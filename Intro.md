# Intro — 从 ShaderLab 到 C++ 游戏引擎渲染管线

> 本文是 ShaderLab 的进阶 companion 文档。你在 ShaderLab 里写的每一个预设，都对应着游戏引擎
> 渲染管线中的一环。本文讲清楚：**GPU 到底是怎么跑你这段 Shader 的**，以及**如何用 C++ 把
> 这条管线从零搭出来**（或在使用商业引擎时知道引擎替你做了什么）。

---

## 0. 概念对照表：ShaderLab ↔ C++ 游戏引擎

你在 ShaderLab 见过的一切，在 C++ 引擎（Unity 底层 / Unreal / 自研）里都有精确对应：

| ShaderLab 里的概念 | C++ 引擎 / 图形 API 里的对应 |
| --- | --- |
| `WebGL2Renderer` | 引擎的 **RHI（Render Hardware Interface）** 层 |
| `gl.createProgram()` | `glCreateProgram` / `vkCreateShaderModule` + Pipeline / D3D12 PSO |
| uniform（`uTime`、`uCamPos`…） | **Constant Buffer (D3D12)** / **UBO (GL/Vulkan)**，按帧/按材质分组上传 |
| 一个 Pass | 一次 **RenderPass（Vulkan）/ draw call 序列（GL）** |
| 多 Pass 卡通渲染 | 引擎里的 **feature pass**（如 UE 的 BasePass + OutlinePass） |
| 后处理的 `uSceneTex` | **G-Buffer / HDR 场景纹理**，通过 render target 切换传给下一 Pass |
| 阴影贴图 `uShadowMap` | Shadow Proxy / CSM 级联，引擎在主渲染前跑一遍 **depth-only pass** |
| 相机的 `uViewProj` | C++ 端 `XMMATRIX`/`glm::mat4` 计算后 `memcpy` 进 UBO |
| 分辨率缩放 | Swapchain 尺寸 / 动态分辨率（Dynamic Resolution Rendering） |

**核心认知：Shader 只是"数据流经管线时的加工规则"；C++ 端的渲染管线负责把数据（顶点、
纹理、常量）按时喂给 GPU、调度 Pass 顺序、管理显存。** 两边合起来才是完整渲染。

---

## 1. GPU 硬件管线全景

现代 GPU 的光栅化管线（以 D3D12/Vulkan 术语为准，GL 名称在括号里）：

```
顶点数据 → [IA] → [VS] → [HS→Tess→DS](可选) → [GS](可选) → [RS 光栅化] → [PS 像素着色] → [OM 输出合并] → RenderTarget
 Input     Input    Vertex    Hull/Domain/    Geometry    Rasterizer      Pixel(OEM      Output
 Assembler Assembler Shader    Domain/Geometry Shader      (背面剔除/      Fragment)      Merger
                                                                         深度测试/混合
```

各阶段要点（这是面试和排错的必备知识）：

1. **IA（输入装配）**：把 `VBO+IBO`（顶点/索引缓冲）装配成点、线、三角形。
   ShaderLab 里 `bindMeshAttributes` 干的事在 C++ 里就是 `VAO`/`VertexInputState`。
2. **VS（顶点着色）**：每个顶点跑一次，输出裁剪空间坐标。MVP 变换在这做 ——
   你在预设里写的 `uProjection * uView * uModel * vec4(aPosition, 1.0)`。
3. **曲面细分 / 几何着色**（可选）：草地、毛发、粒子扩展。多数手游管线跳过。
4. **RS（光栅化）**：三角形 → 像素片元。**背面剔除、视口裁剪、透视校正插值**都在这，
   你无法用 Shader 改变它的行为，只能配置状态（这就是为什么渲染内核里
   `gl.cullFace / gl.depthFunc` 是"状态"而不是"代码"）。
5. **PS / Fragment Shader**：每个片元跑一次 —— 你 95% 的时间在写它。
6. **OM（输出合并）**：深度测试、模板、混合（ShaderLab 里的 `blend: additive/alpha`
   就是在配置这里）。

**Compute Shader** 是管线之外的自由计算（粒子、剔除、模糊），UE5 的 Nanite/Lumen 全靠它。

> 同步法则：**同一帧内 GPU 按你提交的顺序执行；CPU 与 GPU 异步**。C++ 端写管线 80% 的
> 复杂度在于"不要让 CPU 等 GPU"（Fence/同步回读），而不是写 Shader。

---

## 2. 选路径：裸 API、封装库、还是游戏引擎？

