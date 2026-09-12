// 引擎桥接：React 状态 <-> 渲染器单例
import { WebGL2Renderer } from './engine/renderer';
import { WebGPURenderer } from './languages/wgsl-backend';
import { languages } from './languages';
import { useStore, type UniformValues } from './state/store';
import { LogBus } from './logs';
import { getAllPresets } from './presets';
import type { PassDef, Preset, UniformMeta } from './engine/types';
import { CanvasRecorder, downloadBlob, downloadDataURL, timestampName } from './recorder';

let gl2: WebGL2Renderer | null = null;
let wgpu: WebGPURenderer | null = null;
let glCanvas: HTMLCanvasElement | null = null;
let gpuCanvas: HTMLCanvasElement | null = null;
let currentPreset: Preset | null = null;
let loadSeq = 0;
const recorder = new CanvasRecorder();

const darkBG: [number, number, number] = [0.085, 0.095, 0.115];
const lightBG: [number, number, number] = [0.8, 0.82, 0.86];

export function backgroundForTheme(theme: string): [number, number, number] {
  return theme === 'light' ? lightBG : darkBG;
}

export function initBridge(glC: HTMLCanvasElement, gpuC: HTMLCanvasElement) {
  glCanvas = glC;
  gpuCanvas = gpuC;
  gl2 = new WebGL2Renderer(glC);
  gl2.camera.attach(glC);
  gl2.camera.attach(gpuC);
  // 暴露调试/扩展句柄
  const api = ((window as unknown as Record<string, unknown>).ShaderLabAPI ??= {}) as Record<string, unknown>;
  Object.assign(api, {
    gl2, loadPreset, applyEditedPasses, setUniform: setUniformValue,
    getStore: () => useStore.getState(), resetUniforms, snapshot,
    renderOnce: () => activeRenderer()?.renderOnce(),
    presets: getAllPresets(),
    loadPresetById: async (id: string) => {
      const p = getAllPresets().find((x) => x.id === id);
      if (p) await loadPreset(p, { silent: true });
      return p?.id;
    },
  });
  gl2.onCompile = (r) => {
    useStore.getState().setCompile(r.ok, r.passes, r.metas);
    for (const p of r.passes) {
      if (p.ok) LogBus.gpu('编译', `Pass「${p.name}」编译通过`);
      else {
        LogBus.error('编译', `Pass「${p.name}」编译失败`, p.errors.map((e) => `L${e.line}: ${e.message}`).join('\n'));
      }
    }
    LogBus.info('反射', `发现 ${r.metas.length} 个可调 uniform`);
    syncDefaultsToStore(r.metas);
  };
  gl2.onStats = (s) => useStore.getState().setStats(s);
  gl2.onGLError = (msg) => LogBus.error('渲染', '渲染循环异常', msg);
  applyRuntimeOptions();
  gl2.start();
  LogBus.ok('内核', 'WebGL2 渲染内核已启动');
}

function activeRenderer(): WebGL2Renderer | WebGPURenderer | null {
  const backend = useStore.getState().backend;
  return backend === 'webgpu' ? wgpu : gl2;
}

export function getActiveCanvas(): HTMLCanvasElement | null {
  return useStore.getState().backend === 'webgpu' ? gpuCanvas : glCanvas;
}

function syncDefaultsToStore(metas: UniformMeta[]) {
  const s = useStore.getState();
  const pid = s.presetId;
  const stored = s.uniformValues[pid] || {};
  const next: UniformValues = { ...stored };
  let changed = false;
  for (const m of metas) {
    if (next[m.name] === undefined) {
      if (m.type === 'sampler2D') next[m.name] = m.sampler || 'checker';
      else if (m.value !== undefined) next[m.name] = m.value.length === 1 ? m.value[0] : [...m.value];
      else next[m.name] = m.type === 'float' || m.type === 'int' ? 0 : m.type === 'bool' ? 1 : [0, 0, 0];
      changed = true;
    }
  }
  if (changed) {
    useStore.setState({ uniformValues: { ...s.uniformValues, [pid]: next } });
  }
  activeRenderer()?.setValues(next);
}

export function currentValues(): UniformValues {
  const s = useStore.getState();
  return s.uniformValues[s.presetId] || {};
}

