// 代码片段库：AI 助手"生成"页与 ToySL include 共用
export interface Snippet {
  id: string;
  name: string;
  category: string;
  desc: string;
  code: string;
}

export const SNIPPETS: Snippet[] = [
  {
    id: 'hash', name: 'hash / 随机数', category: '噪声与随机', desc: '无纹理哈希函数，常用于噪声与粒子抖动',
    code: `float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; return fract(p * (p + p)); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }`,
  },
  {
    id: 'noise2d', name: 'value noise 2D', category: '噪声与随机', desc: '二维值噪声（平滑插值）',
    code: `float noise2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1, 0));
  float c = hash12(i + vec2(0, 1));
  float d = hash12(i + vec2(1, 1));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}`,
  },
  {
    id: 'noise3d', name: 'value noise 3D', category: '噪声与随机', desc: '三维值噪声，用于体积/云/流体',
    code: `float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n = dot(i, vec3(1.0, 57.0, 113.0));
  return mix(mix(mix(hash11(n), hash11(n + 1.0), f.x), mix(hash11(n + 57.0), hash11(n + 58.0), f.x), f.y),
             mix(mix(hash11(n + 113.0), hash11(n + 114.0), f.x), mix(hash11(n + 170.0), hash11(n + 171.0), f.x), f.y), f.z);
}`,
  },
  {
    id: 'fbm', name: 'fbm 分形噪声', category: '噪声与随机', desc: '多倍频叠加噪声，云雾/地形标配',
    code: `float fbm(vec2 p, int oct) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    v += a * noise2(p);
    p = p * 2.03 + vec2(11.7, 5.3);
    a *= 0.5;
  }
  return v;
}`,
  },
  {
    id: 'rotate', name: '旋转矩阵', category: '工具函数', desc: '二维旋转',
    code: `mat2 rot(float a) { float s = sin(a), c = cos(a); return mat2(c, -s, s, c); }`,
  },
  {
    id: 'palette', name: '余弦调色板', category: '工具函数', desc: 'IQ 余弦调色板，一行生成流动色彩',
    code: `vec3 palette(float t) {
  return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
}`,
  },
  {
    id: 'fresnel', name: '菲涅尔', category: '光照', desc: '视角越掠射越亮，边缘光/水面反射的核心',
    code: `float fresnel(vec3 N, vec3 V, float power) {
  return pow(1.0 - max(dot(N, V), 0.0), power);
}`,
  },
  {
    id: 'toonramp', name: '卡通色阶', category: '光照', desc: '把连续光照量化为 N 档，卡通渲染核心',
    code: `float toonRamp(float ndl, float steps) {
  return floor(clamp(ndl, 0.0, 1.0) * steps) / steps;
}
// 用法: float d = toonRamp(dot(N, L) * 0.5 + 0.5, 3.0);`,
  },
  {
    id: 'sdf', name: 'SDF 基础体', category: 'SDF 与 Raymarch', desc: '球 / 盒 / 环面 / 胶囊的符号距离函数',
    code: `float sdSphere(vec3 p, float r) { return length(p) - r; }
float sdBox(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
float sdTorus(vec3 p, vec2 t) { vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }
float sdCapsule(vec3 p, vec3 a, vec3 b, float r) { vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }`,
  },
  {
    id: 'raymarch', name: 'Raymarch 主循环', category: 'SDF 与 Raymarch', desc: '球体追踪光线步进模板 + 法线求解',
    code: `float map(vec3 p) {
  return sdSphere(p - vec3(0.0, 0.0, 0.0), 1.0);
}
vec3 calcNormal(vec3 p) {
  const vec2 e = vec2(0.002, 0.0);
  return normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx)));
}
// 主循环
float t = 0.0; bool hit = false;
for (int i = 0; i < 96; i++) {
  vec3 pos = ro + rd * t;
  float d = map(pos);
  if (d < 0.001 * t) { hit = true; break; }
  t += d;
  if (t > 40.0) break;
}`,
  },
  {
    id: 'aces', name: 'ACES Tonemap', category: '后处理', desc: '电影级色调映射（Narkowicz 2016 拟合），HDR→SDR 标准出口，防高光死白',
    code: `// 输入线性 HDR，输出线性 ACES；gamma 由渲染器后处理或 pow(1/2.2) 完成
vec3 acesFilm(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
// 用法: fragColor = vec4(pow(acesFilm(hdr), vec3(1.0/2.2)), 1.0);
// 出处: Narkowicz 2016 "ACES Filmic Tone Mapping Curve"（对 ACES RRT+ODT 的有理函数拟合，最大误差 0.0138）`,
  },
  {
    id: 'env-brdf-approx', name: 'IBL 环境近似 (Karis)', category: '后处理', desc: 'UE4 移动端 Split-Sum 第二项的解析近似，免 BRDF LUT',
    code: `// UE4 移动端环境高光近似：替代 2D BRDF LUT（Karis 2013 "Real Shading in Unreal Engine 4"）
// 配合预滤波环境贴图使用: indirectSpecular = prefilteredColor * (F0 * brdf.x + brdf.y)
vec3 envBRDFApprox(vec3 F0, float roughness, float NoV) {
  const vec4 c0 = vec4(-1, -0.0275, -0.572, 0.022);
  const vec4 c1 = vec4(1, 0.0425, 1.04, -0.04);
  vec4 r = roughness * c0 + c1;
  float a004 = min(r.x * r.x, exp2(-9.28 * NoV)) * r.x + r.y;
  vec2 ab = vec2(-1.04, 1.04) * a004 + r.zw;
  return F0 * ab.x + ab.y;
}`,
  },
  {
    id: 'shadow-pcf', name: '阴影 PCF 采样', category: '光照', desc: '3x3 百分比渐近过滤 + 坡度缩放偏移，配合内核 uShadowMap 使用',
    code: `// 阴影采样：Williams 1978 Shadow Maps + Reeves et al. 1983 PCF + 坡度缩放偏移
// 内核已自动提供 uShadowMap / uLightViewProj，顶点着色器输出 vShadowCoord = uLightViewProj * worldPos
uniform sampler2D uShadowMap;

float getShadow(vec3 N, vec3 L, vec4 shadowCoord) {
  vec3 sc = shadowCoord.xyz / shadowCoord.w;          // 透视除法（正交光下 w=1）
  if (sc.z > 1.0 || sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0) return 1.0;
  float bias = max(0.0012 * (1.0 - dot(N, L)), 0.0004); // 坡度缩放偏移，消除阴影痤疮
  float shadow = 0.0;
  vec2 texel = vec2(1.0 / 1024.0);                      // 内核阴影贴图尺寸 1024
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      float d = texture(uShadowMap, sc.xy + vec2(float(x), float(y)) * texel).r;
      shadow += (sc.z - bias > d) ? 0.0 : 1.0;
    }
  }
  return shadow / 9.0;                                  // 0=全影 1=全亮
}`,
  },
  {
    id: 'tbn', name: 'TBN 切线空间', category: '光照', desc: '切线/副切线/法线正交基，法线贴图采样必备（Lengyel 算法）',
    code: `// 顶点着色器（内核几何体已提供 aTangent，位置 3）：
layout(location=3) in vec3 aTangent;
out vec3 vTangent;
out mat3 vTBN;                       // 切线空间 -> 世界空间
void main() {
  vec3 N = normalize(uNormalMatrix * aNormal);
  vec3 T = normalize(uNormalMatrix * aTangent);
  T = normalize(T - N * dot(N, T));  // Gram-Schmidt 正交化
  vec3 B = cross(N, T);              // 副切线现算，省一条 attribute
  vTBN = mat3(T, B, N);
}
// 片元着色器：N = normalize(vTBN * (texture(normalMap, uv).xyz * 2.0 - 1.0));`,
  },
  {
    id: 'vignette', name: '暗角', category: '后处理', desc: '四角压暗，聚焦画面中心',
    code: `vec3 applyVignette(vec3 col, vec2 uv, float strength) {
  float d = distance(uv, vec2(0.5));
  return col * (1.0 - strength * smoothstep(0.3, 0.9, d));
}`,
  },
  {
    id: 'grain', name: '胶片噪点', category: '后处理', desc: '每帧随机颗粒感',
    code: `vec3 applyGrain(vec3 col, vec2 uv, float time, float amount) {
  float g = fract(sin(dot(uv * time, vec2(12.9898, 78.233))) * 43758.5453);
  return col + (g - 0.5) * amount;
}`,
  },
  {
    id: 'ca', name: '色差', category: '后处理', desc: 'RGB 通道径向偏移，镜头缺陷感',
    code: `vec3 applyChromatic(vec2 uv, sampler2D tex, float strength) {
  vec2 dir = uv - 0.5;
  float r = texture(tex, uv - dir * strength).r;
  float g = texture(tex, uv).g;
  float b = texture(tex, uv + dir * strength).b;
  return vec3(r, g, b);
}`,
  },
  {
    id: 'sobel', name: 'Sobel 边缘检测', category: '后处理', desc: '3x3 卷积描边/轮廓线',
    code: `float sobel(sampler2D tex, vec2 uv, vec2 px) {
  float tl = texture(tex, uv + px * vec2(-1, 1)).r, tc = texture(tex, uv + px * vec2(0, 1)).r, tr = texture(tex, uv + px * vec2(1, 1)).r;
  float ml = texture(tex, uv + px * vec2(-1, 0)).r,                                                mr = texture(tex, uv + px * vec2(1, 0)).r;
  float bl = texture(tex, uv + px * vec2(-1, -1)).r, bc = texture(tex, uv + px * vec2(0, -1)).r, br = texture(tex, uv + px * vec2(1, -1)).r;
  float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
  float gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;
  return sqrt(gx * gx + gy * gy);
}`,
  },
  {
    id: 'gerstner', name: 'Gerstner 波', category: '3D 材质', desc: '水面顶点位移的经典波形',
    code: `// 返回: xyz = 位移, w = 局部高度导数参考
vec3 gerstner(vec2 xz, float t, vec2 dir, float steep, float len) {
  float k = 6.28318 / len;
  float c = sqrt(9.8 / k);
  vec2 d = normalize(dir);
  float f = k * (dot(d, xz) - c * t);
  float a = steep / k;
  return vec3(d.x * a * cos(f), a * sin(f), d.y * a * cos(f));
}`,
  },
  {
    id: 'dissolve', name: '噪声消融', category: '3D 材质', desc: '沿噪声阈值溶解 + 烧灼描边',
    code: `float n = noise2(vUV * 8.0);              // 或用世界坐标
float p = uProgress;                       // 0 -> 1
if (n < p - 0.08) discard;                 // 完全消失
float edge = smoothstep(p - 0.08, p, n);   // 边缘区域
vec3 col = mix(baseColor, burnColor, edge);`,
  },
  {
    id: 'scanline', name: '扫描线', category: '后处理', desc: 'CRT / 全息投影的横向条纹',
    code: `float scan = 0.85 + 0.15 * sin(uv.y * uResolution.y * 1.5 - uTime * 8.0);
col *= scan;`,
  },
  {
    id: 'dither', name: 'Bayer 抖动', category: '后处理', desc: '像素艺术/低保真风格化',
    code: `float bayer4(vec2 p) {  // p 为像素坐标
  vec2 p1 = mod(p, 2.0), p2 = floor(0.5 * mod(p, 4.0));
  return 0.25 * p1.x + 0.5 * p1.y + 0.0625 * p2.x + 0.125 * p2.y;
}
// col = floor(col * levels + bayer4(gl_FragCoord.xy)) / levels;`,
  },
  {
    id: 'hologram-core', name: '全息核心', category: '3D 材质', desc: '菲涅尔 + 扫描线 + 闪烁',
    code: `float fres = pow(1.0 - abs(dot(N, V)), 2.0);
float scan = 0.6 + 0.4 * sin(vWorldPos.y * 60.0 - uTime * 6.0);
float flicker = 0.92 + 0.08 * sin(uTime * 47.0) * sin(uTime * 13.0);
vec3 col = uColor * (fres * 1.6 + scan * 0.35) * flicker;`,
  },
];

export function findSnippet(id: string): Snippet | undefined {
  return SNIPPETS.find((s) => s.id === id);
}
