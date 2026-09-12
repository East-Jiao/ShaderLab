// 底部面板：代码编辑器 / 控制台 / AI 助手
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { languages } from '../languages';
import { findPreset } from '../presets';
import * as bridge from '../engine-bridge';
import { CodeEditor } from './CodeEditor';
import { LogBus, LogBus as Bus } from '../logs';
import type { LogEntry } from '../engine/types';
import { explainShader, suggestForError, lintShader, type ExplainResult } from '../assist/ai';
import { SNIPPETS } from '../assist/snippets';

export function BottomPanel() {
  const tab = useStore((s) => s.bottomTab);
  return (
    <div className="bottom-body">
      {tab === 'code' && <CodeTab />}
      {tab === 'console' && <ConsoleTab />}
      {tab === 'assist' && <AssistTab />}
    </div>
  );
}

// ---------------- 代码 ----------------

function CodeTab() {
  const passes = useStore((s) => s.passes);
  const activePass = useStore((s) => s.activePass);
  const dirty = useStore((s) => s.dirty);
  const presetId = useStore((s) => s.presetId);
  const passReports = useStore((s) => s.passReports);
  const [part, setPart] = useState<'fs' | 'vs'>('fs');
  const [showCompiled, setShowCompiled] = useState(false);
  const preset = findPreset(presetId);
  const lang = preset ? languages.get(preset.language) : undefined;
  const pass = passes[activePass];
  const report = passReports[activePass];

  const code = pass ? (part === 'vs' && pass.vs ? pass.vs : pass.fs) : '';
  const mode = (lang?.editorMode || 'glsl') as 'glsl' | 'hlsl' | 'wgsl' | 'toy';
  const errorLines = useMemo(() => (report && !report.ok ? report.errors.map((e) => e.line) : []), [report]);

  if (!pass || !preset) {
    return <div style={{ padding: 20, color: 'var(--text-faint)' }}>加载预设中…</div>;
  }

  const apply = () => {
    void bridge.applyEditedPasses(passes.map((p) => ({ ...p })));
    useStore.getState().setBottomTab('code');
  };

  const translated = () => {
    try {
      const l = languages.require(preset.language);
      const t = l.translate ? l.translate(passes.map((p) => ({ ...p })), preset.scene) : passes;
      return t.map((p) => `/* ====== Pass「${p.name}」VS ====== */\n${p.vs || '(无)'}\n\n/* ====== Pass「${p.name}」FS ====== */\n${p.fs}`).join('\n\n');
    } catch (e) {
      return '转译失败: ' + String(e);
    }
  };

  return (
    <div className="code-wrap">
      <div className="pass-tabs">
        {passes.map((p, i) => (
          <button key={i} className={`pt ${i === activePass ? 'active' : ''}`} onClick={() => { useStore.getState().setActivePass(i); setPart('fs'); }}>
            {p.name}
            <span className="vs-tag">{p.vs ? 'VS + FS' : '仅 FS'}</span>
          </button>
        ))}
        <div style={{ padding: '8px 6px', color: 'var(--text-faint)', fontSize: 11, lineHeight: 1.6 }}>
          多 Pass 按顺序绘制，描边等效果可用两个 Pass 实现（参考卡通渲染预设）。
        </div>
      </div>
      <div className="editor-main">
        <div className="editor-toolbar">
          {pass.vs ? (
            <div style={{ display: 'flex', gap: 2 }}>
              <button className={`btn icon ${part === 'fs' ? 'primary' : ''}`} onClick={() => setPart('fs')}>片元 FS</button>
              <button className={`btn icon ${part === 'vs' ? 'primary' : ''}`} onClick={() => setPart('vs')}>顶点 VS</button>
            </div>
          ) : (
            <span className="badge">顶点着色器由内核提供</span>
          )}
          <button className="btn primary" onClick={apply} title="Ctrl+Enter">▶ 应用编译</button>
          <button className="btn" onClick={() => { const p = preset; if (p) void bridge.loadPreset({ ...p, passes: p.passes.map((x) => ({ ...x })) }); }} title="放弃修改，还原为预设源码">
            ↺ 还原
          </button>
          <button className="btn" onClick={() => { const name = prompt('预设名称', `${preset.name}·副本`); if (name) bridge.saveAsMyPreset(name); }} title="Ctrl+S">
            💾 另存为我的预设
          </button>
          <button className={`btn ${showCompiled ? 'primary' : ''}`} onClick={() => setShowCompiled((v) => !v)}>
            {showCompiled ? '← 返回编辑' : '⚙ 查看转译产物'}
          </button>
          <button
            className="btn"
            title="用当前语言的模板替换本 Pass 代码"
            onClick={() => {
              if (!lang) return;
              const kind = preset.scene.kind;
              const tpl = lang.template(kind === 'mesh' ? 'mesh' : kind === 'post' ? 'post' : 'fullscreen');
              useStore.getState().setPassCode(activePass, part, tpl);
              LogBus.info('生成', `已插入 ${lang.label} 模板（${kind === 'mesh' ? '网格' : kind === 'post' ? '后处理' : '全屏'}）`);
            }}
          >
            📋 载入模板
          </button>
          {dirty && <span className="dirty">● 未应用的修改</span>}
        </div>
        {showCompiled ? (
          <pre className="snippet-preview" style={{ flex: 1, maxHeight: 'none', margin: 0, borderRadius: 0, border: 'none' }}>{translated()}</pre>
        ) : (
          <CodeEditor
            key={`${presetId}-${activePass}-${part}`}
            code={code}
            mode={mode}
            errorLines={errorLines}
            onChange={(c) => useStore.getState().setPassCode(activePass, part, c)}
            onApply={apply}
          />
        )}
        {!showCompiled && report && !report.ok && (
          <div className="error-list">
            {report.errors.map((e, i) => (
              <div
                key={i}
                className="err-item"
                onClick={() => window.dispatchEvent(new CustomEvent('shaderlab-goto', { detail: e.line }))}
              >
                <span className="ln">L{e.line}</span>
                <span>{e.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- 控制台 ----------------

function ConsoleTab() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const filter = useStore((s) => s.consoleFilter);
  const listRef = useRef<HTMLDivElement>(null);
  const cap = useRef(400);

  useEffect(() => {
    return Bus.subscribe((e) => {
      setLogs((prev) => {
        const next = [...prev, e];
        return next.length > cap.current ? next.slice(next.length - cap.current) : next;
      });
    });
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [logs]);

  const shown = logs.filter((l) => filter === 'all' || (filter === 'warn' ? l.level === 'warn' || l.level === 'error' : l.level === filter));

  const exportLogs = () => {
    const text = logs.map((l) => {
      const d = new Date(l.t);
      const p = (n: number) => String(n).padStart(2, '0');
      return `[${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}] [${l.level.toUpperCase()}] [${l.src}] ${l.msg}${l.detail ? '\n  ' + l.detail.replace(/\n/g, '\n  ') : ''}`;
    }).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `shaderlab-log-${Date.now()}.log`;
    a.click();
  };

  return (
    <div className="console">
      <div className="editor-toolbar">
        {(['all', 'info', 'ok', 'gpu', 'warn'] as const).map((f) => (
          <button key={f} className={`btn icon ${filter === f ? 'primary' : ''}`} onClick={() => useStore.getState().setConsoleFilter(f)}>
            {f === 'all' ? '全部' : f === 'gpu' ? 'GPU' : f === 'ok' ? '成功' : f === 'warn' ? '警告+错误' : '信息'}
          </button>
        ))}
        <span className="spacer" style={{ flex: 1 }} />
        <button className="btn icon" onClick={exportLogs}>📤 导出日志</button>
        <button className="btn icon" onClick={() => setLogs([])}>🗑 清空</button>
      </div>
      <div className="console-list" ref={listRef}>
        {shown.map((l) => (
          <div key={l.id}>
            <div className={`log-row level-${l.level}`}>
              <span className="t">{new Date(l.t).toLocaleTimeString('zh-CN', { hour12: false })}</span>
              <span className="src">[{l.src}]</span>
              <span className="msg">{l.msg}</span>
            </div>
            {l.detail && <div className="detail">{l.detail}</div>}
          </div>
        ))}
        {!shown.length && <div style={{ padding: 20, color: 'var(--text-faint)' }}>暂无日志</div>}
      </div>
    </div>
  );
}

// ---------------- AI 助手 ----------------

function AssistTab() {
  const [sub, setSub] = useState<'explain' | 'debug' | 'generate' | 'lint'>('explain');
  return (
    <div className="assist">
      <div className="subtabs">
        {([['explain', '💡 解释'], ['debug', '🐞 调试'], ['generate', '✨ 生成'], ['lint', '🔍 检查']] as const).map(([id, label]) => (
          <button key={id} className={sub === id ? 'active' : ''} onClick={() => setSub(id)}>{label}</button>
        ))}
      </div>
      <div className="content">
        {sub === 'explain' && <ExplainView />}
        {sub === 'debug' && <DebugView />}
        {sub === 'generate' && <GenerateView />}
        {sub === 'lint' && <LintView />}
      </div>
    </div>
  );
}

function useCurrentCode(): { code: string; language: string; passName: string } {
  const passes = useStore((s) => s.passes);
  const activePass = useStore((s) => s.activePass);
  const presetId = useStore((s) => s.presetId);
  const preset = findPreset(presetId);
  const pass = passes[activePass];
  return {
    code: pass?.fs || '',
    language: preset?.language || 'glsl3',
    passName: pass?.name || '—',
  };
}

function ExplainView() {
  const { code, language, passName } = useCurrentCode();
  const [result, setResult] = useState<ExplainResult | null>(null);
  return (
    <>
      <div className="editor-toolbar" style={{ borderBottom: 'none', paddingBottom: 0 }}>
        <button className="btn primary" onClick={() => setResult(explainShader(code, language))}>💡 解释当前 Pass「{passName}」</button>
        <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>本地静态分析，无需联网</span>
      </div>
      {result && (
        <>
          <p className="summary">{result.summary}</p>
          {result.bullets.length > 0 && <ul>{result.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>}
          <h4>Uniform 参数</h4>
          {result.uniforms.length ? (
            <table>
              <thead><tr><th>名称</th><th>类型</th><th>推测用途</th></tr></thead>
              <tbody>
                {result.uniforms.map((u) => (
                  <tr key={u.name}><td className="mono">{u.name}</td><td className="mono">{u.type}</td><td className="purpose">{u.purpose}</td></tr>
                ))}
              </tbody>
            </table>
          ) : <p style={{ color: 'var(--text-faint)' }}>（无自定义 uniform）</p>}
          <h4>函数结构</h4>
          <table>
            <thead><tr><th>函数</th><th>体量</th><th>推测功能</th></tr></thead>
            <tbody>
              {result.functions.map((f) => (
                <tr key={f.name}><td className="mono">{f.name}()</td><td>{f.lines} 行</td><td className="purpose">{f.purpose}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

function DebugView() {
  const passReports = useStore((s) => s.passReports);
  const activePass = useStore((s) => s.activePass);
  const { code, language } = useCurrentCode();
  const report = passReports[activePass];
  const errors = report && !report.ok ? report.errors : [];
  const lintIssues = useMemo(() => (errors.length ? [] : lintShader(code, language).filter((i) => i.level === 'error')), [errors, code, language]);

  return (
    <>
      {errors.length === 0 ? (
        <>
          <h4>✅ 当前 Pass 没有编译错误</h4>
          {lintIssues.length > 0 && (
            <ul>{lintIssues.map((i, k) => <li key={k}>L{i.line}: {i.message}</li>)}</ul>
          )}
          <p style={{ color: 'var(--text-faint)' }}>编译错误出现时，这里会给出逐条修复建议。</p>
        </>
      ) : (
        <>
          <h4>🐞 发现 {errors.length} 个错误 —— 修复建议</h4>
          <table>
            <thead><tr><th>行</th><th>错误</th><th>建议</th></tr></thead>
            <tbody>
              {errors.map((e, i) => (
                <tr key={i}>
                  <td className="mono" style={{ cursor: 'pointer' }} onClick={() => window.dispatchEvent(new CustomEvent('shaderlab-goto', { detail: e.line }))}>L{e.line}</td>
                  <td>{e.message}</td>
                  <td className="purpose">{suggestForError(e)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

function GenerateView() {
  const [cat, setCat] = useState('全部');
  const [selected, setSelected] = useState<string | null>(null);
  const categories = useMemo(() => ['全部', ...new Set(SNIPPETS.map((s) => s.category))], []);
  const shown = SNIPPETS.filter((s) => cat === '全部' || s.category === cat);
  const snippet = SNIPPETS.find((s) => s.id === selected);

  return (
    <>
      <h4>代码片段库（点击选择，追加到当前 Pass 末尾）</h4>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {categories.map((c) => (
          <button key={c} className={`btn icon ${cat === c ? 'primary' : ''}`} onClick={() => setCat(c)}>{c}</button>
        ))}
      </div>
      <div className="snippet-grid">
        {shown.map((s) => (
          <div key={s.id} className={`snippet-card ${selected === s.id ? 'active' : ''}`} onClick={() => setSelected(s.id)}>
            <div className="sn">{s.name}</div>
            <div className="sd">{s.desc}</div>
          </div>
        ))}
      </div>
      {snippet && (
        <>
          <div className="snippet-preview">{snippet.code}</div>
          <button
            className="btn primary"
            onClick={() => {
              const s = useStore.getState();
              const pass = s.passes[s.activePass];
              const next = pass.fs + `\n\n// ===== ${snippet.name}（来自片段库）=====\n` + snippet.code + '\n';
              s.setPassCode(s.activePass, 'fs', next);
              LogBus.ok('生成', `已追加片段「${snippet.name}」到 Pass「${pass.name}」，按 Ctrl+Enter 应用`);
            }}
          >
            ➕ 追加到当前 Pass
          </button>
        </>
      )}
    </>
  );
}

function LintView() {
  const { code, language } = useCurrentCode();
  const [issues, setIssues] = useState<ReturnType<typeof lintShader> | null>(null);
  return (
    <>
      <div className="editor-toolbar" style={{ borderBottom: 'none', paddingBottom: 0 }}>
        <button className="btn primary" onClick={() => { const r = lintShader(code, language); setIssues(r); LogBus.info('检查', `静态检查完成：${r.filter((i) => i.level === 'error').length} 错误 / ${r.filter((i) => i.level === 'warn').length} 警告`); }}>
          🔍 对当前 Pass 运行静态检查
        </button>
        <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>检查版本语法残留 / 整数除法 / 保留资源等 20+ 规则</span>
      </div>
      {issues && (
        issues.length ? (
          <table>
            <thead><tr><th>行</th><th>级别</th><th>问题</th></tr></thead>
            <tbody>
              {issues.map((i, k) => (
                <tr key={k}>
                  <td className="mono" style={{ cursor: 'pointer' }} onClick={() => window.dispatchEvent(new CustomEvent('shaderlab-goto', { detail: i.line }))}>L{i.line}</td>
                  <td style={{ color: i.level === 'error' ? 'var(--err)' : 'var(--warn)' }}>{i.level === 'error' ? '错误' : '警告'}</td>
                  <td className="purpose">{i.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <h4>✅ 没有发现问题</h4>
      )}
    </>
  );
}
