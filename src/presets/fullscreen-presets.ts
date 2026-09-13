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
  // 暗角 + 细噪点（防色带、提升质感）
  col *= 1.0 - 0.32 * pow(length(uv) * 0.72, 2.2);
  float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (grain - 0.5) * 0.015;
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
        fs: `// Shadertoy 风格：iTime / iResolution 由内核自动供应
// 迭代法模拟水面焦散（Dave Hoskins "Water caustics" 改编）
uniform float uScale;  // @range 2 12 @default 6.28
uniform float uSpeed;  // @range 0.2 2 @default 0.5

void mainImage(out vec4 O, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  // ★ mod 绕回 + 大偏移：让 p 远离原点，否则分母趋零 → 1/length 爆炸 → 全屏饱和
  vec2 p = mod(uv * uScale, 6.28318) - 250.0;
  float t = iTime * uSpeed;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 5; n++) {
    float tt = t * (1.0 - 3.5 / float(n + 1));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
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
      summary: 'Shadertoy 方言演示：五次迭代的光线折射近似，生成泳池底部常见的网状焦散。iTime/iResolution/iMouse 等由内核自动供应。',
      detail: [
        '内核自动提供 iTime / iResolution / iMouse / iCamPos / iChannel0-3，用户只写 mainImage',
        '每轮迭代对 uv 做三角函数扰动，倒数叠加形成亮脊',
        'pow(|c|, 8) 锐化出细网，再叠加水色渐变；uScale/uSpeed 可调',
        '后处理场景中 iChannel0 会自动绑定为场景颜色（见 CRT 预设）',
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
  {
    id: 'fs-ripple',
    name: '雨滴涟漪 RainRipples',
    category: 'fullscreen',
    language: 'glsl3',
    tags: ['水', '2D游戏', '天气'],
    scene: { kind: 'fullscreen' },
    passes: [
      {
        name: '主体',
        vs: '',
        fs: HEAD + `
uniform float uDropDensity;    // @range 2 10 @default 5.0
uniform float uRippleSpeed;    // @range 0.2 3 @default 1.0
uniform vec3  uWaterColor;     // @color @default 0.04 0.14 0.2
uniform vec3  uHighlightColor; // @color @default 0.5 0.8 0.9

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

// 单层涟漪场：网格内每个雨滴有随机相位与生命周期，扩散圆环随时间衰减
float rippleLayer(vec2 uv, float t, float scale, float seed) {
  vec2 p = uv * scale;
  vec2 id = floor(p);
  vec2 gv = fract(p) - 0.5;
  float rnd = hash12(id + seed);
  if (rnd < 0.35) return 0.0;                       // 稀疏化：不是每格都有雨滴
  vec2 offs = (hash22(id + seed + 4.7) - 0.5) * 0.6;
  float life = fract(t * (0.4 + rnd * 0.8) + rnd * 7.13); // 生命周期 0..1
  float r = length(gv - offs);
  float radius = life * 0.5;
  float ring = sin((r - radius) * 55.0) * exp(-r * 8.0);
  float fade = (1.0 - life) * smoothstep(0.5, 0.42, r);
  return ring * fade * step(r, radius + 0.18);
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution) / min(uResolution.x, uResolution.y);
  float t = uTime * uRippleSpeed;
  // 三层视差涟漪：近大远小
  float waves = rippleLayer(uv + 0.13, t, uDropDensity, 0.0)
              + 0.6 * rippleLayer(uv * 1.7 + 5.2, t * 1.3, uDropDensity * 1.6, 31.7)
              + 0.35 * rippleLayer(uv * 2.9 + 9.1, t * 1.6, uDropDensity * 2.4, 57.3);
  float grain = hash12(floor(gl_FragCoord.xy * 0.5)) * 0.05;
  vec3 col = uWaterColor * (1.0 + waves * 1.5 + grain);
  col += uHighlightColor * max(waves, 0.0) * max(waves, 0.0) * 0.9; // 波峰提亮
  col *= 1.0 - 0.18 * dot(uv, uv);
  fragColor = vec4(col, 1.0);
}`,
      },
    ],
    docs: {
      summary: '雨落水面的涟漪：网格哈希布雨滴，每滴有独立相位/生命周期，扩散圆环 sin+exp 衰减，三层视差叠加。横版游戏雨天地面/水洼的常用方案。',
      detail: [
        '每格雨滴：life = fract(t·速度 + 随机相位)，radius = life·0.5',
        '波环 = sin((r-radius)·55)·exp(-r·8)：前亮后暗、随距离指数衰减',
        '三层不同 scale/速度 叠出深度感；uDropDensity 控制雨量',
      ],
    },
  },
  {
    id: 'fs-sky',
    name: '程序化天空 ProceduralSky',
    category: 'fullscreen',
    language: 'glsl3',
    tags: ['天空', '环境', '背景'],
    scene: { kind: 'fullscreen' },
    camera: { dist: 6, pitch: 0.1, autoRotate: 0.1 },
    passes: [
      {
        name: '主体',
        vs: '',
        fs: HEAD + `
