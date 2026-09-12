// 语言注册表 + 第三方扩展 API（window.ShaderLabAPI）
import type { LanguageDescriptor, PassDef, SceneConfig } from '../engine/types';

type Listener = () => void;

class LanguageRegistry {
  private langs = new Map<string, LanguageDescriptor>();
  private listeners = new Set<Listener>();

  register(d: LanguageDescriptor) {
    if (this.langs.has(d.id)) console.warn(`[LanguageRegistry] 覆盖已存在的语言: ${d.id}`);
    this.langs.set(d.id, d);
    this.listeners.forEach((l) => l());
  }

  get(id: string): LanguageDescriptor | undefined {
    return this.langs.get(id);
  }

  require(id: string): LanguageDescriptor {
    const d = this.langs.get(id);
    if (!d) throw new Error(`未知语言: ${id}`);
    return d;
  }

  all(): LanguageDescriptor[] {
    return [...this.langs.values()];
  }

  onChange(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

export const languages = new LanguageRegistry();

/** 把用户 pass 翻译为内核 GLSL 的辅助类型 */
export interface TranslateResult {
  passes: PassDef[];
}

export function unsupported(scene: SceneConfig, need: string): PassDef {
  return {
    name: '不支持',
    vs: '',
    fs: `#error 此语言仅支持 ${need} 场景\nvoid main(){} `,
  };
}

// 暴露给第三方/控制台的插件 API
export function installPublicAPI(extra: Record<string, unknown> = {}) {
  (window as unknown as Record<string, unknown>).ShaderLabAPI = {
    registerLanguage: (d: LanguageDescriptor) => languages.register(d),
    listLanguages: () => languages.all().map((l) => ({ id: l.id, label: l.label, backend: l.backend })),
    ...extra,
  };
}
