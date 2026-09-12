// 多语言演示预设：HLSL 转译 / ToySL 自定义语言 / WGSL(WebGPU)
import type { Preset } from '../engine/types';

export const extraPresets: Preset[] = [
  {
    id: 'fs-hlsl-dither',
    name: '像素抖动画 (HLSL)',
    category: 'fullscreen',
    language: 'hlsl',
    tags: ['HLSL', '抖动', '转译'],
    scene: { kind: 'fullscreen' },
    passes: [
      {
        name: 'PSMain',
        vs: '',
        fs: `// HLSL 全屏着色器（实验性：逐行转译为 GLSL ES 3.0 后由 WebGL2 执行）
// cbuffer 成员 Time / Resolution 自动映射为内核内置 uniform
cbuffer PerFrame : register(b0) {
  float  Time;
  float2 Resolution;
};

float hash21(float2 p) {
  p = frac(p * float2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return frac(p.x * p.y);
}

float bayer4(float2 pix) {
  float2 p1 = fmod(pix, 2.0);
  float2 p2 = floor(0.5 * fmod(pix, 4.0));
  return 0.25 * p1.x + 0.5 * p1.y + 0.0625 * p2.x + 0.125 * p2.y;
}

float4 PSMain(float2 uv : TEXCOORD0) : SV_Target {
  float2 p = uv - 0.5;
  p.x *= Resolution.x / Resolution.y;
  float t = Time * 0.4;
  // 流动图案
  float v = sin(p.x * 9.0 + t) * sin(p.y * 9.0 - t * 0.8);
  v += sin(length(p) * 22.0 - t * 2.2) * 0.7;
  v = v * 0.25 + 0.5;
  // Bayer 4x4 抖动量化
  float levels = 5.0;
  float d = bayer4(uv * Resolution);
  float q = floor(saturate(v) * levels + d) / levels;
  float3 warm = float3(0.95, 0.75, 0.45);
  float3 cool = float3(0.1, 0.12, 0.22);
  float3 col = lerp(cool, warm, q);
  return float4(col, 1.0);
}`,
      },
    ],
    docs: {
      summary: 'HLSL 转译演示：同一份 HLSL 代码经内置转译器变为 GLSL ES 3.0 在 WebGL2 上执行，Bayer 4x4 抖动生成复古色调。',
      detail: [
        'cbuffer 的 Time/Resolution 自动接到 uTime/uResolution',
        'frac→fract、lerp→mix、saturate→clamp、fmod→mod 均由转译器处理',
        '代码面板可点击"查看转译产物"对照生成的 GLSL',
      ],
    },
  },
  {
    id: 'fs-toysl-demo',
    name: 'ToySL 自定义语言演示',
    category: 'fullscreen',
    language: 'toysl',
    tags: ['自定义语言', '插件', 'ToySL'],
    scene: { kind: 'fullscreen' },
    passes: [
      {
        name: 'shaderMain',
        vs: '',
        fs: `// ToySL：ShaderLab 的自定义语言插件示例
// 语法 = param 宏（生成检查器控件） + include 片段库 + GLSL 主体
// 第三方语言也可通过 window.ShaderLabAPI.registerLanguage() 注册（见 README）

param speed = 1.4        // @range 0 6
param rings = 26.0       // @range 8 60
param tint = #ff8844     // @color
include <palette>

void shaderMain(vec2 uv, out vec4 fragColor) {
  vec2 p = uv - 0.5;
  p.x *= uResolution.x / uResolution.y;
  float r = length(p);
  float wave = 0.5 + 0.5 * sin(r * rings - uTime * speed);
  float glow = exp(-r * 3.0);
  vec3 col = palette(wave * 0.4 + uTime * 0.04) * wave;
  col += vec3(1.0, 0.8, 0.5) * glow * 0.6;
  col *= tint;
  fragColor = vec4(col, 1.0);
}`,
      },
    ],
    docs: {
      summary: 'ToySL 是演示"如何扩展一门新语言"的宏方言：param 行生成 uniform 与检查器控件，include 行注入代码片段库，主体是 GLSL。',
      detail: [
        'param speed = 1.4 // @range 0 6 → uniform float speed + 滑条控件',
        'param tint = #ff8844 // @color → uniform vec3 tint + 颜色选择器',
        'include <palette> → 从片段库注入 palette() 函数',
        '它本身就是通过公开的插件 API 注册的 —— 你可以照着写自己的语言',
      ],
    },
  },
  {
    id: 'wgsl-plasma',
    name: 'WGSL 等离子 (WebGPU)',
    category: 'fullscreen',
    language: 'wgsl',
    tags: ['WGSL', 'WebGPU', '新一代'],
    scene: { kind: 'fullscreen' },
    passes: [
      {
        name: 'fs_main',
        vs: '',
        fs: `// WGSL 全屏着色器（WebGPU）。内核自动提供 Globals uniform（G）与全屏顶点着色器。
// G: time / resolution / mouse / camPos / camRot ...
@group(1) @binding(0)
var<uniform> U: UserParams;

struct UserParams {
  speed: f32,          // @range 0 4
  rings: f32,          // @range 8 60
  tint: vec3f,         // @color
};

fn palette(t: f32) -> vec3f {
  return 0.5 + 0.5 * cos(6.28318 * (t + vec3f(0.0, 0.33, 0.67)));
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  var p = uv - vec2f(0.5);
  p.x = p.x * (G.resolution.x / G.resolution.y);
  let r = length(p);
  let wave = 0.5 + 0.5 * sin(r * U.rings - G.time * U.speed);
  let col = palette(wave * 0.35 + G.time * 0.05) * (wave * 0.9 + 0.1);
  let glow = exp(-r * 3.5) * 0.4;
  return vec4f(col * U.tint + vec3f(glow), 1.0);
}`,
      },
    ],
    docs: {
      summary: 'WGSL（WebGPU）全屏演示：内核自动前置 Globals（时间/分辨率/相机），用户 uniform 通过 group(1) 显式声明。',
      detail: [
        '结构体 UserParams 的字段注释（@range/@color）会生成检查器控件',
        'G.resolution / G.time 由内核每帧写入统一的 Globals 缓冲',
        '需要浏览器支持 WebGPU（Chrome/Edge 113+ 或本桌面版）',
      ],
    },
  },
  {
    id: 'wgsl-toon',
    name: 'WGSL 卡通材质 (WebGPU)',
    category: 'material',
    language: 'wgsl',
    tags: ['WGSL', 'WebGPU', '网格'],
    scene: { kind: 'mesh', geometry: 'torusKnot', showFloor: true },
    camera: { dist: 5.2, pitch: 0.3, autoRotate: 0.3 },
    passes: [
      {
        name: 'vs+fs',
        vs: '',
        fs: `// WGSL 网格着色器。内核自动前置 Globals（G）——含 viewProj/model/normalMat。
@group(1) @binding(0)
var<uniform> U: UserParams;

struct UserParams {
  steps: f32,        // @range 1 6
  baseColor: vec3f,  // @color
  rimColor: vec3f,   // @color
};

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
  out.normal = G.normalMat * normal;
  out.uv = uv;
  out.pos = G.viewProj * wp;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4f {
  let N = normalize(in.normal);
  let V = normalize(G.camPos.xyz - in.worldPos);
  let L = normalize(vec3f(0.55, 0.75, 0.45));
  var ndl = dot(N, L) * 0.5 + 0.5;
  ndl = floor(ndl * U.steps) / U.steps;
  var col = mix(vec3f(0.25, 0.16, 0.3), U.baseColor, ndl);
  let rim = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  col = col + U.rimColor * rim * 0.5;
  return vec4f(col, 1.0);
}`,
      },
    ],
    docs: {
      summary: 'WGSL 网格卡通材质：单个模块内写 @vertex 与 @fragment，矩阵与相机全部来自内核 Globals。',
      detail: [
        'G.viewProj / G.model / G.normalMat 由内核每帧更新',
        '顶点输入布局：location0=position, 1=normal, 2=uv',
        'UserParams 支持滑条（steps）与颜色（baseColor/rimColor）',
      ],
    },
  },
];