uniform float uSunAngle;     // @range 0 6.28 @default 0.8
uniform float uSunHeight;    // @range 0.05 0.8 @default 0.35
uniform float uCloudCover;   // @range 0 1 @default 0.45
uniform vec3  uZenithColor;  // @color @default 0.2 0.45 0.85
uniform vec3  uHorizonColor; // @color @default 0.75 0.85 0.95

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
  for (int i = 0; i < 5; i++) { v += a * noise2(p); p = p * 2.1 + 17.3; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution) / uResolution.y;
  vec3 rd = normalize(vec3(uv, 1.25));
  vec3 sunDir = normalize(vec3(cos(uSunAngle) * (1.0 - uSunHeight * 0.5), uSunHeight, sin(uSunAngle) * (1.0 - uSunHeight * 0.5)));
  // 天顶-地平线渐变
  vec3 sky = mix(uHorizonColor, uZenithColor, pow(clamp(rd.y, 0.0, 1.0), 0.55));
  // 太阳：锐利日轮 + 宽光晕
  float sd = dot(rd, sunDir);
  sky += vec3(1.0, 0.9, 0.6) * pow(max(sd, 0.0), 900.0) * 3.0;
  sky += vec3(1.0, 0.65, 0.35) * pow(max(sd, 0.0), 8.0) * 0.22;
  // 云：视线与云层平面求交（平面投影）+ 双层 fbm
  vec2 cp = rd.xz / max(rd.y, 0.08);
  float cl = fbm(cp * 0.9 + vec2(uTime * 0.02, uTime * 0.007));
  float cl2 = fbm(cp * 2.3 - vec2(uTime * 0.03, 0.0));
  float clouds = smoothstep(1.05 - uCloudCover, 1.3 - uCloudCover, cl * 0.75 + cl2 * 0.35);
  clouds *= smoothstep(0.03, 0.18, rd.y);
  vec3 cloudCol = mix(vec3(0.5, 0.53, 0.6), vec3(1.0, 0.98, 0.94), 0.45 + 0.55 * max(sd, 0.0));
  sky = mix(sky, cloudCol, clouds * 0.92);
  // 地平线薄雾 + 地面以下压暗
  sky = mix(vec3(0.78, 0.84, 0.9), sky, smoothstep(-0.02, 0.14, rd.y));
  sky *= smoothstep(-0.12, 0.0, rd.y) * 0.9 + 0.1;
  fragColor = vec4(sky, 1.0);
}`,
      },
    ],
    docs: {
      summary: '程序化天空盒替代品：视线方向渐变 + 太阳日轮/光晕 + 平面投影双层 fbm 云 + 地平线雾。赛车/开放世界背景的廉价标准方案。',
      detail: [
        '视线 rd.y 决定天顶-地平线插值；sunDir 由角度+高度参数化',
        '云用 rd.xz / rd.y 投影到无穷远平面，fbm 双层叠加并随风飘移',
        '可当成天空穹顶材质：拖动 uSunAngle 看太阳运动，uCloudCover 控制多云程度',
      ],
    },
  },
  {
    id: 'fs-flowmap-river',
    name: '河流 Flowmap（流动贴图）',
    category: 'fullscreen',
    language: 'glsl3',
    tags: ['水', 'Flowmap', '业界技法'],
    scene: { kind: 'fullscreen' },
    passes: [
      {
        name: '主体',
        vs: '',
        fs: HEAD + `
