// 3D 网格材质预设（含多 Pass：卡通渲染 + 描边壳）
import type { Preset } from '../engine/types';

const TOON_VS = `#version 300 es
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUV;
uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProjection;
uniform mat3 uNormalMatrix;
uniform mat4 uLightViewProj;
out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vUV;
out vec4 vShadowCoord;
void main() {
  vec4 wp = uModel * vec4(aPosition, 1.0);
  vWorldPos = wp.xyz;
  vNormal = uNormalMatrix * aNormal;
  vUV = aUV;
  vShadowCoord = uLightViewProj * wp;
  gl_Position = uProjection * uView * wp;
}`;

// 内核自动提供的阴影采样函数（uShadowMap 为 1024² 深度贴图）
const SHADOW_GLSL = `uniform sampler2D uShadowMap;

float getShadow(vec3 N, vec3 L, vec4 shadowCoord) {
  vec3 sc = shadowCoord.xyz / shadowCoord.w;
  if (sc.z > 1.0 || sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0) return 1.0;
  float bias = max(0.0012 * (1.0 - dot(N, L)), 0.0004);
  float shadow = 0.0;
  vec2 texel = vec2(1.0 / 1024.0);
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      float d = texture(uShadowMap, sc.xy + vec2(float(x), float(y)) * texel).r;
      shadow += (sc.z - bias > d) ? 0.0 : 1.0;
    }
  }
  return shadow / 9.0;
}`;

const OUTLINE_VS = `#version 300 es
// 反向壳描边：正面剔除 + 顶点沿法线在裁剪空间膨胀
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProjection;
uniform float uOutlineWidth; // @range 0 0.08 @default 0.02
void main() {
  mat4 mv = uView * uModel;
  vec4 clipPos = uProjection * mv * vec4(aPosition, 1.0);
  vec3 clipNormal = mat3(uProjection) * mat3(mv) * aNormal;
  vec3 offset = normalize(clipNormal) * uOutlineWidth * clipPos.w * 2.4;
  clipPos.xy += offset.xy;
  gl_Position = clipPos;
}`;

