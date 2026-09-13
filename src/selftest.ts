// 全预设自检：?selftest=1 时逐个加载预设并记录编译/渲染结果（window.__SELFTEST__）
import { useStore } from './state/store';
import { getAllPresets } from './presets';
import { languages } from './languages';
import * as bridge from './engine-bridge';
import { LogBus } from './logs';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForBridge(timeout = 8000): Promise<boolean> {
  const start = performance.now();
  while (performance.now() - start < timeout) {
    if (useStore.getState().compileOk !== null) return true;
    await sleep(100);
  }
  return false;
}

export async function runSelfTest() {
  LogBus.info('自检', '=== ShaderLab 自检开始 ===');
  const bridgeReady = await waitForBridge();
  if (!bridgeReady) {
    LogBus.error('自检', '桥接初始化超时');
    (window as unknown as Record<string, unknown>).__SELFTEST__ = { pass: false, results: [], fatal: 'bridge timeout' };
    return;
  }
  await sleep(400);

  const presets = getAllPresets();
  const results: { id: string; name: string; language: string; backend: string; ok: boolean; skipped?: boolean; errors?: string[]; pixel?: number[] | null }[] = [];

  for (const p of presets) {
    const lang = languages.require(p.language);
    if (lang.backend === 'webgpu' && !(navigator as Navigator & { gpu?: unknown }).gpu) {
      results.push({ id: p.id, name: p.name, language: p.language, backend: 'webgpu', ok: true, skipped: true });
      LogBus.warn('自检', `⏭ ${p.name} —— 跳过（环境无 WebGPU）`);
      continue;
    }
    try {
      await bridge.loadPreset(p, { silent: true });
      await sleep(250); // 渲染数帧
      const s = useStore.getState();
      const errors = s.passReports.flatMap((r) => r.errors.map((e) => `「${r.name}」L${e.line}: ${e.message}`));
      const ok = s.compileOk === true;
      // 画面亮度采样（仅 WebGL2 后端；全黑/全 NaN 视为可疑）
      const pixel = s.backend === 'webgl2' ? bridge.sampleCenterPixel() : null;
      const bright = pixel ? Math.max(...pixel) : 255;
      results.push({ id: p.id, name: p.name, language: p.language, backend: s.backend, ok, errors, pixel });
      if (ok) {
        if (pixel && bright < 8) LogBus.warn('自检', `✅ ${p.name} 编译通过，⚠️ 画面疑似全黑 (RGB=${pixel})`);
        else LogBus.ok('自检', `✅ ${p.name} [${p.language}] 通过 (${s.backend}, 亮度 ${bright})`);
      } else {
        LogBus.error('自检', `❌ ${p.name} [${p.language}] 失败`, errors.join('\n'));
      }
    } catch (err) {
      results.push({ id: p.id, name: p.name, language: p.language, backend: '-', ok: false, errors: [String(err)] });
      LogBus.error('自检', `❌ ${p.name} 异常`, String(err));
    }
  }

  const passed = results.filter((r) => r.ok && !r.skipped).length;
  const failed = results.filter((r) => !r.ok && !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;
  const summary = { pass: failed === 0, total: results.length, passed, failed, skipped, results };
  (window as unknown as Record<string, unknown>).__SELFTEST__ = summary;
  LogBus.info('自检', `=== 自检完成：${passed} 通过 / ${failed} 失败 / ${skipped} 跳过（共 ${results.length}）===`);
  console.log('[ShaderLab 自检]', summary);
}
