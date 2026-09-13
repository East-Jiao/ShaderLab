// WebGL2 渲染器：三种场景（全屏 / 网格多 Pass / 后处理 MRT）+ 录制采集 + 统计
import { BUILTIN_UNIFORMS, buildProgram, setUniformValue, type GLProgram } from './gl';
import { makeGeometry, makePlane, makeSphere, makeCube, makeTorusKnot, triangleCount, fixWinding, type MeshData } from './geometry';
import { createTextureLibrary, type TextureLibrary, type TextureId } from './textures';
import { OrbitCamera } from './camera';
import { RenderTarget } from './fbo';
import { buildUniformMetas } from './introspect';
import { M4, trs, multiply, normalMatrix, orthoOffCenter, lookAt, type Vec3 } from './math';
import type { CompiledUniform, PassDef, Preset, SceneConfig, ShaderError, UniformMeta } from './types';

export interface PassReport {
  name: string;
  ok: boolean;
  errors: ShaderError[];
}
export interface CompileReport {
  ok: boolean;
  passes: PassReport[];
  metas: UniformMeta[];
}
export interface Stats {
  fps: number;
  ms: number;
  draws: number;
  tris: number;
}

export type UniformValues = Record<string, number | number[] | string | boolean>;

const FLOOR_VS = `#version 300 es
layout(location=0) in vec3 aPosition;
uniform mat4 uViewProj;
uniform mat4 uModel;
uniform mat4 uLightViewProj;
out vec2 vXZ;
out vec4 vShadowCoord;
void main(){
  vec4 wp = uModel * vec4(aPosition, 1.0);
  vXZ = aPosition.xz;
  vShadowCoord = uLightViewProj * wp;
  gl_Position = uViewProj * wp;
}`;

const FLOOR_FS = `#version 300 es
precision highp float;
in vec2 vXZ;
in vec4 vShadowCoord;
out vec4 fragColor;
uniform vec3 uBaseColor;
uniform vec3 uLineColor;
uniform vec3 uLightDir;
uniform vec2 uShadowTexel;
uniform sampler2D uShadowMap;

// PCF 阴影（Reeves et al. 1983 + 坡度缩放偏移）
float getShadowFloor(vec4 shadowCoord) {
  vec3 sc = shadowCoord.xyz / shadowCoord.w;
  if (sc.z > 1.0 || sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0) return 1.0;
  vec3 N = vec3(0.0, 1.0, 0.0);
  float bias = max(0.0012 * (1.0 - dot(N, uLightDir)), 0.0004);
  float shadow = 0.0;
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      float d = texture(uShadowMap, sc.xy + vec2(float(x), float(y)) * uShadowTexel).r;
      shadow += (sc.z - bias > d) ? 0.0 : 1.0;
    }
  }
  return shadow / 9.0;
}

void main(){
  vec2 g = abs(fract(vXZ * 0.5) - 0.5);
  float line = smoothstep(0.44, 0.5, max(1.0 - g.x, 1.0 - g.y));
  line = max(line, smoothstep(0.44, 0.5, max(g.x, g.y)));
  float fade = 1.0 - smoothstep(4.0, 14.0, length(vXZ));
  float shadow = getShadowFloor(vShadowCoord);
  vec3 c = mix(uBaseColor, uLineColor, line * fade);
  float alpha = max(line * fade, fade * 0.25);
  c *= mix(0.45, 1.0, shadow);   // 阴影区域压暗（地面网格随光衰减）
  fragColor = vec4(c, alpha);
}`;

// 后处理源场景（画廊）：MRT 输出 颜色 + 世界法线
const GALLERY_VS = `#version 300 es
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUV;
uniform mat4 uModel;
uniform mat4 uViewProj;
uniform mat3 uNormalMatrix;
out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vUV;
void main(){
  vec4 wp = uModel * vec4(aPosition, 1.0);
  vWorldPos = wp.xyz;
  vNormal = uNormalMatrix * aNormal;
  vUV = aUV;
  gl_Position = uViewProj * wp;
}`;

