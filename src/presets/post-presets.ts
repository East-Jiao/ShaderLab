// 后处理预设：渲染内置画廊场景（颜色+法线+深度 MRT）后应用特效
import type { Preset } from '../engine/types';

const POST_HEAD = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uSceneTex;   // 场景颜色（带 mip 链）
uniform sampler2D uNormalTex;  // 世界法线（0.5 偏置编码）
uniform sampler2D uSceneDepth; // 深度（非线性 0..1）
uniform vec2  uResolution;
uniform float uTime;
uniform float uNear;
uniform float uFar;`;

export const postPresets: Preset[] = [
  {
    id: 'post-bloom',
    name: '辉光 Bloom',
    category: 'post',
    language: 'glsl3',
    tags: ['后处理', '泛光', '必须会'],
    scene: { kind: 'post' },
    passes: [
      {
        name: '合成',
        vs: '',
        fs: POST_HEAD + `
uniform float uThreshold; // @range 0 2 @default 0.55
uniform float uIntensity; // @range 0 3 @default 0.9
uniform float uRadius;    // @range 0 1 @default 0.5

void main() {
  vec3 base = texture(uSceneTex, vUV).rgb;
  // 单 Pass 泛光：直接采样 mip 链的高层级（廉价大范围模糊）
  float r = uRadius;
  vec3 bloom = textureLod(uSceneTex, vUV, 2.0 + r * 1.0).rgb * 0.45
             + textureLod(uSceneTex, vUV, 3.0 + r * 1.5).rgb * 0.3
             + textureLod(uSceneTex, vUV, 4.0 + r * 2.0).rgb * 0.25;
  bloom = max(bloom - uThreshold, vec3(0.0));
  vec3 col = base + bloom * uIntensity;
  col = col / (1.0 + col * 0.12);
  fragColor = vec4(col, 1.0);
}`,
      },
    ],
    docs: {
      summary: '单 Pass 辉光：利用场景纹理的 mip 链做廉价大范围模糊，阈值以上部分叠加回原图。手游泛光的最经济实现。',
      detail: [
        'textureLod 直接取高层 mip 等价于低通滤波，省掉多 Pass 高斯模糊',
        'uThreshold 控制泛光起点；uRadius 调整模糊范围（mip 层级偏移）',
        '最后一步 Reinhard 变体压缩高光防过曝',
      ],
    },
  },
  {
    id: 'post-film',
    name: '暗角+噪点+色差 Film',
    category: 'post',
    language: 'glsl3',
    tags: ['后处理', '氛围', '电影感'],
    scene: { kind: 'post' },
    passes: [
      {
        name: '合成',
        vs: '',
        fs: POST_HEAD + `
uniform float uVignette;    // @range 0 2 @default 1.0
uniform float uGrain;       // @range 0 0.3 @default 0.08
uniform float uAberration;  // @range 0 0.02 @default 0.005

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 dir = vUV - 0.5;
  // 色差：RGB 通道沿径向错开
  float r = texture(uSceneTex, vUV - dir * uAberration).r;
  float g = texture(uSceneTex, vUV).g;
  float b = texture(uSceneTex, vUV + dir * uAberration).b;
  vec3 col = vec3(r, g, b);
  // 暗角
  float d = distance(vUV, vec2(0.5));
  col *= 1.0 - uVignette * 0.6 * smoothstep(0.35, 0.85, d);
  // 胶片噪点（每帧变化）
  float gr = hash12(vUV * uResolution + fract(uTime) * 1000.0);
  col += (gr - 0.5) * uGrain;
  fragColor = vec4(col, 1.0);
}`,
      },
    ],
    docs: {
      summary: '电影感三件套：径向色差 + 暗角 + 时间变化的胶片噪点，恐怖/悬疑游戏氛围标配。',
      detail: [
        '色差：红蓝通道向中心/外侧偏移采样，边缘效果最强',
        '噪点种子含 fract(uTime)，保证每帧不同产生"颗粒滚动"',
      ],
    },
  },
  {
    id: 'post-grading',
    name: '调色 Color Grading',
    category: 'post',
    language: 'glsl3',
    tags: ['后处理', '调色', 'LUT'],
    scene: { kind: 'post' },
    passes: [
      {
        name: '合成',
        vs: '',
        fs: POST_HEAD + `
