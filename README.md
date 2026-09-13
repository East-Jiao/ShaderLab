# ◆ ShaderLab — Unity 风格多语言 Shader 实验库

一个用 **React + TypeScript + Vite** 构建的 Shader 学习 / 实验 / 调试工作台，UI 布局仿 Unity 编辑器，
内置**自研 WebGL2 / WebGPU 双渲染内核**，支持 6 种着色语言与 30+ 个游戏常用预设，
可通过 **Electron 打包为 Windows 桌面应用**。

> 📚 进阶阅读：[Intro.md](./Intro.md) —— 从 ShaderLab 到 C++ 游戏引擎渲染管线（GPU 管线 / 前向-延迟架构 / 阴影 / PBR / 学习路线）

---

## ✨ 功能总览

### 1. 预设库（49 个游戏常用 Shader，全部可实时调参）

| 分类 | 预设 |
| --- | --- |
| **2D / 全屏** | 霓虹流光 Plasma · 星云 Nebula · 体积云 Raymarch · 水焦散(Shadertoy) · 朱利亚分形(WebGL1) · 火焰 Flame · 极光 Aurora · 星际穿梭 Warp · SDF 陀螺体 Raymarch · 雨滴涟漪 RainRipples · 程序化天空 ProceduralSky · 河流 Flowmap · 冲击波 Shockwave · **色带阶梯天空 PosterizeSky** · **螺旋能量涡旋 Vortex** · **花瓣粒子系统 Petals** · 像素抖动画(HLSL) · ToySL 自定义语言演示 · WGSL 等离子(WebGPU) |
| **3D 材质** | 卡通渲染+反向壳描边+阴影(双Pass) · 标准 PBR 光照(GGX+IBL+ACES+阴影) · 顶点动画水面 · Gerstner 海面 Ocean · 全息投影(加法混合) · 噪声消融 Dissolve · MatCap 球贴材质 · 菲涅尔边缘光 · 旗帜飘动(顶点动画) · 受击闪白 HitFlash · 法线调试(WebGL1) · 法线贴图(TBN 切线空间) · **Ramp 色阶着色 RampToon** · **各向异性高光 KajiyaKay** · **面部 SDF 阴影** · **MatCap 混合金属 MatCapBlend** · **风格化卡通水面 StylizedWater** · WGSL 卡通材质(WebGPU) |
| **后处理** | 辉光 Bloom(mip 链) · 暗角+噪点+色差 · 调色 Color Grading · 深度法线描边(Outline) · 像素化 Pixelate · CRT 显示器(Shadertoy) · 水下扭曲 · 径向模糊 · 雪景叠加 Snowfall · 景深 DepthOfField · 信号故障 Glitch · 圆形转场 CircleWipe |

**二游（原神/鸣潮）专题**参考了社区公开的渲染拆解（面部 SDF 阈值、Ramp 暗部混色、Kajiya-Kay
头发高光、武器 MatCap 混合、风格化量化水面），配合程序化生成的 **Ramp 渐变条**与**脸部阴影 SDF**
两张纹理即可完整体验，无需外部素材。

每个预设带 **技术文档**（右侧"文档"页）与 **自动反射的参数面板**（滑条 / 颜色选择器 / 纹理下拉框，
由 uniform 反射 + 源码 `// @range / @color / @default` 注解共同生成）。

### 2. 多语言渲染内核（支持大部分主流 Shader 语言）

| 语言 | 执行路径 | 说明 |
| --- | --- | --- |
| **GLSL ES 3.0** | WebGL2 原生 | 主力语言，全部预设默认 |
| **GLSL ES 1.0** | WebGL2（version 100 管线） | WebGL1 语法兼容（attribute/varying/gl_FragColor） |
| **Shadertoy 风格** | WebGL2 + 自动包装层 | 只写 `mainImage`，内核注入 iTime/iResolution/iMouse/iChannel0-3 |
| **HLSL** | WebGL2 + 内置逐行转译器 | cbuffer / Texture2D / PSMain 入口 / lerp·saturate·frac·mul·fmod 等；逐行转译保持行号对齐，报错可直接映射回源码 |
| **WGSL** | **WebGPU 原生后端** | 内核自动前置 Globals（时间/分辨率/相机/矩阵），group(1) 用户资源显式绑定 |
| **ToySL** | WebGL2 + 方言翻译 | **自定义语言扩展示例**：`param` 宏生成控件、`include <片段>` 注入代码片段库 |