| 路径 | 适合 | 代价 |
| --- | --- | --- |
| **OpenGL 4.6** | 学习管线概念、原型 | 已不推荐商用（驱动黑盒、多线程弱） |
| **Vulkan / D3D12** | 自研引擎、追求极致控制 | 样板代码极多（Vulkan 画一个三角形 ~1000 行） |
| **bgfx / The-Forge / Sokol** | 自研引擎但不想写 RHI | 少一次造轮子，跨平台免费拿 |
| **Unity (SRP/C++)** | 用引擎做游戏 + 定制渲染 | C# 层写 RenderPass，底层 C++ 不可见 |
| **Unreal 5** | 高端 PC/主机 | 定制渲染要动引擎源码（C++，RHI 抽象层） |

**建议路线**：先用 OpenGL 写一遍最小管线理解概念（下节），再迁到 Vulkan
（推荐 [vkguide.dev](https://vkguide.dev/)），或者直接进 Unity/UE 在引擎框架内做渲染功能。

---

## 3. 动手：C++ + OpenGL 的最小渲染管线骨架

下面是一个**可编译的最小前向管线**的骨架（完整可运行版约 400 行，
推荐对照 [LearnOpenGL](https://learnopengl-cn.github.io/) 的 Hello Triangle 章节）。

### 3.1 初始化窗口与 GL 上下文

```cpp
// 依赖: GLFW(窗口) + GLAD(GL函数加载器) + glm(数学) —— 对应 ShaderLab 的 math.ts
#include <glad/glad.h>
#include <GLFW/glfw3.h>
#include <glm/glm.hpp>
#include <glm/gtc/matrix_transform.hpp>

int main() {
    glfwInit();
    glfwWindowHint(GLFW_CONTEXT_VERSION_MAJOR, 4);   // 现代 GL，别用兼容 profile
    glfwWindowHint(GLFW_CONTEXT_VERSION_MINOR, 6);
    glfwWindowHint(GLFW_OPENGL_PROFILE, GLFW_OPENGL_CORE_PROFILE);
    GLFWwindow* win = glfwCreateWindow(1680, 980, "MiniPipeline", nullptr, nullptr);
    glfwMakeContextCurrent(win);
    gladLoadGLLoader((GLADloadproc)glfwGetProcAddress);
    glfwSwapInterval(1);                              // vsync
    // ... 后面所有章节代码都塞进 main 的循环前后
}
```

### 3.2 Shader 封装类（对应 ShaderLab 的 `buildProgram`）

```cpp
// Shader.cpp —— 与 src/engine/gl.ts 的 buildProgram 逻辑完全一致
GLuint CompileStage(GLenum type, const char* src) {
    GLuint s = glCreateShader(type);
    glShaderSource(s, 1, &src, nullptr);
    glCompileShader(s);
    GLint ok; glGetShaderiv(s, GL_COMPILE_STATUS, &ok);
    if (!ok) {                       // 对应 ShaderLab 的 parseErrorLog
        char log[4096]; glGetShaderInfoLog(s, 4096, nullptr, log);
        fprintf(stderr, "shader error: %s\n", log);
    }
    return s;
}

GLuint BuildProgram(const char* vsSrc, const char* fsSrc) {
    GLuint vs = CompileStage(GL_VERTEX_SHADER, vsSrc);
    GLuint fs = CompileStage(GL_FRAGMENT_SHADER, fsSrc);
    GLuint p = glCreateProgram();
    glAttachShader(p, vs); glAttachShader(p, fs);
    glLinkProgram(p);
    glDeleteShader(vs); glDeleteShader(fs);
    return p;
}
```

### 3.3 几何上传（对应 ShaderLab 的 `geometry.ts` + `bindMeshAttributes`）

```cpp
struct Mesh { GLuint vao, vbo, ibo; int indexCount; };

Mesh UploadMesh(const float* posUvNormal /*交错或分块*/, const uint32_t* idx,
                int vertCount, int idxCount) {
    Mesh m;
    glGenVertexArrays(1, &m.vao);                 // VAO = 顶点属性布局的"存档"
    glGenBuffers(1, &m.vbo);  glGenBuffers(1, &m.ibo);
    glBindVertexArray(m.vao);
    glBindBuffer(GL_ARRAY_BUFFER, m.vbo);
    glBufferData(GL_ARRAY_BUFFER, vertCount * sizeof(float) * 8, posUvNormal, GL_STATIC_DRAW);
    // layout(location=0)=pos, 1=normal, 2=uv —— 与 ShaderLab 的 TOON_VS 一致
    glEnableVertexAttribArray(0); glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 32, (void*)0);
    glEnableVertexAttribArray(1); glVertexAttribPointer(1, 3, GL_FLOAT, GL_FALSE, 32, (void*)12);
    glEnableVertexAttribArray(2); glVertexAttribPointer(2, 2, GL_FLOAT, GL_FALSE, 32, (void*)24);
    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, m.ibo);
    glBufferData(GL_ELEMENT_ARRAY_BUFFER, idxCount * 4, idx, GL_STATIC_DRAW);
    m.indexCount = idxCount;
    return m;
}
```

### 3.4 Uniform 上传（对应内核的 `bindBuiltins`）

```cpp
// 每帧把相机矩阵、时间喂给 GPU。现代做法是 UBO/std140 块，一次绑绑定全帧共享
glm::mat4 view  = glm::lookAt(eye, target, glm::vec3(0,1,0));   // 对应 camera.ts
glm::mat4 proj  = glm::perspective(glm::radians(50.f), aspect, 0.1f, 100.f);
glUseProgram(prog);
glUniformMatrix4fv(glGetUniformLocation(prog, "uViewProj"), 1, GL_FALSE, &proj*view[0][0]);
glUniform1f(glGetUniformLocation(prog, "uTime"), timeSeconds);
```

### 3.5 主循环（这就是"渲染管线"的骨架）

```cpp
while (!glfwWindowShouldClose(win)) {
    float dt = ComputeDeltaTime();          // 帧率无关逻辑（对应 camera 的 damp）
    // 1) 更新相机/动画（CPU 端）
    camera.Update(dt);
    // 2) 清屏（对应 renderer.render 里的 clear）
    glClearColor(0.09f, 0.10f, 0.12f, 1);
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
    glEnable(GL_DEPTH_TEST);
    // 3) 逐 Pass 提交
    glUseProgram(prog);
    glBindVertexArray(mesh.vao);
    glDrawElements(GL_TRIANGLES, mesh.indexCount, GL_UNSIGNED_INT, 0);
    // 4) 交换链呈现
    glfwSwapBuffers(win);
    glfwPollEvents();
}
```

**跑通这一步，你就拥有了 ShaderLab 内核的全部知识**。剩下的所有"渲染技术"
（阴影、PBR、后处理）都只是在这个骨架上**增加 Pass 和纹理绑定**。

---

## 4. 渲染架构：前向、延迟、Forward+

这是引擎渲染框架的第一次重大选型（ShaderLab 的三种场景 = 三种最简单的架构雏形）：

### 4.1 前向渲染（Forward）

```
对每个物体: [深度/阴影Pass] → [光照计算 + 写颜色]
```
- 就是 ShaderLab `mesh` 场景的做法：每个物体渲染时把所有光照算完。
- 优点：简单、透明排序自然、MSAA 友好。缺点：**光源数 × 物体数**，光照多了就爆。
- 适用：手游（光源少）、风格化渲染（卡通/手绘 —— 你写的卡通预设就是典型前向）。

### 4.2 延迟渲染（Deferred）—— ShaderLab `post` 场景的终极形态

```
Pass 1 (G-Buffer): 把所有物体写进多张纹理 —— albedo / 法线 / 深度 / 材质参数
Pass 2 (Lighting): 渲染一个全屏三角形，逐像素重建世界位置、累加所有光源
Pass 3+: 后处理
```
- 对应你在 ShaderLab `post` 场景已经用过的 **MRT**：`fragColor` + `fragNormal` 两张输出。
- 优点：光照成本只与**像素×光源**有关，与物体数无关 → 支持成百上千动态光。
- 缺点：**带宽贵**（G-Buffer 每帧读写几十 MB）、MSAA 困难、**透明物体仍需前向**（透明不能写深度）。
- UE 默认、Unity URP 可选、几乎所有端游方案。

G-Buffer 典型布局（现代引擎还会加 HDR 浮点）：

| 附件 | 格式 | 内容 |
| --- | --- | --- |
| RT0 | RGBA8 / sRGB | Albedo + 金属度 |
| RT1 | RGBA16F | 世界法线 (RG) + 粗糙度 + AO |
| RT2 | RGBA8 | 运动向量（TAA 用） |
| Depth | D32F / D24S8 | 深度 |

### 4.3 Forward+（分块前向）

前向 + Compute Shader 做光源列表（屏幕分块 / 2.5D 裁剪），像素着色时查表取相关光源。
兼具前向的材质自由度和延迟的光源扩展性。Unity URP、DOOM(2016)、Filament 都是这一派。

> **练习**：把 ShaderLab 的画廊场景改造成延迟光照 —— G-Buffer 你已经有了（MRT），
> 只需再写一个全屏 Lighting Pass 累加 10 个点光源，对比前向版性能。

---

## 5. 三大核心技术在 C++ 端的实现要点

### 5.1 阴影（Shadow Mapping）

你在 ShaderLab 里看到的 `uShadowMap` 在 C++ 端只有三步：

1. 创建 depth-only FBO（`glTexImage2D(DEPTH_COMPONENT24)`），通常再做成
   **CSM 级联**（Cascade Shadow Map，按距离分 2~4 张覆盖近远视野，UE/Unity 默认）；
2. 每帧先从**光源视角**把场景渲染进这张深度图（一个只渲染深度的超简单 Shader）；
3. 主 Pass 里把世界坐标变换到光空间，比较深度 + **PCF** 软化（Reeves et al. 1983），
   加**坡度缩放偏移**防阴影痤疮 —— 这正是内核 `getShadow()` 的逻辑。

进阶（按工程价值排序）：VSM（方差阴影）、PCSS（接触硬化）、点光源 Cubemap 阴影。

### 5.2 PBR（基于物理的渲染）

ShaderLab PBR 预设里的公式就是业界标准，记住三件套来源：

- ** specular BRDF**：GGX 分布 + Smith 几何 + Schlick 菲涅尔
  （Karis, *Real Shading in Unreal Engine 4*, SIGGRAPH 2013 Course）；
- **间接光 IBL**：Split-Sum —— 预滤波环境贴图（mip=roughness）+ 2D BRDF LUT；
  移动端用 `envBRDFApprox` 解析近似（你已经在预设里见过）；
- **色调映射**：HDR 线性光照 → ACES filmic（Narkowicz 2016 拟合）→ gamma。

C++ 端要做的是**离线/启动时生成 IBL 资源**：加载 HDR 环境图 → CubeFilter 生成 mip 链 →
积分生成 BRDF LUT（LearnOpenGL 的 IBL 章节有完整代码）。

### 5.3 后处理链

```
场景(HDR FBO) → Bloom(阈值+降采样高斯) → Tonemap → 调色 → FXAA/TAA → Swapchain
```
C++ 端核心是 **Ping-Pong FBO 管理**：一串全屏 Pass，每个 Pass 读上一张输出。
进阶：半分辨率 Bloom（UE 的卷积mip链）、TAA（历史帧混合 + 运动向量去鬼影）。

---

## 6. 在商业引擎里做同样的事

### Unity（C# SRP，底层 C++）

```csharp
// URP 自定义 Renderer Pass（相当于你写一个新 Pass 而不改引擎）
public class OutlinePass : ScriptableRenderPass {
    public override void Execute(ScriptableRenderContext ctx,
                                 ref RenderingData data) {
        CommandBuffer cmd = CommandBufferPool.Get("Outline");
        // Blit(source, dest, outlineMaterial) —— 对应 ShaderLab 的后处理 Pass
        ctx.ExecuteCommandBuffer(cmd);
        CommandBufferPool.Release(cmd);
    }
}
```
Shader 用 ShaderLab 语法（正好是你现在学的语言）或 HLSL，UBO 对应 `CBUFFER`。

### Unreal（C++ 源码级）

- **RHI 抽象层**：`FRHICommandList` / `FRHITexture` —— 写一次跑 D3D12/Vulkan/Metal；
- 新增 Pass：`FSceneRenderer` 子类 + `FRenderPass`，在 `Render()` 里排 Pass；
- Shader 是 `.usf/.ush`（HLSL 方言）+ `.gen.cpp` 里声明 Shader Map —— 学习成本最高但天花板最高。

---

## 7. 学习路线图（按顺序）

1. **GAMES101**（闫令琪，现代计算机图形学入门）— 理论打底
2. **LearnOpenGL**（中文版 learnopengl-cn.github.io）— 把第 3 节的骨架写完整
3. **Real-Time Rendering, 4th Edition**（Akenine-Möller 等）— 业界百科，面试圣经
4. **SIGGRAPH Physically Based Shading Course**（2012-2023 每年免费）— PBR 标准来源
5. **vkguide.dev / Vulkan Tutorial** — 迁移到现代 API
6. **GAMES202（高质量实时渲染）+ Games104（游戏引擎）** — 阴影/全局光/引擎架构
7. 源码级参考：**Filament**（Google，文档极佳）、**Hazel/Sparky** 类教学引擎、**bgfx**

## 8. 术语速查

| 术语 | 含义 |
| --- | --- |
| Draw Call | CPU 向 GPU 提交的一次绘制命令；性能优化的第一战场 |
| State Change | 切 Shader/纹理/缓冲的开销；引擎按材质排序就是为了减少它 |
| UBO / CBV | Uniform Block / 常量缓冲，一次绑定多 uniform |
| MRT | 多渲染目标，一次写多张纹理（延迟渲染/法线输出的基础） |
| Swapchain | 交换链：屏幕前/后缓冲，VSync 在此起作用 |
| Fence/Semaphore | CPU-GPU / GPU-GPU 同步原语（Vulkan 必修） |
| TBR/TBDR | 移动端 GPU 架构（Tile-Based），优化思路与桌面完全不同 |

---

*本文提到的所有算法在 ShaderLab 中都有可交互的对应物：切到对应预设改代码、拖参数、
看像素 —— 比只看书快十倍。祝你在 C++ 端写出自己的第一盏光。*
