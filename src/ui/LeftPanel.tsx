// 左面板：预设库（分类树）+ 我的预设 + 场景设置
import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { CATEGORY_META, getAllPresets } from '../presets';
import type { PresetCategory } from '../engine/types';
import * as bridge from '../engine-bridge';
import { LogBus } from '../logs';

export function LeftPanel() {
  const presetId = useStore((s) => s.presetId);
  const myPresetIds = useStore((s) => s.myPresetIds);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const presets = useMemo(() => getAllPresets(), []);
  const filtered = useMemo(() => {
    if (!search.trim()) return presets;
    const q = search.trim().toLowerCase();
    return presets.filter((p) => p.name.toLowerCase().includes(q) || p.tags.some((t) => t.toLowerCase().includes(q)));
  }, [presets, search]);

  const byCat = useMemo(() => {
    const map: Record<string, typeof filtered> = { fullscreen: [], material: [], post: [] };
    for (const p of filtered) map[p.category].push(p);
    return map;
  }, [filtered]);

  const myPresets = myPresetIds.map((id) => bridge.getMyPreset(id)).filter(Boolean) as NonNullable<ReturnType<typeof bridge.getMyPreset>>[];

  return (
    <div className="panel-scroll" style={{ height: '100%' }}>
      <div className="panel-section">
        <h3>搜索</h3>
        <input className="search-box" placeholder="搜索预设 / 标签…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="panel-section" style={{ padding: '6px 8px' }}>
        {(['fullscreen', 'material', 'post'] as PresetCategory[]).map((cat) => (
          <div key={cat} className={`preset-cat ${collapsed[cat] ? 'collapsed' : ''}`}>
            <div className="cat-head" onClick={() => setCollapsed((c) => ({ ...c, [cat]: !c[cat] }))}>
              <span className="arrow">▼</span>
              <span>{CATEGORY_META[cat].icon}</span>
              <span>{CATEGORY_META[cat].label}</span>
              <span style={{ marginLeft: 'auto', color: 'var(--text-faint)' }}>{byCat[cat].length}</span>
            </div>
            <div className="preset-list">
              {byCat[cat].map((p) => (
                <div
                  key={p.id}
                  className={`preset-item ${presetId === p.id ? 'active' : ''}`}
                  onClick={() => void bridge.loadPreset(p)}
                  title={p.docs.summary}
                >
                  <span className="dot" />
                  <span className="pname">{p.name}</span>
                  <span className="lang">{p.language}</span>
                </div>
              ))}
              {!byCat[cat].length && <div style={{ padding: '4px 20px', color: 'var(--text-faint)', fontSize: 12 }}>无匹配项</div>}
            </div>
          </div>
        ))}
        <div className={`preset-cat ${collapsed['my'] ? 'collapsed' : ''}`}>
          <div className="cat-head" onClick={() => setCollapsed((c) => ({ ...c, my: !c.my }))}>
            <span className="arrow">▼</span>
            <span>★</span>
            <span>我的预设</span>
            <span style={{ marginLeft: 'auto', color: 'var(--text-faint)' }}>{myPresets.length}</span>
          </div>
          <div className="preset-list">
            {myPresets.map((p) => (
              <div key={p.id} className={`preset-item ${presetId === p.id ? 'active' : ''}`} onClick={() => bridge.loadMyPreset(p.id)}>
                <span className="dot" />
                <span className="pname">{p.name}</span>
                <button
                  className="del"
                  title="删除"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`删除「${p.name}」？`)) bridge.deleteMyPreset(p.id);
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
            {!myPresets.length && (
              <div style={{ padding: '4px 20px', color: 'var(--text-faint)', fontSize: 12 }}>
                空空如也 —— 编辑代码后用 文件 ▸ 另存为我的预设
              </div>
            )}
          </div>
        </div>
      </div>
      <SceneSection />
    </div>
  );
}

function SceneSection() {
  const resScale = useStore((s) => s.resScale);
  const showFps = useStore((s) => s.showFps);
  const presetId = useStore((s) => s.presetId);
  const preset = getAllPresets().find((p) => p.id === presetId);
  const isMesh = preset?.scene.kind === 'mesh';
  void isMesh;
  return (
      <div className="panel-section">
        <h3>场景与性能</h3>
        <div className="row">
          <label>几何体</label>
          <select
            value={useStore.getState().geometryOverride}
            onChange={(e) => {
              useStore.getState().setGeometryOverride(e.target.value);
              LogBus.info('场景', `几何体覆盖: ${e.target.value === 'auto' ? '跟随预设' : e.target.value}`);
              const p = getAllPresets().find((x) => x.id === useStore.getState().presetId);
              if (p) void bridge.loadPreset(p, { silent: true });
            }}
          >
            <option value="auto">跟随预设</option>
            <option value="sphere">球体</option>
            <option value="icosphere">Icosphere 均匀球</option>
            <option value="torus">环面</option>
            <option value="torusKnot">环面结</option>
            <option value="cube">立方体</option>
            <option value="cylinder">圆柱</option>
            <option value="plane">平面</option>
          </select>
        </div>
        <div className="row">
          <label>分辨率</label>
          <input
            type="range" min={0.35} max={1.5} step={0.05} value={resScale}
            onChange={(e) => { useStore.getState().setResScale(parseFloat(e.target.value)); bridge.applyRuntimeOptions(); }}
          />
          <span className="val">{Math.round(resScale * 100)}%</span>
        </div>
      <div className="row">
        <label>统计浮层</label>
        <label className="checkbox-row">
          <input type="checkbox" checked={showFps} onChange={(e) => useStore.getState().setShowFps(e.target.checked)} />
          <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>在视口显示 FPS</span>
        </label>
      </div>
      <div className="row">
        <label>渲染内核</label>
        <select value={useStore.getState().backend} onChange={(e) => LogBus.info('内核', `当前渲染内核: ${e.target.value}`)}>
          <option value="webgl2">WebGL2（GLSL）</option>
          <option value="webgpu">WebGPU（WGSL）</option>
        </select>
      </div>
      <div style={{ color: 'var(--text-faint)', fontSize: 11, lineHeight: 1.6, marginTop: 4 }}>
        WGSL 预设自动切换到 WebGPU；低配设备可下调分辨率缩放提升流畅度。
      </div>
    </div>
  );
}