> **添加你自己的语言**：所有语言（包括内置的 ToySL）都通过同一个注册表工作。在控制台或扩展脚本中：
>
> ```js
> ShaderLabAPI.registerLanguage({
>   id: 'my-lang', label: '我的语言', backend: 'webgl2', editorMode: 'glsl',
>   template: (kind) => '...',
>   translate: (passes, scene) => passes, // 把你的语言翻译成 GLSL ES 3.0
> });
> ```

### 3. Unity 风格界面

- **顶栏**：文件 / 视图 / 帮助菜单 · 播放暂停 · 时间缩放(×0.1~×4) · **⏺ 录制视频** · 📷 截图 · 深浅主题切换
- **左面板**：按分类的预设树（搜索/折叠）· 我的预设（localStorage 持久化，支持导入导出 JSON）· 场景与性能设置
- **中央视口**：轨道相机（左键旋转 / 滚轮缩放）· FPS/DrawCall/三角形统计浮层 · 编译错误覆盖层 · WebGL2/WebGPU 双画布自动切换
- **右面板（检查器）**：自动生成的 uniform 控件（含重置/随机化）· 性能统计 · 录制设置 · 预设文档页
- **底部面板**（可拖拽调整高度）：
  - **代码**：CodeMirror 6 编辑器（GLSL/HLSL/WGSL 自定义高亮、**上下文感知自动补全**——内置函数/类型/
    按场景分类的内核 uniform、错误行标记、点击跳转、多 Pass 切换、**实时编译**（输入停顿自动应用，
    可关闭）、**查看转译产物**、载入模板、Ctrl+Enter 应用编译、Ctrl+S 另存预设）
  - **控制台**：分级日志（信息/成功/GPU/警告）、**导出日志 .log**、清空
  - **AI 助手**（本地启发式，无需联网）：
    - 💡 **解释**：解析代码生成结构化讲解（uniform 推测用途、函数功能、循环/采样热点、性能提示）
    - 🐞 **调试**：编译错误逐条翻译 + 修复建议规则库（类型不匹配/隐式转换/精度声明/保留字…）
    - ✨ **生成**：20+ 个代码片段库（噪声/分形/SDF/Raymarch/光照/后处理…），一键追加
    - 🔍 **检查**：静态 lint（版本语法残留、整数除法、WGSL 保留资源等 20+ 规则）

### 4. 记录 / 调试 / 日志

- **录制**：`canvas.captureStream + MediaRecorder`，自动选择 webm(vp9/vp8) / mp4 编码，60fps + 12Mbps，结束自动下载
- **截图**：当前帧 PNG 下载
- **日志**：编译结果（驱动报错行号映射回用户源码）、uniform 反射统计、周期性 FPS 汇总、录制/导入导出事件，可导出 .log
- **持久化**：主题 / 布局尺寸 / 参数值 / 我的预设 全部 localStorage 持久化，重开应用恢复上次状态

### 5. 自研渲染内核亮点（`src/engine/`）

- 三种场景系统：**全屏三角形**（2D/Shadertoy）、**网格多 Pass**（反向壳描边、加法/α 混合、双面渲染）、
  **后处理 MRT 管线**（内置画廊源场景 → 颜色+法线+深度三目标 → 特效 Pass）
- **阴影贴图系统**（Shadow Mapping, Williams 1978）：1024² 深度贴图 + 平行光正交投影，
  采样端 3×3 **PCF**（Reeves et al. 1983）+ 坡度缩放偏移；地面自动接收阴影，
  用户 Pass 只要声明 `uShadowMap` 即可获得 —— 参考代码片段库 `shadow-pcf`
- 内置 uniform 自动供应：`uTime / uResolution / uMouse / uCamPos / uCamRot / uModel / uView / uProjection / uNormalMatrix / uNear / uFar / uSceneTex / uNormalTex / uSceneDepth / uLightDir / uLightViewProj / uShadowMap`
- 参数化几何体：球 / **Icosphere 均匀球** / 环面 / **环面结** / 立方体 / 平面(XZ+竖直) / 圆柱，
  带**三角形环绕方向自动修正**（按属性法线翻转，杜绝"看到内表面"类 bug）
