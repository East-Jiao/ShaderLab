// 预设注册表
import type { Preset, PresetCategory } from '../engine/types';
import { fullscreenPresets } from './fullscreen-presets';
import { meshPresets } from './mesh-presets';
import { postPresets } from './post-presets';
import { extraPresets } from './extra-presets';

export const CATEGORY_META: Record<PresetCategory, { label: string; icon: string }> = {
  fullscreen: { label: '2D / 全屏', icon: '▤' },
  material: { label: '3D 材质', icon: '◈' },
  post: { label: '后处理', icon: '▦' },
};

export function getAllPresets(): Preset[] {
  return [...fullscreenPresets, ...meshPresets, ...postPresets, ...extraPresets];
}

export function findPreset(id: string): Preset | undefined {
  return getAllPresets().find((p) => p.id === id);
}

export function presetsByCategory(cat: PresetCategory): Preset[] {
  return getAllPresets().filter((p) => p.category === cat);
}
