// 右面板：检查器（uniform 控件 / 相机 / 性能）+ 文档
import { useStore } from '../state/store';
import * as bridge from '../engine-bridge';
import { getAllPresets, findPreset } from '../presets';
import { languages } from '../languages';
import type { UniformMeta } from '../engine/types';
import { CanvasRecorder } from '../recorder';

export function RightPanel() {
  const tab = useStore((s) => s.rightTab);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div className="bottom-tabs" style={{ flex: 'none' }}>
        <button className={`tab ${tab === 'inspector' ? 'active' : ''}`} onClick={() => useStore.getState().setRightTab('inspector')}>检查器</button>
        <button className={`tab ${tab === 'docs' ? 'active' : ''}`} onClick={() => useStore.getState().setRightTab('docs')}>文档</button>
      </div>
      <div className="panel-scroll">
        {tab === 'inspector' ? <Inspector /> : <Docs />}
      </div>
    </div>
  );
}

function metaValue(m: UniformMeta): number | number[] {
  return m.value && m.value.length === 1 ? m.value[0] : (m.value ?? [0, 0, 0]) as number[];
}

function UniformRow({ meta }: { meta: UniformMeta }) {
  const presetId = useStore((s) => s.presetId);
  const stored = useStore((s) => s.uniformValues[s.presetId]?.[meta.name]);
  const value = (stored !== undefined ? stored : metaValue(meta)) as number | number[] | string;
  const set = (v: number | number[] | string | boolean) => bridge.setUniformValue(meta.name, v);
  const [lo, hi] = meta.range || [0, 1];

  if (meta.type === 'sampler2D') {
    const textures = TEXTURES;
    return (
      <div className="uniform-row">
        <div className="u-head">
          <span className="u-name">{meta.name}</span>
          <span className="u-type">sampler2D</span>
        </div>
        <select value={(value as string) || 'checker'} onChange={(e) => set(e.target.value)}>
          {textures.map((t) => (
            <option key={t} value={t}>{TEXTURE_LABELS[t] || t}</option>
          ))}
        </select>
      </div>
    );
  }

  if (meta.type === 'bool') {
    return (
      <div className="uniform-row">
        <div className="u-head">
          <span className="u-name">{meta.name}</span>
          <span className="u-type">bool</span>
          <label className="checkbox-row" style={{ marginLeft: 'auto' }}>
            <input type="checkbox" checked={Boolean(value)} onChange={(e) => set(e.target.checked ? 1 : 0)} />
          </label>
        </div>
      </div>
    );
  }

  if (meta.color && (meta.type === 'vec3' || meta.type === 'vec4')) {
    const arr = (Array.isArray(value) ? value : [0, 0, 0, 1]) as number[];
    const hex = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 255).toString(16).padStart(2, '0');
    const colorHex = `#${hex(arr[0] ?? 0)}${hex(arr[1] ?? 0)}${hex(arr[2] ?? 0)}`;
    return (
      <div className="uniform-row">
        <div className="u-head">
          <span className="u-name">{meta.name}</span>
          <span className="u-type">{meta.type}</span>
          <input
            type="color" value={colorHex} style={{ marginLeft: 'auto' }}
            onChange={(e) => {
              const r = parseInt(e.target.value.slice(1, 3), 16) / 255;
              const g = parseInt(e.target.value.slice(3, 5), 16) / 255;
              const b = parseInt(e.target.value.slice(5, 7), 16) / 255;
              set(meta.type === 'vec3' ? [r, g, b] : [r, g, b, arr[3] ?? 1]);
            }}
          />
        </div>
        {meta.type === 'vec4' && (
          <div className="row" style={{ margin: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>alpha</span>
            <input type="range" min={0} max={1} step={0.01} value={arr[3] ?? 1} onChange={(e) => set([arr[0], arr[1], arr[2], parseFloat(e.target.value)])} />
          </div>
        )}
      </div>
    );
  }

  if (meta.type === 'float' || meta.type === 'int') {
    const v = typeof value === 'number' ? value : (value as number[])[0];
    const isInt = meta.type === 'int';
    return (
      <div className="uniform-row">
        <div className="u-head">
          <span className="u-name">{meta.name}</span>
          <span className="u-type">{meta.type}</span>
          <span className="val" style={{ color: 'var(--accent)', marginLeft: 'auto', fontSize: 12 }}>{isInt ? Math.round(v) : v.toFixed(3)}</span>
        </div>
        <div className="row" style={{ margin: 0 }}>
          <input
            type="range" min={lo} max={hi} step={isInt ? 1 : (hi - lo) / 200}
            value={v}
            onChange={(e) => set(isInt ? parseInt(e.target.value, 10) : parseFloat(e.target.value))}
          />
          <input
            type="text" className="inline" style={{ width: 64, flex: 'none' }} defaultValue={v}
            key={`${meta.name}-${v}`}
            onBlur={(e) => {
              const n = parseFloat(e.target.value);
              if (!Number.isNaN(n)) set(n);
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          />
        </div>
      </div>
    );
  }

  // vec2/3/4 非颜色
  const arr = (Array.isArray(value) ? value : [0, 0, 0, 0]) as number[];
  return (
    <div className="uniform-row">
      <div className="u-head">
        <span className="u-name">{meta.name}</span>
        <span className="u-type">{meta.type}</span>
      </div>
      <div className="vec-input">
        {arr.map((v, i) => (
          <input
            key={i}
            type="number" className="inline" step={0.01} value={v}
            onChange={(e) => {
              const next = [...arr];
              next[i] = parseFloat(e.target.value) || 0;
              set(next);
            }}
          />
        ))}
      </div>
    </div>
  );
}

const TEXTURES = ['white', 'black', 'checker', 'uvgrid', 'noise', 'brick', 'stripes', 'gradient', 'matcap', 'rings', 'normalmap'];
const TEXTURE_LABELS: Record<string, string> = {
  white: '纯白', black: '纯黑', checker: '棋盘格', uvgrid: 'UV 网格', noise: '噪声图',
  brick: '砖墙', stripes: '条纹', gradient: '渐变', matcap: 'MatCap 金属', rings: '年轮',
  normalmap: '砖墙法线贴图',
};

function Inspector() {
  const metas = useStore((s) => s.metas);
  const stats = useStore((s) => s.stats);
  const presetId = useStore((s) => s.presetId);
  const preset = findPreset(presetId);
  const timeScale = useStore((s) => s.timeScale);
  const mimes = CanvasRecorder.supportedMimes();

  return (
    <>
      <div className="panel-section">
        <h3>
          参数 Uniform
          <span>
            <button className="btn icon" title="重置" onClick={() => bridge.resetUniforms()}>↺</button>{' '}
            <button className="btn icon" title="随机化" onClick={() => bridge.randomizeUniforms()}>🎲</button>
          </span>
        </h3>
        {metas.length === 0 && <div style={{ color: 'var(--text-faint)', fontSize: 12 }}>编译后此处会自动生成所有 uniform 控件</div>}
        {metas.map((m) => <UniformRow key={m.name} meta={m} />)}
      </div>
      <div className="panel-section">
        <h3>性能</h3>
        <div className="stats-grid">
          <div className="st"><div className="k">FPS</div><div className="v">{stats.fps.toFixed(0)}</div></div>
          <div className="st"><div className="k">帧耗时</div><div className="v">{stats.ms.toFixed(1)}ms</div></div>
          <div className="st"><div className="k">Draw Call</div><div className="v">{stats.draws}</div></div>
          <div className="st"><div className="k">三角形</div><div className="v">{stats.tris.toLocaleString()}</div></div>
        </div>
        {preset?.resolutionScale && preset.resolutionScale < 1 && (
          <div style={{ color: 'var(--text-faint)', fontSize: 11, marginTop: 6 }}>此预设默认 {preset.resolutionScale * 100}% 分辨率（性能考虑），可在左侧调整。</div>
        )}
      </div>
      <div className="panel-section">
        <h3>录制</h3>
        <div className="row">
          <label>时间缩放</label>
          <input type="range" min={0.1} max={4} step={0.05} value={timeScale} onChange={(e) => { useStore.getState().setTimeScale(parseFloat(e.target.value)); bridge.applyRuntimeOptions(); }} />
          <span className="val">×{timeScale.toFixed(2)}</span>
        </div>
        <div style={{ color: 'var(--text-faint)', fontSize: 11, lineHeight: 1.7 }}>
          编码器：{mimes.length ? mimes.map((m) => m.split(';')[0]).join(' / ') : '不可用'}
          <br />点击顶栏 ⏺ 开始录制视口动画，⏹ 结束并自动下载。
        </div>
      </div>
    </>
  );
}

function Docs() {
  const presetId = useStore((s) => s.presetId);
  const preset = getAllPresets().find((p) => p.id === presetId);
  if (!preset) return null;
  const lang = languages.get(preset.language);
  return (
    <>
      <div className="panel-section">
        <h3>{preset.name}</h3>
        <div className="docs-body">
          <p style={{ marginTop: 0 }}>{preset.docs.summary}</p>
          {preset.docs.detail && (
            <>
              <b>技术要点</b>
              <ul style={{ margin: '6px 0' }}>
                {preset.docs.detail.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            </>
          )}
          <b>元信息</b>
          <table>
            <tbody>
              <tr><td>语言</td><td className="mono">{lang?.label || preset.language}</td></tr>
              <tr><td>场景</td><td className="mono">{preset.scene.kind}</td></tr>
              <tr><td>Pass 数</td><td className="mono">{preset.passes.length}</td></tr>
              <tr><td>标签</td><td>{preset.tags.join(' · ')}</td></tr>
            </tbody>
          </table>
          <p style={{ color: 'var(--text-faint)', fontSize: 11 }}>
            内置 uniform（自动供应）：uTime / uResolution / uMouse / uCamPos / uCamRot / uModel / uView / uProjection / uNormalMatrix 等，编辑器里直接声明即可使用。
          </p>
        </div>
      </div>
    </>
  );
}
