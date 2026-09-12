// 内核提供的默认顶点着色器 / 头文件模板
export const MESH_VS_GLSL3 = `#version 300 es
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUV;
uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProjection;
uniform mat3 uNormalMatrix;
uniform float uTime;
out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vUV;
void main() {
  vec4 worldPos = uModel * vec4(aPosition, 1.0);
  vWorldPos = worldPos.xyz;
  vNormal = uNormalMatrix * aNormal;
  vUV = aUV;
  gl_Position = uProjection * uView * worldPos;
}`;

export const MESH_VS_GLSL1 = `attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec2 aUV;
uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProjection;
uniform mat3 uNormalMatrix;
uniform float uTime;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vUV;
void main() {
  vec4 worldPos = uModel * vec4(aPosition, 1.0);
  vWorldPos = worldPos.xyz;
  vNormal = uNormalMatrix * aNormal;
  vUV = aUV;
  gl_Position = uProjection * uView * worldPos;
}`;

export const FS_HEADER_GLSL3 = `#version 300 es
precision highp float;
out vec4 fragColor;
`;

export const FS_HEADER_GLSL1 = `precision mediump float;
`;

/** 全屏大三角形顶点着色器（GLSL3 / GLSL1 版本需与片元一致） */
export const FSQUAD_VS_GLSL3 = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUV;
void main() {
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

export const FSQUAD_VS_GLSL1 = `attribute vec2 aPos;
varying vec2 vUV;
void main() {
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

/** 组装 GLSL3 片元：缺失 #version 时自动补标准头 */
export function assembleGLSL3Fragment(userFs: string, kind: 'fullscreen' | 'mesh' | 'post'): { code: string; lineOffset: number } {
  if (/^\s*#\s*version/m.test(userFs)) return { code: userFs, lineOffset: 0 };
  const header = FS_HEADER_GLSL3;
  return { code: header + userFs, lineOffset: header.split('\n').length };
}

export function assembleGLSL1Fragment(userFs: string): { code: string; lineOffset: number } {
  if (/precision\s+(high|medium|low)p\s+float/.test(userFs)) return { code: userFs, lineOffset: 0 };
  return { code: FS_HEADER_GLSL1 + userFs, lineOffset: FS_HEADER_GLSL1.split('\n').length };
}