- **逐顶点切线计算**（Lengyel §7.8 / MikkTSpace 简化版）：`aTangent` 自动绑定到 location 3，
  法线贴图预设演示完整 TBN 切线空间流程
- 程序化纹理库：棋盘格 / UV 网格 / 噪声 / 砖墙 / 条纹 / 渐变 / **MatCap** / 年轮 / **砖墙法线贴图（高度图 Sobel 生成）**（离线 Canvas 生成，零外部资源依赖）
- WebGPU 后端：WGSL 编译信息行号映射、用户 struct 反射与对齐布局计算、动态 bind group 布局
- **数学库（`math.ts`）**：四元数全套（Shoemake 1985 Slerp，极角退化自动转 Nlerp）、`compose` TRS 组合、
  帧率无关指数阻尼 `damp`、反 Z 无限远投影 `perspectiveReversedZInfinite`（UE/Unity 现代深度方案）
- **轨道相机**带业界手感的指数阻尼（输入写目标值、渲染帧率无关逼近），预设切换不漂移
- 自检系统：`?selftest=1` 逐个编译+渲染全部预设并**采样视口像素**（捕捉黑屏/NaN 类回归），
  输出 `window.__SELFTEST__`（当前 **49/49 通过**）

### 已修复的重要内核 bug（记录备查）

1. **Shadertoy 兼容层 uniform 未供应**：`iTime/iResolution/iMouse` 声明了但从未赋值，
   所有 Shadertoy 预设冻结在第 0 帧且除以 0 产生 NaN —— 现由内核每帧自动填充。
2. **持久化状态污染内置 uniform**：旧版本曾把 `iResolution` 当用户 uniform（默认 [0,0,0]）存入
   localStorage，新版渲染时又被覆盖回 0 —— 现在 `bindUserUniforms` 拒绝一切内置 uniform 的用户值。
3. **后处理场景 iChannel0 未绑定场景纹理**：CRT 等 Shadertoy 后处理预设拿到的 iChannel0 是
   棋盘格而非场景颜色 —— 现在后处理场景自动把 iChannel0/1/2 绑定为 场景颜色/法线/深度。
4. **水焦散算法错误**：转写经典 caustics 时漏掉了 `mod(uv·TAU, TAU) - 250` 大偏移（防分母趋零
   爆炸）与迭代反馈 `i = p + f(i)`，导致全屏饱和成白色 —— 已按 Dave Hoskins 原版修正。
5. **几何体三角形环绕方向与法线相反**：背面剔除后看到的是"内表面"，光照全错 ——
   `fixWinding` 按属性法线自动翻转全部网格。

### 6. 算法与论文出处（按内核使用位置）

| 算法 | 出处 |
| --- | --- |
| Split-Sum 环境高光 / `envBRDFApprox` | B. Karis, *Real Shading in Unreal Engine 4*, SIGGRAPH 2013 PBR Course（selfshadow.com/publications/s2013-shading-course） |
| ACES 色调映射拟合 | K. Narkowicz 2016, *ACES Filmic Tone Mapping Curve*（knarkowicz.wordpress.com），对 ACES RRT+ODT 的有理函数拟合，最大误差 0.0138 |
| 逐顶点切线空间 | E. Lengyel, *Mathematics for 3D Game Programming* §7.8 / terathon.com/blog/tangent-space.html；工业标准实现为 MikkTSpace |
| PCF 软阴影 | W. Reeves, D. Salesin, D. Cook, *Shadows for Cloak-and-Dagger Rendering*, SIGGRAPH 1983；阴影贴图出自 L. Williams 1978 *Casting Curved Shadows on a Curved Surface* |
| 四元数 Slerp | K. Shoemake, *Animating Rotation with Quaternion Curves*, SIGGRAPH 1985 |
| Half-Lambert | Valve, *Half-Life 2 / Valve Source Shading*, GDC 2004（法线贴图预设使用） |
| Gerstner 波 | J. Gerstner 1802；实时水面经典参考 GPU Gems Chapter 1（水面预设使用） |

---

## 🚀 快速开始