uniform float uExposure;     // @range 0.1 3 @default 1.1
uniform float uContrast;     // @range 0.5 2 @default 1.1
uniform float uSaturation;   // @range 0 2 @default 1.15
uniform float uTemperature;  // @range -1 1 @default 0.15

vec3 whiteBalance(vec3 c, float temp) {
  // 简化温偏：暖色加红黄，冷色加蓝
  c.r += temp * 0.12;
  c.g += temp * 0.02;
  c.b -= temp * 0.1;
  return c;
}

void main() {
  vec3 col = texture(uSceneTex, vUV).rgb;
  col *= uExposure;
  col = whiteBalance(col, uTemperature);
  // 对比度：围绕 0.5 拉伸
  col = (col - 0.5) * uContrast + 0.5;
  // 饱和度：亮度插值
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(luma), col, uSaturation);
  col = clamp(col, 0.0, 1.0);
  // 轻微 S 曲线
  col = col * col * (3.0 - 2.0 * col) * 0.35 + col * 0.65;
  fragColor = vec4(col, 1.0);
}`,
      },
    ],
    docs: {
      summary: '游戏调色管线教学：曝光 → 白平衡 → 对比度 → 饱和度 → S 曲线，五步把画面调出"风格"。',
      detail: [
        '曝光在线性域乘法最自然；对比度围绕中灰 0.5 拉伸',
        '饱和度用 luma 做 mix（灰度 = dot(rgb,Rec709系数)）',
        'uTemperature 正值偏暖负值偏冷',
      ],
    },
  },
  {
    id: 'post-outline',
    name: '深度法线描边 Outline',
    category: 'post',
    language: 'glsl3',
    tags: ['描边', '后处理', 'CelShading'],
    scene: { kind: 'post' },
    passes: [
      {
        name: '合成',
        vs: '',
        fs: POST_HEAD + `
uniform float uThickness;   // @range 1 4 @default 2.0
uniform float uDepthSens;   // @range 0.1 4 @default 1.2
uniform float uNormalSens;  // @range 0.1 2 @default 0.6
uniform vec3  uOutlineColor; // @color @default 0.05 0.05 0.08

float linearDepth(vec2 uv) {
  float d = texture(uSceneDepth, uv).r;
  float ndc = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - ndc * (uFar - uNear));
}

void main() {
  vec2 px = uThickness / uResolution;
  float dC = linearDepth(vUV);
  float dR = linearDepth(vUV + vec2(px.x, 0.0));
  float dU = linearDepth(vUV + vec2(0.0, px.y));
  float dL = linearDepth(vUV - vec2(px.x, 0.0));
  float dD = linearDepth(vUV - vec2(0.0, px.y));
  float diff = dC > 0.0 ? abs(dR - dC) + abs(dU - dC) + abs(dL - dC) + abs(dD - dC) : 0.0;
  float depthEdge = smoothstep(0.02 * uDepthSens, 0.08 * uDepthSens, diff / max(dC, 0.001));

  vec3 nC = texture(uNormalTex, vUV).rgb * 2.0 - 1.0;
  vec3 nR = texture(uNormalTex, vUV + vec2(px.x, 0.0)).rgb * 2.0 - 1.0;
  vec3 nU = texture(uNormalTex, vUV + vec2(0.0, px.y)).rgb * 2.0 - 1.0;
  float normalEdge = (1.0 - dot(nC, nR)) + (1.0 - dot(nC, nU));
  normalEdge = smoothstep(0.1 * uNormalSens, 0.35 * uNormalSens, normalEdge);

  float edge = clamp(max(depthEdge, normalEdge), 0.0, 1.0);
  vec3 col = mix(texture(uSceneTex, vUV).rgb, uOutlineColor, edge);
  fragColor = vec4(col, 1.0);
}`,
      },
    ],
    docs: {
      summary: '屏幕空间描边：对深度和法线缓冲各做一次边缘检测，比反向壳覆盖更广（含地面遮挡边缘），UE/Unity 卡通渲染管线的标准做法。',
      detail: [
        '深度线性化后与四邻域求差分，法线用点积（1-dot）检测弯折',
        '深度突变（前景遮挡背景）产生外描边；法线突变产生折角内描边',
        'uThickness 用像素步长控制；两个灵敏度分别调两类边缘',
      ],
    },
  },
  {
    id: 'post-pixelate',
    name: '像素化 Pixelate',
    category: 'post',
    language: 'glsl3',
    tags: ['后处理', '复古', '像素游戏'],
    scene: { kind: 'post' },
    passes: [
      {
        name: '合成',
        vs: '',
        fs: POST_HEAD + `
