// HLSL → GLSL ES 3.0 实验性转译器（逐行转译，保持行号对齐，便于报错定位）
// 支持子集：cbuffer / Texture2D / SamplerState / PSMain 全屏入口 / 常用内置函数。
// 行号对齐策略：每行输入输出一行，报错行号可直接映射回用户代码。
import type { LanguageDescriptor, PassDef, SceneConfig } from '../engine/types';
import { unsupported } from './registry';
import { FSQUAD_VS_GLSL3 } from './defaults';

const BUILTIN_MAP: Record<string, string> = {
  Time: 'uTime', DeltaTime: 'uDeltaTime', Frame: 'uFrame', Resolution: 'uResolution',
  Mouse: 'uMouse', CamPos: 'uCamPos', Near: 'uNear', Far: 'uFar',
};

const TYPE_TOKENS: [RegExp, string][] = [
  [/\bfloat4x4\b/g, 'mat4'], [/\bfloat3x3\b/g, 'mat3'], [/\bfloat2x2\b/g, 'mat2'],
  [/\bhalf4x4\b/g, 'mat4'], [/\bhalf3x3\b/g, 'mat3'],
  [/\bfloat4\b/g, 'vec4'], [/\bfloat3\b/g, 'vec3'], [/\bfloat2\b/g, 'vec2'],
  [/\bhalf4\b/g, 'vec4'], [/\bhalf3\b/g, 'vec3'], [/\bhalf2\b/g, 'vec2'],
  [/\bint4\b/g, 'ivec4'], [/\bint3\b/g, 'ivec3'], [/\bint2\b/g, 'ivec2'],
  [/\buint4\b/g, 'uvec4'], [/\buint3\b/g, 'uvec3'], [/\buint2\b/g, 'uvec2'],
  [/\bbool4\b/g, 'bvec4'], [/\bbool3\b/g, 'bvec3'], [/\bbool2\b/g, 'bvec2'],
  [/\bhalf1\b/g, 'float'], [/\bhalf\b/g, 'float'], [/\bfixed\b/g, 'float'],
];

