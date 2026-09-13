// WebGL2 基础设施：上下文 / 程序编译 / 反射 / 错误解析
import type { CompiledUniform, ShaderError, UniformType } from './types';

export const BUILTIN_UNIFORMS = new Set([
  'uTime', 'uDeltaTime', 'uFrame', 'uResolution', 'uInvResolution', 'uMouse',
  'uCamPos', 'uCamRot', 'uView', 'uProjection', 'uViewProj', 'uModel', 'uNormalMatrix',
  'uNear', 'uFar', 'uSceneTex', 'uNormalTex', 'uSceneDepth',
  // 阴影系统（内核渲染阴影贴图并自动填充）
  'uLightDir', 'uLightViewProj', 'uShadowMap', 'uShadowTexel',
  // Shadertoy 兼容层（iChannel0-3 除外：它们是用户可换的纹理槽）
  'iTime', 'iTimeDelta', 'iFrame', 'iResolution', 'iMouse', 'iCamPos', 'iCamRot',
  'iDate', 'iChannelResolution',
]);

export function createGL(canvas: HTMLCanvasElement): WebGL2RenderingContext | null {
  const gl = canvas.getContext('webgl2', {
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  });
  if (gl) gl.getExtension('EXT_color_buffer_float');
  return gl;
}

export interface GLProgram {
  program: WebGLProgram;
  uniforms: CompiledUniform[];
  attributes: string[];
  locations: Map<string, WebGLUniformLocation | null>;
  attribLocations: Map<string, number>;
}

function mapGlslType(gl: WebGL2RenderingContext, t: number, size: number): UniformType | null {
  const { FLOAT, FLOAT_VEC2, FLOAT_VEC3, FLOAT_VEC4, INT, BOOL, SAMPLER_2D, FLOAT_MAT3, FLOAT_MAT4 } = gl;
  switch (t) {
    case FLOAT: return 'float';
    case FLOAT_VEC2: return 'vec2';
    case FLOAT_VEC3: return 'vec3';
    case FLOAT_VEC4: return 'vec4';
    case INT: case BOOL: return 'int';
    case SAMPLER_2D: return 'sampler2D';
    default:
      void size; void FLOAT_MAT3; void FLOAT_MAT4;
      return null; // mat / 数组等：内核直接供值，不进 UI
  }
}

export function buildProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): { result: GLProgram } | { errors: ShaderError[]; rawLog: string } {
  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vs, vsSrc);
  gl.compileShader(vs);
  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fs, fsSrc);
  gl.compileShader(fs);

  const vLog = gl.getShaderInfoLog(vs) || '';
  const fLog = gl.getShaderInfoLog(fs) || '';
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS) || !gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    const stage = !gl.getShaderParameter(vs, gl.COMPILE_STATUS) ? 'vertex' : 'fragment';
    const raw = (stage === 'vertex' ? vLog : fLog) || (vLog + fLog);
    const vsLines = vsSrc.split('\n').length;
    // 驱动把 vs/fs 都报为 0:<line>；若是 fs，行号需要减去 vs 行数（两段独立编译，fs 从 0 开始）。
    // 这里 fs 是单独编译的，行号无需偏移 —— glsl es 驱动日志为 "ERROR: 0:N: msg"。
    return { errors: parseErrorLog(raw, (l) => l, stage), rawLog: raw };
  }

  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  // GLSL ES 1.0 没有 layout(location) 限定符：link 前固定 attribute 槽位
  gl.bindAttribLocation(program, 0, 'aPos');
  gl.bindAttribLocation(program, 0, 'aPosition');
  gl.bindAttribLocation(program, 1, 'aNormal');
  gl.bindAttribLocation(program, 2, 'aUV');
  gl.bindAttribLocation(program, 3, 'aTangent');
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const raw = gl.getProgramInfoLog(program) || 'link failed';
    return { errors: [{ line: 1, rawLine: 1, message: raw }], rawLog: raw };
  }

  const uniforms: CompiledUniform[] = [];
  const locations = new Map<string, WebGLUniformLocation | null>();
  const nU = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < nU; i++) {
    const info = gl.getActiveUniform(program, i);
    if (!info) continue;
    const name = info.name.replace(/\[0\]$/, '');
    locations.set(name, gl.getUniformLocation(program, info.name));
    const t = mapGlslType(gl, info.type, info.size);
    if (t) uniforms.push({ name, type: t, size: info.size });
  }

  const attributes: string[] = [];
  const attribLocations = new Map<string, number>();
  const nA = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES) as number;
  for (let i = 0; i < nA; i++) {
    const info = gl.getActiveAttrib(program, i);
    if (!info) continue;
    attributes.push(info.name);
    attribLocations.set(info.name, gl.getAttribLocation(program, info.name));
  }

  return { result: { program, uniforms, attributes, locations, attribLocations } };
}

const ERROR_RE = /ERROR:\s*\d+:(\d+):\s*(.+)/g;

export function parseErrorLog(log: string, lineMap: (n: number) => number, stage: string): ShaderError[] {
  const errors: ShaderError[] = [];
  let m: RegExpExecArray | null;
  ERROR_RE.lastIndex = 0;
  while ((m = ERROR_RE.exec(log))) {
    const rawLine = parseInt(m[1], 10);
    errors.push({
      rawLine,
      line: lineMap(rawLine),
      message: `[${stage === 'vertex' ? '顶点' : '片元'}] ${m[2].trim()}`,
    });
    if (errors.length >= 12) break;
  }
  if (!errors.length && log.trim()) {
    errors.push({ line: 1, rawLine: 1, message: log.trim(), suggestion: undefined });
  }
  return errors;
}

export function setUniformValue(
  gl: WebGL2RenderingContext,
  loc: WebGLUniformLocation | null,
  type: UniformType,
  v: number[] | number,
) {
  if (!loc) return;
  switch (type) {
    case 'float': gl.uniform1f(loc, v as number); break;
    case 'int': gl.uniform1i(loc, Math.round(v as number)); break;
    case 'bool': gl.uniform1i(loc, v ? 1 : 0); break;
    case 'vec2': gl.uniform2fv(loc, v as number[]); break;
    case 'vec3': gl.uniform3fv(loc, v as number[]); break;
    case 'vec4': gl.uniform4fv(loc, v as number[]); break;
    case 'sampler2D': gl.uniform1i(loc, v as number); break;
  }
}