uniform float uPixelSize; // @range 2 40 @default 12.0
uniform float uLevels;    // @range 2 16 @default 8.0
uniform float uScanline;  // @range 0 1 @default 0.15

void main() {
  vec2 uv = floor(vUV * uResolution / uPixelSize) * uPixelSize / uResolution;
  uv += uPixelSize / uResolution * 0.5;
  vec3 col = texture(uSceneTex, uv).rgb;
  // 调色板量化
  col = floor(col * uLevels) / uLevels;
  // 扫描线
  col *= 1.0 - uScanline * step(0.5, fract(vUV.y * uResolution.y * 0.5));
  fragColor = vec4(col, 1.0);
}`,
      },
    ],
    docs: {
      summary: '像素化 + 调色板量化 + 扫描线：把 3D 画面压成复古像素游戏质感。',
      detail: [
        'uv 按像素块尺寸取整（floor）后再采样 = 马赛克',
        'floor(col * levels) / levels 减少色数，更有"低色深"味',
      ],
    },
  },
  {
    id: 'post-crt',
    name: 'CRT 显示器 Shadertoy',
    category: 'post',
    language: 'shadertoy',
    tags: ['后处理', 'Shadertoy', '复古'],
    scene: { kind: 'post' },
    passes: [
      {
        name: 'mainImage',
        vs: '',
        fs: `// Shadertoy 方言：iChannel0 即为内置场景颜色
void mainImage(out vec4 O, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  // 桶形畸变
  vec2 cc = uv - 0.5;
  float dist = dot(cc, cc);
  vec2 duv = uv + cc * dist * 0.18;
  // 色差
  vec3 col;
  col.r = texture(iChannel0, duv + cc * 0.004).r;
  col.g = texture(iChannel0, duv).g;
  col.b = texture(iChannel0, duv - cc * 0.004).b;
  // 扫描线
  col *= 0.82 + 0.18 * sin(duv.y * iResolution.y * 1.4);
  // RGB 荫罩
  col *= 0.9 + 0.1 * sin(fragCoord.x * 3.14159);
  // 屏幕外为黑 + 暗角
  if (duv.x < 0.0 || duv.x > 1.0 || duv.y < 0.0 || duv.y > 1.0) col = vec3(0.0);
  col *= pow(16.0 * uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y), 0.2);
  O = vec4(col, 1.0);
}`,
      },
    ],
    docs: {
      summary: 'Shadertoy 方言演示后处理：桶形畸变 + RGB 荫罩 + 扫描线 + 暗角，还原老式 CRT 显示器。',
      detail: [
        '在后处理场景中，iChannel0 被内核绑定到内置场景颜色纹理',
        '桶形畸变：uv 偏移量 = cc * dist，越靠边越弯',
        'sin(fragCoord.x * π) 生成逐像素的荫罩条纹',
      ],
    },
  },
  {
    id: 'post-underwater',
    name: '水下扭曲 Underwater',
    category: 'post',
    language: 'glsl3',
    tags: ['后处理', '水', '氛围'],
    scene: { kind: 'post' },
    passes: [
      {
        name: '合成',
        vs: '',
        fs: POST_HEAD + `