uniform float uFlowSpeed;    // @range 0 3 @default 1.0
uniform float uFlowStrength; // @range 0 0.5 @default 0.18
uniform vec3  uDeepColor;    // @color @default 0.03 0.18 0.24
uniform vec3  uShallowColor; // @color @default 0.1 0.5 0.55

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
  for (int i = 0; i < 4; i++) { v += a * noise2(p); p = p * 2.1 + 11.7; a *= 0.5; }
  return v;
}

// 河道中心线（实际项目中这一项由美术烘焙的 RG Flowmap 纹理给出）
float riverCenter(float x) { return sin(x * 0.8) * 0.35 + sin(x * 0.35 + 2.0) * 0.25; }

void main() {
  vec2 p = (gl_FragCoord.xy * 2.0 - uResolution) / uResolution.y;
  float cy = riverCenter(p.x);
  float d = abs(p.y - cy);
  float halfW = 0.45;
  float inRiver = smoothstep(halfW, halfW - 0.08, d);
  // 流向 = 河道切线
  float e = 0.01;
  float slope = (riverCenter(p.x + e) - riverCenter(p.x - e)) / (2.0 * e);
  vec2 flow = normalize(vec2(1.0, slope));
  // ★ Valve 式两相滚动：两组按相位错开 0.5 的采样用三角波混合，消除循环感
  float t = uTime * 0.25 * uFlowSpeed;
  float ph0 = fract(t);
  float ph1 = fract(t + 0.5);
  float w = abs(ph0 - 0.5) * 2.0;
  vec2 fOff = flow * uFlowStrength;
  float n0 = fbm((p + fOff * ph0) * 6.0);
  float n1 = fbm((p + fOff * ph1) * 6.0);
  float surface = mix(n0, n1, w);
  float detail = fbm((p + fOff * 0.5) * 14.0 + surface * 2.0);
  float sparkle = pow(max(surface * detail * 2.2 - 0.55, 0.0), 2.0);
  vec3 col = mix(uDeepColor, uShallowColor, surface * 0.85);
  col += vec3(0.7, 0.9, 1.0) * sparkle * 0.9;           // 波光
  float foam = smoothstep(halfW - 0.16, halfW - 0.05, d)
             * (0.55 + 0.45 * sin(p.x * 26.0 + uTime * 2.5));
  col = mix(col, vec3(0.9, 0.94, 0.96), foam * inRiver * 0.7); // 岸边泡沫
  vec3 land = mix(vec3(0.09, 0.15, 0.08), vec3(0.2, 0.27, 0.13), fbm(p * 3.0));
  col = mix(land, col, inRiver);
  fragColor = vec4(col, 1.0);
}`,
      },
    ],
    docs: {
      summary: 'Flowmap 河流：Valve《求生之路》引入的行业标准水体流动技法——两组相位错开 0.5 的滚动噪声用三角波混合，任何循环贴图都能"无限流动"不露馅。',
      detail: [
        '核心公式：sample = mix(tex(p + flow·ph0), tex(p + flow·ph1), |ph0-0.5|·2)',
        'ph0/ph1 = fract(t) 与 fract(t+0.5)：A 组循环重启时 B 组恰在半程，肉眼看不出重置',
        '实际项目 flow 向量存于 RG 纹理由美术烘焙；此处用河道切线解析替代',
        '波光 sparkle 与岸边泡沫都用同一流动场驱动，方向一致才真实',
      ],
    },
  },
  {
    id: 'fs-shockwave',
    name: '冲击波 Shockwave',
    category: 'fullscreen',
    language: 'glsl3',
    tags: ['特效', '打击感', '交互'],
    scene: { kind: 'fullscreen' },
    passes: [
      {
        name: '主体',
        vs: '',
        fs: HEAD + `
