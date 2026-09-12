// Uniform 反射 + 源码注解解析，生成检查器 UI 所需的 UniformMeta
import type { CompiledUniform, UniformMeta } from './types';
import { BUILTIN_UNIFORMS } from './gl';

export interface Annotations {
  range?: [number, number];
  color?: boolean;
  def?: number[];
  desc?: string;
}

/** 解析源码中 uniform 声明后的注释注解：// @range 0 2 @color @default 0.5 */
export function parseAnnotations(sources: string[]): Map<string, Annotations> {
  const map = new Map<string, Annotations>();
  const re = /uniform\s+(?:highp\s+|mediump\s+|lowp\s+)?(float|int|bool|vec\d|sampler2D)\s+(\w+)\s*;([^\n]*)/g;
  for (const src of sources) {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(src))) {
      const name = m[2];
      const comment = m[3] || '';
      const a: Annotations = map.get(name) || {};
      const range = comment.match(/@range\s+(-?[\d.]+)\s+(-?[\d.]+)/);
      if (range) a.range = [parseFloat(range[1]), parseFloat(range[2])];
      if (/@color\b/.test(comment)) a.color = true;
      const def = comment.match(/@default\s+((?:-?[\d.]+\s*)+)/);
      if (def) a.def = def[1].trim().split(/\s+/).map(parseFloat);
      const desc = comment.match(/@desc\s+([^@]*)/);
      if (desc) a.desc = desc[1].trim();
      map.set(name, a);
    }
  }
  return map;
}

const NAME_COLOR_HINT = /(color|colour|tint|albedo|col\b|basecolor|emission|ambient|diffuse|spec)/i;

export function buildUniformMetas(
  perPass: CompiledUniform[][],
  presetOverrides: UniformMeta[] | undefined,
  sources: string[],
  defaults: Record<string, unknown> = {},
): UniformMeta[] {
  const ann = parseAnnotations(sources);
  const merged = new Map<string, UniformMeta>();

  for (const list of perPass) {
    for (const u of list) {
      if (BUILTIN_UNIFORMS.has(u.name)) continue;
      if (u.name.startsWith('gl_')) continue;
      if (merged.has(u.name)) continue;
      const a = ann.get(u.name) || {};
      const meta: UniformMeta = { name: u.name, type: u.type };
      if (a.range) meta.range = a.range;
      if (a.color) meta.color = true;
      if (a.desc) meta.desc = a.desc;
      // 颜色启发：vec3/vec4 且名字带颜色语义
      if (!meta.color && (u.type === 'vec3' || u.type === 'vec4') && NAME_COLOR_HINT.test(u.name)) {
        meta.color = true;
      }
      // 默认值
      if (u.type === 'float' || u.type === 'int') {
        meta.value = [num(a.def?.[0], defaults[u.name], u.type === 'float' ? 0.5 : 3)];
        if (!meta.range) meta.range = u.type === 'int' ? [0, 10] : [0, 1];
      } else if (u.type === 'bool') {
        meta.value = [a.def?.[0] ?? asNum(defaults[u.name], 1)];
      } else if (u.type === 'vec2') {
        meta.value = a.def ?? (Array.isArray(defaults[u.name]) ? (defaults[u.name] as number[]).slice(0, 2) : [0, 0]);
        if (!meta.range) meta.range = [-5, 5];
      } else if (u.type === 'vec3') {
        meta.value = a.def ?? (Array.isArray(defaults[u.name]) ? (defaults[u.name] as number[]).slice(0, 3) : meta.color ? [0.8, 0.5, 0.2] : [0, 0, 0]);
        if (!meta.range && !meta.color) meta.range = [-5, 5];
      } else if (u.type === 'vec4') {
        meta.value = a.def ?? (Array.isArray(defaults[u.name]) ? (defaults[u.name] as number[]).slice(0, 4) : meta.color ? [0.8, 0.5, 0.2, 1] : [0, 0, 0, 1]);
        if (!meta.range && !meta.color) meta.range = [-5, 5];
      } else if (u.type === 'sampler2D') {
        meta.sampler = (defaults[u.name] as string) || 'checker';
        meta.value = [0];
      }
      merged.set(u.name, meta);
    }
  }

  // 预设声明覆盖（作者显式指定的 meta 优先级最高）
  if (presetOverrides) {
    for (const o of presetOverrides) {
      const prev = merged.get(o.name);
      const meta: UniformMeta = { ...(prev || { type: o.type, value: o.value }), ...o };
      merged.set(o.name, meta);
    }
  }
  return [...merged.values()];
}

function asNum(v: unknown, fallback: number): number {
  return typeof v === 'number' && !Number.isNaN(v) ? v : fallback;
}

function num(a: number | undefined, b: unknown, fallback: number): number {
  if (a !== undefined && !Number.isNaN(a)) return a;
  if (typeof b === 'number' && !Number.isNaN(b)) return b;
  if (Array.isArray(b) && typeof b[0] === 'number') return b[0];
  return fallback;
}