uniform float uStrength; // @range 0 0.06 @default 0.012
uniform float uTint;     // @range 0 1 @default 0.45

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
  // 正弦波扰动 + 噪声抖动
  vec2 warp = vec2(
    sin(vUV.y * 22.0 + uTime * 1.6) * 0.6 + noise2(vUV * 6.0 + uTime * 0.4) - 0.5,
    cos(vUV.x * 18.0 + uTime * 1.2) * 0.4);
  vec2 uv = vUV + warp * uStrength;
  vec3 col = texture(uSceneTex, uv).rgb;
  // 水色渐变 + 焦散亮斑
  float caustic = pow(noise2(vUV * 9.0 + vec2(uTime * 0.3, -uTime * 0.2)) * 1.4, 3.0);
  col += vec3(0.1, 0.3, 0.35) * caustic;
  col = mix(col, col * vec3(0.45, 0.75, 1.0) + vec3(0.0, 0.03, 0.08), uTint);
  // 边缘渐暗（水下隧道感）
  float d = distance(vUV, vec2(0.5));
  col *= 1.0 - smoothstep(0.4, 0.8, d) * 0.5;
  fragColor = vec4(col, 1.0);
}`,
      },
    ],
    docs: {
      summary: '水下全屏效果：UV 正弦扭曲 + 焦散亮斑 + 蓝绿色调 + 边缘压暗，进入水中的瞬间切换。',
      detail: [
        'warp 两个方向用不同频率的 sin/ cos，避免机械感',
        '焦散用滚动 fbm 的幂次锐化',
      ],
    },
  },
  {
    id: 'post-radial-blur',
    name: '径向模糊 SpeedBlur',
    category: 'post',
    language: 'glsl3',
    tags: ['后处理', '速度感', '竞速'],
    scene: { kind: 'post' },
    passes: [
      {
        name: '合成',
        vs: '',
        fs: POST_HEAD + `
uniform float uStrength; // @range 0 1 @default 0.35
uniform float uCenterR;  // @range 0 0.6 @default 0.18

void main() {
  vec2 dir = vUV - 0.5;
  float dist = length(dir);
  // 中心区域保持清晰
  float amt = uStrength * smoothstep(uCenterR, 0.7, dist);
  vec3 col = vec3(0.0);
  const int SAMPLES = 20;
  float total = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    float t = float(i) / float(SAMPLES - 1);
    float scale = 1.0 - amt * 0.35 * t;
    vec2 suv = dir * scale + 0.5;
    float w = 1.0 - t * 0.6;
    col += texture(uSceneTex, suv).rgb * w;
    total += w;
  }
  col /= total;
  // 轻微拖影色偏
  col += vec3(0.03, 0.01, 0.05) * amt;
  fragColor = vec4(col, 1.0);
}`,
      },
    ],
    docs: {
      summary: '径向模糊：采样点沿视线中心方向收缩叠加，赛车/冲刺游戏的提速效果，中心清晰边缘拖影。',
      detail: [
        '20 次采样带权重（近样本权重大），由外向内回溯形成拖尾',
        'uCenterR 保住画面中心清晰区域',
      ],
    },
  },
  {
    id: 'post-snow',
    name: '雪景叠加 Snowfall',
    category: 'post',
    language: 'glsl3',
    tags: ['后处理', '天气', '氛围'],
    scene: { kind: 'post' },
    passes: [
      {
        name: '合成',
        vs: '',
        fs: POST_HEAD + `
uniform float uSnowAmount; // @range 0 1 @default 0.7
uniform float uFallSpeed;  // @range 0.2 3 @default 1.0
uniform float uWindX;      // @range -1 1 @default 0.2

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float snowLayer(vec2 uv, float scale, float t, float seed) {
  vec2 p = uv * scale + vec2(uWindX * t * scale * 0.15, -t * scale * 0.1) + seed;
  vec2 gv = fract(p) - 0.5;
  vec2 id = floor(p);
  float n = hash21(id + seed);
  if (n < 0.75) return 0.0; // 稀疏化
  vec2 offs = (vec2(hash21(id + seed + 1.7), hash21(id + seed + 9.1)) - 0.5) * 0.6;
  offs.y += sin(t * 2.0 + n * 6.28) * 0.08; // 左右摇摆
  float d = length(gv - offs);
  float r = 0.05 + hash21(id + seed + 3.3) * 0.08;
  return smoothstep(r, 0.0, d) * uSnowAmount;
}