uniform vec4  uMouse;      // xy=像素 z/w=按下
uniform float uWaveSpeed;  // @range 0.2 3 @default 1.0
uniform float uRingGap;    // @range 0.3 3 @default 1.2
uniform vec3  uRingColor;  // @color @default 0.3 0.8 1.0

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution) / min(uResolution.x, uResolution.y);
  // 按住鼠标：冲击波从鼠标位置发射；未按下：从中心
  vec2 m = uMouse.z > 0.5
    ? (uMouse.xy * 2.0 - uResolution) / min(uResolution.x, uResolution.y)
    : vec2(0.0);
  float r = length(uv - m);
  float t = uTime * uWaveSpeed;
  // 四道循环冲击波：高斯环带，随年龄衰减
  float distort = 0.0;
  for (int i = 0; i < 4; i++) {
    float age = fract(t * 0.35 + float(i) * 0.25);
    float radius = age * uRingGap * 1.4;
    float band = exp(-pow((r - radius) * 9.0, 2.0));
    distort += band * (1.0 - age);
  }
  // 沿径向扭曲背景网格（屏幕空间位移的典型用法）
  vec2 dir = (uv - m) / max(r, 1e-3);
  vec2 guv = uv + dir * distort * 0.1;
  vec2 g = abs(fract(guv * 3.0) - 0.5);
  float line = smoothstep(0.44, 0.5, max(g.x, g.y));
  vec3 col = vec3(0.03, 0.04, 0.07) + line * vec3(0.07, 0.13, 0.19);
  col += uRingColor * distort * 0.55;
  col += line * uRingColor * distort * 0.6;
  fragColor = vec4(col, 1.0);
}`,
      },
    ],
    docs: {
      summary: '循环冲击波：四道相位错开的高斯波环沿径向扭曲并推亮背景网格。按住鼠标可改变发射源点——爆炸/Boss 释放技能时屏幕级震波的标准做法。',
      detail: [
        'age = fract(t·速度 + i·0.25)：四道波相位均分循环',
        'band = exp(-((r-radius)·9)²)：高斯截面让波环有厚度柔和衰减',
        '背景沿 normalize(uv-m) 方向位移 distort·0.1 —— 即"折射"效果',
        '游戏里通常由脚本触发单次波（把 fract 换成 (t-t0)·speed 并截断）',
      ],
    },
  },
  {
    id: 'fs-posterize-sky',
    name: '色带阶梯天空 PosterizeSky',
    category: 'fullscreen',
    language: 'glsl3',
    tags: ['二游', '天空', '过场'],
    scene: { kind: 'fullscreen' },
    passes: [
      {
        name: '主体',
        vs: '',
        fs: HEAD + `
uniform vec3  uTopColor;     // @color @default 0.25 0.5 0.9
uniform vec3  uMidColor;     // @color @default 0.55 0.75 0.95
uniform vec3  uHorizonColor; // @color @default 0.92 0.94 0.9
uniform vec3  uSunColor;     // @color @default 1.0 0.95 0.75
uniform float uSunX;         // @range 0.1 0.9 @default 0.72
uniform float uCloudTh;      // @range 0.3 0.7 @default 0.52

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
  for (int i = 0; i < 5; i++) { v += a * noise2(p); p = p * 2.1 + 17.3; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float aspect = uResolution.x / uResolution.y;
  // 天空：三色渐变后量化成色带（posterize）—— 二次元过场的标志性阶梯天
  vec3 sky = mix(uHorizonColor, uMidColor, smoothstep(0.0, 0.45, uv.y));
  sky = mix(sky, uTopColor, smoothstep(0.45, 0.95, uv.y));
  sky = floor(sky * 9.0 + 0.5) / 9.0;
  // 太阳：硬边日轮 + 柔光晕
  vec2 sc = vec2(uSunX, 0.34);
  float sd = length((uv - sc) * vec2(aspect, 1.0));
  sky += uSunColor * smoothstep(0.085, 0.07, sd);
  sky += uSunColor * pow(max(1.0 - sd * 2.1, 0.0), 3.0) * 0.3;
  // 扁平云：域扭曲 fbm（消除网格伪影）→ 阈值出形状，云底描一圈暗边
  vec2 cp = vec2(uv.x * aspect, uv.y) * vec2(1.7, 3.2) + vec2(uTime * 0.012, 0.0);
  float cw = fbm(cp * 0.85 + 3.7);
  float cn = fbm(cp + cw * 0.6);
  float lowSky = smoothstep(0.1, 0.3, uv.y);            // 低空云淡出
  float cloud = smoothstep(uCloudTh, uCloudTh + 0.12, cn) * lowSky;
  float edge = (smoothstep(uCloudTh - 0.07, uCloudTh, cn) - smoothstep(uCloudTh, uCloudTh + 0.12, cn)) * lowSky;
  vec3 cloudCol = mix(vec3(1.0, 1.0, 1.0), vec3(0.84, 0.88, 0.96), smoothstep(uCloudTh, uCloudTh + 0.28, cn));
  sky = mix(sky, cloudCol, cloud);
  sky = mix(sky, cloudCol * 0.78, edge);
  // 两层远山剪影
  float h1 = 0.09 + fbm(vec2(uv.x * aspect * 1.6, 2.0)) * 0.14;
  float h2 = 0.045 + fbm(vec2(uv.x * aspect * 2.8 + 9.0, 5.0)) * 0.09;
  sky = mix(sky, vec3(0.55, 0.66, 0.74), step(uv.y, h1));
  sky = mix(sky, vec3(0.34, 0.46, 0.5), step(uv.y, h2));
  fragColor = vec4(sky, 1.0);
}`,
      },
    ],
    docs: {
      summary: '原神/鸣潮过场漫画式天空：三色渐变量化成色带（posterize）、硬边太阳、fbm 扁平云带云底暗边、两层远山剪影。全靠"量化+硬边"摆脱写实感。',
      detail: [
        'sky = floor(sky·9+0.5)/9：把连续渐变拍成 9 档色带 —— 二次元天空的第一法则',
        '云的双色：云体随 fbm 值从白到淡蓝灰，云底用负 smoothstep 描暗边',
        '远山 = fbm 阈值的剪影，两层深浅做大气透视',
        '拖 uCloudTh 改云量，uSunX 移动太阳位置',
      ],
    },
  },
  {
    id: 'fs-vortex',
    name: '螺旋能量涡旋 Vortex',
    category: 'fullscreen',
    language: 'glsl3',
    tags: ['二游', '元素', '传送门'],
    scene: { kind: 'fullscreen' },
    passes: [
      {
        name: '主体',
        vs: '',
        fs: HEAD + `
