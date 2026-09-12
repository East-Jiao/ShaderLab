// WGSL（WebGPU）语言描述符 —— 渲染由 wgsl-backend.ts 执行
import type { LanguageDescriptor } from '../engine/types';
import { WGSL_GLOBALS } from './wgsl-backend';

export const wgsl: LanguageDescriptor = {
  id: 'wgsl',
  label: 'WGSL（WebGPU）',
  backend: 'webgpu',
  editorMode: 'wgsl',
  template: (kind) => {
    if (kind === 'mesh') {
      return `// WGSL 网格着色器（WebGPU）。内核自动前置：${'Globals'} 结构体 + uniform G（含矩阵/相机/时间）。
struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) worldPos: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
};

@vertex
fn vs_main(@location(0) position: vec3f, @location(1) normal: vec3f, @location(2) uv: vec2f) -> VSOut {
  var out: VSOut;
  let wp = G.model * vec4f(position, 1.0);
  out.worldPos = wp.xyz;
  out.normal = (G.normalMat * normal);
  out.uv = uv;
  out.pos = G.viewProj * wp;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4f {
  let N = normalize(in.normal);
  let L = normalize(vec3f(0.5, 0.8, 0.4));
  let diff = max(dot(N, L), 0.0);
  return vec4f(vec3f(0.35 + 0.6 * diff) * vec3f(0.9, 0.6, 0.4), 1.0);
}`;
    }
    return `// WGSL 全屏着色器（WebGPU）。内核自动提供：Globals uniform（G）+ 全屏顶点着色器。
// G: time / deltaTime / frame / resolution / invResolution / mouse / camPos / camRot / viewProj / model / normalMat / near / far
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let t = G.time;
  return vec4f(0.5 + 0.5 * cos(t + uv.xyx + vec3f(0.0, 2.0, 4.0)), 1.0);
}`;
  },
};

export { WGSL_GLOBALS };