const GALLERY_FS = `#version 300 es
precision highp float;
in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vUV;
layout(location=0) out vec4 fragColor;
layout(location=1) out vec4 fragNormal;
uniform float uTime;
uniform vec3 uCamPos;

// ACES Filmic Tonemapping（Narkowicz 2016 拟合，业内常用的廉价版本）
vec3 acesFilm(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main(){
  vec3 N = normalize(vNormal);
  fragNormal = vec4(N * 0.5 + 0.5, 1.0);
  vec3 albedo = vec3(0.55, 0.58, 0.66);
  vec2 cell = floor(vUV * vec2(8.0, 4.0));
  if (fract(cell.x + cell.y * 0.5) < 0.5) albedo *= 0.55;
  if (vWorldPos.y < -0.99) albedo = mix(vec3(0.16, 0.18, 0.22), albedo, 0.25);
  vec3 L = normalize(vec3(cos(uTime * 0.4) * 3.0, 2.6, sin(uTime * 0.4) * 3.0));
  float diff = max(dot(N, L), 0.0) * 1.25 + 0.28;
  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 48.0) * 0.65;
  // 线性空间光照 → ACES → gamma
  vec3 hdr = albedo * diff + spec;
  vec3 srgb = pow(acesFilm(hdr), vec3(1.0 / 2.2));
  fragColor = vec4(srgb, 1.0);
}`;

