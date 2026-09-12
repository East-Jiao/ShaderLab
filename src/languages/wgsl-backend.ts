// WebGPU 渲染后端：WGSL 预设（全屏 + 网格）
// WGSL 契约：
//   group(0) binding(0)  var<uniform> G: Globals   —— 内核自动填充
//   group(1)             用户资源（uniform / texture_2d<f32> / sampler）
import { OrbitCamera } from '../engine/camera';
import { makeGeometry, triangleCount, type MeshData } from '../engine/geometry';
import { createTextureLibrary, type TextureId } from '../engine/textures';
import { M4, trs, normalMatrix } from '../engine/math';
import type { PassDef, Preset, ShaderError, UniformMeta } from '../engine/types';
import type { UniformValues } from '../engine/renderer';

export interface WgslReport {
  ok: boolean;
  passes: { name: string; ok: boolean; errors: ShaderError[] }[];
  metas: UniformMeta[];
}

export const WGSL_GLOBALS = `struct Globals {
  time: f32,
  deltaTime: f32,
  frame: u32,
  _pad0: u32,
  resolution: vec2f,
  invResolution: vec2f,
  mouse: vec4f,
  camPos: vec4f,
  camRot: mat3x3f,
  viewProj: mat4x4f,
  model: mat4x4f,
  normalMat: mat3x3f,
  near: f32,
  far: f32,
  _pad1: vec2f,
};

@group(0) @binding(0) var<uniform> G: Globals;`;

const WGSL_VS_BODY = `
struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VSOut {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var out: VSOut;
  let q = p[vi];
  out.pos = vec4f(q, 0.0, 1.0);
  out.uv = q * 0.5 + 0.5;
  return out;
}`;

export const WGSL_VS_FULLSCREEN = WGSL_GLOBALS + WGSL_VS_BODY;

// Globals 缓冲区字节布局（与上面结构体严格一致）
const GOFF = {
  time: 0, deltaTime: 4, frame: 8,
  resolution: 16, invResolution: 24,
  mouse: 32, camPos: 48, camRot: 64,
  viewProj: 112, model: 176, normalMat: 240,
  near: 288, far: 292,
};
const GLOBALS_SIZE = 304;

interface WgslResource {
  group: number;
  binding: number;
  kind: 'uniform' | 'texture' | 'sampler';
  name: string;
}

function parseResources(code: string): WgslResource[] {
  const out: WgslResource[] = [];
  const re = /@group\((\d+)\)\s*@binding\((\d+)\)\s*var(?:<(\w+)>)?\s+(\w+)\s*:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    const group = +m[1], binding = +m[2];
    const ptr = m[3] || '';
    const name = m[4];
    const type = m[5].trim();
    let kind: WgslResource['kind'];
    if (ptr === 'uniform') kind = 'uniform';
    else if (type.startsWith('texture_2d')) kind = 'texture';
    else if (type.startsWith('sampler')) kind = 'sampler';
    else continue;
    out.push({ group, binding, kind, name });
  }
  return out;
}

export interface WgslUserParam {
  name: string;
  type: 'f32' | 'i32' | 'u32' | 'bool' | 'vec2f' | 'vec3f' | 'vec4f';
  offset: number;
  size: number;
  range?: [number, number];
  color?: boolean;
}

/** 解析 struct UserParams 字段并按 WGSL 对齐规则布局 */
export function parseUserParams(code: string): WgslUserParam[] {
  const s = code.indexOf('struct UserParams');
  if (s < 0) return [];
  const open = code.indexOf('{', s);
  let depth = 0, end = open;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') { depth--; if (!depth) { end = i; break; } }
  }
  const body = code.slice(open + 1, end);
  const out: WgslUserParam[] = [];
  let offset = 0;
  const fieldRe = /(\w+)\s*:\s*(f32|i32|u32|bool|vec2f|vec3f|vec4f)\s*,?([^\n]*)/g;
  let m: RegExpExecArray | null;
  while ((m = fieldRe.exec(body))) {
    const name = m[1], type = m[2] as WgslUserParam['type'], comment = m[3] || '';
    const align = type === 'f32' || type === 'i32' || type === 'u32' || type === 'bool' ? 4 : type === 'vec2f' ? 8 : 16;
    const size = type === 'f32' || type === 'i32' || type === 'u32' || type === 'bool' ? 4 : type === 'vec2f' ? 8 : type === 'vec3f' ? 12 : 16;
    offset = Math.ceil(offset / align) * align;
    const p: WgslUserParam = { name, type, offset, size };
    const range = comment.match(/@range\s+(-?[\d.]+)\s+(-?[\d.]+)/);
    if (range) p.range = [parseFloat(range[1]), parseFloat(range[2])];
    if (/@color\b/.test(comment)) p.color = true;
    out.push(p);
    offset += size;
  }
  return out;
}

