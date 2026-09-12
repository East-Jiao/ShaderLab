// ToySL —— 一个演示"自定义语言插件"的宏方言（通过公开插件 API 注册）
// 语法：param 声明 uniform；include <snippet> 注入代码片段库；主体是 GLSL。
import type { LanguageDescriptor, PassDef, SceneConfig } from '../engine/types';
import { unsupported } from './registry';
import { findSnippet } from '../assist/snippets';
import { FSQUAD_VS_GLSL3 } from './defaults';

const TOY_HEADER_GLSL = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform vec2  uResolution;
uniform float uTime;
uniform vec4  uMouse;
uniform vec3  uCamPos;
uniform mat3  uCamRot;
`;

const TOY_FOOTER = `
void main() {
  vec4 c = vec4(0.0);
  shaderMain(vUV, c);
  fragColor = c;
}`;

function parseParamLine(line: string): { decl: string; name: string } | null {
  const m = line.match(/^\s*param\s+(\w+)\s*=\s*([^;]+?)\s*(\/\/.*)?$/);
  if (!m) return null;
  const name = m[1];
  const rawValue = m[2].trim();
  const comment = (m[3] || '').trim();
  // GLSL ES 3.0 的 uniform 不允许初始化器，默认值走 @default 注解由内核反射
  let type = 'float';
  let defaults = rawValue;
  if (/^#[0-9a-fA-F]{6}$/.test(rawValue)) {
    const r = (parseInt(rawValue.slice(1, 3), 16) / 255).toFixed(4);
    const g = (parseInt(rawValue.slice(3, 5), 16) / 255).toFixed(4);
    const b = (parseInt(rawValue.slice(5, 7), 16) / 255).toFixed(4);
    type = 'vec3';
    defaults = `${r} ${g} ${b}`;
  } else {
    const nums = rawValue.split(/[,\s]+/).filter(Boolean);
    if (nums.length === 2) { type = 'vec2'; defaults = nums.join(' '); }
    else if (nums.length === 3) { type = 'vec3'; defaults = nums.join(' '); }
    else if (nums.length >= 4) { type = 'vec4'; defaults = nums.slice(0, 4).join(' '); }
  }
  const note = comment ? comment.replace(/^\/\//, '').trim() : '';
  const ann = note ? ` ${note}` : '';
  return { decl: `uniform ${type} ${name}; // @default ${defaults}${ann}`, name };
}

function translateToySL(src: string): { fs: string; lineOffset: number; ok: boolean; message?: string } {
  const lines = src.split('\n');
  const decls: string[] = [];
  const body: string[] = [];
  const notes: string[] = [];
  for (const line of lines) {
    if (/^\s*param\s+\w+\s*=/.test(line)) {
      const p = parseParamLine(line);
      if (p) {
        decls.push(p.decl);
        body.push(''); // 保持行号对齐
        continue;
      }
    }
    const inc = line.match(/^\s*include\s+<([\w\d]+)>/);
    if (inc) {
      const snip = findSnippet(inc[1]);
      if (snip) {
        body.push(`// --- include <${snip.id}> ${snip.name} ---`);
        body.push(...snip.code.split('\n'));
        continue;
      }
      notes.push(`include <${inc[1]}> 未找到对应片段`);
      body.push('');
      continue;
    }
    body.push(line);
  }
  if (!/void\s+shaderMain\s*\(/.test(src)) {
    return { fs: TOY_HEADER_GLSL + '#error ToySL 需要 void shaderMain(vec2 uv, out vec4 fragColor) 入口', lineOffset: TOY_HEADER_GLSL.split('\n').length, ok: false, message: '缺少 shaderMain 入口' };
  }
  const header = [TOY_HEADER_GLSL.trimEnd(), ...decls].join('\n');
  return {
    fs: header + '\n' + body.join('\n') + TOY_FOOTER,
    lineOffset: header.split('\n').length,
    ok: true,
    message: notes.join('; '),
  };
}

/** 通过公开插件 API 注册的示例语言（见 languages/index.ts） */
export const toysl: LanguageDescriptor = {
  id: 'toysl',
  label: 'ToySL（自定义语言示例）',
  backend: 'webgl2',
  editorMode: 'toy',
  template: () => `// ToySL：演示如何给 ShaderLab 添加一门自定义语言（方言 = param 宏 + include 片段 + GLSL 主体）
// param <名字> = 默认值      // @range 0 4 / @color  -> 自动生成检查器控件
// include <片段id>           -> 注入 AI 助手代码片段库中的片段（如 noise2d / fbm / palette）
// 入口：void shaderMain(vec2 uv, out vec4 fragColor)

param speed = 1.4        // @range 0 6
param tint = #ff8844     // @color
include <palette>

void shaderMain(vec2 uv, out vec4 fragColor) {
  float r = length(uv - 0.5);
  float wave = 0.5 + 0.5 * sin(r * 30.0 - uTime * speed);
  fragColor = vec4(palette(wave * 0.3 + uTime * 0.05) * (1.0 - r), 1.0) * vec4(tint, 1.0);
}`,
  translate: (passes, scene) => {
    if (scene.kind === 'mesh') return [unsupported(scene, '全屏')];
    return passes.map((p) => {
      const r = translateToySL(p.fs);
      return { ...p, vs: FSQUAD_VS_GLSL3, fs: r.fs, lineOffset: r.lineOffset };
    });
  },
};
