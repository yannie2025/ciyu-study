/**
 * Liquid Glass 视觉材质与无障碍偏好控制器
 * 纯 CSS 光学高光、饱和磨砂与棱镜色散描边方案：
 * - 避免 Chromium/Electron 在 backdrop-filter: url(#svg-filter) 中因 feImage 尺寸不匹配或越界采样产生的坏图；
 * - 100% 适配任意宽高比容器（顶栏、侧边栏、分段器与卡片），在「降低透明度」模式自动安全退化。
 */

import { applyColorTheme } from './themes';
import type { CiyuColorThemeId, CiyuCustomThemeColors } from './types';

const FILTER_SVG_ID = 'ciyu-liquid-glass-defs';

export function ensureLiquidGlassFilter(doc: Document = document): void {
  // 清理旧版本残留的 SVG 位移滤镜节点，防止产生坏图
  const legacy = doc.getElementById(FILTER_SVG_ID);
  if (legacy) legacy.remove();
}

/**
 * 将无障碍与材质偏好应用到指定 .ciyu-ui 根节点
 */
export function applyGlassPreferences(
  root: HTMLElement,
  options: {
    liquidGlass?: boolean;
    reducedTransparency: boolean;
    reducedMotion: boolean;
    edgeRefraction: boolean;
    glassOpacity?: number;
    colorTheme?: CiyuColorThemeId;
    customTheme?: CiyuCustomThemeColors;
  }
): void {
  const glassEnabled =
    (options.liquidGlass ?? !options.reducedTransparency) && !options.reducedTransparency;
  const solidMode = !glassEnabled;

  const enableRefraction = glassEnabled && options.edgeRefraction;
  const rawOpacity = typeof options.glassOpacity === 'number' && Number.isFinite(options.glassOpacity)
    ? Math.max(10, Math.min(100, Math.round(options.glassOpacity)))
    : 42;

  const sig = JSON.stringify([
    glassEnabled,
    options.reducedMotion,
    enableRefraction,
    rawOpacity,
    options.colorTheme ?? 'system',
    options.customTheme ?? null,
  ]);
  if (root.dataset.ciyuGlassSig === sig) return;
  root.dataset.ciyuGlassSig = sig;

  root.classList.toggle('ciyu-reduced-transparency', solidMode);
  root.setAttribute('data-reduced-transparency', solidMode ? 'true' : 'false');
  root.setAttribute('data-liquid-glass', glassEnabled ? 'true' : 'false');

  root.classList.toggle('ciyu-reduced-motion', options.reducedMotion);
  root.setAttribute('data-reduced-motion', options.reducedMotion ? 'true' : 'false');

  root.classList.toggle('ciyu-refraction-enabled', enableRefraction);
  if (glassEnabled && root.ownerDocument) {
    ensureLiquidGlassFilter(root.ownerDocument);
  }

  applyColorTheme(root, options.colorTheme, options.customTheme);

  // iOS 27 高通透 Liquid Glass：采用轻量 GPU 模糊半径（6–12px）显著降低首次渲染与滚动开销
  if (glassEnabled) {
    const glassPct = Math.max(10, Math.min(96, Math.round(rawOpacity * 0.62)));
    const elevatedPct = Math.max(16, Math.min(96, Math.round(rawOpacity * 0.78)));
    const readingPct = Math.max(14, Math.min(96, Math.round(rawOpacity * 0.74)));
    const stickyPct = Math.min(94, Math.max(46, Math.round(rawOpacity * 0.86)));
    const blurPx = Math.round(6 + ((100 - rawOpacity) / 90) * 4);
    const blurHeavyPx = Math.round(8 + ((100 - rawOpacity) / 90) * 4);
    root.style.setProperty('--ciyu-glass-bg', `color-mix(in srgb, var(--ciyu-reading-bg-solid) ${glassPct}%, transparent)`);
    root.style.setProperty('--ciyu-glass-bg-elevated', `color-mix(in srgb, var(--ciyu-reading-bg-solid) ${elevatedPct}%, transparent)`);
    root.style.setProperty('--ciyu-reading-bg', `color-mix(in srgb, var(--ciyu-reading-bg-solid) ${readingPct}%, transparent)`);
    root.style.setProperty('--ciyu-sticky-bg', `color-mix(in srgb, var(--ciyu-reading-bg-solid) ${stickyPct}%, transparent)`);
    root.style.setProperty('--ciyu-glass-blur', `${blurPx}px`);
    root.style.setProperty('--ciyu-glass-blur-heavy', `${blurHeavyPx}px`);
  } else {
    root.style.removeProperty('--ciyu-glass-blur');
    root.style.removeProperty('--ciyu-glass-blur-heavy');
    if (!options.colorTheme || options.colorTheme === 'system') {
      root.style.removeProperty('--ciyu-glass-bg');
      root.style.removeProperty('--ciyu-glass-bg-elevated');
      root.style.removeProperty('--ciyu-reading-bg');
      root.style.removeProperty('--ciyu-sticky-bg');
    }
  }
}
