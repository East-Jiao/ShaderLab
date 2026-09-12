// AI 助手（本地启发式）：解释 / 调试建议 / 静态检查
import type { ShaderError } from '../engine/types';

// ---------- 解释 ----------

const FN_PURPOSE: [RegExp, string][] = [
  [/hash/i, '哈希/伪随机函数：把输入打乱成看似随机的值，是程序化噪声的基石'],
  [/noise/i, '噪声函数：在空间中生成平滑的伪随机场（云、火焰、地形的基础）'],
  [/\bfbm\b|fractal/i, '分形布朗运动（fbm）：多倍频噪声叠加，一层比一层细节丰富'],
  [/rot|rotate|mat[23]/i, '旋转工具：构造旋转矩阵，常用于域变换'],
  [/palette|colorramp|ramp/i, '调色板：把 0..1 的标量映射为颜色循环'],
  [/raymarch|march|trace/i, '光线步进：沿视线小步采样场景（SDF/体积）'],
  [/map\b|sdf|sd[A-Z]/i, 'SDF 场：返回点到表面的有符号距离，负值代表内部'],
  [/normal/i, '法线求解：常用 SDF 梯度（中心差分）或几何信息重建表面朝向'],
  [/fresnel|rim/i, '菲涅尔/边缘光：视线掠射时变亮，增强轮廓立体感'],
  [/main|entry/i, '着色器入口：每个片元都会执行一次'],
  [/mainImage/i, 'Shadertoy 风格入口：每像素执行，输出颜色'],
  [/light|diffuse|lambert|spec/gi, '光照项：漫反射/高光贡献'],
  [/dither|bayer/i, '抖动：用有序噪声打散色带（banding）'],
  [/blur/i, '模糊：多次邻域采样加权平均'],
  [/caustic/i, '焦散：模拟光线经水面汇聚的网状亮纹'],
  [/wave|gerstner|sway/i, '波动：顶点位移或纹理滚动的周期函数'],
  [/star/i, '星点层：网格哈希布点 + 距离场画星'],
];

const UNIFORM_PURPOSE: [RegExp, string][] = [
  [/^u?time$/i, '运行时间（秒），动画驱动源'],
  [/res(olution)?$/i, '画布分辨率（像素）'],
  [/mouse/i, '鼠标状态（位置/按下）'],
  [/cam(era)?(pos)?/i, '相机位置'],
  [/rot$/i, '相机基/旋转矩阵'],
  [/color|col$|tint|albedo/i, '颜色参数'],
  [/speed|vel/i, '速度/强度系数'],
  [/scale|freq/i, '缩放/频率'],
  [/progress|amount|mix|strength|radius|power|steps|threshold|level/i, '可调参数（控制效果强度/阈值等）'],
];

export interface ExplainResult {
  summary: string;
  bullets: string[];
  uniforms: { name: string; type: string; purpose: string }[];
  functions: { name: string; purpose: string; lines: number }[];
  stats: { lines: number; loops: number; textureCalls: number; branches: number };
}