export const meshPresets: Preset[] = [
  {
    id: 'mesh-toon-cel',
    name: '卡通渲染 + 描边 Toon',
    category: 'material',
    language: 'glsl3',
    tags: ['风格化', '描边', '双Pass'],
    scene: { kind: 'mesh', geometry: 'torusKnot', showFloor: true },
    camera: { dist: 5.2, pitch: 0.3, autoRotate: 0.3 },
    passes: [
      {
        name: '主体着色',
        vs: TOON_VS,
        fs: `#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vUV;
in vec4 vShadowCoord;
out vec4 fragColor;

${SHADOW_GLSL}

uniform vec3  uBaseColor;   // @color @default 0.95 0.55 0.3
uniform vec3  uShadowColor; // @color @default 0.32 0.2 0.4
uniform vec3  uRimColor;    // @color @default 1.0 0.9 0.6
uniform float uSteps;       // @range 1 6 @default 3.0
uniform float uRimPower;    // @range 1 8 @default 4.0
uniform vec3  uCamPos;

void main() {
  vec3 N = normalize(vNormal);
  vec3 L = normalize(vec3(0.55, 0.75, 0.45));
  vec3 V = normalize(uCamPos - vWorldPos);
  // 卡通硬阴影：PCF 结果二值化后压暗受光面（行业惯用做法）
  float shadow = step(0.5, getShadow(N, L, vShadowCoord));
  float ndl = dot(N, L) * 0.5 + 0.5;
  ndl *= mix(0.45, 1.0, shadow);
  // 量化色阶：floor(ndl * steps) / steps
  float ramp = floor(ndl * uSteps) / uSteps;
  ramp = mix(ramp, ndl, 0.12); // 稍微保留一点过渡
  vec3 col = mix(uShadowColor, uBaseColor, ramp);
  vec3 H = normalize(L + V);
  float spec = step(0.92, pow(max(dot(N, H), 0.0), 24.0)) * shadow;
  col += spec * 0.85;
  float rim = pow(1.0 - max(dot(N, V), 0.0), uRimPower);
  col += uRimColor * rim * 0.55;
  fragColor = vec4(col, 1.0);
}`,
      },
      {
        name: '描边壳（反向法）',
        vs: OUTLINE_VS,
        fs: `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec3 uOutlineColor; // @color @default 0.08 0.07 0.1
void main() {
  fragColor = vec4(uOutlineColor, 1.0);
}`,
        cull: 'front',
      },
    ],
    docs: {
      summary: '双 Pass 卡通渲染：Pass1 量化色阶 + 硬高光 + 边缘光；Pass2 反向壳（正面剔除 + 沿法线膨胀）画描边。这是主机游戏卡通渲染最经典的组合。',
      detail: [
        '色阶：ramp = floor(ndl*steps)/steps，uSteps 控制档位数',
        '描边壳把顶点沿法线在裁剪空间挤出 uOutlineWidth * w，剔除正面后只剩轮廓',
        '调整 uOutlineWidth 观察描边粗细；换 geometry 看不同模型效果',
      ],
    },
  },
  {
    id: 'mesh-pbr-lit',
    name: '标准 PBR 光照',
    category: 'material',
    language: 'glsl3',
    tags: ['PBR', '光照', 'GGX'],
    scene: { kind: 'mesh', geometry: 'torusKnot', showFloor: true },
    camera: { dist: 5.0, pitch: 0.35, autoRotate: 0.3 },
    passes: [
      {
        name: '主体着色',
        vs: TOON_VS,
        fs: `#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vUV;
in vec4 vShadowCoord;
out vec4 fragColor;

${SHADOW_GLSL}

uniform vec3  uAlbedo;     // @color @default 0.8 0.35 0.2
uniform float uMetallic;   // @range 0 1 @default 0.85
uniform float uRoughness;  // @range 0.05 1 @default 0.3
uniform vec3  uLightColor; // @color @default 1.0 0.95 0.9
uniform vec3  uCamPos;

const float PI = 3.14159265359;

// ---- GGX / Smith / Schlick（Karis "Real Shading in UE4" 采用的组合）----
float D_GGX(float NoH, float a) {
  float a2 = a * a;
  float d = NoH * NoH * (a2 - 1.0) + a2;
  return a2 / (PI * d * d);
}
float G_Smith(float NoV, float NoL, float a) {
  float k = a * a / 2.0;
  float gv = NoV / (NoV * (1.0 - k) + k);
  float gl = NoL / (NoL * (1.0 - k) + k);
  return gv * gl;
}
vec3 F_Schlick(float u, vec3 f0) {
  return f0 + (1.0 - f0) * pow(1.0 - u, 5.0);
}
// ---- UE4 移动端 IBL 环境高光解析近似（免 BRDF LUT）----
vec3 envBRDFApprox(vec3 F0, float roughness, float NoV) {
  const vec4 c0 = vec4(-1, -0.0275, -0.572, 0.022);
  const vec4 c1 = vec4(1, 0.0425, 1.04, -0.04);
  vec4 r = roughness * c0 + c1;
  float a004 = min(r.x * r.x, exp2(-9.28 * NoV)) * r.x + r.y;
  vec2 ab = vec2(-1.04, 1.04) * a004 + r.zw;
  return F0 * ab.x + ab.y;
}
// ---- ACES 色调映射（Narkowicz 2016）----
vec3 acesFilm(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 L = normalize(vec3(0.55, 0.75, 0.45));   // 与内核阴影光方向一致
  vec3 H = normalize(L + V);
  float NoV = max(dot(N, V), 1e-4);
  float NoL = max(dot(N, L), 0.0);
  float NoH = max(dot(N, H), 0.0);
  float LoH = max(dot(L, H), 0.0);

  float a = uRoughness * uRoughness;
  vec3 f0 = mix(vec3(0.04), uAlbedo, uMetallic);
  vec3 F = F_Schlick(LoH, f0);
  float D = D_GGX(NoH, a);
  float G = G_Smith(NoV, NoL, a);
  vec3 spec = (D * G * F) / max(4.0 * NoV * NoL, 1e-4) * NoL;
  vec3 kd = (1.0 - F) * (1.0 - uMetallic);
  vec3 diff = kd * uAlbedo / PI * NoL;

  // 阴影（PCF）：直接光 diffuse+spec 都被遮挡
  float shadow = getShadow(N, L, vShadowCoord);

  // 半球环境漫反射 + Karis 近似的环境高光（用程序化天空色代替 cubemap）
  vec3 skyColor = mix(vec3(0.30, 0.34, 0.42), vec3(0.55, 0.65, 0.82), N.y * 0.5 + 0.5);
  vec3 groundColor = vec3(0.14, 0.13, 0.12);
  vec3 ambientDiff = mix(groundColor, skyColor, N.y * 0.5 + 0.5) * uAlbedo * (1.0 - uMetallic * 0.7);
  vec3 ambientSpec = skyColor * envBRDFApprox(f0, uRoughness, NoV) * 0.5;

  vec3 col = (diff + spec) * uLightColor * PI * 0.6 * shadow
           + ambientDiff + ambientSpec * NoV;
  vec3 mapped = pow(acesFilm(col / 1.2), vec3(1.0 / 2.2)); // HDR → ACES → gamma
  fragColor = vec4(mapped, 1.0);
}`,
      },
    ],
    docs: {
      summary: 'Cook-Torrance PBR（GGX+Smith+Schlick）+ PCF 阴影 + UE4 移动端 IBL 环境高光近似 + ACES 色调映射 —— 一套完整的现代实时 PBR 管线教学实现。',
      detail: [
        '直接光：GGX 法线分布 + Smith 几何项 + Schlick 菲涅尔（Karis 2013 采用的组合）',
        '间接光：半球环境漫反射 + envBRDFApprox 环境高光（Karis 移动端 Split-Sum 第二项的解析近似，免 BRDF LUT）',
        '阴影：内核 1024² 深度贴图 + 3x3 PCF（Reeves 1983）+ 坡度缩放偏移',
        '输出：线性 HDR → ACES filmic（Narkowicz 2016 拟合）→ gamma 2.2',
      ],
    },
  },
  {
    id: 'mesh-water-surface',
    name: '水面 waves Water',
    category: 'material',
    language: 'glsl3',
    tags: ['水面', '顶点动画', '菲涅尔'],
    scene: { kind: 'mesh', geometry: 'plane', showFloor: false, spin: false },
    camera: { dist: 4.6, pitch: 0.5, autoRotate: 0.12 },
    passes: [
      {
        name: '水面',
        vs: `#version 300 es
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUV;
uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProjection;
uniform mat3 uNormalMatrix;
uniform float uTime;
uniform float uWaveHeight; // @range 0 0.5 @default 0.16
uniform float uWaveSpeed;  // @range 0 3 @default 1.0
out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vUV;
out float vHeight;

float waveH(vec2 xz, float t) {
  return sin(dot(xz, vec2(0.8, 0.6)) * 2.0 + t * 1.2) * 0.55
       + sin(dot(xz, vec2(-0.4, 1.0)) * 3.1 + t * 1.7) * 0.3
       + sin(dot(xz, vec2(0.2, -0.9)) * 5.3 + t * 2.3) * 0.15;
}

void main() {
  vec3 p = aPosition;
  float t = uTime * uWaveSpeed;
  float h = waveH(p.xz, t) * uWaveHeight;
  p.y += h;
  vHeight = h;
  // 数值求导得到法线
  float e = 0.05;
  float hL = waveH(p.xz - vec2(e, 0.0), t) * uWaveHeight;
  float hR = waveH(p.xz + vec2(e, 0.0), t) * uWaveHeight;
  float hD = waveH(p.xz - vec2(0.0, e), t) * uWaveHeight;
  float hU = waveH(p.xz + vec2(0.0, e), t) * uWaveHeight;
  vNormal = uNormalMatrix * normalize(vec3(hL - hR, 2.0 * e, hD - hU));
  vec4 wp = uModel * vec4(p, 1.0);
  vWorldPos = wp.xyz;
  vUV = aUV;
  gl_Position = uProjection * uView * wp;
}`,
        fs: `#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vUV;
in float vHeight;
out vec4 fragColor;

uniform vec3  uDeepColor;    // @color @default 0.02 0.14 0.28
uniform vec3  uShallowColor; // @color @default 0.08 0.5 0.55
uniform vec3  uFoamColor;    // @color @default 1.0 1.0 1.0
uniform float uFoamLevel;    // @range 0 0.4 @default 0.12
uniform vec3  uCamPos;
uniform float uTime;

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
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCamPos - vWorldPos);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 L = normalize(vec3(0.4, 0.8, 0.3));
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 180.0) * 2.0;
  vec3 sky = mix(vec3(0.35, 0.5, 0.75), vec3(0.8, 0.88, 0.95), 0.5);
  vec3 water = mix(uDeepColor, uShallowColor, smoothstep(-0.2, 0.25, vHeight));
  vec3 col = mix(water, sky, fres * 0.75);
  col += vec3(1.0, 0.95, 0.85) * spec;
  float foamN = noise2(vUV * 40.0 + uTime * 0.4) * 0.6 + noise2(vUV * 90.0 - uTime * 0.3) * 0.4;
  float foam = smoothstep(uFoamLevel, uFoamLevel + 0.06, vHeight) * smoothstep(0.35, 0.6, foamN);
  col = mix(col, uFoamColor, foam * 0.65);
  fragColor = vec4(col, 1.0);
}`,
        cull: 'none',
      },
    ],
    docs: {
      summary: '顶点着色器波动水面：三组正弦波叠加位移顶点，数值求导重建法线，片元做菲涅尔反射 + 太阳高光 + 波峰泡沫。',
      detail: [
        'waveH 在 xz 平面上叠加 3 个不同方向/频率的波',
        '法线用左右/前后 4 点高度差重建（等价于求偏导）',
        '泡沫出现在波峰（vHeight 超阈值）且噪声纹理匹配处',
      ],
    },
  },
  {
    id: 'mesh-hologram',
    name: '全息投影 Hologram',
    category: 'material',
    language: 'glsl3',
    tags: ['科幻', '加法混合', '特效'],
    scene: { kind: 'mesh', geometry: 'sphere', showFloor: true },
    camera: { dist: 4.5, pitch: 0.2, autoRotate: 0.4 },
    passes: [
      {
        name: '全息',
        vs: TOON_VS,
        fs: `#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vUV;
out vec4 fragColor;

uniform vec3  uHoloColor;   // @color @default 0.15 0.8 1.0
uniform float uScanDensity; // @range 10 120 @default 60.0
uniform float uFlicker;     // @range 0 1 @default 0.2
uniform float uFresnelPow;  // @range 0.5 6 @default 2.5
uniform vec3  uCamPos;
uniform float uTime;

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCamPos - vWorldPos);
  float fres = pow(1.0 - abs(dot(N, V)), uFresnelPow);
  float scan = 0.55 + 0.45 * sin(vWorldPos.y * uScanDensity - uTime * 6.0);
  float flicker = 1.0 - uFlicker * (0.5 + 0.5 * sin(uTime * 47.0) * sin(uTime * 13.7));
  float alpha = (fres * 1.4 + scan * 0.25) * flicker;
  vec3 col = uHoloColor * (0.6 + fres) + vec3(0.4, 0.9, 1.0) * scan * 0.3;
  fragColor = vec4(col * alpha, clamp(alpha, 0.0, 1.0));
}`,
        blend: 'additive',
        cull: 'back',
      },
    ],
    docs: {
      summary: '加法混合的全息效果：菲涅尔描亮轮廓，横向扫描线滚动，轻微双频闪烁模拟信号干扰。',
      detail: [
        'blend: additive —— 无需排序，颜色直接往画面上叠',
        'scan 用世界坐标 y * 密度 - 时间 做滚动条纹',
        'flicker 用两个不同频率 sin 相乘，避免周期感',
      ],
    },
  },
  {
    id: 'mesh-dissolve',
    name: '噪声消融 Dissolve',
    category: 'material',
    language: 'glsl3',
    tags: ['特效', '消融', '死亡动画'],
    scene: { kind: 'mesh', geometry: 'torus', showFloor: true },
    camera: { dist: 4.6, pitch: 0.3, autoRotate: 0.3 },
    passes: [
      {
        name: '主体',
        vs: TOON_VS,
        fs: `#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uNoiseTex;
uniform float uProgress;   // @range 0 1 @default 0.35
uniform vec3  uBaseColor;  // @color @default 0.4 0.55 0.9
uniform vec3  uBurnColor;  // @color @default 1.0 0.42 0.08
uniform float uEdgeWidth;  // @range 0.01 0.25 @default 0.08
uniform vec3  uCamPos;

void main() {
  float n = texture(uNoiseTex, vUV * 2.0).r;
  if (n < uProgress - uEdgeWidth) discard;      // 完全消失的区域
  vec3 N = normalize(vNormal);
  vec3 L = normalize(vec3(0.55, 0.75, 0.45));
  float diff = max(dot(N, L), 0.0) * 0.75 + 0.25;
  vec3 base = uBaseColor * diff;
  // 烧灼边缘：越接近阈值越亮
  float edge = 1.0 - smoothstep(uProgress - uEdgeWidth, uProgress, n);
  vec3 col = mix(base, uBurnColor * (1.6 + n * 1.5), edge);
  fragColor = vec4(col, 1.0);
}`,
      },
    ],
    docs: {
      summary: '怪物死亡/传送门最常见的消融：噪声图阈值裁剪（discard），边缘一段渐变到烧灼色。',
      detail: [
        'uProgress 从 0 拖到 1 即可驱动整段消融动画（可配合录制导出视频）',
        'discard 掉低于阈值的片元，边缘 smoothstep 混合烧灼色',
        '换 uNoiseTex 不同的纹理可以得到不同的消融花纹',
      ],
    },
  },
  {
    id: 'mesh-matcap',
    name: 'MatCap 球贴材质',
    category: 'material',
    language: 'glsl3',
    tags: ['风格化', '无光照', '美术友好'],
    scene: { kind: 'mesh', geometry: 'torusKnot', showFloor: true },
    camera: { dist: 5.0, pitch: 0.3, autoRotate: 0.35 },
    passes: [
      {
        name: '主体',
        vs: TOON_VS,
        fs: `#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uMatCapTex;
uniform vec3  uTint;        // @color @default 1.0 1.0 1.0
uniform float uNormalBlend; // @range 0 1 @default 0.0
uniform mat4  uView;

void main() {
  // 视空间法线映射到 MatCap 纹理
  vec3 nWorld = normalize(vNormal);
  vec3 nGeo = nWorld;
  vec3 nView = normalize(mat3(uView) * nGeo);
  vec2 muv = nView.xy * 0.5 + 0.5;
  vec3 cap = texture(uMatCapTex, muv).rgb;
  vec3 col = cap * uTint;
  if (uNormalBlend > 0.0) {
    col = mix(col, nGeo * 0.5 + 0.5, uNormalBlend);
  }
  fragColor = vec4(col, 1.0);
}`,
      },
    ],
    docs: {
      summary: 'MatCap：把视空间法线直接映射到一张"预烘焙光照球"纹理，一次采样得到金属/釉质感，性能极佳。',
      detail: [
        '核心：nView.xy * 0.5 + 0.5 作为纹理 uv',
        'uNormalBlend 可以让法线直接可视化（调参调试利器）',
        '旋转模型（拖动相机）观察光照"冻结"在表面上的效果',
      ],
    },
  },
  {
    id: 'mesh-fresnel-rim',
    name: '菲涅尔边缘光 Rim',
    category: 'material',
    language: 'glsl3',
    tags: ['光照', '边缘光', '角色'],
    scene: { kind: 'mesh', geometry: 'sphere', showFloor: true },
    camera: { dist: 4.4, pitch: 0.25, autoRotate: 0.3 },
    passes: [
      {
        name: '主体',
        vs: TOON_VS,
        fs: `#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vUV;
out vec4 fragColor;

uniform vec3  uBaseColor;    // @color @default 0.15 0.2 0.3
uniform vec3  uRimColor;     // @color @default 0.4 0.8 1.0
uniform float uRimPower;     // @range 0.5 8 @default 3.0
uniform float uRimStrength;  // @range 0 3 @default 1.2
uniform vec3  uCamPos;

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 L = normalize(vec3(0.55, 0.75, 0.45));
  float diff = max(dot(N, L), 0.0) * 0.6 + 0.35;
  float rim = pow(1.0 - max(dot(N, V), 0.0), uRimPower);
  vec3 col = uBaseColor * diff + uRimColor * rim * uRimStrength;
  fragColor = vec4(col, 1.0);
}`,
      },
    ],
    docs: {
      summary: '菲涅尔边缘光：视线与法线夹角越大越亮，角色在逆光场景中保持轮廓可读性的标配。',
      detail: [
        'rim = pow(1 - dot(N, V), power)：power 越大光圈越细',
        'uRimStrength 控制强度；双击 viewport 拖动相机看边缘光跟随视角',
      ],
    },
  },
  {
    id: 'mesh-flag-wave',
    name: '旗帜飘动 Flag',
    category: 'material',
    language: 'glsl3',
    tags: ['顶点动画', '布料', '2D/3D'],
    scene: { kind: 'mesh', geometry: 'flag', showFloor: true, spin: false },
    camera: { dist: 4.8, pitch: 0.1, yaw: 0.5, autoRotate: 0 },
    passes: [
      {
        name: '旗面',
        vs: `#version 300 es
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUV;
uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProjection;
uniform mat3 uNormalMatrix;
uniform float uTime;
uniform float uWaveHeight; // @range 0 0.6 @default 0.25
uniform float uStiffness;  // @range 0 1 @default 0.7
out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vUV;

float disp(vec2 xz, float t, float amp) {
  return sin(xz.x * 2.2 + t * 2.4) * 0.6
       + sin(xz.x * 4.1 - t * 3.1) * 0.25
       + sin(xz.y * 3.0 + t * 1.8) * 0.15;
}

void main() {
  vec3 p = aPosition;
  float t = uTime;
  // 靠近旗杆（x=-1.3，uv.x=0）固定：权重随 x 增大
  float w = (p.x / 2.6 + 0.5) * (1.0 - uStiffness * 0.5);
  w = max(w, 0.0);
  float d = disp(p.xz, t, uWaveHeight) * uWaveHeight * w;
  p.z += d;
  p.y += sin(p.x * 1.7 + t * 2.0) * uWaveHeight * w * 0.25;
  float e = 0.08;
  float dR = disp(vec2(p.x + e, p.z), t, uWaveHeight) * uWaveHeight * w;
  float dU = disp(vec2(p.x, p.z + e), t, uWaveHeight) * uWaveHeight * w;
  vec3 tR = vec3(e, 0.0, dR - d) ;
  vec3 tU = vec3(0.0, e, dU - d);
  vNormal = uNormalMatrix * normalize(cross(tR, tU));
  vec4 wp = uModel * vec4(p, 1.0);
  vWorldPos = wp.xyz;
  vUV = aUV;
  gl_Position = uProjection * uView * wp;
}`,
        fs: `#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vUV;
out vec4 fragColor;

uniform vec3 uStripeA; // @color @default 0.9 0.2 0.25
uniform vec3 uStripeB; // @color @default 0.98 0.9 0.85

void main() {
  vec3 N = normalize(vNormal);
  vec3 L = normalize(vec3(0.4, 0.8, 0.5));
  float diff = abs(dot(N, L)) * 0.7 + 0.3; // abs() 让布料双面受光
  float stripe = step(0.5, fract(vUV.x * 5.0)) * 0.85 + 0.15;
  float star = smoothstep(0.12, 0.1, distance(fract(vUV * vec2(2.0, 1.0)), vec2(0.7, 0.7)));
  vec3 col = mix(uStripeA, uStripeB, stripe);
  col = mix(col, uStripeB * 1.05, star * step(0.55, vUV.x) * step(0.55, vUV.y));
  col *= diff;
  fragColor = vec4(col, 1.0);
}`,
        cull: 'none',
      },
    ],
    docs: {
      summary: '顶点动画布料：位移权重随距旗杆距离增大，数值求导重建法线，双面渲染 + abs(N·L) 光照。',
      detail: [
        '权重 w = 距旗杆的距离比例 —— 旗杆一侧完全固定',
        '法线由位移场偏导（cross(∂d/∂x, ∂d/∂y)）实时重建',
        'uStiffness 调节整体柔软度',
      ],
    },
  },
  {
    id: 'mesh-hit-flash',
    name: '受击闪白 HitFlash',
    category: 'material',
    language: 'glsl3',
    tags: ['2D/3D游戏', '打击感', '实用'],
    scene: { kind: 'mesh', geometry: 'cube', showFloor: true },
    camera: { dist: 5.0, pitch: 0.3, autoRotate: 0.4 },
    passes: [
      {
        name: '主体',
        vs: TOON_VS,
        fs: `#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uMainTex;
uniform vec3  uBaseColor;   // @color @default 0.35 0.5 0.85
uniform vec3  uFlashColor;  // @color @default 1.0 1.0 1.0
uniform float uFlash;       // @range 0 1 @default 0.0
uniform float uFlashMix;    // @range 0 2 @default 1.0
uniform vec3  uCamPos;

void main() {
  vec3 N = normalize(vNormal);
  vec3 L = normalize(vec3(0.55, 0.75, 0.45));
  float diff = max(dot(N, L), 0.0) * 0.7 + 0.3;
  vec3 tex = texture(uMainTex, vUV).rgb;
  vec3 base = uBaseColor * tex * diff;
  vec3 col = mix(base, uFlashColor * uFlashMix, clamp(uFlash, 0.0, 1.0));
  fragColor = vec4(col, 1.0);
}`,
      },
    ],
    docs: {
      summary: '角色受击闪白：受击瞬间把 uFlash 从 0 打到 1 再衰减回 0，画面立刻获得打击反馈。游戏里通常由代码驱动这个参数。',
      detail: [
        'col = mix(正常着色, 闪白, uFlash)',
        'uFlashMix > 1 时可以过曝到纯白',
        '尝试把 uFlash 拖到 1，再配合右上角录制按钮导出打击瞬间',
      ],
    },
  },
  {
    id: 'mesh-normals-debug',
    name: '法线调试 NormalDebug',
    category: 'material',
    language: 'glsl1',
    tags: ['调试', 'WebGL1', '工具'],
    scene: { kind: 'mesh', geometry: 'torusKnot', showFloor: true },
    camera: { dist: 5.0, pitch: 0.35, autoRotate: 0.3 },
    passes: [
      {
        name: '法线可视化',
        vs: `attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec2 aUV;
uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProjection;
uniform mat3 uNormalMatrix;
varying vec3 vNormal;
varying vec2 vUV;
void main() {
  vNormal = uNormalMatrix * aNormal;
  vUV = aUV;
  gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);
}`,
        fs: `precision highp float;
varying vec3 vNormal;
varying vec2 vUV;
void main() {
  gl_FragColor = vec4(normalize(vNormal) * 0.5 + 0.5, 1.0);
}`,
      },
    ],
    docs: {
      summary: '法线可视化（GLSL1）：RGB 直接映射法线 xyz，是网格调试与切线空间问题排查的必备工具。',
      detail: [
        '红 = +X，绿 = +Y，蓝 = +Z',
        '同时演示 GLSL ES 1.0 在网格场景（attribute/varying）的写法',
      ],
    },
  },
  {
    id: 'mesh-normal-map',
    name: '法线贴图 NormalMap',
    category: 'material',
    language: 'glsl3',
    tags: ['法线贴图', 'TBN', 'PBR基础'],
    scene: { kind: 'mesh', geometry: 'torus', showFloor: true },
    camera: { dist: 4.6, pitch: 0.3, autoRotate: 0.25 },
    passes: [
      {
        name: '主体',
        vs: `#version 300 es
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUV;
layout(location=3) in vec3 aTangent;   // 内核几何体自带切线（Lengyel 算法）
uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProjection;
uniform mat3 uNormalMatrix;
uniform mat4 uLightViewProj;
out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vUV;
out vec3 vTangent;
out vec4 vShadowCoord;
void main() {
  vec4 wp = uModel * vec4(aPosition, 1.0);
  vWorldPos = wp.xyz;
  vNormal = uNormalMatrix * aNormal;
  vTangent = uNormalMatrix * aTangent;
  vUV = aUV;
  vShadowCoord = uLightViewProj * wp;
  gl_Position = uProjection * uView * wp;
}`,
        fs: `#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vUV;
in vec3 vTangent;
in vec4 vShadowCoord;
out vec4 fragColor;

${SHADOW_GLSL}

uniform sampler2D uNormalTex;   // 默认绑定程序化砖墙法线贴图
uniform vec3  uBaseColor;       // @color @default 0.75 0.72 0.68
uniform float uNormalStrength;  // @range 0 2 @default 1.0
uniform float uSpecPower;       // @range 4 128 @default 32
uniform float uSpecStrength;    // @range 0 2 @default 0.6
uniform vec3  uCamPos;

void main() {
  vec3 N = normalize(vNormal);
  vec3 T = normalize(vTangent - N * dot(N, vTangent)); // Gram-Schmidt 正交化
  vec3 B = cross(N, T);
  mat3 TBN = mat3(T, B, N);
  // 采样切线空间法线贴图并变换到世界空间
  vec3 nTS = texture(uNormalTex, vUV * 2.0).xyz * 2.0 - 1.0;
  vec3 Np = normalize(TBN * (nTS * vec3(uNormalStrength, uNormalStrength, 1.0)));

  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 L = normalize(vec3(0.55, 0.75, 0.45));
  float shadow = getShadow(N, L, vShadowCoord);
  // Half-Lambert（半兰伯特， Valve 半条命2 引入）+ Blinn-Phong 高光
  float hL = dot(Np, L) * 0.5 + 0.5;
  vec3 diff = uBaseColor * hL * hL * shadow;
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(Np, H), 0.0), uSpecPower) * uSpecStrength * shadow;
  vec3 col = diff + vec3(1.0) * spec;
  fragColor = vec4(pow(col, vec3(0.4545)), 1.0);
}`,
      },
    ],
    docs: {
      summary: '切线空间法线贴图全流程：几何体自带 Lengyel 切线 → TBN 正交基 → 采样程序化砖墙法线贴图 → Half-Lambert + Blinn-Phong，外加 PCF 阴影。',
      detail: [
        '切线计算：Lengyel《Mathematics for 3D Game Programming》§7.8，逐三角形求切线后按顶点平均 + Gram-Schmidt 正交化（工业界 MikkTSpace 的简化索引版）',
        'bitangent 不占 attribute：着色器里 B = cross(N, T) 现算',
        'Half-Lambert（Valve，半条命 2）让背光面不至于死黑',
        '把 uNormalTex 换成"噪声图"等其它纹理观察不同凹凸；uNormalStrength 控制强度',
      ],
    },
  },
];
