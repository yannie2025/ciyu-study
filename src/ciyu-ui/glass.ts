/**
 * 轻量级液态玻璃边缘折射 SVG 滤镜注入器
 * 灵感源自 MIT 协议开源项目 librecosta/liquid-glass 的 SVG feDisplacementMap 折射思路。
 * 特点：
 * - 仅在支持 Chromium/Electron SVG backdrop-filter 的环境中启用轻微光学折射；
 * - 严格保持低位移幅度（scale=6），仅用于壳层边缘质感，绝不干扰正文阅读；
 * - 在降低透明度或不支持环境中自动安全退化。
 */

import { applyColorTheme } from './themes';
import type { CiyuColorThemeId, CiyuCustomThemeColors } from './types';

const FILTER_SVG_ID = 'ciyu-liquid-glass-defs';

export function ensureLiquidGlassFilter(doc: Document = document): void {
  if (doc.getElementById(FILTER_SVG_ID)) return;

  const ns = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(ns, 'svg');
  svg.setAttribute('id', FILTER_SVG_ID);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'fixed';
  svg.style.pointerEvents = 'none';
  svg.style.opacity = '0';

  svg.innerHTML = `
    <defs>
      <filter
        id="ciyu-liquid-refract"
        x="-12%"
        y="-12%"
        width="124%"
        height="124%"
        color-interpolation-filters="sRGB"
      >
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.008 0.012"
          numOctaves="2"
          seed="7"
          result="glassNoise"
        />
        <feGaussianBlur in="glassNoise" stdDeviation="7" result="softLens" />
        <feDisplacementMap
          in="SourceGraphic"
          in2="softLens"
          scale="6"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    </defs>
  `;

  doc.body.appendChild(svg);
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

  root.classList.toggle('ciyu-reduced-transparency', solidMode);
  root.setAttribute('data-reduced-transparency', solidMode ? 'true' : 'false');
  root.setAttribute('data-liquid-glass', glassEnabled ? 'true' : 'false');

  root.classList.toggle('ciyu-reduced-motion', options.reducedMotion);
  root.setAttribute('data-reduced-motion', options.reducedMotion ? 'true' : 'false');

  const enableRefraction = glassEnabled && options.edgeRefraction;
  root.classList.toggle('ciyu-refraction-enabled', enableRefraction);
  if (enableRefraction && root.ownerDocument) {
    ensureLiquidGlassFilter(root.ownerDocument);
  }

  const rawOpacity = typeof options.glassOpacity === 'number' && Number.isFinite(options.glassOpacity)
    ? Math.max(20, Math.min(100, Math.round(options.glassOpacity)))
    : 68;

  applyColorTheme(root, options.colorTheme, options.customTheme);

  // 在开启 Liquid Glass 时，按用户自定义的玻璃不透明度动态调节所有玻璃与卡片表面透底程度
  if (glassEnabled) {
    const elevatedPct = Math.min(98, rawOpacity + 12);
    const readingPct = Math.min(98, rawOpacity + 18);
    const stickyPct = Math.min(98, Math.max(76, rawOpacity + 24));
    const blurPx = Math.round(8 + ((100 - rawOpacity) / 80) * 12);
    root.style.setProperty('--ciyu-glass-bg', `color-mix(in srgb, var(--ciyu-reading-bg-solid) ${rawOpacity}%, transparent)`);
    root.style.setProperty('--ciyu-glass-bg-elevated', `color-mix(in srgb, var(--ciyu-reading-bg-solid) ${elevatedPct}%, transparent)`);
    root.style.setProperty('--ciyu-reading-bg', `color-mix(in srgb, var(--ciyu-reading-bg-solid) ${readingPct}%, transparent)`);
    root.style.setProperty('--ciyu-sticky-bg', `color-mix(in srgb, var(--ciyu-reading-bg-solid) ${stickyPct}%, transparent)`);
    root.style.setProperty('--ciyu-glass-blur', `${blurPx}px`);
  } else {
    root.style.removeProperty('--ciyu-glass-blur');
    if (!options.colorTheme || options.colorTheme === 'system') {
      root.style.removeProperty('--ciyu-glass-bg');
      root.style.removeProperty('--ciyu-glass-bg-elevated');
      root.style.removeProperty('--ciyu-reading-bg');
      root.style.removeProperty('--ciyu-sticky-bg');
    }
  }
}