const CALL_TOKENS: [RegExp, string][] = [
  [/\bsaturate\s*\(/g, 'sat('],
  [/\blerp\s*\(/g, 'mix('],
  [/\bfrac\s*\(/g, 'fract('],
  [/\batan2\s*\(/g, 'atan('],
  [/\brsqrt\s*\(/g, 'inversesqrt('],
  [/\bddx\s*\(/g, 'dFdx('],
  [/\bddy\s*\(/g, 'dFdy('],
  [/\btex2D\s*\(/g, 'texture('],
  [/\bclip\s*\(/g, 'hlslClip('],
  [/\bfmod\s*\(/g, 'mod('],
  [/(\w+)\.Sample\s*\(\s*\w+\s*,\s*/g, 'texture($1, '],
];

const HELPERS = `float sat(float x){ return clamp(x, 0.0, 1.0); }
vec2 sat(vec2 x){ return clamp(x, 0.0, 1.0); }
vec3 sat(vec3 x){ return clamp(x, 0.0, 1.0); }
vec4 sat(vec4 x){ return clamp(x, 0.0, 1.0); }
void hlslClip(float x){ if (x < 0.0) discard; }
`;

interface Param {
  type: string;
  name: string;
  semantic: string;
}

function stripBlockComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

function parseParams(list: string): Param[] {
  return list.split(',').map((s) => s.trim()).filter(Boolean).map((p) => {
    const m = p.match(/^(.*?[\w>]+)\s+(\w+)\s*(?::\s*(\w+))?$/);
    if (!m) return { type: 'vec4', name: '_arg', semantic: '' };
    return { type: m[1].trim(), name: m[2], semantic: (m[3] || '').toUpperCase() };
  });
}

function convertType(ty: string): string {
  let out = ty;
  for (const [re, to] of TYPE_TOKENS) out = out.replace(re, to);
  return out;
}

function translateLine(line: string): string {
  let out = line;
  if (/\[\s*(unroll|branch|loop|fastopt)\s*\]/.test(out)) out = out.replace(/\[[^\]]*\]/g, '');
  if (/^\s*#\s*(pragma|include|pack_matrix)/.test(out)) return '// [HLSL→GLSL] ' + out.trim();
  out = out.replace(/\bstatic\s+/g, '').replace(/\binline\s+/g, '');
  // cbuffer 内置成员名 -> 内核内置 uniform 名（Time -> uTime 等）
  for (const [n, builtin] of Object.entries(BUILTIN_MAP)) {
    if (n !== builtin) out = out.replace(new RegExp(`\\b${n}\\b`, 'g'), builtin);
  }
  for (const [re, to] of TYPE_TOKENS) out = out.replace(re, to);
  for (const [re, to] of CALL_TOKENS) out = out.replace(re, to);
  // mul(A, B) -> (A * B)
  out = out.replace(/\bmul\s*\(([^(),]+(?:\([^()]*\))?[^(),]*),\s*([^()]*(?:\([^()]*\))?[^()]*)\)/g, '($1 * $2)');
  // 字面量后缀
  out = out.replace(/\b(\d+\.\d*)[fh]\b/g, '$1').replace(/\b(\d+)[fh]\b/g, '$1.0');
  // 标量初始化 vec3 x = 1; -> vec3 x = vec3(1);
  out = out.replace(/\b(vec[234])\s+(\w+)\s*=\s*(-?\d+(?:\.\d+)?)\s*;/g, '$1 $2 = $1($3);');
  return out;
}

function translateHLSLFullscreen(src: string): { fs: string; lineOffset: number; headerNote: string } {
  const lines = stripBlockComments(src).split('\n');
  const out: string[] = [];
  const uniformDecls: string[] = [];
  let entryFound = false;
  let entryName = 'PSMain';
  let entryArgs: string[] = [];
  let inCbuffer = false;
  let cbufferDepth = 0;

  for (const raw of lines) {
    let line = raw;
    // cbuffer 块处理
    if (!inCbuffer && /\bcbuffer\b/.test(line)) {
      inCbuffer = true;
      cbufferDepth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      out.push('');
      continue;
    }
    if (inCbuffer) {
      const member = line.match(/^\s*(?:float|half|fixed|int|uint|bool)\d?\s+(\w+)\s*;/);
      if (member) {
        const n = member[1];
        const glslName = BUILTIN_MAP[n] || n;
        // 头部已声明的内置 uniform 不重复声明
        if (!BUILTIN_MAP[n]) {
          const typeMatch = line.trim().match(/^(?:float|half|fixed|int|uint|bool)(\d?)/);
          const vec = typeMatch && typeMatch[1] ? `vec${typeMatch[1]}` : 'float';
          uniformDecls.push(`uniform ${vec} ${glslName};   // ${n}`);
        }
        out.push('');
      } else {
        cbufferDepth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
        if (cbufferDepth <= 0) inCbuffer = false;
        out.push('');
      }
      continue;
    }
    // 纹理声明
    const tex = line.match(/^\s*Texture2D\s+(\w+)/);
    if (tex) {
      uniformDecls.push(`uniform sampler2D ${tex[1]};`);
      out.push('');
      continue;
    }
    if (/^\s*SamplerState\s+\w+/.test(line)) {
      out.push('');
      continue;
    }
    // PS 入口（float4/half4/vec4 返回类型）
    const entry = line.match(/^\s*(?:float4|half4|vec4)\s+(\w+)\s*\((.*)\)\s*:\s*SV_Target\w*\s*\{/);
    if (entry) {
      entryFound = true;
      entryName = entry[1];
      const params = parseParams(entry[2]);
      entryArgs = params.map((p) => {
        if (p.semantic.startsWith('TEXCOORD')) return 'vUV';
        if (p.semantic.startsWith('SV_POSITION')) return 'vec4(vUV * 2.0 - 1.0, 0.0, 1.0)';
        const ty = convertType(p.type);
        return ty.startsWith('vec') ? `${ty}(0.0)` : '0.0';
      });
      const sig = params.map((p) => `${convertType(p.type)} ${p.name}`).join(', ');
      out.push(`vec4 ${entry[1]}(${sig}) {`);
      continue;
    }
    out.push(translateLine(line));
  }

  if (!entryFound) {
    const err = `#error 未找到 HLSL 入口：需要形如 float4 PSMain(float2 uv : TEXCOORD0) : SV_Target { ... }`;
    const header = HEADER_LINES.join('\n');
    return { fs: header + err + '\n' + uniformDecls.join('\n') + '\n' + out.join('\n'), lineOffset: HEADER_LINES.length, headerNote: 'missing entry' };
  }

  const header = [
    ...HEADER_LINES,
    ...uniformDecls,
    HELPERS.trimEnd(),
  ];
  const footer = ['',
    `void main() {`,
    `  fragColor = ${entryName}(${entryArgs.join(', ')});`,
    `}`];
  return {
    fs: header.join('\n') + '\n' + out.join('\n') + footer.join('\n'),
    lineOffset: header.length,
    headerNote: '',
  };
}

const HEADER_LINES = [
  '#version 300 es',
  'precision highp float;',
  'in vec2 vUV;              // 0..1（由内核全屏顶点着色器提供）',
  'out vec4 fragColor;',
  'uniform float uTime;',
  'uniform vec2  uResolution;',
];

export const hlsl: LanguageDescriptor = {
  id: 'hlsl',
  label: 'HLSL（实验转译）',
  backend: 'webgl2',
  editorMode: 'hlsl',
  template: () => `// HLSL 全屏着色器（实验性：转译为 GLSL ES 3.0 后由 WebGL2 执行）
// 支持子集：cbuffer / Texture2D / PSMain 入口 / 常用函数（lerp、saturate、frac、mul、tex2D...）
// cbuffer 成员约定：Time/Resolution/Mouse/CamPos 会自动映射为内核内置 uniform
cbuffer PerFrame : register(b0) {
  float  Time;        // -> uTime（秒）
  float2 Resolution;  // -> uResolution（像素）
};

float3 palette(float t) {
  return 0.5 + 0.5 * cos(6.28318 * (t + float3(0.0, 0.33, 0.67)));
}

float4 PSMain(float2 uv : TEXCOORD0) : SV_Target {
  float2 p = uv - 0.5;
  float  r = length(p);
  float  wave = sin(r * 24.0 - Time * 2.0) * 0.5 + 0.5;
  float3 col = palette(wave * 0.4 + r) * (1.0 - r * 1.4);
  return float4(max(col, 0.0), 1.0);
}`,
  translate: (passes, scene) => {
    if (scene.kind === 'mesh') return [unsupported(scene, '全屏 / 后处理')];
    return passes.map((p) => {
      const r = translateHLSLFullscreen(p.fs);
      return { ...p, vs: FSQUAD_VS_GLSL3, fs: r.fs, lineOffset: r.lineOffset };
    });
  },
};

export function hlslToGLSL(src: string): string {
  return translateHLSLFullscreen(src).fs;
}