const QUAD_VS3 = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUV;
void main(){ vUV = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

// ---- 阴影贴图（Shadow Mapping, Williams 1978；采样端 PCF 见代码片段库） ----
// 平行光从固定方向照亮原点，正交投影覆盖模型与地面；
// 声明了 uShadowMap 的用户 Pass 会自动得到阴影贴图与光照矩阵。
const SHADOW_SIZE = 2048;
export const LIGHT_DIR: Vec3 = (() => {
  const l = Math.hypot(0.55, 0.75, 0.45);
  return [0.55 / l, 0.75 / l, 0.45 / l];
})();

const SHADOW_VS = `#version 300 es
layout(location=0) in vec3 aPosition;
uniform mat4 uLightViewProj;
uniform mat4 uModel;
void main(){ gl_Position = uLightViewProj * uModel * vec4(aPosition, 1.0); }`;

const SHADOW_FS = `#version 300 es
precision highp float;
void main(){}`;

interface PassRuntime {
  def: PassDef;
  prog: GLProgram;
  samplerMetas: { name: string; unit: number }[];
}

export class WebGL2Renderer {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  camera = new OrbitCamera();
  private texLib: TextureLibrary;
  private quadBuf: WebGLBuffer;
  private quadVAO: WebGLVertexArrayObject;
  private floorMesh: MeshData;
  private floorProg: GLProgram;
  private galleryProg: GLProgram;
  private galleryMeshes: { mesh: MeshData; model: () => { m: Float32Array } }[] = [];
  private rt: RenderTarget | null = null;
  private passes: PassRuntime[] = [];
  private scene: SceneConfig = { kind: 'fullscreen' };
  private preset: Preset | null = null;
  private mesh: MeshData | null = null;
  private userTextures = new Map<string, WebGLTexture>();
  private values: UniformValues = {};
  private metas: UniformMeta[] = [];
  private time = 0;
  private frame = 0;
  private dtLast = 1 / 60;
  private mouse = [0, 0, 0, 0];
  private raf = 0;
  private lastT = 0;
  private playing = true;
  private timeScale = 1;
  private resScale = 1;
  private background: [number, number, number] = [0.09, 0.1, 0.12];
  private spin = true;
  private showFloor = true;
  private model = M4();
  private normalMat = new Float32Array(9);
  private camBasis = new Float32Array(9);
  private fpsEMA = 60;
  private lastStatsPush = 0;
  private failed = false;
  // 阴影贴图资源（按需创建）
  private shadowFbo: WebGLFramebuffer | null = null;
  private shadowTex: WebGLTexture | null = null;
  private shadowProg: GLProgram | null = null;
  private lightViewProj = M4();

  onCompile?: (r: CompileReport) => void;
  onStats?: (s: Stats) => void;
  onGLError?: (msg: string) => void;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) throw new Error('WebGL2 不可用：请更新浏览器或启用硬件加速');
    this.canvas = canvas;
    this.gl = gl;
    gl.getExtension('EXT_color_buffer_float');
    this.texLib = createTextureLibrary();
    this.floorMesh = fixWinding(makePlane(30, 60));
    this.quadVAO = gl.createVertexArray()!;
    this.quadBuf = gl.createBuffer()!;
    gl.bindVertexArray(this.quadVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    const fl = buildProgram(gl, FLOOR_VS, FLOOR_FS);
    if ('errors' in fl) throw new Error('内置地面着色器编译失败: ' + fl.rawLog);
    this.floorProg = fl.result;
    const ga = buildProgram(gl, GALLERY_VS, GALLERY_FS);
    if ('errors' in ga) throw new Error('内置画廊场景编译失败: ' + ga.rawLog);
    this.galleryProg = ga.result;

    this.galleryMeshes = [
      { mesh: fixWinding(makeTorusKnot()), model: () => ({ m: this.tmpModel(0, 0.35, 0, this.time * 0.5, 0.72) }) },
      { mesh: fixWinding(makeSphere()), model: () => ({ m: this.tmpModel(-2.1, -0.55, 0.4, 0, 0.75) }) },
      { mesh: fixWinding(makeCube()), model: () => ({ m: this.tmpModel(2.1, -0.55, -0.3, this.time * 0.2 + 1, 0.62) }) },
    ];
  }

  private tmpArr = M4();
  private tmpModel(tx: number, ty: number, tz: number, yaw: number, s: number) {
    trs(this.tmpArr, tx, ty, tz, yaw, s);
    return this.tmpArr;
  }

  // ---------- 资源 ----------

  private getTexture(id: string): WebGLTexture {
    let t = this.userTextures.get(id);
    if (!t) {
      const gl = this.gl;
      t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      const src = this.texLib.get((id as TextureId) || 'checker') as TexImageSource;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src as HTMLCanvasElement);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.generateMipmap(gl.TEXTURE_2D);
      this.userTextures.set(id, t);
    }
    return t;
  }

  setPreset(preset: Preset, passes: PassDef[], values: UniformValues) {
    this.preset = preset;
    this.scene = preset.scene;
    this.values = values;
    this.failed = false;
    const gl = this.gl;

    // 释放旧程序
    for (const p of this.passes) gl.deleteProgram(p.prog.program);
    this.passes = [];
    this.samplerCache.clear();

    const reports: PassReport[] = [];
    const perPassUniforms: CompiledUniform[][] = [];
    const sources: string[] = [];
    for (const def of passes) {
      sources.push(def.vs, def.fs);
      const r = buildProgram(gl, def.vs, def.fs);
      if ('errors' in r) {
        const off = def.lineOffset ?? 0;
        reports.push({
          name: def.name,
          ok: false,
          errors: r.errors.map((e) => ({ ...e, line: Math.max(1, e.rawLine - off) })),
        });
        perPassUniforms.push([]);
        this.failed = true;
      } else {
        reports.push({ name: def.name, ok: true, errors: [] });
        perPassUniforms.push(r.result.uniforms);
        this.passes.push({ def, prog: r.result, samplerMetas: [] });
      }
    }

    // 场景资源
    if (this.scene.kind === 'mesh') {
      this.mesh = makeGeometry(this.scene.geometry);
      this.spin = this.scene.spin !== false;
      this.showFloor = this.scene.showFloor !== false;
    } else {
      this.mesh = null;
    }
    if (this.scene.kind === 'post' && !this.rt) {
      this.rt = new RenderTarget(gl, true, true);
    }

    this.metas = buildUniformMetas(perPassUniforms, preset.uniforms, sources, this.values);
    this.onCompile?.({ ok: !this.failed, passes: reports, metas: this.metas });
    if (this.preset.camera) {
      const c = this.preset.camera;
      this.camera.setAngles(c.yaw, c.pitch, c.dist);
      this.camera.autoRotate = (c.autoRotate ?? 0) > 0;
    }
  }

  setValues(v: UniformValues) {
    this.values = v;
  }
  setPlaying(p: boolean) { this.playing = p; }
  setTimeScale(s: number) { this.timeScale = s; }
  setResolutionScale(s: number) { this.resScale = s; }
  setBackground(rgb: [number, number, number]) { this.background = rgb; }
  setMouse(x: number, y: number, down: boolean) {
    this.mouse = [x, y, down ? 1 : 0, down ? 1 : 0];
  }

  // ---------- 渲染 ----------

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

  renderOnce() {
    this.render(1 / 60);
  }

  private resizeIfNeeded() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.resScale;
    const w = Math.max(2, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(2, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private render(dt: number) {
    const gl = this.gl;
    this.resizeIfNeeded();
    const w = this.canvas.width, h = this.canvas.height;
    if (this.playing) this.time += dt * this.timeScale;
    this.dtLast = dt * this.timeScale;
    this.frame++;
    this.camera.update(dt);
    this.camera.setAspect(w / h);
    this.camera.basis(this.camBasis);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    const bg = this.background;
    gl.clearColor(this.failed ? 0.16 : bg[0], this.failed ? 0.05 : bg[1], this.failed ? 0.06 : bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);

    let draws = 0, tris = 0;
    if (this.failed) {
      // 编译失败：不绘制
    } else if (this.scene.kind === 'fullscreen') {
      const r = this.drawFullscreen();
      draws += r.draws; tris += r.tris;
    } else if (this.scene.kind === 'mesh') {
      const r = this.drawMeshScene();
      draws += r.draws; tris += r.tris;
    } else if (this.scene.kind === 'post') {
      const r = this.drawPostScene(w, h);
      draws += r.draws; tris += r.tris;
    }

    // 统计
    this.fpsEMA = this.fpsEMA * 0.92 + (1 / Math.max(dt, 1e-4)) * 0.08;
    const now = performance.now();
    if (this.onStats && now - this.lastStatsPush > 500) {
      this.lastStatsPush = now;
      this.onStats({ fps: this.fpsEMA, ms: 1000 / Math.max(this.fpsEMA, 1e-4), draws, tris });
    }
  }

  private bindBuiltins(prog: GLProgram, extra?: Record<string, () => void>) {
    const gl = this.gl;
    const L = (n: string) => prog.locations.get(n) ?? null;
    const has = (n: string) => prog.locations.has(n);
    if (has('uTime')) gl.uniform1f(L('uTime'), this.time);
    if (has('uDeltaTime')) gl.uniform1f(L('uDeltaTime'), this.dtLast);
    if (has('uFrame')) gl.uniform1i(L('uFrame'), this.frame);
    if (has('uResolution')) gl.uniform2f(L('uResolution'), this.canvas.width, this.canvas.height);
    if (has('uInvResolution')) gl.uniform2f(L('uInvResolution'), 1 / this.canvas.width, 1 / this.canvas.height);
    if (has('uMouse')) gl.uniform4fv(L('uMouse'), this.mouse);
    if (has('uCamPos')) gl.uniform3fv(L('uCamPos'), this.camera.eye);
    if (has('uCamRot')) gl.uniformMatrix3fv(L('uCamRot'), false, this.camBasis);
    if (has('uNear')) gl.uniform1f(L('uNear'), this.camera.near);
    if (has('uFar')) gl.uniform1f(L('uFar'), this.camera.far);
    if (has('uView')) gl.uniformMatrix4fv(L('uView'), false, this.camera.view);
    if (has('uProjection')) gl.uniformMatrix4fv(L('uProjection'), false, this.camera.projection);
    if (has('uViewProj')) gl.uniformMatrix4fv(L('uViewProj'), false, this.camera.viewProj);
    if (has('uModel')) gl.uniformMatrix4fv(L('uModel'), false, this.model);
    if (has('uNormalMatrix')) gl.uniformMatrix3fv(L('uNormalMatrix'), false, this.normalMat);
    // 阴影系统内置 uniform
    if (has('uLightDir')) gl.uniform3fv(L('uLightDir'), LIGHT_DIR);
    if (has('uLightViewProj')) gl.uniformMatrix4fv(L('uLightViewProj'), false, this.lightViewProj);
    if (has('uShadowTexel')) gl.uniform2f(L('uShadowTexel'), 1 / SHADOW_SIZE, 1 / SHADOW_SIZE);
    // Shadertoy 兼容层（iTime/iResolution 等由内核每帧供应，用户无需关心）
    if (has('iTime')) gl.uniform1f(L('iTime'), this.time);
    if (has('iTimeDelta')) gl.uniform1f(L('iTimeDelta'), this.dtLast);
    if (has('iFrame')) gl.uniform1i(L('iFrame'), this.frame);
    if (has('iResolution')) gl.uniform3f(L('iResolution'), this.canvas.width, this.canvas.height, this.canvas.width / this.canvas.height);
    if (has('iMouse')) gl.uniform4fv(L('iMouse'), this.mouse);
    if (has('iCamPos')) gl.uniform3fv(L('iCamPos'), this.camera.eye);
    if (has('iCamRot')) gl.uniformMatrix3fv(L('iCamRot'), false, this.camBasis);
    if (extra) for (const fn of Object.values(extra)) fn();
  }

  private samplerCache = new Map<GLProgram, Map<number, { name: string; unit: number }[]>>();

  private userSamplerUnits(prog: GLProgram, baseUnit: number): { name: string; unit: number }[] {
    // 按名称稳定排序分配纹理单元（内置场景纹理 uSceneTex 等由 bindBuiltins 绑定，跳过）。
    // 分配结果只与 (program, baseUnit) 有关 —— 缓存起来，避免每帧排序分配。
    let byUnit = this.samplerCache.get(prog);
    if (!byUnit) {
      byUnit = new Map();
      this.samplerCache.set(prog, byUnit);
    }
    let list = byUnit.get(baseUnit);
    if (!list) {
      list = prog.uniforms
        .filter((u) => u.type === 'sampler2D' && !BUILTIN_UNIFORMS.has(u.name))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((u, i) => ({ name: u.name, unit: baseUnit + i }));
      byUnit.set(baseUnit, list);
    }
    return list;
  }

  private bindUserUniforms(prog: GLProgram, baseUnit: number) {
    const gl = this.gl;
    const samplerUnits = this.userSamplerUnits(prog, baseUnit);
    for (const { name, unit } of samplerUnits) {
      const loc = prog.locations.get(name);
      if (loc === undefined) continue;
      const texId = (this.values[name] as string) || 'checker';
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, this.getTexture(texId));
      gl.uniform1i(loc, unit);
    }
    for (const u of prog.uniforms) {
      if (u.type === 'sampler2D') continue;
      if (BUILTIN_UNIFORMS.has(u.name)) continue; // 内置 uniform 由内核供应，拒绝（可能过期的）用户值覆盖
      const v = this.values[u.name];
      if (v === undefined) continue;
      const arr = Array.isArray(v) ? v.map(Number) : [Number(v)];
      setUniformValue(gl, prog.locations.get(u.name) ?? null, u.type, u.type === 'float' || u.type === 'int' ? arr[0] : arr);
    }
    return samplerUnits;
  }

  private drawFullscreen(): { draws: number; tris: number } {
    const gl = this.gl;
    const pass = this.passes[0];
    if (!pass) return { draws: 0, tris: 0 };
    gl.useProgram(pass.prog.program);
    gl.bindVertexArray(this.quadVAO);
    this.bindBuiltins(pass.prog);
    this.bindUserUniforms(pass.prog, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    return { draws: 1, tris: 1 };
  }

  private bindMeshAttributes(prog: GLProgram, mesh: MeshData) {
    const gl = this.gl;
    const bind = (name: string, buf: Float32Array, size: number) => {
      const loc = prog.attribLocations.get(name);
      if (loc === undefined || loc < 0) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ensureBuffer('m' + name + mesh.positions.length, buf));
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    };
    bind('aPosition', mesh.positions, 3);
    bind('aNormal', mesh.normals, 3);
    bind('aUV', mesh.uvs, 2);
    if (mesh.tangents) bind('aTangent', mesh.tangents, 3);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ensureIndexBuffer(mesh));
  }

  private buffers = new Map<string, WebGLBuffer>();
  private ensureBuffer(key: string, data: Float32Array): WebGLBuffer {
    let b = this.buffers.get(key);
    if (!b) {
      b = this.gl.createBuffer()!;
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, b);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, data, this.gl.STATIC_DRAW);
      this.buffers.set(key, b);
    }
    return b;
  }
  private indexBuffers = new Map<MeshData, WebGLBuffer>();
  private ensureIndexBuffer(mesh: MeshData): WebGLBuffer {
    let b = this.indexBuffers.get(mesh);
    if (!b) {
      b = this.gl.createBuffer()!;
      this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, b);
      this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, mesh.indices, this.gl.STATIC_DRAW);
      this.indexBuffers.set(mesh, b);
    }
    return b;
  }

  private drawFloor() {
    const gl = this.gl;
    const p = this.floorProg;
    gl.useProgram(p.program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const loc = p.locations.get('uViewProj')!;
    gl.uniformMatrix4fv(loc, false, this.camera.viewProj);
    // 地面模型：下沉 1.05，物体落在地面上方
    trs(this.tmpArr, 0, -1.05, 0, 0, 1);
    gl.uniformMatrix4fv(p.locations.get('uModel')!, false, this.tmpArr);
    gl.uniformMatrix4fv(p.locations.get('uLightViewProj')!, false, this.lightViewProj);
    gl.uniform3fv(p.locations.get('uLightDir')!, LIGHT_DIR);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex!);
    gl.uniform1i(p.locations.get('uShadowMap')!, 0);
    const base = p.locations.get('uBaseColor')!;
    const line = p.locations.get('uLineColor')!;
    gl.uniform3f(base, this.background[0] * 0.6 + 0.05, this.background[1] * 0.6 + 0.055, this.background[2] * 0.6 + 0.07);
    gl.uniform3f(line, 0.32, 0.42, 0.6);
    gl.depthMask(false);
    this.bindMeshAttributes(p, this.floorMesh);
    gl.drawElements(gl.TRIANGLES, this.floorMesh.indices.length, gl.UNSIGNED_INT, 0);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  private drawMeshScene(): { draws: number; tris: number } {
    const gl = this.gl;
    if (!this.mesh) return { draws: 0, tris: 0 };
    const spin = this.spin ? this.time * 0.45 : 0;
    trs(this.model, 0, 0, 0, spin, 1);
    normalMatrix(this.normalMat, this.model);
    // 阴影贴图：地面接收阴影，或任意 Pass 声明了 uShadowMap 时渲染
    const needsShadow = this.showFloor || this.passes.some((p) => p.prog.locations.has('uShadowMap'));
    if (needsShadow) this.renderShadowMap();
    if (this.showFloor) this.drawFloor();
    let draws = 0, tris = 0;
    for (const pass of this.passes) {
      applyPassState(gl, pass.def);
      gl.useProgram(pass.prog.program);
      this.bindMeshAttributes(pass.prog, this.mesh);
      this.bindBuiltins(pass.prog);
      const samplerCount = this.bindUserUniforms(pass.prog, 0).length;
      if (this.passes.some((p) => p.prog.locations.has('uShadowMap')) && pass.prog.locations.has('uShadowMap')) {
        const unit = samplerCount;
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, this.shadowTex!);
        gl.uniform1i(pass.prog.locations.get('uShadowMap')!, unit);
      }
      gl.drawElements(gl.TRIANGLES, this.mesh.indices.length, gl.UNSIGNED_INT, 0);
      tris += triangleCount(this.mesh);
      draws++;
    }
    return { draws, tris };
  }

  private ensureShadow() {
    if (this.shadowFbo) return;
    const gl = this.gl;
    this.shadowFbo = gl.createFramebuffer()!;
    this.shadowTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, SHADOW_SIZE, SHADOW_SIZE, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const r = buildProgram(gl, SHADOW_VS, SHADOW_FS);
    if ('result' in r) this.shadowProg = r.result;
  }

  /** 从平行光视角渲染深度（模型 + 地面） */
  private renderShadowMap() {
    this.ensureShadow();
    if (!this.shadowProg || !this.mesh) return;
    const gl = this.gl;
    const l = LIGHT_DIR;
    const eye: Vec3 = [l[0] * 8, l[1] * 8, l[2] * 8];
    const lightView = M4();
    lookAt(lightView, eye, [0, 0, 0], [0, 1, 0]);
    const lightProj = M4();
    orthoOffCenter(lightProj, -4.5, 4.5, -4.5, 4.5, 0.5, 30);
    multiply(this.lightViewProj, lightProj, lightView);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
    gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(this.shadowProg.program);
    gl.uniformMatrix4fv(this.shadowProg.locations.get('uLightViewProj')!, false, this.lightViewProj);
    const locModel = this.shadowProg.locations.get('uModel')!;
    gl.uniformMatrix4fv(locModel, false, this.model);
    this.bindMeshAttributes(this.shadowProg, this.mesh);
    gl.drawElements(gl.TRIANGLES, this.mesh.indices.length, gl.UNSIGNED_INT, 0);
    trs(this.tmpArr, 0, -1.05, 0, 0, 1);
    gl.uniformMatrix4fv(locModel, false, this.tmpArr);
    this.bindMeshAttributes(this.shadowProg, this.floorMesh);
    gl.drawElements(gl.TRIANGLES, this.floorMesh.indices.length, gl.UNSIGNED_INT, 0);
    // 恢复屏幕渲染状态
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  private drawPostScene(w: number, h: number): { draws: number; tris: number } {
    const gl = this.gl;
    const rt = this.rt!;
    rt.resize(w, h);
    // 1) 画廊源场景 → RT（MRT: 颜色 + 法线）
    rt.bind();
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.08, 0.09, 0.12, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    const p = this.galleryProg;
    gl.useProgram(p.program);
    const drawGalleryMesh = (mesh: MeshData, model: Float32Array) => {
      normalMatrix(this.normalMat, model as Mat4Alias);
      gl.uniformMatrix4fv(p.locations.get('uModel')!, false, model);
      gl.uniformMatrix4fv(p.locations.get('uViewProj')!, false, this.camera.viewProj);
      gl.uniformMatrix3fv(p.locations.get('uNormalMatrix')!, false, this.normalMat);
      gl.uniform3fv(p.locations.get('uCamPos')!, this.camera.eye);
      gl.uniform1f(p.locations.get('uTime')!, this.time);
      this.bindMeshAttributes(p, mesh);
      gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_INT, 0);
    };
    drawGalleryMesh(this.floorGalleryMesh, this.tmpModel(0, -1.05, 0, 0, 1));
    for (const g of this.galleryMeshes) drawGalleryMesh(g.mesh, g.model().m as Float32Array);
    rt.generateMips();

    // 2) 后处理 Pass → 屏幕
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.DEPTH_TEST);
    const pass = this.passes[0];
    if (!pass) return { draws: 0, tris: 0 };
    gl.useProgram(pass.prog.program);
    gl.bindVertexArray(this.quadVAO);
    rt.bindTexture(rt.colorTex, 0);
    rt.bindTexture(rt.normalTex, 1);
    rt.bindTexture(rt.depthTex, 2);
    this.bindBuiltins(pass.prog, {
      uSceneTex: () => gl.uniform1i(pass.prog.locations.get('uSceneTex')!, 0),
      uNormalTex: () => gl.uniform1i(pass.prog.locations.get('uNormalTex')!, 1),
      uSceneDepth: () => gl.uniform1i(pass.prog.locations.get('uSceneDepth')!, 2),
    });
    const userSamplers = this.bindUserUniforms(pass.prog, 3);
    // Shadertoy 方言约定：后处理场景中 iChannel0/1/2 = 场景颜色/法线/深度（覆盖默认纹理库绑定）
    for (const { name, unit } of userSamplers) {
      const target =
        name === 'iChannel0' ? rt.colorTex :
        name === 'iChannel1' ? rt.normalTex :
        name === 'iChannel2' ? rt.depthTex : null;
      if (target) rt.bindTexture(target, unit);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.enable(gl.DEPTH_TEST);
    return { draws: 2, tris: triangleCount(this.floorGalleryMesh) + 3 };
  }

  private floorGalleryMesh = makePlane(12, 1);

  // ---------- 采集 ----------

  snapshot(): string {
    this.renderOnce();
    return this.canvas.toDataURL('image/png');
  }

  captureStream(fps: number): MediaStream {
    return this.canvas.captureStream(fps);
  }

  dispose() {
    this.stop();
    const gl = this.gl;
    this.samplerCache.clear();
    for (const p of this.passes) gl.deleteProgram(p.prog.program);
    gl.deleteProgram(this.floorProg.program);
    gl.deleteProgram(this.galleryProg.program);
    for (const t of this.userTextures.values()) gl.deleteTexture(t);
    this.rt?.dispose();
    this.buffers.forEach((b) => gl.deleteBuffer(b));
    this.indexBuffers.forEach((b) => gl.deleteBuffer(b));
    gl.deleteBuffer(this.quadBuf);
    gl.deleteVertexArray(this.quadVAO);
  }
}

type Mat4Alias = Float32Array;

function applyPassState(gl: WebGL2RenderingContext, def: PassDef) {
  const blend = def.blend ?? 'opaque';
  if (blend === 'additive') {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  } else if (blend === 'alpha') {
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  } else {
    gl.disable(gl.BLEND);
  }
  const cull = def.cull ?? 'back';
  if (cull === 'none') gl.disable(gl.CULL_FACE);
  else {
    gl.enable(gl.CULL_FACE);
    gl.cullFace(cull === 'front' ? gl.FRONT : gl.BACK);
  }
  gl.depthMask(true);
  gl.enable(gl.DEPTH_TEST);
}
