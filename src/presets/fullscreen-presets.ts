// 全屏 2D / 程序化 预设
import type { Preset } from '../engine/types';

const HEAD = `#version 300 es
precision highp float;

out vec4 fragColor;
uniform vec2  uResolution;
uniform float uTime;`;

export const fullscreenPresets: Preset[] = [
  {
    id: 'fs-neon-plasma',
    name: '霓虹流光 Plasma',
    category: 'fullscreen',
    language: 'glsl3',
    tags: ['经典', '调色板', '入门'],
    scene: { kind: 'fullscreen' },
    passes: [
      {
        name: '主体',
        vs: '',
        fs: HEAD + `
uniform vec3  uColorA;   // @color @default 1.0 0.25 0.55
uniform vec3  uColorB;   // @color @default 0.15 0.5 1.0
uniform float uSpeed;    // @range 0 3 @default 1.0
uniform float uScale;    // @range 1 8 @default 3.0

vec3 palette(float t) {
  return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution) / min(uResolution.x, uResolution.y);
  float t = uTime * uSpeed;
  float v = sin(uv.x * uScale + t)
          + sin((uv.y + uv.x) * uScale * 0.7 - t * 1.3)
          + sin(length(uv) * uScale * 1.5 + t * 0.7);
  vec3 col = mix(uColorA, uColorB, v * 0.25 + 0.5);
  col *= 1.0 - 0.25 * length(uv);
  fragColor = vec4(pow(max(col, 0.0), vec3(0.9)), 1.0);
}`,
      },
    ],
    docs: {
      summary: '经典的余弦调色板 Plasma：多组正弦波叠加驱动色彩流动，常用于背景、加载屏与音乐可视化。',
      detail: [
        'uv 归一化到短边，保证不同窗口比例下图案不拉伸',
        '三组 sin 波（x 方向 / 对角 / 径向）叠加出一个 0..1 的标量场',
        'mix(uColorA, uColorB, v) 把标量场映射到双色，再用幂函数提升对比',
      ],
    },
  },
  {
    id: 'fs-nebula',
    name: '星云 Nebula',
    category: 'fullscreen',
    language: 'glsl3',
    tags: ['太空', '噪声', '星空'],
    scene: { kind: 'fullscreen' },
    passes: [
      {
        name: '主体',
        vs: '',
        fs: HEAD + `
uniform vec3  uNebulaA;    // @color @default 0.55 0.15 0.45
uniform vec3  uNebulaB;    // @color @default 0.1 0.35 0.8
uniform float uDensity;    // @range 0.2 3 @default 1.2
uniform float uStarAmount; // @range 0 3 @default 1.0

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x),
             mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 6; i++) { v += a * noise2(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}
float starLayer(vec2 suv, float t) {
  vec2 gv = fract(suv) - 0.5;
  vec2 id = floor(suv);
  float n = hash21(id);
  vec2 offs = (vec2(hash21(id + 7.3), hash21(id + 3.1)) - 0.5) * 0.8;
  float d = length(gv - offs);
  float tw = 0.6 + 0.4 * sin(t * 3.0 + n * 6.2831);
  return smoothstep(0.05, 0.0, d) * step(0.82, n) * tw;
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution) / min(uResolution.x, uResolution.y);
  vec2 p = uv * 1.6;
  float t = uTime * 0.06;
  float n1 = fbm(p * 1.8 + vec2(t, -t * 0.6));
  float n2 = fbm(p * 3.2 - vec2(t * 0.7, t * 0.4) + n1);
  float neb = pow(max(n1 * 0.7 + n2 * 0.5 - 0.35, 0.0), 1.6) * uDensity;
  vec3 col = mix(uNebulaA, uNebulaB, clamp(n2 * 1.4, 0.0, 1.0)) * neb;
  float dust = smoothstep(0.4, 0.75, fbm(p * 4.0 + n1 * 2.0));
  col *= 1.0 - dust * 0.55;
  col += starLayer(uv * 8.0 + vec2(t * 0.2, 0.0), uTime) * 0.9 * uStarAmount;
  col += starLayer(uv * 16.0 + vec2(-t * 0.35, t * 0.1), uTime * 1.4) * 0.55 * uStarAmount;
  fragColor = vec4(col, 1.0);
}`,
      },
    ],
    docs: {
      summary: 'fbm 分形噪声星云：两层噪声 warp 出星云形态，暗尘带遮挡，双层视差闪烁星点。',
      detail: [
        'fbm 在旋转 + 频率倍增的域上叠加 6 层值噪声',
        '第二层 fbm 以第一层为偏移（domain warp），产生丝缕状结构',
        'starLayer 用网格 hash 放置星点，step 过滤稀疏度，sin 做闪烁',
      ],
    },
  },
  {
    id: 'fs-volumetric-clouds',
    name: '体积云 Volumetric Clouds',
    category: 'fullscreen',
    language: 'glsl3',
    tags: ['体积', 'Raymarch', '天空'],
    scene: { kind: 'fullscreen' },
    camera: { dist: 6.5, pitch: 0.25, autoRotate: 0.2 },
    resolutionScale: 0.8,
    passes: [
      {
        name: '主体',
        vs: '',
        fs: HEAD + `
uniform vec3  uCamPos;
uniform mat3  uCamRot;
uniform float uCoverage;  // @range 0.2 0.9 @default 0.5
uniform float uSunAngle;  // @range 0 6.28 @default 2.4

float hash1(float n) { return fract(sin(n) * 43758.5453); }
float noise3(vec3 x) {
  vec3 p = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float n = p.x + p.y * 57.0 + p.z * 113.0;
  return mix(mix(mix(hash1(n), hash1(n + 1.0), f.x), mix(hash1(n + 57.0), hash1(n + 58.0), f.x), f.y),
             mix(mix(hash1(n + 113.0), hash1(n + 114.0), f.x), mix(hash1(n + 170.0), hash1(n + 171.0), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise3(p); p *= 2.37; a *= 0.5; }
  return v;
}
float cloudDensity(vec3 p) {
  vec3 q = p * 0.35 + vec3(uTime * 0.05, uTime * 0.02, 0.0);
  float base = fbm(q);
  return smoothstep(uCoverage, uCoverage + 0.25, base - abs(p.y - 6.0) * 0.04);
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution) / uResolution.y;
  vec3 ro = vec3(uCamPos.x, max(uCamPos.y * 0.6, 0.5), uCamPos.z);
  vec3 rd = uCamRot * normalize(vec3(uv, 1.4));
  vec3 sun = normalize(vec3(cos(uSunAngle), 0.35, sin(uSunAngle)));
  float sunAmt = pow(max(dot(rd, sun), 0.0), 64.0);
  vec3 sky = mix(vec3(0.35, 0.5, 0.75), vec3(0.65, 0.75, 0.9), rd.y * 0.5 + 0.5)
           + vec3(1.0, 0.75, 0.45) * sunAmt * 1.2;
  float t0 = (1.0 - ro.y) / rd.y;
  float t1 = (9.0 - ro.y) / rd.y;
  vec3 col = sky;
  float trans = 1.0;
  if (rd.y > 0.02 && t1 > t0 && t0 < 90.0) {
    t0 = max(t0, 0.0);
    float stepLen = (t1 - t0) / 48.0;
    float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    float t = t0 + jitter * stepLen;
    for (int i = 0; i < 48; i++) {
      vec3 p = ro + rd * t;
      float d = cloudDensity(p);
      if (d > 0.01) {
        float light = cloudDensity(p + sun * 1.2);
        float li = clamp((d - light) * 2.0 + 0.6, 0.05, 1.0);
        vec3 cloudCol = mix(vec3(0.35, 0.38, 0.45), vec3(1.05, 1.0, 0.95), li);
        float a = clamp(d * 0.6, 0.0, 1.0);
        col = mix(col, cloudCol, a * trans);
        trans *= 1.0 - a * 0.5;
        if (trans < 0.05) break;
      }
      t += stepLen;
    }
  }
  col *= 1.0 - smoothstep(0.0, -0.4, rd.y) * 0.35;
  fragColor = vec4(pow(col, vec3(0.4545)), 1.0);
}`,
      },
    ],
    docs: {
      summary: 'Raymarch 体积云：在云层 slab 内步进 48 次，向太阳方向二次采样近似散射，Beer 风格衰减。',
      detail: [
        '射线与 y∈[1,9] 的云层 slab 求交，得到步进区间',
        '每步用 fbm3D 采样密度，密度高处向太阳方向再采样一次，密度差决定明暗（近似前向散射）',
        'jitter 起始步长打散条带伪影；透射率低于阈值提前退出',
        '分辨率缩放默认 0.8，可在场景设置中调整',
      ],
    },
  },
  {
    id: 'fs-water-caustics',
    name: '水焦散 Caustics',
    category: 'fullscreen',
    language: 'shadertoy',
    tags: ['水', 'Shadertoy', '经典'],
    scene: { kind: 'fullscreen' },
    passes: [
      {
        name: 'mainImage',
        vs: '',
        fs: `// Shadertoy 风格：迭代法模拟水面焦散（经典 caustics 改编）
void mainImage(out vec4 O, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.y;
  vec2 p = uv * 6.0;
  float t = iTime * 0.5;
  vec2 k = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 5; n++) {
    float tt = t * (1.0 - 3.5 / float(n + 1));
    vec2 i = p + vec2(cos(tt - k.x) + sin(tt + k.y), sin(tt - k.y) + cos(tt + k.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 5.0;
  c = 1.17 - pow(c, 1.4);
  vec3 col = vec3(pow(abs(c), 8.0));
  col = clamp(col + vec3(0.0, 0.35, 0.5), 0.0, 1.0);
  col *= 0.6 + 0.4 * smoothstep(1.2, 0.0, uv.y);
  O = vec4(col, 1.0);
}`,
      },
    ],
    docs: {
      summary: 'Shadertoy 方言演示：五次迭代的光线折射近似，生成泳池底部常见的网状焦散。',
      detail: [
        '内核自动提供 iTime / iResolution / iMouse / iChannel0-3，用户只写 mainImage',
        '每轮迭代对 uv 做三角函数扰动，倒数叠加形成亮脊',
        'pow(|c|, 8) 锐化出细网，再叠加水色渐变',
      ],
    },
  },
  {
    id: 'fs-julia',
    name: '朱利亚分形 Julia',
    category: 'fullscreen',
    language: 'glsl1',
    tags: ['分形', 'WebGL1', '经典'],
    scene: { kind: 'fullscreen' },
    passes: [
      {
        name: '主体',
        vs: '',
        fs: `// GLSL ES 1.0（WebGL1 风格）：attribute/varying/gl_FragColor
precision highp float;
varying vec2 vUV;
uniform vec2 uResolution;
uniform float uTime;
uniform float uZoom;      // @range 0.5 3 @default 1.0
uniform vec2  uOffset;    // @range -1 1 @default 0 0

void main() {
  vec2 p = vUV * 2.0 - 1.0;
  p.x *= uResolution.x / uResolution.y;
  vec2 c = vec2(0.355 + 0.18 * cos(uTime * 0.35), 0.355 + 0.18 * sin(uTime * 0.28));
  vec2 z = p / uZoom + uOffset;
  float m = 0.0;
  for (int i = 0; i < 128; i++) {
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    if (dot(z, z) > 16.0) { m = float(i); break; }
  }
  m = m / 128.0;
  vec3 col = vec3(0.5 + 0.5 * cos(6.2831 * (m + vec3(0.0, 0.33, 0.67))));
  col *= smoothstep(0.0, 0.12, m);
  vec3 inside = vec3(0.04, 0.02, 0.1);
  gl_FragColor = vec4(mix(inside, col, step(0.001, m)), 1.0);
}`,
      },
    ],
    docs: {
      summary: 'GLSL ES 1.0 方言演示：朱利亚集合，参数 c 随时间在复平面上游走，展示 WebGL1 兼容能力。',
      detail: [
        'z ← z² + c 迭代 128 次，逃逸时记录迭代数作为颜色索引',
        'c 取 (0.355+0.18cos t, 0.355+0.18sin t)，绕分形主心形边缘转动',
        '注意 GLSL1 的 varying/attribute/gl_FragColor 语法与 3.0 不同',
      ],
    },
  },
  {
    id: 'fs-fire',
    name: '火焰 Flame',
    category: 'fullscreen',
    language: 'glsl3',
    tags: ['特效', '噪声', '2D游戏'],
    scene: { kind: 'fullscreen' },
    passes: [
      {
        name: '主体',
        vs: '',
        fs: HEAD + `
uniform float uIntensity; // @range 0.5 3 @default 1.6
uniform float uWind;      // @range -1 1 @default 0.0

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x),
             mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise2(p); p = p * 2.1 + vec2(3.7, 1.3); a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 p = uv - vec2(0.5, 0.0);
  p.x *= uResolution.x / uResolution.y;
  // 向上流动的域：y 越大噪声采样越靠下
  float n = fbm(vec2(p.x * 4.0 + uWind * p.y * 2.0, p.y * 2.5 - uTime * 2.4));
  float shape = 1.0 - smoothstep(0.0, 1.0, p.y + n * 0.5);
  shape *= smoothstep(0.55, 0.05, abs(p.x) + p.y * 0.35);
  float flame = clamp(shape * uIntensity, 0.0, 1.4);
  vec3 col = mix(vec3(0.55, 0.04, 0.01), vec3(1.0, 0.35, 0.05), clamp(flame, 0.0, 1.0));
  col = mix(col, vec3(1.0, 0.9, 0.45), clamp(flame - 0.55, 0.0, 1.0));
  col *= smoothstep(0.02, 0.25, flame);
  fragColor = vec4(col, 1.0);
}`,
      },
    ],
    docs: {
      summary: '2D 火焰：fbm 沿 y 向上滚动扰动火焰轮廓，温度梯度上黄下红，适合横版游戏的火把/篝火。',
      detail: [
        '噪声域随时间向上滚动（p.y - t）模拟火焰上升',
        'uWind 让火焰随风倾斜',
        '两层颜色 mix：暗红 → 橙 → 亮黄（焰心）',
      ],
    },
  },
  {
    id: 'fs-aurora',
    name: '极光 Aurora',
    category: 'fullscreen',
    language: 'glsl3',
    tags: ['自然', '噪声', '氛围'],
    scene: { kind: 'fullscreen' },
    passes: [
      {
        name: '主体',
        vs: '',
        fs: HEAD + `
uniform vec3  uAuroraColor; // @color @default 0.15 0.9 0.45
uniform vec3  uAccentColor; // @color @default 0.6 0.2 0.9
uniform float uBandCount;   // @range 1 4 @default 3.0

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x),
             mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise2(p); p *= 2.2; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec3 col = mix(vec3(0.015, 0.025, 0.06), vec3(0.04, 0.07, 0.14), uv.y);
  // 星星
  float s = hash21(floor(uv * uResolution / 2.0));
  col += step(0.9975, s) * 0.7;
  float t = uTime * 0.22;
  for (float i = 1.0; i < 5.0; i++) {
    if (i > uBandCount) break;
    float sway = sin(uv.x * 2.0 + t * i + i * 2.7) * 0.14
               + (fbm(vec2(uv.x * 2.4, t * 0.6 + i * 9.0)) - 0.5) * 0.22;
    float baseY = 0.32 + 0.1 * i * 0.2 + sway;
    float above = uv.y - baseY;
    float curtain = smoothstep(0.32, 0.02, above) * step(0.0, above);
    // 竖直条纹（帘状）
    curtain *= 0.65 + 0.35 * sin(uv.x * 26.0 + i * 5.0 + t * 3.0);
    vec3 c = mix(uAuroraColor, uAccentColor, 0.5 + 0.5 * sin(uv.x * 3.0 - t + i));
    col += c * curtain * (0.45 / i);
  }
  fragColor = vec4(col, 1.0);
}`,
      },
    ],
    docs: {
      summary: '极光：多条随 fbm 摆动的光带叠加，帘状竖纹用高频 sin 调制，底部渐隐。',
      detail: [
        '每条光带 = 基线（低频 sin + fbm 摆动）+ 上方指数衰减',
        'band 循环上限 4，由 uBandCount 控制实际条数',
        '星空用屏幕像素 hash 抖点',
      ],
    },
  },
  {
    id: 'fs-starfield-warp',
    name: '星际穿梭 Warp',
    category: 'fullscreen',
    language: 'glsl3',
    tags: ['太空', '粒子', '氛围'],
    scene: { kind: 'fullscreen' },
    passes: [
      {
        name: '主体',
        vs: '',
        fs: HEAD + `
uniform float uWarpSpeed; // @range 0.1 4 @default 1.0
uniform float uLayers;    // @range 4 16 @default 10.0

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution) / min(uResolution.x, uResolution.y);
  vec3 col = vec3(0.0);
  float t = uTime * 0.15 * uWarpSpeed;
  float layers = floor(uLayers);
  for (float i = 0.0; i < 16.0; i++) {
    if (i >= layers) break;
    float depth = fract(i / layers + t);
    float scale = mix(20.0, 0.8, depth);
    float fade = depth * smoothstep(1.0, 0.9, depth);
    vec2 suv = uv * scale + i * 41.3;
    vec2 gv = fract(suv) - 0.5;
    vec2 id = floor(suv);
    float n = hash21(id + i);
    vec2 offs = (hash22(id + i) - 0.5) * 0.7;
    float d = length(gv - offs);
    float star = smoothstep(0.045, 0.0, d) * step(0.45, n) * fade;
    // 径向拖尾：沿视线方向拉伸
    float ang = atan(uv.y, uv.x);
    star += smoothstep(0.05, 0.0, d) * fade * uWarpSpeed * 0.12 * step(0.8, n);
    vec3 tint = mix(vec3(0.6, 0.75, 1.0), vec3(1.0, 0.85, 0.7), n);
    col += star * tint * 1.4;
  }
  col += vec3(0.02, 0.015, 0.04) * (1.0 - length(uv) * 0.4);
  fragColor = vec4(col, 1.0);
}`,
      },
    ],
    docs: {
      summary: '多层星层向观察者流动的穿梭隧道：每层独立深度循环，近大远小 + 中心淡入。',
      detail: [
        'depth = fract(层偏移 + 时间)：星层从深处无限涌出',
        'scale 由深度插值（20 → 0.8）产生透视加速感',
        '每层用网格 hash 放星，亮度乘 fade 避免生硬出现/消失',
      ],
    },
  },
  {
    id: 'fs-sdf-gyroid',
    name: 'SDF 陀螺体 Raymarch',
    category: 'fullscreen',
    language: 'glsl3',
    tags: ['SDF', 'Raymarch', '3D'],
    scene: { kind: 'fullscreen' },
    camera: { dist: 6.0, pitch: 0.3, autoRotate: 0.25 },
    passes: [
      {
        name: '主体',
        vs: '',
        fs: HEAD + `
uniform vec3  uCamPos;
uniform mat3  uCamRot;
uniform float uScale;     // @range 1 8 @default 4.0
uniform float uThickness; // @range 0.02 0.3 @default 0.08
uniform float uSmooth;    // @range 0 0.5 @default 0.12

mat2 rot(float a) { float s = sin(a), c = cos(a); return mat2(c, -s, s, c); }
float sdGyroid(vec3 p, float scale, float th) {
  p *= scale;
  return (abs(dot(sin(p), cos(p.zxy))) - th) / scale;
}
float sdSphere(vec3 p, float r) { return length(p) - r; }
float opSmoothUnion(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float map(vec3 p) {
  p.xz *= rot(uTime * 0.15);
  p.xy *= rot(uTime * 0.08);
  float g = sdGyroid(p + vec3(0.0, uTime * 0.2, 0.0), uScale, uThickness);
  float s = sdSphere(p, 1.15);
  return opSmoothUnion(g, s, uSmooth);
}
vec3 calcNormal(vec3 p) {
  const vec2 e = vec2(0.0015, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)));
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution) / uResolution.y;
  vec3 ro = uCamPos * 0.55;
  vec3 rd = uCamRot * normalize(vec3(uv, 1.6));
  float t = 0.0;
  bool hit = false;
  vec3 p = ro;
  for (int i = 0; i < 100; i++) {
    p = ro + rd * t;
    float d = map(p);
    if (d < 0.001 * t + 0.0005) { hit = true; break; }
    t += d;
    if (t > 30.0) break;
  }
  vec3 col = mix(vec3(0.05, 0.06, 0.1), vec3(0.85, 0.7, 0.45), exp(-t * 0.06));
  if (hit) {
    vec3 n = calcNormal(p);
    vec3 l = normalize(vec3(0.6, 0.7, 0.3));
    float diff = max(dot(n, l), 0.0) * 0.8 + 0.18;
    float fres = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
    vec3 base = mix(vec3(0.9, 0.45, 0.25), vec3(0.3, 0.75, 0.95), smoothstep(-1.0, 1.0, p.y));
    col = base * diff + fres * 0.6;
  }
  fragColor = vec4(pow(col, vec3(0.4545)), 1.0);
}`,
      },
    ],
    docs: {
      summary: 'Raymarch SDF：陀螺体（gyroid）与球体做平滑并集，轨道相机 + 菲涅尔边缘光。',
      detail: [
        'gyroid: |dot(sin(p), cos(p.zxy))| < th 是典型的三周期极小面',
        'opSmoothUnion 用多项式核把两个 SDF 融合出"骨头关节"效果',
        '法线用 SDF 梯度中心差分求解；背景按距离做指数雾',
      ],
    },
  },
];