uniform vec3  uColor;       // @color @default 0.35 0.75 1.0   元素主色
uniform vec3  uAccentColor; // @color @default 0.65 0.4 1.0    内环辅色
uniform float uTwist;       // @range 0.5 4 @default 2.0       螺旋强度
uniform float uSpinSpeed;   // @range 0 3 @default 0.6
uniform float uFlowSpeed;   // @range 0 3 @default 1.0

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

void main() {
  vec2 p = (gl_FragCoord.xy * 2.0 - uResolution) / min(uResolution.x, uResolution.y);
  float r = length(p);
  float ang = atan(p.y, p.x);
  // 极坐标螺旋扭曲：越靠中心扭得越狠
  float swirl = ang + (1.0 - smoothstep(0.0, 0.95, r)) * uTwist * 6.2831 + uTime * uSpinSpeed;
  // 螺旋坐标上采噪声 → 能量带
  vec2 sp = vec2(swirl * 3.0 / 6.2831, r * 4.0 - uTime * uFlowSpeed);
  float en = noise2(sp * vec2(2.0, 1.6)) * 0.65 + noise2(sp * vec2(6.0, 3.5)) * 0.35;
  float arcs = smoothstep(0.42, 0.5, en) * smoothstep(0.78, 0.62, en);
  // 中心辉光 + 内环
  float core = exp(-r * 5.5);
  float ring = smoothstep(0.5, 0.4, r) * smoothstep(0.3, 0.4, r);
  vec3 col = vec3(0.02, 0.025, 0.05);
  col += uColor * core * 1.1;
  col += uColor * arcs * smoothstep(1.0, 0.2, r) * (0.55 + 0.45 * sin(r * 26.0 - uTime * 4.0));
  col += uAccentColor * ring * 0.9;
  col += uAccentColor * arcs * ring * 1.2;
  // 被吸入的粒子（沿 y 向上流，视觉上往中心卷）
  float dots = step(0.986, hash21(floor((p * 22.0) + vec2(0.0, -uTime * 1.4 * uFlowSpeed))));
  col += mix(uColor, uAccentColor, hash21(floor(p * 22.0))) * dots * smoothstep(0.95, 0.05, r) * 0.9;
  // 外围淡出
  col *= smoothstep(1.35, 0.55, r) * 0.85 + 0.15;
  fragColor = vec4(col, 1.0);
}`,
      },
    ],
    docs: {
      summary: '原神式元素传送门/元素爆发：极坐标螺旋扭曲 + 螺旋域噪声能量带 + 中心辉光 + 吸入粒子。换 uColor 就是换元素（蓝=水、紫=雷、金=岩）。',
      detail: [
        'swirl = ang + (1-smoothstep(r))·twist·2π：中心扭得多、外围扭得少，形成漩涡',
        '能量带在 (swirl, r - t) 的"拉直的螺旋坐标"上采噪声，带子随时间往中心流',
        '粒子用 y 向下滚动的网格 hash 点，配合漩涡读作"被吸入"',
      ],
    },
  },
  {
    id: 'fs-petals',
    name: '花瓣粒子系统 Petals',
    category: 'fullscreen',
    language: 'glsl3',
    tags: ['二游', '粒子', '氛围'],
    scene: { kind: 'fullscreen' },
    passes: [
      {
        name: '主体',
        vs: '',
        fs: HEAD + `