export function explainShader(code: string, language: string): ExplainResult {
  const lines = code.split('\n');
  const isWGSL = language === 'wgsl';
  const uniforms: ExplainResult['uniforms'] = [];
  if (isWGSL) {
    // struct UserParams / U 成员
    const structM = code.match(/struct\s+UserParams\s*\{([^}]*)\}/);
    if (structM) {
      for (const m of structM[1].matchAll(/(\w+)\s*:\s*(f32|i32|u32|bool|vec2f|vec3f|vec4f)/g)) {
        uniforms.push({ name: m[1], type: m[2], purpose: guessPurpose(m[1], UNIFORM_PURPOSE) });
      }
    }
  } else {
    const uRe = /\buniform\s+(?:highp\s+|mediump\s+|lowp\s+)?(\w+)\s+(\w+)\s*;/g;
    let m: RegExpExecArray | null;
    while ((m = uRe.exec(code))) {
      const type = m[1];
      const name = m[2];
      if (BUILTIN_GLSL.has(name)) continue;
      uniforms.push({ name, type, purpose: guessPurpose(name, UNIFORM_PURPOSE) });
    }
  }

  // 函数
  const functions: ExplainResult['functions'] = [];
  const fnRe = isWGSL
    ? /fn\s+(\w+)\s*\(([^)]*)\)/g
    : /^\s*(?:\w+\s+)*?(\w+)\s+(\w+)\s*\(([^;)]*)\)\s*\{/gm;
  let fm: RegExpExecArray | null;
  while ((fm = fnRe.exec(code))) {
    const name = isWGSL ? fm[1] : fm[2];
    if (['if', 'for', 'while', 'switch'].includes(name)) continue;
    const startLine = code.slice(0, fm.index).split('\n').length;
    // 粗略统计函数体行数：从 { 开始计配对
    let depth = 0, endLine = startLine;
    for (let i = startLine - 1; i < lines.length; i++) {
      for (const ch of lines[i]) {
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
      }
      endLine = i + 1;
      if (depth <= 0 && i > startLine - 2) break;
    }
    functions.push({ name, purpose: guessPurpose(name, FN_PURPOSE), lines: Math.max(1, endLine - startLine + 1) });
  }

  const loops = (code.match(/\bfor\s*\(/g) || []).length + (code.match(/\bwhile\s*\(/g) || []).length + (code.match(/\bloop\s*\{/g) || []).length;
  const textureCalls = (code.match(/\btexture\s*\(|\btextureLod\s*\(|\btexture2D\s*\(|\.Sample\s*\(|textureSample\s*\(/g) || []).length;
  const branches = (code.match(/\bif\s*\(/g) || []).length + (code.match(/\bdiscard\b/g) || []).length;

  const entry = functions.find((f) => /^(main|mainImage|fs_main|shaderMain|PSMain)$/.test(f.name));
  const summary = lines.length > 0
    ? `这是一个 ${langLabel(language)} 着色器，约 ${lines.length} 行，包含 ${functions.length} 个函数、${uniforms.length} 个自定义 uniform、${loops} 个循环与 ${textureCalls} 次纹理采样。` +
      (entry ? `入口函数是 ${entry.name}()（约 ${entry.lines} 行），${entry.purpose}。` : '')
    : '（空代码）';

  const bullets: string[] = [];
  const heavy = loops >= 1 && /for\s*\([^)]*<\s*(\d{2,})/.test(code);
  if (heavy) bullets.push('⚠️ 检测到较大的循环上限 —— 体积/分形类着色器的性能热点，可考虑降低次数或提前 break。');
  if (textureCalls > 8) bullets.push('⚠️ 纹理采样次数较多，瓶颈可能在显存带宽；可合并采样或降低分辨率。');
  if (/discard/.test(code)) bullets.push('ℹ️ 使用了 discard：在网格上做透明裁剪时无需排序，但会打断 early-Z。');
  if (/\bfor\b[^{]*\{\s*$/.test(code) === false && loops === 0 && /noise|fbm/.test(code)) bullets.push('ℹ️ 噪声未用循环叠加倍频（fbm），单倍频噪声细节有限。');
  if (uniforms.length) bullets.push(`🎛️ 检查器里可以实时调这 ${uniforms.length} 个参数，试试拖动看效果变化。`);
  if (/mat3|mat4|matrix/i.test(code)) bullets.push('ℹ️ 代码涉及矩阵运算（相机/模型变换），由内核自动填充这些内置 uniform。');
  return { summary, bullets, uniforms, functions, stats: { lines: lines.length, loops, textureCalls, branches } };
}

const BUILTIN_GLSL = new Set([
  'uTime', 'uDeltaTime', 'uFrame', 'uResolution', 'uInvResolution', 'uMouse', 'uCamPos', 'uCamRot',
  'uView', 'uProjection', 'uViewProj', 'uModel', 'uNormalMatrix', 'uNear', 'uFar',
  'uSceneTex', 'uNormalTex', 'uSceneDepth', 'iTime', 'iTimeDelta', 'iFrame', 'iResolution', 'iMouse', 'iChannel0', 'iChannel1', 'iChannel2', 'iChannel3', 'iDate', 'iChannelResolution',
]);

function guessPurpose(name: string, table: [RegExp, string][]): string {
  for (const [re, purpose] of table) {
    if (re.test(name)) return purpose;
  }
  return '（按名字推测功能）';
}

function langLabel(l: string): string {
  const map: Record<string, string> = {
    glsl3: 'GLSL ES 3.0', glsl1: 'GLSL ES 1.0', shadertoy: 'Shadertoy 风格',
    hlsl: 'HLSL（转译后）', wgsl: 'WGSL（WebGPU）', toysl: 'ToySL（自定义方言）',
  };
  return map[l] || l;
}

// ---------- 调试建议 ----------

const DEBUG_RULES: [RegExp, string][] = [
  [/undeclared identifier/i, '未声明的标识符：检查拼写；若是 uniform，确认已在着色器中声明且名称一致'],
  [/cannot convert from|cannot construct|type mismatch|no implicit/i, '类型不匹配：GLSL 不做隐式转换 —— 1 要写成 1.0，int/float 与 vecN 的混用需要显式构造（如 vec3(1.0)）'],
  [/no matching overloaded function found/i, '没有匹配的重载：参数类型或数量不对（例如 mix() 的两个向量长度不同）'],
  [/left of "\[|index/i, '索引越界或类型错误：数组下标必须是常量或 int'],
  [/does not support|precision/i, '浮点精度问题：片元着色器需要 precision 声明（highp/mediump）'],
  [/texture2D/i, 'GLSL 3.0 中 texture2D 已更名为 texture()'],
  [/redefinition/i, '重复定义：同名变量/函数声明了两次'],
  [/syntax error/i, '语法错误：常见于缺分号、括号不配对、使用了保留字'],
  [/too few arguments|too many arguments/i, '函数参数数量不对'],
  [/l-value|read-only/i, '对只读值赋值：uniform 不能在着色器内修改，const 不能被赋值'],
  [/loop/i, '循环限制（GLSL ES 1.0）：循环边界必须是常量，可用 break 提前退出'],
  [/out-params|outputs/i, '输出问题：片元着色器必须声明 out vec4（3.0）或写 gl_FragColor（1.0）'],
  [/no vertex|attribute/i, '顶点属性问题：确认 aPosition/aNormal/aUV 的使用与几何体提供的一致'],
  [/expected/i, '表达式不完整：检查是否有缺失的运算符、逗号或括号'],
  [/uniform.*initializer|initializer/i, 'GLSL ES 的 uniform 不能带初始化器，默认值请写在注释注解 @default 中'],
  [/entry point|entrypoint/i, 'WGSL 入口问题：确认 @vertex/@fragment 的入口名与内核期望一致（vs_main / fs_main）'],
  [/cannot resolve|undeclared/i, 'WGSL 标识符无法解析：检查变量声明顺序（WGSL 要求先声明后使用）'],
];

export function suggestForError(err: ShaderError): string {
  for (const [re, tip] of DEBUG_RULES) {
    if (re.test(err.message)) return tip;
  }
  return '通用排查：① 看报错行附近是否有缺分号/括号；② 检查变量名拼写与类型；③ 用下方"静态检查"再扫一遍。';
}

// ---------- 静态检查（lint） ----------

export interface LintIssue {
  line: number;
  level: 'warn' | 'error';
  message: string;
}

export function lintShader(code: string, language: string): LintIssue[] {
  const issues: LintIssue[] = [];
  const lines = code.split('\n');
  const is300 = language === 'glsl3' || language === 'shadertoy' || language === 'hlsl' || language === 'toysl';
  lines.forEach((raw, i) => {
    const line = raw.replace(/\/\/.*$/, '');
    const lineNo = i + 1;
    const noComment = raw;
    if (is300 || language === 'wgsl') {
      if (/\btexture2D\s*\(/.test(line)) issues.push({ line: lineNo, level: 'warn', message: 'GLSL 3.0 请使用 texture() 而不是 texture2D()' });
      if (/\battribute\b/.test(line)) issues.push({ line: lineNo, level: 'warn', message: 'GLSL 3.0 使用 in 代替 attribute' });
      if (/\bvarying\b/.test(line)) issues.push({ line: lineNo, level: 'warn', message: 'GLSL 3.0 使用 in/out 代替 varying' });
      if (/\bgl_FragColor\b/.test(line)) issues.push({ line: lineNo, level: 'warn', message: 'GLSL 3.0 使用自定义 out vec4 代替 gl_FragColor' });
    }
    if (language === 'glsl1') {
      if (/\btexture\s*\(/.test(line) && !/\btexture2D\b/.test(line)) issues.push({ line: lineNo, level: 'warn', message: 'GLSL 1.0 中采样函数是 texture2D()' });
      if (/\bin\s+vec|\bout\s+vec/.test(line)) issues.push({ line: lineNo, level: 'warn', message: 'GLSL 1.0 使用 attribute/varying 而不是 in/out' });
    }
    if (/\bmod\s*\([^,]+,\s*0(\.0+)?\s*\)/.test(line)) issues.push({ line: lineNo, level: 'error', message: 'mod(x, 0) 未定义（除以零）' });
    if (/\bfor\s*\(\s*float\b/.test(line)) issues.push({ line: lineNo, level: 'warn', message: 'float 循环计数器：建议用 int 并在比较时转 float，避免精度问题' });
    if (/\bdiscard\b/.test(noComment) && !/\{\s*$/.test(noComment)) {
      // discard 不在独立行——仅提示
    }
    if (/=\s*[^=]+\b(\d+)\s*\/\s*(\d+)\b/.test(line) && !/\./.test(line)) {
      issues.push({ line: lineNo, level: 'warn', message: '整数除法：a/b 在两个 int 间会截断，浮点除请写 2.0' });
    }
    if (language === 'wgsl') {
      if (/@group\(0\)\s*@binding\(0\)/.test(line)) issues.push({ line: lineNo, level: 'error', message: 'group(0)/binding(0) 由内核保留（Globals uniform），用户资源请使用 group(1)' });
      if (/\bvec3\b(?!f)/.test(line) && !/vec[234]f|vec[234]i/.test(line)) issues.push({ line: lineNo, level: 'warn', message: 'WGSL 中 vec3 是抽象类型，运行时类型应写 vec3f' });
      if (/\bglm?\b|GLSL/.test(line)) issues.push({ line: lineNo, level: 'warn', message: '混用了 GLSL 语法？WGSL 的函数关键字是 fn、变量是 var/let' });
    }
  });
  // 整体检查
  if ((language === 'glsl3') && !/out\s+vec4\s+\w+/.test(code) && !/gl_FragColor/.test(code)) {
    issues.push({ line: 1, level: 'error', message: 'GLSL 3.0 片元着色器缺少 out vec4 声明（如 out vec4 fragColor;）' });
  }
  if (language === 'glsl1' && !/precision\s+(high|medium|low)p\s+float/.test(code)) {
    issues.push({ line: 1, level: 'warn', message: 'GLSL 1.0 片元着色器建议声明 precision' });
  }
  if ((language === 'shadertoy') && !/mainImage/.test(code)) {
    issues.push({ line: 1, level: 'error', message: 'Shadertoy 方言需要 mainImage(out vec4, in vec2) 入口' });
  }
  if (language === 'toysl' && !/shaderMain/.test(code)) {
    issues.push({ line: 1, level: 'error', message: 'ToySL 需要 void shaderMain(vec2 uv, out vec4 fragColor) 入口' });
  }
  if (language === 'hlsl' && !/SV_Target|SV_TARGET/.test(code)) {
    issues.push({ line: 1, level: 'error', message: 'HLSL 模板需要形如 float4 PSMain(...) : SV_Target 的入口' });
  }
  return issues;
}
