// 全局日志总线：控制台面板 / 导出 / selftest 都从这里取数据
import type { LogEntry } from './engine/types';

type Sub = (e: LogEntry) => void;
const subs = new Set<Sub>();
let counter = 0;

function push(level: LogEntry['level'], src: string, msg: string, detail?: string) {
  const e: LogEntry = { id: ++counter, t: Date.now(), level, src, msg, detail };
  subs.forEach((s) => {
    try { s(e); } catch { /* 忽略订阅者错误 */ }
  });
  return e;
}

export const LogBus = {
  info: (src: string, msg: string, detail?: string) => push('info', src, msg, detail),
  warn: (src: string, msg: string, detail?: string) => push('warn', src, msg, detail),
  error: (src: string, msg: string, detail?: string) => push('error', src, msg, detail),
  ok: (src: string, msg: string, detail?: string) => push('ok', src, msg, detail),
  gpu: (src: string, msg: string, detail?: string) => push('gpu', src, msg, detail),
  subscribe(fn: Sub) {
    subs.add(fn);
    return () => { subs.delete(fn); };
  },
};