export async function loadPreset(preset: Preset, opts: { silent?: boolean } = {}) {
  const seq = ++loadSeq;
  // 应用几何体覆盖（用户可在左侧面板把任意材质放到任意几何体上）
  let effective = preset;
  const geo = useStore.getState().geometryOverride;
  if (geo && geo !== 'auto' && preset.scene.kind === 'mesh') {
    effective = { ...preset, scene: { ...preset.scene, geometry: geo as never } };
  }
  currentPreset = effective;
  useStore.getState().loadPresetState(effective);
  if (!opts.silent) LogBus.info('预设', `加载预设「${effective.name}」(${effective.language})`);
  const lang = languages.require(effective.language);
  applyRuntimeOptions();

  if (lang.backend === 'webgpu') {
    useStore.getState().setBackend('webgpu');
    try {
      if (!wgpu && gpuCanvas) {
        LogBus.gpu('内核', '正在初始化 WebGPU 设备…');
        wgpu = await WebGPURenderer.create(gpuCanvas);
        wgpu.camera.attach(gpuCanvas);
        wgpu.onCompile = (r) => {
          useStore.getState().setCompile(r.ok, r.passes, r.metas);
          for (const p of r.passes) {
            if (p.ok) LogBus.gpu('编译', `Pass「${p.name}」编译通过`);
            else LogBus.error('编译', `Pass「${p.name}」编译失败`, p.errors.map((e) => `L${e.line}: ${e.message}`).join('\n'));
          }
          syncDefaultsToStore(r.metas);
        };
        wgpu.onStats = (s) => useStore.getState().setStats(s);
        wgpu.onGLError = (msg) => LogBus.error('渲染', 'WebGPU 渲染循环异常', msg);
        LogBus.ok('内核', 'WebGPU 渲染内核已启动');
      }
      if (!wgpu) throw new Error('WebGPU 画布未就绪');
      gl2?.stop();
      wgpu.start();
      await wgpu.setPreset(effective, effective.passes, currentValues());
    } catch (err) {
      LogBus.error('内核', 'WebGPU 初始化失败，回退到 WebGL2', String(err));
      useStore.getState().setBackend('webgl2');
      if (gl2) {
        wgpu?.stop();
        gl2.start();
        gl2.setPreset(preset, [{ name: '错误', vs: '', fs: '#error WebGPU 不可用\n' }], {});
      }
    }
    return;
  }

  // WebGL2 路径
  useStore.getState().setBackend('webgl2');
  wgpu?.stop();
  gl2?.start();
  const passes: PassDef[] = lang.translate
    ? lang.translate(effective.passes.map((p) => ({ ...p })), effective.scene)
    : effective.passes;
  gl2?.setPreset(effective, passes, currentValues());
}

/** 应用编辑器中的代码（翻译 -> 编译 -> 更新检查器） */
export async function applyEditedPasses(passes: PassDef[]) {
  if (!currentPreset) return;
  const s = useStore.getState();
  const lang = languages.require(currentPreset.language);
  LogBus.info('编译', '应用编辑器代码…');
  if (lang.backend === 'webgpu') {
    if (wgpu) await wgpu.setPreset(currentPreset, passes, currentValues());
  } else {
    const translated = lang.translate ? lang.translate(passes.map((p) => ({ ...p })), currentPreset.scene) : passes;
    gl2?.setPreset(currentPreset, translated, currentValues());
  }
}

export function applyRuntimeOptions() {
  const s = useStore.getState();
  for (const r of [gl2, wgpu]) {
    if (!r) continue;
    r.setPlaying(s.playing);
    r.setTimeScale(s.timeScale);
    r.setResolutionScale(s.resScale);
    r.setBackground(backgroundForTheme(s.theme));
  }
}

export function setUniformValue(name: string, v: number | number[] | string | boolean) {
  const s = useStore.getState();
  s.setUniformValue(s.presetId, name, v);
  const next = { ...(s.uniformValues[s.presetId] || {}), [name]: v };
  activeRenderer()?.setValues(next);
}

export function resetUniforms() {
  const s = useStore.getState();
  const defaults: UniformValues = {};
  for (const m of s.metas) {
    if (m.type === 'sampler2D') defaults[m.name] = m.sampler || 'checker';
    else if (m.value !== undefined) defaults[m.name] = m.value.length === 1 ? m.value[0] : [...m.value];
  }
  s.resetUniforms(s.presetId, defaults);
  activeRenderer()?.setValues(defaults);
  LogBus.info('检查器', '已重置所有 uniform 为默认值');
}

export function randomizeUniforms() {
  const s = useStore.getState();
  const vals = { ...(s.uniformValues[s.presetId] || {}) };
  for (const m of s.metas) {
    if (m.type === 'sampler2D' || m.color) continue;
    const [lo, hi] = m.range || [0, 1];
    const r = lo + Math.random() * (hi - lo);
    if (m.type === 'float' || m.type === 'int') vals[m.name] = Math.round(r * 100) / 100;
    else if (m.type === 'bool') vals[m.name] = Math.random() > 0.5 ? 1 : 0;
  }
  useStore.setState({ uniformValues: { ...s.uniformValues, [s.presetId]: vals } });
  activeRenderer()?.setValues(vals);
  LogBus.info('检查器', '已随机化数值型 uniform');
}