function paramToMeta(p: WgslUserParam, values: UniformValues): UniformMeta {
  const meta: UniformMeta = { name: p.name, type: p.type === 'vec2f' ? 'vec2' : p.type === 'vec3f' ? 'vec3' : p.type === 'vec4f' ? 'vec4' : p.type === 'bool' ? 'int' : 'float' };
  if (p.range) meta.range = p.range;
  if (p.color) meta.color = true;
  const v = values[p.name];
  if (meta.type === 'float' || meta.type === 'int') {
    meta.value = [typeof v === 'number' ? v : 0.5];
    if (!meta.range) meta.range = meta.type === 'int' ? [0, 10] : [0, 1];
  } else if (meta.type === 'vec2') {
    meta.value = Array.isArray(v) ? (v as number[]).slice(0, 2) : [0, 0];
    if (!meta.range) meta.range = [-5, 5];
  } else if (meta.type === 'vec3') {
    meta.value = Array.isArray(v) ? (v as number[]).slice(0, 3) : meta.color ? [0.8, 0.5, 0.2] : [0, 0, 0];
    if (!meta.range && !meta.color) meta.range = [-5, 5];
  } else if (meta.type === 'vec4') {
    meta.value = Array.isArray(v) ? (v as number[]).slice(0, 4) : meta.color ? [0.8, 0.5, 0.2, 1] : [0, 0, 0, 1];
    if (!meta.range && !meta.color) meta.range = [-5, 5];
  }
  return meta;
}

export class WebGPURenderer {
  canvas: HTMLCanvasElement;
  device: GPUDevice;
  ctx: GPUCanvasContext;
  format: GPUTextureFormat;
  camera = new OrbitCamera();
  private texLib = createTextureLibrary();
  private gpuTextures = new Map<string, GPUTexture>();
  private sampler: GPUSampler;
  private pipeline: GPURenderPipeline | null = null;
  private globalsBuf: GPUBuffer;
  private userBuf: GPUBuffer | null = null;
  private userBufSize = 0;
  private bindGroup0: GPUBindGroup | null = null;
  private bindGroup1: GPUBindGroup | null = null;
  private vertexBuf: GPUBuffer | null = null;
  private indexBuf: GPUBuffer | null = null;
  private indexCount = 0;
  private depthView: GPUTextureView | null = null;
  private userParams: WgslUserParam[] = [];
  private metas: UniformMeta[] = [];
  private values: UniformValues = {};
  private sceneKind: 'fullscreen' | 'mesh' = 'fullscreen';
  private meshData: MeshData | null = null;
  private spin = true;
  private model = M4();
  private normalMat = new Float32Array(9);
  private time = 0;
  private frame = 0;
  private dtLast = 1 / 60;
  private mouse = new Float32Array(4);
  private playing = true;
  private timeScale = 1;
  private background: [number, number, number] = [0.09, 0.1, 0.12];
  private raf = 0;
  private lastT = 0;
  private fpsEMA = 60;
  private lastStatsPush = 0;
  private failed = false;

  onCompile?: (r: WgslReport) => void;
  onStats?: (s: { fps: number; ms: number; draws: number; tris: number }) => void;
  onGLError?: (msg: string) => void;

