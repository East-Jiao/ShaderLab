// 视口：双画布（WebGL2 / WebGPU）+ 统计浮层 + 错误覆盖
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { initBridge, setMouse } from '../engine-bridge';
import { LogBus } from '../logs';

export function Viewport({ onReady }: { onReady?: () => void }) {
  const glRef = useRef<HTMLCanvasElement>(null);
  const gpuRef = useRef<HTMLCanvasElement>(null);
  const backend = useStore((s) => s.backend);
  const showFps = useStore((s) => s.showFps);
  const stats = useStore((s) => s.stats);
  const compileOk = useStore((s) => s.compileOk);
  const passReports = useStore((s) => s.passReports);
  const presetId = useStore((s) => s.presetId);
  const presetName = useStore((s) => s.presetName);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [gpuError, setGpuError] = useState<string | null>(null);

  useEffect(() => {
    if (!glRef.current || !gpuRef.current || bridgeReady) return;
    try {
      initBridge(glRef.current, gpuRef.current);
      setBridgeReady(true);
      onReady?.();
    } catch (err) {
      LogBus.error('内核', '渲染内核初始化失败', String(err));
      setGpuError(String(err));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 鼠标 uniform
  useEffect(() => {
    const el = backend === 'webgpu' ? gpuRef.current : glRef.current;
    if (!el) return;
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      setMouse(e.clientX - rect.left, rect.bottom - e.clientY, e.buttons > 0);
    };
    const onDown = (e: PointerEvent) => onMove(e);
    const onUp = (e: PointerEvent) => onMove(e);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
    };
  }, [backend]);

  const errors = passReports.flatMap((r) => r.errors.map((e) => ({ pass: r.name, ...e })));

  return (
    <div className="viewport">
      <canvas ref={glRef} style={{ visibility: backend === 'webgl2' ? 'visible' : 'hidden' }} />
      <canvas ref={gpuRef} style={{ visibility: backend === 'webgpu' ? 'visible' : 'hidden' }} />
      <div className="overlay">
        {showFps && (
          <>
            <div className="chip">{stats.fps.toFixed(0)} FPS · {stats.ms.toFixed(1)} ms</div>
            <div className="chip">Draw {stats.draws} · 三角形 {stats.tris.toLocaleString()}</div>
          </>
        )}
        <div className="chip" title={presetId}>{presetName || presetId}</div>
      </div>
      <div className="hint">左键拖拽旋转 · 滚轮缩放</div>
      {compileOk === false && errors.length > 0 && (
        <div className="error-overlay">
          <div className="card">
            <h4>⛔ 着色器编译失败</h4>
            <pre>{errors.slice(0, 8).map((e) => `「${e.pass}」 L${e.line}: ${e.message}`).join('\n')}</pre>
            <p style={{ margin: '10px 0 0', color: 'var(--text-dim)', fontSize: 12 }}>
              修复后按 Ctrl+Enter 重新编译 · 详见底部"控制台"或"AI 助手 ▸ 调试"
            </p>
          </div>
        </div>
      )}
      {gpuError && (
        <div className="error-overlay">
          <div className="card">
            <h4>渲染内核异常</h4>
            <pre>{gpuError}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