void main() {
  vec3 col = texture(uSceneTex, vUV).rgb;
  float t = uTime * uFallSpeed;
  // 三层视差雪花：近大远小、近快远慢
  float s1 = snowLayer(vUV, 12.0, t, 0.0);
  float s2 = snowLayer(vUV, 24.0, t * 1.4, 7.7) * 0.7;
  float s3 = snowLayer(vUV, 48.0, t * 1.9, 13.3) * 0.45;
  float snow = clamp(s1 + s2 + s3, 0.0, 1.0);
  // 冷色调 + 雾
  col = mix(col, col * vec3(0.85, 0.9, 1.05) + vec3(0.02, 0.03, 0.06), 0.5);
  col = mix(col, vec3(0.9, 0.93, 1.0), snow);
  fragColor = vec4(col, 1.0);
}`,
      },
    ],
    docs: {
      summary: '屏幕空间降雪：三层视差网格雪花（近大快、远小慢），左右摇摆下落，叠加冷色调雾感。',
      detail: [
        '每层独立 scale / 速度 / 随机种子，hash 稀疏化避免密度过高',
        'offs.y += sin(t) 让雪花左右飘摆，告别机械直线',
      ],
    },
  },
  {
    id: 'post-dof',
    name: '景深 DepthOfField',
    category: 'post',
    language: 'glsl3',
    tags: ['后处理', '镜头', '电影感'],
    scene: { kind: 'post' },
    passes: [
      {
        name: '合成',
        vs: '',
        fs: POST_HEAD + `
uniform float uFocusDist;  // @range 2 14 @default 6.0
uniform float uFocusRange; // @range 0.5 6 @default 2.2
uniform float uMaxRadius;  // @range 0 8 @default 4.0

// 深度线性化（与描边预设同一方法）
float linearDepth(vec2 uv) {
  float d = texture(uSceneDepth, uv).r;
  float ndc = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - ndc * (uFar - uNear));
}

void main() {
  float depth = linearDepth(vUV);
  // CoC（弥散圆）：焦点处 0，偏离按比例放大
  float coc = clamp(abs(depth - uFocusDist) / uFocusRange, 0.0, 1.0) * uMaxRadius;
  vec3 col;
  if (coc < 0.4) {
    col = texture(uSceneTex, vUV).rgb;   // 焦点内直接采样
  } else {
    // 12 点泊松盘可变半径模糊（黄金角打散避免方向伪影）
    col = vec3(0.0);
    for (int i = 0; i < 12; i++) {
      float a = float(i) * 0.5236 + float(i) * 0.618;
      float rr = sqrt(float(i) / 12.0) * 0.022;
      vec2 offs = vec2(cos(a), sin(a)) * rr * coc;
      col += texture(uSceneTex, vUV + offs).rgb;
    }
    col /= 12.0;
  }
  fragColor = vec4(col, 1.0);
}`,
      },
    ],
    docs: {
      summary: '深度驱动景深：线性化深度图计算弥散圆（CoC），焦点清晰、前后景按 CoC 半径泊松盘模糊。过场动画/剧情镜头的必备镜头语言。',
      detail: [
        'CoC = clamp(|depth - 焦距| / 对焦范围) —— 真实相机模型是光圈/像距的函数，这里用简化线性版',
        '12 点泊松盘 + 面积均匀分布（sqrt(i/N)），单 Pass 可变半径模糊',
        '拖 uFocusDist 观察焦点在画廊三个物体间转移；商业引擎会用分离的两半模糊 + 前后景合成',
      ],
    },
  },
  {
    id: 'post-glitch',
    name: '信号故障 Glitch',
    category: 'post',
    language: 'glsl3',
    tags: ['后处理', '风格化', '科幻'],
    scene: { kind: 'post' },
    passes: [
      {
        name: '合成',
        vs: '',
        fs: POST_HEAD + `
uniform float uIntensity; // @range 0 1 @default 0.35
uniform float uSpeed;     // @range 1 20 @default 8.0

