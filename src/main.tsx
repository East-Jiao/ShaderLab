import { createRoot } from 'react-dom/client';
import { App } from './App';
import './languages'; // 触发语言注册（含插件 API 暴露）
import { LogBus } from './logs';

const params = new URLSearchParams(location.search);
const SELFTEST = params.get('selftest') === '1';

// 根错误兜底
window.addEventListener('error', (e) => {
  LogBus.error('全局', e.message, e.error?.stack);
});
window.addEventListener('unhandledrejection', (e) => {
  LogBus.error('全局', '未处理的 Promise 异常', String(e.reason));
});

function mount() {
  const root = createRoot(document.getElementById('root')!);
  root.render(<App />);

  if (SELFTEST) {
    void import('./selftest').then((m) => m.runSelfTest());
  }
}

mount();
