import { useEffect } from 'react';
import { TopBar } from './ui/TopBar';
import { LeftPanel } from './ui/LeftPanel';
import { Viewport } from './ui/Viewport';
import { RightPanel } from './ui/RightPanel';
import { BottomPanel } from './ui/BottomPanel';
import { Splitter } from './ui/Splitter';
import { useStore } from './state/store';
import * as bridge from './engine-bridge';
import { findPreset } from './presets';
import './styles.css';

export function App() {
  const theme = useStore((s) => s.theme);
  const leftW = useStore((s) => s.leftW);
  const rightW = useStore((s) => s.rightW);
  const bottomH = useStore((s) => s.bottomH);
  const bottomTab = useStore((s) => s.bottomTab);
  const presetId = useStore((s) => s.presetId);

  // 主题应用
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    bridge.applyRuntimeOptions();
  }, [theme]);

  // 初始加载上次的预设（内置或"我的预设"）
  useEffect(() => {
    const preset = findPreset(presetId);
    if (preset) {
      void bridge.loadPreset(preset);
    } else if (presetId.startsWith('my-') && bridge.getMyPreset(presetId)) {
      bridge.loadMyPreset(presetId);
    } else {
      const first = findPreset('fs-neon-plasma')!;
      void bridge.loadPreset(first);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ctrl+S 另存为我的预设
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        const name = prompt('预设名称', (findPreset(useStore.getState().presetId)?.name || '我的Shader') + '·副本');
        if (name) bridge.saveAsMyPreset(name);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="app">
      <TopBar />
      <div className="main">
        <div className="side-panel left-panel" style={{ ['--w' as string]: `${leftW}px` }}>
          <LeftPanel />
        </div>
        <Splitter dir="v" />
        <Viewport />
        <Splitter dir="v" />
        <div className="side-panel right-panel" style={{ ['--w' as string]: `${rightW}px` }}>
          <RightPanel />
        </div>
      </div>
      <Splitter dir="h" />
      <div className="bottom" style={{ ['--h' as string]: `${bottomH}px` }}>
        <div className="bottom-tabs">
          <button className={`tab ${bottomTab === 'code' ? 'active' : ''}`} onClick={() => useStore.getState().setBottomTab('code')}>📝 代码</button>
          <button className={`tab ${bottomTab === 'console' ? 'active' : ''}`} onClick={() => useStore.getState().setBottomTab('console')}>🖥️ 控制台</button>
          <button className={`tab ${bottomTab === 'assist' ? 'active' : ''}`} onClick={() => useStore.getState().setBottomTab('assist')}>🤖 AI 助手</button>
          <div className="right-tools">
            <kbd>Ctrl</kbd>+<kbd>Enter</kbd> 应用并编译 · <kbd>Ctrl</kbd>+<kbd>S</kbd> 另存预设
          </div>
        </div>
        <BottomPanel />
      </div>
    </div>
  );
}