uniform float uFallSpeed;  // @range 0.2 3 @default 1.0
uniform float uDensity;    // @range 0 1 @default 0.35
uniform vec3  uSkyColor;   // @color @default 0.93 0.95 0.98

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
// 花瓣形状：对称椭圆 + 顶端缺口（樱花瓣特征）
float petalMask(vec2 gv, float rot) {
  float c = cos(rot), s = sin(rot);
  gv = mat2(c, -s, s, c) * gv;
  gv.x = abs(gv.x);
  gv.x *= 0.72;                            // 稍微收窄，更像瓣
  float d = length(gv - vec2(0.0, 0.06));
  float body = smoothstep(0.26, 0.2, d);
  float notch = smoothstep(-0.02, 0.09, gv.y + 0.1);
  return body * notch;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec3 col = mix(uSkyColor, uSkyColor * vec3(1.0, 0.92, 0.95), uv.y);
  // 远景圆形散景（格内圆斑，柔和淡出）
  float t = uTime * uFallSpeed;
  vec2 bq = uv * vec2(uResolution.x / uResolution.y, 1.0) * 5.0 + vec2(t * 0.03, -t * 0.05);
  vec2 bid = floor(bq), bgv = fract(bq) - 0.5;
  float br = hash12(bid + floor(t * 0.2));
  float bokeh = smoothstep(0.38, 0.3, length(bgv - (hash22(bid) - 0.5) * 0.4)) * step(0.88, br);
  col += vec3(1.0, 0.88, 0.92) * bokeh * 0.16;
  // 三层花瓣：近大远小、近快远慢、翻转翻滚
  for (int layer = 0; layer < 3; layer++) {
    float fl = float(layer);
    float scale = 3.2 + fl * 2.2;
    vec2 p = uv * vec2(uResolution.x / uResolution.y, 1.0) * scale;
    p.y += t * (0.6 + fl * 0.3) * (1.0 + hash12(vec2(fl, 3.7)) * 0.4);   // 下落
    p.x += sin(t * 0.7 + fl * 2.1) * 0.7 + t * 0.12;                      // 摇摆 + 风吹
    vec2 id = floor(p);
    vec2 gv = fract(p) - 0.5;
    float rnd = hash12(id + fl * 17.0);
    if (rnd < 0.86 - uDensity * 0.7) continue;                            // 密度控制
    vec2 offs = (hash22(id + fl + 4.2) - 0.5) * 0.5;
    float rot = rnd * 6.2831 + t * (rnd - 0.5) * 3.2;                     // 翻滚旋转
    float m = petalMask(gv - offs, rot);
    vec3 petalCol = mix(vec3(1.0, 0.82, 0.88), vec3(1.0, 0.6, 0.72), rnd);
    float shade = smoothstep(0.16, -0.12, (gv - offs).y) * 0.32;          // 简单明暗
    col = mix(col, petalCol * (1.0 - shade), m * (0.45 + fl * 0.25));
  }
  fragColor = vec4(col, 1.0);
}`,
      },
    ],
    docs: {
      summary: '樱花/花瓣飘落粒子场：三层网格布花瓣，每片独立旋转翻滚 + 正弦摇摆，花瓣形状用"对称椭圆 + 顶端缺口"勾勒樱花特征，配散景光斑。稻妻城/鸣潮dialogue背景的氛围粒子方案。',
      detail: [
        'petalMask：旋转后取 |x| 对称，length 场画椭圆，顶部 smoothstep 挖出樱花瓣缺口',
        '层间 scale/速度递增做视差；rnd 决定是否生成（密度）、色相、翻滚速度',
        'p.x += sin(t)·0.7 + t·0.12：摇摆叠加恒定"风"——纯直落会假',
      ],
    },
  },
];