float hash11(float n) { return fract(sin(n) * 43758.5453); }
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 uv = vUV;
  float t = floor(uTime * uSpeed);            // 时间量化成"帧"，故障按帧跳变
  float gOn = step(1.0 - uIntensity * 0.9, hash11(t)); // 本帧是否处于故障
  // 1) 行段水平撕裂：按行块随机位移
  float band = floor(uv.y * 24.0 + hash11(t + 1.7) * 64.0);
  float shift = (hash12(vec2(band, t)) - 0.5) * 0.16 * uIntensity * (0.25 + gOn);
  uv.x += shift;
  // 2) RGB 色散（故障时加剧）
  float ca = 0.0012 + 0.008 * uIntensity * gOn;
  vec3 col;
  col.r = texture(uSceneTex, uv + vec2(ca, 0.0)).r;
  col.g = texture(uSceneTex, uv).g;
  col.b = texture(uSceneTex, uv - vec2(ca, 0.0)).b;
  // 3) 雪花噪点（故障帧概率触发）
  float snow = step(0.996 - uIntensity * 0.025 * gOn, hash12(vUV * uResolution + t));
  col = mix(col, vec3(hash12(vUV * 91.7 + t)), snow * 0.85);
  // 4) 轻扫描线
  col *= 0.94 + 0.06 * sin(vUV.y * uResolution.y * 1.2);
  fragColor = vec4(col, 1.0);
}`,
      },
    ],
    docs: {
      summary: '数字信号故障：时间量化成"帧"驱动随机撕裂行位移 + RGB 色散 + 雪花噪点。黑客/赛博朋克风格的传送、受干扰、入侵特效。',
      detail: [
        't = floor(time·speed)：所有随机数以"帧号"为种子，故障按帧跳变而非连续漂移',
        'gOn = step(...)：部分时间片完全正常，部分剧烈故障 —— 有节奏感',
        '行块位移用 hash(行块, 帧号)，每条横带独立撕开',
      ],
    },
  },
  {
    id: 'post-circle-wipe',
    name: '圆形转场 CircleWipe',
    category: 'post',
    language: 'glsl3',
    tags: ['后处理', '转场', 'UI'],
    scene: { kind: 'post' },
    passes: [
      {
        name: '合成',
        vs: '',
        fs: POST_HEAD + `
uniform float uProgress;   // @range 0 1 @default 0.5
uniform float uSoftness;   // @range 0.01 0.3 @default 0.08
uniform vec3  uWipeColor;  // @color @default 0.05 0.06 0.12
uniform float uInvert;     // @range 0 1 @default 0.0

void main() {
  float aspect = uResolution.x / uResolution.y;
  vec2 p = (vUV - 0.5) * vec2(aspect, 1.0);
  float r = length(p);
  float maxR = length(vec2(aspect * 0.5, 0.5));
  // 正向：0→1 圆形展开收拢；uInvert=1 时反向
  float pr = mix(uProgress, 1.0 - uProgress, uInvert);
  float edge0 = pr * (maxR + uSoftness * 2.0);
  float mask = smoothstep(edge0, edge0 - uSoftness, r);      // 圆内 = 1
  vec3 scene = texture(uSceneTex, vUV).rgb;
  float ring = smoothstep(edge0 - uSoftness, edge0, r)
             * smoothstep(edge0 + uSoftness, edge0, r);      // 转场发光边
  vec3 col = mix(uWipeColor, scene, mask);
  col += uWipeColor * 5.0 * ring;
  fragColor = vec4(col, 1.0);
}`,
      },
    ],
    docs: {
      summary: '圆形转场遮罩：进度 0→1 圆形展开再收拢，柔边 + 发光过渡环。关卡切换/传送/角色死亡的经典转场，游戏里由代码驱动 uProgress。',
      detail: [
        'mask = smoothstep(edge0, edge0-softness, r)：softness 控制边缘羽化',
        'ring 在圆边缘处取 1，乘 uWipeColor 做发光描边',
        '拖动 uProgress 0→1→0 预览完整转场；配合顶部"录制"按钮可导出转场动画',
      ],
    },
  },
];
