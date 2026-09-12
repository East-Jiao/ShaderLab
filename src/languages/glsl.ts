// GLSL ES 3.0 / GLSL ES 1.0 语言（直通，缺头自动补）
import type { LanguageDescriptor, PassDef, SceneConfig } from '../engine/types';
import { assembleGLSL3Fragment, assembleGLSL1Fragment, MESH_VS_GLSL3, MESH_VS_GLSL1, FSQUAD_VS_GLSL3, FSQUAD_VS_GLSL1 } from './defaults';
import { unsupported } from './registry';

const glsl3: LanguageDescriptor = {
  id: 'glsl3',
  label: 'GLSL ES 3.0（WebGL2）',
  backend: 'webgl2',
  editorMode: 'glsl',
  template: (kind) => {
    if (kind === 'mesh') {
      // mesh 场景：顶点着色器由内核默认模板提供，这里返回片元
      return `#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vUV;
out vec4 fragColor;

uniform float uTime;

void main() {
  vec3 N = normalize(vNormal);
  float diff = max(dot(N, normalize(vec3(0.5, 0.8, 0.4))), 0.0);
  fragColor = vec4(vec3(0.35 + 0.6 * diff) * vec3(0.9, 0.6, 0.4), 1.0);
}`;
    }
    return `#version 300 es
precision highp float;

out vec4 fragColor;
uniform vec2  uResolution;   // 画布分辨率
uniform float uTime;         // 秒
uniform vec4  uMouse;        // xy=像素坐标 z/w=是否按下
uniform vec3  uCamPos;       // 相机位置（轨道相机）
uniform mat3  uCamRot;       // 相机基（right/up/forward）

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec3 col = 0.5 + 0.5 * cos(uTime + uv.xyx + vec3(0, 2, 4));
  fragColor = vec4(col, 1.0);
}`;
  },
};

const glsl1: LanguageDescriptor = {
  id: 'glsl1',
  label: 'GLSL ES 1.0（WebGL1 风格）',
  backend: 'webgl2',
  editorMode: 'glsl',
  template: (kind) => {
    if (kind === 'mesh') {
      return `precision mediump float;
varying vec3 vNormal;
varying vec2 vUV;
uniform float uTime;

void main() {
  float diff = max(dot(normalize(vNormal), normalize(vec3(0.5, 0.8, 0.4))), 0.0);
  gl_FragColor = vec4(vec3(0.3 + 0.7 * diff) * vec3(0.4, 0.7, 0.9), 1.0);
}`;
    }
    return `precision highp float;
varying vec2 vUV;
uniform float uTime;

void main() {
  vec2 uv = vUV;
  vec3 col = 0.5 + 0.5 * cos(uTime + uv.xyx + vec3(0, 2, 4));
  gl_FragColor = vec4(col, 1.0);
}`;
  },
};

/** GLSL 直通翻译 */
export function translateGLSL(passes: PassDef[], scene: SceneConfig, version: 1 | 3): PassDef[] {
  const fsQuadVS = version === 1 ? FSQUAD_VS_GLSL1 : FSQUAD_VS_GLSL3;
  if (scene.kind === 'fullscreen' || scene.kind === 'post') {
    return passes.map((p) => {
      if (version === 1) {
        const a = assembleGLSL1Fragment(p.fs);
        return { ...p, vs: fsQuadVS, fs: a.code, lineOffset: a.lineOffset };
      }
      const a = assembleGLSL3Fragment(p.fs, scene.kind);
      return { ...p, vs: fsQuadVS, fs: a.code, lineOffset: a.lineOffset };
    });
  }
  // mesh：片元同样补头；顶点缺失则用默认 VS
  return passes.map((p) => {
    const a = version === 1 ? assembleGLSL1Fragment(p.fs) : assembleGLSL3Fragment(p.fs, 'mesh');
    const vs = p.vs.trim() ? p.vs : version === 1 ? MESH_VS_GLSL1 : MESH_VS_GLSL3;
    return { ...p, vs, fs: a.code, lineOffset: a.lineOffset };
  });
}

export const glsl3Descriptor = glsl3;
export const glsl1Descriptor = glsl1;
export { unsupported };