```bash
npm install
npm run dev            # Web 开发模式  http://localhost:5173
npm run build          # 类型检查 + 生产构建
npm run preview        # 预览生产构建  http://localhost:4173
```

### 打包 Windows 桌面应用（Electron）

```bash
npm run desktop:dev    # Electron + Vite 热更新开发模式
npm run desktop:build  # 构建 + electron-builder 打包
```

产物在 `release/` 目录：

- `ShaderLab-1.0.0-setup.exe` —— NSIS 安装包（可选安装目录、创建桌面快捷方式）
- `ShaderLab-1.0.0-portable.exe` —— 免安装便携版，双击即用
- `win-unpacked/ShaderLab.exe` —— 解压版

> WebGPU（WGSL 预设）在 Electron 主进程里已通过 `enable-unsafe-webgpu` 开关启用；
> 浏览器端需要 Chrome/Edge 113+。

### 自检

```bash
npm run build && npm run preview
# 浏览器打开 http://localhost:4173/?selftest=1
# 控制台读取 window.__SELFTEST__ → { pass, total, passed, failed }
```

---

## 📁 目录结构

```
├── electron/            # Electron 主进程 / preload
├── scripts/             # dev-desktop / 图标生成脚本
├── src/
│   ├── engine/          # ★ 渲染内核（WebGL2）
│   │   ├── renderer.ts  #   三种场景 + 多 Pass + MRT + 采集
│   │   ├── gl.ts        #   程序编译 / 反射 / 错误解析
│   │   ├── geometry.ts  #   参数化几何 + 环绕修正
│   │   ├── textures.ts  #   程序化纹理库
│   │   └── fbo.ts camera.ts math.ts introspect.ts types.ts
│   ├── languages/       # ★ 语言系统
│   │   ├── registry.ts  #   注册表 + window.ShaderLabAPI 插件 API
│   │   ├── glsl.ts shadertoy.ts hlsl.ts toysl.ts wgsl-lang.ts
│   │   └── wgsl-backend.ts  # ★ WebGPU 渲染后端
│   ├── presets/         # ★ 32 个预设（全屏/材质/后处理/多语言）
│   ├── assist/          # AI 助手（解释/调试/检查/片段库）
│   ├── state/store.ts   # zustand 全局状态（持久化）
│   ├── ui/              # Unity 风格 UI 组件（CodeMirror 编辑器等）
│   ├── engine-bridge.ts # React <-> 渲染内核桥接
│   └── selftest.ts      # 全预设自检
└── build/icon.ico       # 应用图标（scripts/gen-icon.mjs 生成）
```

## ⌨️ 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl+Enter` | 应用编辑器代码并重新编译 |
| `Ctrl+S` | 另存为我的预设 |
| 鼠标左键拖拽（视口） | 旋转相机 |
| 滚轮（视口） | 缩放 |

## 🧾 内置 Uniform 参考

- 全屏场景：`uTime uDeltaTime uFrame uResolution uInvResolution uMouse uCamPos uCamRot`
- 网格场景额外：`uModel uView uProjection uViewProj uNormalMatrix`
- 阴影系统（声明即用）：`uLightDir`（内核平行光方向，与预设主光一致）、`uLightViewProj`（光空间正交矩阵）、
  `uShadowMap`（1024² 深度贴图；顶点着色器输出 `vShadowCoord = uLightViewProj * worldPos`，
  片元用片段库 `shadow-pcf` 的 `getShadow(N, L, vShadowCoord)` 采样，内置地面自动接收阴影）
- 后处理场景额外：`uSceneTex(带mip链) uNormalTex uSceneDepth uNear uFar`
- WGSL：内核前置 `Globals` 结构体（`G.time / G.resolution / G.camPos / G.camRot / G.viewProj / G.model / G.normalMat ...`），
  用户参数放 `group(1)`（uniform binding 0 + 纹理/采样器），字段注释 `// @range 0 4 / @color` 会生成检查器控件。

GLSL 源码注解：`// @range 0 1`（滑条范围）、`// @color`（颜色选择器）、`// @default 0.5 0.5 0.5`（默认值）、`// @desc 说明文字`。

## 📄 许可

MIT. 预设着色器中的经典算法（焦散、星域等）来自社区公开演示思路，仅用于学习目的。