// ---------- 我的预设 ----------

const MY_KEY = (id: string) => `shaderlab-my-${id}`;

export function saveAsMyPreset(name: string): Preset | null {
  if (!currentPreset) return null;
  const s = useStore.getState();
  const id = `my-${Date.now().toString(36)}`;
  const preset: Preset = {
    ...currentPreset,
    id,
    name: name || `${currentPreset.name}·副本`,
    passes: s.passes.map((p) => ({ ...p })), // 用户编辑后的源码
    uniforms: s.metas.length
      ? s.metas.map((m) => ({ ...m, value: m.value ? [...m.value] : undefined }))
      : undefined,
  };
  localStorage.setItem(MY_KEY(id), JSON.stringify(preset));
  s.addMyPreset(id);
  LogBus.ok('预设', `已保存到"我的预设": ${preset.name}`, `id=${id}`);
  return preset;
}

export function loadMyPreset(id: string): Preset | null {
  const raw = localStorage.getItem(MY_KEY(id));
  if (!raw) return null;
  try {
    const preset = JSON.parse(raw) as Preset;
    // 载入后继承当前 uniform 值
    void loadPreset(preset);
    return preset;
  } catch (e) {
    LogBus.error('预设', '我的预设解析失败', String(e));
    return null;
  }
}

export function getMyPreset(id: string): Preset | null {
  const raw = localStorage.getItem(MY_KEY(id));
  if (!raw) return null;
  try { return JSON.parse(raw) as Preset; } catch { return null; }
}

export function deleteMyPreset(id: string) {
  localStorage.removeItem(MY_KEY(id));
  useStore.getState().removeMyPreset(id);
  LogBus.info('预设', `已删除我的预设 ${id}`);
}

export function exportMyPresets() {
  const ids = useStore.getState().myPresetIds;
  const presets = ids.map(getMyPreset).filter(Boolean);
  const blob = new Blob([JSON.stringify({ kind: 'shaderlab-presets', version: 1, presets }, null, 2)], { type: 'application/json' });
  downloadBlob(blob, timestampName('shaderlab-presets', 'json'));
  LogBus.ok('预设', `已导出 ${presets.length} 个自定义预设`);
}

export function importMyPresets(json: string) {
  try {
    const data = JSON.parse(json);
    const presets: Preset[] = Array.isArray(data) ? data : data.presets;
    if (!Array.isArray(presets)) throw new Error('格式不正确');
    const ids: string[] = [];
    for (const p of presets) {
      const id = p.id.startsWith('my-') ? p.id : `my-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      localStorage.setItem(MY_KEY(id), JSON.stringify({ ...p, id }));
      ids.push(id);
    }
    useStore.setState((s) => ({ myPresetIds: [...new Set([...s.myPresetIds, ...ids])] }));
    LogBus.ok('预设', `已导入 ${ids.length} 个预设，可在左侧"我的预设"中查看`);
  } catch (e) {
    LogBus.error('预设', '导入失败', String(e));
  }
}

// ---------- 采集 ----------

export function snapshot() {
  const r = activeRenderer();
  if (!r) return;
  const url = r.snapshot();
  downloadDataURL(url, timestampName(currentPreset?.id || 'shaderlab', 'png'));
  LogBus.ok('采集', '已保存视口截图 (PNG)');
}

export function recordStart() {
  const canvas = getActiveCanvas();
  if (!canvas) return;
  recorder.start(canvas, 60, 12_000_000);
  useStore.getState().setRecording(true);
}

export async function recordStop() {
  const result = await recorder.stop();
  useStore.getState().setRecording(false);
  if (result) {
    downloadBlob(result.blob, timestampName(currentPreset?.id || 'shaderlab', result.mime.includes('mp4') ? 'mp4' : 'webm'));
    LogBus.ok('采集', `录制完成：${result.seconds.toFixed(1)} 秒 / ${(result.blob.size / 1024 / 1024).toFixed(2)} MB，已下载`);
  }
}

export function isRecording() {
  return recorder.recording;
}

export function setMouse(x: number, y: number, down: boolean) {
  gl2?.setMouse(x, y, down);
  wgpu?.setMouse(x, y, down);
}

export function disposeBridge() {
  gl2?.dispose();
  wgpu?.dispose();
  gl2 = null;
  wgpu = null;
}
