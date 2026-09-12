// 核心类型定义
export type GeometryId = 'sphere' | 'icosphere' | 'torus' | 'torusKnot' | 'cube' | 'plane' | 'cylinder' | 'flag';

export type PresetCategory = 'fullscreen' | 'material' | 'post';

export type UniformType = 'float' | 'int' | 'bool' | 'vec2' | 'vec3' | 'vec4' | 'sampler2D';

export interface UniformMeta {
  name: string;
  type: UniformType;
  /** 当前/默认值，float/vec 用扁平数组 */
  value?: number[];
  range?: [number, number];
  color?: boolean;
  sampler?: string; // 纹理 id（textures.ts 里的键）
  desc?: string;
}

export type BlendMode = 'opaque' | 'alpha' | 'additive';
export type CullMode = 'back' | 'front' | 'none';

export interface PassDef {
  name: string;
  vs: string;
  fs: string;
  blend?: BlendMode;
  cull?: CullMode;
  /** 网格场景中此 pass 是否绘制地面（默认仅第一个 pass 绘制） */
  drawFloor?: boolean;
  /** 翻译后 GLSL 相对用户源码的行偏移（用于报错行号映射） */
  lineOffset?: number;
}

export type SceneConfig =
  | { kind: 'fullscreen' }
  | { kind: 'mesh'; geometry: GeometryId; showFloor?: boolean; spin?: boolean }
  | { kind: 'post' };

export interface PresetDoc {
  summary: string;
  detail?: string[];
  refs?: string[];
}

export interface Preset {
  id: string;
  name: string;
  category: PresetCategory;
  language: string;
  tags: string[];
  scene: SceneConfig;
  passes: PassDef[];
  /** 预设级 uniform 元信息（默认值/范围/颜色标记），与自动反射合并 */
  uniforms?: UniformMeta[];
  docs: PresetDoc;
  resolutionScale?: number;
  camera?: { dist?: number; pitch?: number; yaw?: number; autoRotate?: number };
}

export interface CompiledUniform {
  name: string;
  type: UniformType;
  size: number; // 数组长度或 1
}

export interface ShaderError {
  line: number; // 映射回编辑器的行号（1-based）
  rawLine: number;
  message: string;
  suggestion?: string;
}

export interface CompileResult {
  ok: boolean;
  program?: WebGLProgram;
  errors?: ShaderError[];
  rawLog?: string;
  uniforms?: CompiledUniform[];
  attributes?: string[];
}

/** 语言描述符：每种语言负责把用户代码翻译成内核可编译的 GLSL */
export interface LanguageDescriptor {
  id: string;
  label: string;
  backend: 'webgl2' | 'webgpu';
  /** 编辑器高亮模式 */
  editorMode: 'glsl' | 'hlsl' | 'wgsl' | 'toy';
  /** 片元(或 WGSL)代码模板：新建空文件时使用 */
  template: (kind: 'fullscreen' | 'mesh' | 'post') => string;
  /**
   * 编译前翻译：输入用户各 pass 代码，输出内核可用的 GLSL（webgl2）或原样 WGSL（webgpu）。
   * lineOffset 用于把驱动报错行号映射回编辑器。
   */
  translate?: (passes: PassDef[], scene: SceneConfig) => PassDef[];
}

export interface LogEntry {
  id: number;
  t: number;
  level: 'info' | 'warn' | 'error' | 'ok' | 'gpu';
  src: string;
  msg: string;
  detail?: string;
}
