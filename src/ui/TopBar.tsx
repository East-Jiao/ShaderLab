// 顶栏：菜单 / 预设信息 / 播放 / 录制 / 主题
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { languages } from '../languages';
import { findPreset, getAllPresets } from '../presets';
import * as bridge from '../engine-bridge';
import { LogBus } from '../logs';
import { importMyPresets } from '../engine-bridge';

function Menu({ label, children }: { label: string; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, []);
  return (
    <div className={`menu-item ${open ? 'open' : ''}`} ref={ref}>
      <button onClick={() => setOpen((o) => !o)}>{label}</button>
      {open && <div className="dropdown">{children(() => setOpen(false))}</div>}
    </div>
  );
}

export function TopBar() {
  const theme = useStore((s) => s.theme);
  const presetId = useStore((s) => s.presetId);
  const playing = useStore((s) => s.playing);
  const recording = useStore((s) => s.recording);
  const backend = useStore((s) => s.backend);
  const dirty = useStore((s) => s.dirty);
  const compileOk = useStore((s) => s.compileOk);
  const preset = findPreset(presetId);
  const lang = preset ? languages.get(preset.language) : undefined;

  const onImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) importMyPresets(await file.text());
    };
    input.click();
  };

  return (
    <div className="topbar">
      <div className="logo">
        <span className="gem">◆</span> ShaderLab
      </div>
      <Menu label="文件">
        {(close) => (
          <>
            <div className="label">预设</div>
            <button onClick={() => { const name = prompt('预设名称', (preset?.name || '我的Shader') + '·副本'); if (name) { bridge.saveAsMyPreset(name); close(); } }}>💾 另存为我的预设</button>
            <button onClick={() => { bridge.exportMyPresets(); close(); }}>📤 导出我的预设 (JSON)</button>
            <button onClick={() => { onImport(); close(); }}>📥 导入预设 (JSON)</button>
            <div className="sep" />
            <button onClick={() => { bridge.snapshot(); close(); }}>📸 保存视口截图 (PNG)</button>
          </>
        )}
      </Menu>
      <Menu label="视图">
        {(close) => (
          <>
            <button onClick={() => { useStore.getState().setShowFps(!useStore.getState().showFps); close(); }}>
              {useStore.getState().showFps ? '✓ ' : ''}显示性能统计
            </button>
            <button onClick={() => { useStore.getState().toggleTheme(); close(); }}>🌗 切换深/浅色主题</button>
            <div className="sep" />
            <div className="label">分辨率缩放</div>
            {[0.5, 0.75, 1, 1.5].map((v) => (
              <button key={v} onClick={() => { useStore.getState().setResScale(v); bridge.applyRuntimeOptions(); close(); }}>
                {useStore.getState().resScale === v ? '✓ ' : ''}{v * 100}%
              </button>
            ))}
          </>
        )}
      </Menu>
      <Menu label="帮助">
        {(close) => (
          <>
            <button onClick={() => { LogBus.info('帮助', 'Ctrl+Enter 应用代码并编译 · Ctrl+S 另存为我的预设 · 左键拖拽旋转视口 · 滚轮缩放'); close(); }}>⌨️ 快捷键说明（输出到控制台）</button>
            <button onClick={() => { LogBus.info('帮助', '全部预设列表', getAllPresets().map((p) => `${p.name} [${p.language}]`).join('\n')); close(); }}>📋 列出全部预设</button>
            <button onClick={() => { alert('ShaderLab v1.0\nUnity 风格多语言 Shader 实验库\n\n内核：WebGL2 + WebGPU 双后端\n语言：GLSL ES 3.0 / 1.0 / Shadertoy / HLSL(转译) / WGSL / ToySL\n桌面版：Electron'); close(); }}>ℹ️ 关于</button>
          </>
        )}
      </Menu>

      <div className="spacer" />
      <div className="title">
        <span className="name">{preset?.name || '—'}</span>
        {dirty && <span className="badge" style={{ color: 'var(--warn)' }}>已修改</span>}
        {compileOk === true && <span className="badge ok">编译通过</span>}
        {compileOk === false && <span className="badge err">编译失败</span>}
        {lang && <span className="badge accent">{lang.label}</span>}
        <span className="badge">{backend === 'webgpu' ? 'WebGPU' : 'WebGL2'}</span>
      </div>
      <div className="spacer" />

      <button className="btn icon" title={playing ? '暂停 (时间冻结)' : '播放'} onClick={() => { useStore.getState().setPlaying(!playing); bridge.applyRuntimeOptions(); }}>
        {playing ? '⏸' : '▶'}
      </button>
      <select
        title="时间缩放"
        value={useStore.getState().timeScale}
        onChange={(e) => { useStore.getState().setTimeScale(parseFloat(e.target.value)); bridge.applyRuntimeOptions(); }}
      >
        {[0.1, 0.25, 0.5, 1, 2, 4].map((v) => (
          <option key={v} value={v}>×{v}</option>
        ))}
      </select>
      <button
        className={`btn icon ${recording ? 'danger rec' : ''}`}
        title={recording ? '停止录制并保存' : '录制视口为视频'}
        onClick={() => {
          if (recording) void bridge.recordStop();
          else bridge.recordStart();
        }}
      >
        {recording ? '⏹ 停止' : '⏺ 录制'}
      </button>
      <button className="btn icon" title="截图 (PNG)" onClick={() => bridge.snapshot()}>📷</button>
      <button className="btn icon" title="切换深浅主题" onClick={() => { useStore.getState().toggleTheme(); }}>
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
    </div>
  );
}