  private constructor(canvas: HTMLCanvasElement, device: GPUDevice, format: GPUTextureFormat) {
    this.canvas = canvas;
    this.device = device;
    this.format = format;
    this.ctx = canvas.getContext('webgpu') as GPUCanvasContext;
    this.ctx.configure({ device, format, alphaMode: 'opaque' });
    this.globalsBuf = device.createBuffer({ size: GLOBALS_SIZE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.sampler = device.createSampler({
      magFilter: 'linear', minFilter: 'linear',
      addressModeU: 'repeat', addressModeV: 'repeat',
    });
  }

  static async create(canvas: HTMLCanvasElement): Promise<WebGPURenderer> {
    if (!navigator.gpu) throw new Error('此环境不支持 WebGPU（可用最新 Chrome / Edge，或 Electron 开启 WebGPU）');
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('未找到可用的 GPU 适配器');
    const device = await adapter.requestDevice();
    const canvas2 = canvas as HTMLCanvasElement & { getContext(c: 'webgpu'): GPUCanvasContext | null };
    const ctx = canvas2.getContext('webgpu');
    if (!ctx) throw new Error('无法创建 WebGPU 上下文（画布可能已被 WebGL 占用）');
    const format = navigator.gpu.getPreferredCanvasFormat();
    const r = new WebGPURenderer(canvas, device, format);
    return r;
  }

  private getTexture(id: string): GPUTexture {
    let t = this.gpuTextures.get(id);
    if (!t) {
      const src = this.texLib.get((id as TextureId) || 'checker') as HTMLCanvasElement;
      t = this.device.createTexture({
        size: [src.width, src.height], format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this.device.queue.copyExternalImageToTexture({ source: src }, { texture: t }, [src.width, src.height]);
      this.gpuTextures.set(id, t);
    }
    return t;
  }

  async setPreset(preset: Preset, passes: PassDef[], values: UniformValues) {
    this.values = values;
    this.failed = false;
    this.sceneKind = preset.scene.kind === 'mesh' ? 'mesh' : 'fullscreen';
    if (this.sceneKind === 'mesh') {
      this.meshData = makeGeometry((preset.scene as any).geometry);
      this.spin = (preset.scene as any).spin !== false;
    }

    // 组合 WGSL：内核前置 Globals 声明；mesh 场景合并 vs+fs 为一个模块
    const userCode = passes.map((p) => (this.sceneKind === 'mesh' ? p.vs + '\n' + p.fs : p.fs)).join('\n');
    const fullCode =
      this.sceneKind === 'fullscreen'
        ? WGSL_GLOBALS + WGSL_VS_BODY + userCode
        : WGSL_GLOBALS + '\n' + userCode;
    const module = this.device.createShaderModule({ code: fullCode, label: `preset-${preset.id}` });
    const info = await module.getCompilationInfo();
    const errors: ShaderError[] = info.messages
      .filter((m) => m.type === 'error')
      .map((m) => ({ line: Math.max(1, Math.floor(m.lineNum)), rawLine: Math.max(1, Math.floor(m.lineNum)), message: m.message }));

    const report: WgslReport = { ok: errors.length === 0, passes: [{ name: passes[0]?.name ?? 'main', ok: errors.length === 0, errors }], metas: [] };
    if (!report.ok) {
      this.failed = true;
      this.onCompile?.(report);
      return;
    }

    // 顶点/索引缓冲（mesh）
    if (this.sceneKind === 'mesh' && this.meshData) {
      const md = this.meshData;
      const n = md.positions.length / 3;
      const interleaved = new Float32Array(n * 8);
      for (let i = 0; i < n; i++) {
        interleaved.set([md.positions[i * 3], md.positions[i * 3 + 1], md.positions[i * 3 + 2]], i * 8);
        interleaved.set([md.normals[i * 3], md.normals[i * 3 + 1], md.normals[i * 3 + 2]], i * 8 + 3);
        interleaved.set([md.uvs[i * 2], md.uvs[i * 2 + 1]], i * 8 + 6);
      }
      this.vertexBuf?.destroy();
      this.indexBuf?.destroy();
      this.vertexBuf = this.device.createBuffer({ size: interleaved.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
      this.device.queue.writeBuffer(this.vertexBuf, 0, interleaved);
      const indexArr = new Uint32Array(md.indices);
      this.indexBuf = this.device.createBuffer({ size: indexArr.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
      this.device.queue.writeBuffer(this.indexBuf, 0, indexArr);
      this.indexCount = md.indices.length;
    }

    // 反射用户参数
    this.userParams = parseUserParams(fullCode);
    this.metas = this.userParams.map((p) => paramToMeta(p, values));
    const uboSize = Math.max(16, Math.ceil((this.userParams.at(-1)?.offset ?? 0) / 16) * 16 + 16);
    if (this.userBuf === null || this.userBufSize < uboSize) {
      this.userBuf?.destroy();
      this.userBufSize = Math.max(64, uboSize);
      this.userBuf = this.device.createBuffer({ size: this.userBufSize, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    }

    // 管线
    const depthStencil: GPUDepthStencilState | undefined = this.sceneKind === 'mesh'
      ? { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' } : undefined;
    const targets: GPUColorTargetState[] = [{ format: this.format }];
    try {
      this.pipeline = this.device.createRenderPipeline({
        layout: 'auto',
        vertex: this.sceneKind === 'fullscreen'
          ? { module: module, entryPoint: 'vs_main' }
          : {
              module: module, entryPoint: 'vs_main',
              buffers: [{
                arrayStride: 32,
                attributes: [
                  { shaderLocation: 0, offset: 0, format: 'float32x3' },
                  { shaderLocation: 1, offset: 12, format: 'float32x3' },
                  { shaderLocation: 2, offset: 24, format: 'float32x2' },
                ],
              }],
            },
        fragment: { module: module, entryPoint: 'fs_main', targets },
        primitive: { topology: 'triangle-list', cullMode: this.sceneKind === 'mesh' ? 'back' : 'none' },
        depthStencil,
      });
    } catch (e) {
      this.failed = true;
      report.ok = false;
      report.passes[0].ok = false;
      report.passes[0].errors.push({ line: 1, rawLine: 1, message: '管线创建失败: ' + String(e) });
      this.onCompile?.(report);
      return;
    }

    // Bind groups（layout: auto 反射）
    const bg0Layout = this.pipeline.getBindGroupLayout(0);
    this.bindGroup0 = this.device.createBindGroup({
      layout: bg0Layout,
      entries: [{ binding: 0, resource: { buffer: this.globalsBuf } }],
    });
    const res1 = parseResources(fullCode).filter((r) => r.group === 1);
    if (res1.length && this.userBuf) {
      const bg1Layout = this.pipeline.getBindGroupLayout(1);
      const entries: GPUBindGroupEntry[] = res1.map((r) => {
        if (r.kind === 'uniform') return { binding: r.binding, resource: { buffer: this.userBuf! } };
        if (r.kind === 'texture') {
          const texId = (this.values[r.name] as string) || 'checker';
          return { binding: r.binding, resource: this.getTexture(texId).createView() };
        }
        return { binding: r.binding, resource: this.sampler };
      });
      this.bindGroup1 = this.device.createBindGroup({ layout: bg1Layout, entries });
    } else {
      this.bindGroup1 = null;
    }

    report.metas = this.metas;
    if (preset.camera) {
      const c = preset.camera;
      this.camera.setAngles(c.yaw, c.pitch, c.dist);
      this.camera.autoRotate = (c.autoRotate ?? 0) > 0;
    }
    this.onCompile?.(report);
  }

  setValues(v: UniformValues) {
    this.values = v;
    this.writeUserParams();
  }
  setPlaying(p: boolean) { this.playing = p; }
  setTimeScale(s: number) { this.timeScale = s; }
  setResolutionScale(_s: number) { void _s; }
  setBackground(rgb: [number, number, number]) { this.background = rgb; }
  setMouse(x: number, y: number, down: boolean) {
    this.mouse[0] = x; this.mouse[1] = y; this.mouse[2] = down ? 1 : 0; this.mouse[3] = down ? 1 : 0;
  }

  private writeUserParams() {
    if (!this.userBuf || !this.userParams.length) return;
    const buf = new Float32Array(this.userBufSize / 4);
    for (const p of this.userParams) {
      const v = this.values[p.name];
      const idx = p.offset / 4;
      if (p.type === 'f32') buf[idx] = typeof v === 'number' ? v : 0;
      else if (p.type === 'i32' || p.type === 'u32' || p.type === 'bool') buf[idx] = typeof v === 'number' ? Math.round(v) : 0;
      else {
        const arr = Array.isArray(v) ? (v as number[]) : [0, 0, 0, 0];
        for (let i = 0; i < p.size / 4; i++) buf[idx + i] = arr[i] ?? 0;
      }
    }
    this.device.queue.writeBuffer(this.userBuf, 0, buf);
  }

  private writeGlobals(w: number, h: number) {
    const g = new Float32Array(GLOBALS_SIZE / 4);
    g[0] = this.time; g[1] = this.dtLast; g[2] = this.frame;
    g[4] = w; g[5] = h;
    g[6] = 1 / w; g[7] = 1 / h;
    g.set(this.mouse, 8);
    g[12] = this.camera.eye[0]; g[13] = this.camera.eye[1]; g[14] = this.camera.eye[2];
    const basis = new Float32Array(9);
    this.camera.basis(basis);
    // mat3x3f 列布局（每列 vec3+pad）
    for (let c = 0; c < 3; c++) {
      g[(GOFF.camRot / 4) + c * 4] = basis[c * 3];
      g[(GOFF.camRot / 4) + c * 4 + 1] = basis[c * 3 + 1];
      g[(GOFF.camRot / 4) + c * 4 + 2] = basis[c * 3 + 2];
    }
    g.set(this.camera.viewProj, GOFF.viewProj / 4);
    g.set(this.model, GOFF.model / 4);
    for (let c = 0; c < 3; c++) {
      g[(GOFF.normalMat / 4) + c * 4] = this.normalMat[c * 3];
      g[(GOFF.normalMat / 4) + c * 4 + 1] = this.normalMat[c * 3 + 1];
      g[(GOFF.normalMat / 4) + c * 4 + 2] = this.normalMat[c * 3 + 2];
    }
    g[GOFF.near / 4] = this.camera.near;
    g[GOFF.far / 4] = this.camera.far;
    this.device.queue.writeBuffer(this.globalsBuf, 0, g);
  }

  start() {
    if (this.raf) return;
    const loop = (t: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, this.lastT ? (t - this.lastT) / 1000 : 1 / 60);
      this.lastT = t;
      try {
        this.render(dt);
      } catch (err) {
        this.stop();
        this.onGLError?.(String(err));
      }
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.lastT = 0;
  }

  renderOnce() { this.render(1 / 60); }

  private resizeIfNeeded() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(2, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      // 画布尺寸变化后需要重建深度纹理
      this.depthView = null;
    }
  }

  private render(dt: number) {
    if (!this.pipeline || this.failed) return;
    this.resizeIfNeeded();
    const w = this.canvas.width, h = this.canvas.height;
    if (this.playing) this.time += dt * this.timeScale;
    this.dtLast = dt * this.timeScale;
    this.frame++;
    this.camera.update(dt);
    this.camera.setAspect(w / h);
    if (this.sceneKind === 'mesh') {
      trs(this.model, 0, 0, 0, this.spin ? this.time * 0.45 : 0, 1);
      normalMatrix(this.normalMat, this.model);
    }
    this.writeGlobals(w, h);
    this.writeUserParams();

    let depthView = this.depthView;
    if (!depthView) {
      const depthTex = this.device.createTexture({ size: [w, h], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT });
      depthView = depthTex.createView();
      this.depthView = depthView;
    }

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.ctx.getCurrentTexture().createView(),
        clearValue: { r: this.background[0], g: this.background[1], b: this.background[2], a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
      depthStencilAttachment: this.sceneKind === 'mesh'
        ? { view: depthView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } : undefined,
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup0);
    if (this.bindGroup1) pass.setBindGroup(1, this.bindGroup1);
    if (this.sceneKind === 'mesh' && this.vertexBuf && this.indexBuf) {
      pass.setVertexBuffer(0, this.vertexBuf);
      pass.setIndexBuffer(this.indexBuf, 'uint32');
      pass.drawIndexed(this.indexCount);
    } else {
      pass.draw(3);
    }
    pass.end();
    this.device.queue.submit([encoder.finish()]);

    this.fpsEMA = this.fpsEMA * 0.92 + (1 / Math.max(dt, 1e-4)) * 0.08;
    const now = performance.now();
    if (this.onStats && now - this.lastStatsPush > 500) {
      this.lastStatsPush = now;
      this.onStats({
        fps: this.fpsEMA, ms: 1000 / Math.max(this.fpsEMA, 1e-4), draws: 1,
        tris: this.meshData ? triangleCount(this.meshData) : 1,
      });
    }
  }

  snapshot(): string {
    this.renderOnce();
    return this.canvas.toDataURL('image/png');
  }

  captureStream(fps: number): MediaStream {
    return (this.canvas as HTMLCanvasElement).captureStream(fps);
  }

  dispose() {
    this.stop();
    this.vertexBuf?.destroy();
    this.indexBuf?.destroy();
    this.userBuf?.destroy();
    this.globalsBuf.destroy();
    this.gpuTextures.forEach((t) => t.destroy());
  }
}
