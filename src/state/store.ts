// 全局状态（zustand + localStorage 持久化）
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PassDef, Preset, ShaderError, UniformMeta } from '../engine/types';

export type UniformValues = Record<string, number | number[] | string | boolean>;
export interface PassReportLite {
  name: string;
  ok: boolean;
  errors: ShaderError[];
}
export interface Stats {
  fps: number;
  ms: number;
  draws: number;
  tris: number;
}

interface AppState {
  theme: 'dark' | 'light';
  presetId: string;
  myPresetIds: string[];
  // 编辑器（用户源码 = 预设 pass 副本）
  passes: PassDef[];
  activePass: number;
  dirty: boolean;
  // 编译结果
  compileOk: boolean | null;
  passReports: PassReportLite[];
  metas: UniformMeta[];
  backend: 'webgl2' | 'webgpu';
  // uniform 值（按预设持久化）
  uniformValues: Record<string, UniformValues>;
  // 场景/播放
  playing: boolean;
  timeScale: number;
  resScale: number;
  showFps: boolean;
  /** 网格预设的几何体覆盖（'auto' = 使用预设自带） */
  geometryOverride: string;
  // 布局
  leftW: number;
  rightW: number;
  bottomH: number;
  bottomTab: 'code' | 'console' | 'assist';
  rightTab: 'inspector' | 'docs';
  consoleFilter: string;
  // 统计/录制
  stats: Stats;
  recording: boolean;
  // actions
  setTheme: (t: 'dark' | 'light') => void;
  toggleTheme: () => void;
  loadPresetState: (preset: Preset) => void;
  setPassCode: (idx: number, part: 'vs' | 'fs', code: string) => void;
  setActivePass: (i: number) => void;
  setPasses: (passes: PassDef[]) => void;
  setCompile: (ok: boolean, reports: PassReportLite[], metas: UniformMeta[]) => void;
  setBackend: (b: 'webgl2' | 'webgpu') => void;
  setUniformValue: (presetId: string, name: string, v: number | number[] | string | boolean) => void;
  resetUniforms: (presetId: string, defaults: UniformValues) => void;
  setPlaying: (p: boolean) => void;
  setTimeScale: (s: number) => void;
  setResScale: (s: number) => void;
  setShowFps: (s: boolean) => void;
  setGeometryOverride: (g: string) => void;
  setLayout: (k: 'leftW' | 'rightW' | 'bottomH', v: number) => void;
  setBottomTab: (t: 'code' | 'console' | 'assist') => void;
  setRightTab: (t: 'inspector' | 'docs') => void;
  setConsoleFilter: (f: string) => void;
  setStats: (s: Stats) => void;
  setRecording: (r: boolean) => void;
  addMyPreset: (id: string) => void;
  removeMyPreset: (id: string) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      theme: 'dark',
      presetId: 'fs-neon-plasma',
      myPresetIds: [],
      passes: [],
      activePass: 0,
      dirty: false,
      compileOk: null,
      passReports: [],
      metas: [],
      backend: 'webgl2',
      uniformValues: {},
      playing: true,
      timeScale: 1,
      resScale: 1,
      showFps: true,
      geometryOverride: 'auto',
      leftW: 260,
      rightW: 320,
      bottomH: 300,
      bottomTab: 'code',
      rightTab: 'inspector',
      consoleFilter: 'all',
      stats: { fps: 0, ms: 0, draws: 0, tris: 0 },
      recording: false,

      setTheme: (t) => set({ theme: t }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      loadPresetState: (preset) =>
        set({ presetId: preset.id, passes: preset.passes.map((p) => ({ ...p })), activePass: 0, dirty: false, compileOk: null, passReports: [], metas: [] }),
      setPassCode: (idx, part, code) =>
        set((s) => ({
          passes: s.passes.map((p, i) => (i === idx ? { ...p, [part]: code } : p)),
          dirty: true,
        })),
      setActivePass: (i) => set({ activePass: i }),
      setPasses: (passes) => set({ passes, dirty: true }),
      setCompile: (ok, reports, metas) => set({ compileOk: ok, passReports: reports, metas }),
      setBackend: (b) => set({ backend: b }),
      setUniformValue: (presetId, name, v) =>
        set((s) => ({
          uniformValues: {
            ...s.uniformValues,
            [presetId]: { ...(s.uniformValues[presetId] || {}), [name]: v },
          },
        })),
      resetUniforms: (presetId, defaults) =>
        set((s) => ({ uniformValues: { ...s.uniformValues, [presetId]: { ...defaults } } })),
      setPlaying: (p) => set({ playing: p }),
      setTimeScale: (v) => set({ timeScale: v }),
      setResScale: (v) => set({ resScale: v }),
      setShowFps: (v) => set({ showFps: v }),
      setGeometryOverride: (g) => set({ geometryOverride: g }),
      setLayout: (k, v) => set({ [k]: v } as Partial<AppState>),
      setBottomTab: (t) => set({ bottomTab: t }),
      setRightTab: (t) => set({ rightTab: t }),
      setConsoleFilter: (f) => set({ consoleFilter: f }),
      setStats: (st) => set({ stats: st }),
      setRecording: (r) => set({ recording: r }),
      addMyPreset: (id) => set((s) => ({ myPresetIds: [...new Set([...s.myPresetIds, id])] })),
      removeMyPreset: (id) =>
        set((s) => ({ myPresetIds: s.myPresetIds.filter((x) => x !== id) })),
    }),
    {
      name: 'shaderlab-state',
      partialize: (s) => ({
        theme: s.theme,
        presetId: s.presetId,
        myPresetIds: s.myPresetIds,
        uniformValues: s.uniformValues,
        playing: s.playing,
        timeScale: s.timeScale,
        resScale: s.resScale,
        showFps: s.showFps,
        geometryOverride: s.geometryOverride,
        leftW: s.leftW,
        rightW: s.rightW,
        bottomH: s.bottomH,
        bottomTab: s.bottomTab,
        rightTab: s.rightTab,
      }),
    },
  ),
);
