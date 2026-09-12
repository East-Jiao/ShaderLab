// Shadertoy 方言：自动包装 mainImage(iTime / iResolution / iChannel0-3 ...)
import type { LanguageDescriptor, PassDef, SceneConfig } from '../engine/types';
import { unsupported } from './registry';
import { FSQUAD_VS_GLSL3 } from './defaults';

const HEADER = `#version 300 es
precision highp float;

/* ===== ShaderLab 自动生成（Shadertoy 兼容层）===== */
out vec4 fragColor;
uniform vec3  iResolution;     // 视口分辨率 (宽, 高, 像素宽高比)
uniform float iTime;           // 运行时间（秒）
uniform float iTimeDelta;      // 帧间隔
uniform int   iFrame;          // 帧号
uniform vec4  iMouse;          // xy=像素 z/w=按下标记
uniform vec3  iCamPos;
uniform mat3  iCamRot;
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform sampler2D iChannel2;
uniform sampler2D iChannel3;
/* ================================================ */
`;

const FOOTER = `
void main() {
  mainImage(fragColor, gl_FragCoord.xy);
}`;

export const shadertoy: LanguageDescriptor = {
  id: 'shadertoy',
  label: 'Shadertoy 风格',
  backend: 'webgl2',
  editorMode: 'glsl',
  template: () => `// Shadertoy 风格：只写 mainImage，其余由内核提供
// iChannel0 在"后处理"场景下 = 场景颜色；全屏场景下 = 程序化噪声纹理
void mainImage(out vec4 O, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  O = vec4(0.5 + 0.5 * cos(iTime + uv.xyx + vec3(0, 2, 4)), 1.0);
}`,
  translate: (passes, scene) => {
    if (scene.kind === 'mesh') return [unsupported(scene, '全屏 / 后处理')];
    return passes.map((p) => {
      if (!/void\s+mainImage\s*\(/.test(p.fs)) {
        return { ...p, vs: FSQUAD_VS_GLSL3, fs: HEADER + p.fs + `\n#error 未找到 mainImage(vec4, vec2) 入口\n` + FOOTER, lineOffset: HEADER.split('\n').length };
      }
      return { ...p, vs: FSQUAD_VS_GLSL3, fs: HEADER + p.fs + FOOTER, lineOffset: HEADER.split('\n').length };
    });
  },
};
