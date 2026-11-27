/**
 * 词屿 (Ciyu) — 开源配色方案与自定义配色引擎
 * 收录多套经典 MIT / 开源社区配色方案：
 * - Catppuccin (Latte / Mocha) — github.com/catppuccin/catppuccin (MIT)
 * - Nord — github.com/nordtheme/nord (MIT)
 * - Rosé Pine (Dawn / Main) — github.com/rose-pine/rose-pine-theme (MIT)
 * - Everforest (Light / Dark) — github.com/sainnhe/everforest (MIT)
 * - Solarized Light — github.com/altercation/solarized (MIT)
 * 并支持用户任意自定义 4 项核心色值（强调色 / 背景色 / 卡片色 / 正文色），自动推算可读对比度与玻璃质感派生变量。
 */

import type { CiyuColorThemeId, CiyuCustomThemeColors } from './types';

export interface CiyuColorThemePreset {
  id: CiyuColorThemeId;
  name: string;
  tag: string;
  source?: string;
  isDark?: boolean;
  colors?: CiyuCustomThemeColors;
}

export const DEFAULT_CUSTOM_THEME: CiyuCustomThemeColors = {
  accent: '#007aff',
  canvasBg: '#f4f6fb',
  surfaceBg: '#ffffff',
  textPrimary: '#1c1c1e',
};

export const CIYU_COLOR_THEMES: ReadonlyArray<CiyuColorThemePreset> = [
  {
    id: 'system',
    name: '跟随系统（黑白默认）',
    tag: '自适应',
    source: 'Apple System',
  },
  {
    id: 'catppuccin-latte',
    name: 'Catppuccin Latte',
    tag: '柔和浅色',
    source: 'MIT · Catppuccin',
    isDark: false,
    colors: {
      accent: '#1e66f5',
      canvasBg: '#eff1f5',
      surfaceBg: '#ffffff',
      textPrimary: '#4c4f69',
    },
  },
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    tag: '摩卡深色',
    source: 'MIT · Catppuccin',
    isDark: true,
    colors: {
      accent: '#cba6f7',
      canvasBg: '#1e1e2e',
      surfaceBg: '#27273a',
      textPrimary: '#cdd6f4',
    },
  },
  {
    id: 'nord',
    name: 'Nord 极光蓝',
    tag: '北欧深色',
    source: 'MIT · Nord Theme',
    isDark: true,
    colors: {
      accent: '#88c0d0',
      canvasBg: '#2e3440',
      surfaceBg: '#3b4252',
      textPrimary: '#eceff4',
    },
  },
  {
    id: 'rose-pine-dawn',
    name: 'Rosé Pine Dawn',
    tag: '玫瑰晨曦',
    source: 'MIT · Rosé Pine',
    isDark: false,
    colors: {
      accent: '#b4637a',
      canvasBg: '#faf4ed',
      surfaceBg: '#fffaf3',
      textPrimary: '#575279',
    },
  },
  {
    id: 'rose-pine',
    name: 'Rosé Pine 夜色',
    tag: '暗夜柔紫',
    source: 'MIT · Rosé Pine',
    isDark: true,
    colors: {
      accent: '#c4a7e7',
      canvasBg: '#191724',
      surfaceBg: '#1f1d2e',
      textPrimary: '#e0def4',
    },
  },
  {
    id: 'everforest-light',
    name: 'Everforest 浅林',
    tag: '护眼浅绿',
    source: 'MIT · Everforest',
    isDark: false,
    colors: {
      accent: '#3a94c5',
      canvasBg: '#f3efda',
      surfaceBg: '#fdf6e3',
      textPrimary: '#5c6a72',
    },
  },
  {
    id: 'everforest-dark',
    name: 'Everforest 深林',
    tag: '护眼深绿',
    source: 'MIT · Everforest',
    isDark: true,
    colors: {
      accent: '#a7c080',
      canvasBg: '#272e33',
      surfaceBg: '#2f383e',
      textPrimary: '#d3c6aa',
    },
  },
  {
    id: 'solarized-light',
    name: 'Solarized 暖纸',
    tag: '经典暖浅',
    source: 'MIT · Solarized',
    isDark: false,
    colors: {
      accent: '#268bd2',
      canvasBg: '#fdf6e3',
      surfaceBg: '#fffbf0',
      textPrimary: '#586e75',
    },
  },
  {
    id: 'custom',
    name: '自定义配色',
    tag: '自由调色',
    source: 'Custom',
  },
];

const MANAGED_CSS_VARS = [
  '--ciyu-accent',
  '--ciyu-accent-hover',
  '--ciyu-accent-active',
  '--ciyu-accent-soft',
  '--ciyu-accent-soft-strong',
  '--ciyu-accent-border',
  '--ciyu-accent-text',
  '--ciyu-on-accent',
  '--ciyu-canvas-bg',
  '--ciyu-reading-bg',
  '--ciyu-reading-bg-solid',
  '--ciyu-reading-subtle',
  '--ciyu-input-bg',
  '--ciyu-glass-bg',
  '--ciyu-glass-bg-elevated',
  '--ciyu-glass-bg-popover',
  '--ciyu-glass-thumb-bg',
  '--ciyu-glass-pill-bg',
  '--ciyu-glass-pill-hover',
  '--ciyu-sticky-bg',
  '--ciyu-text-primary',
  '--ciyu-text-secondary',
  '--ciyu-text-tertiary',
  '--ciyu-border-subtle',
  '--ciyu-border-outer',
  '--ciyu-border-glass',
  '--ciyu-focus-ring',
] as const;

export function normalizeHexColor(value: string | undefined, fallback: string): string {
  const raw = String(value || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    return (
      '#' +
      raw[1] +
      raw[1] +
      raw[2] +
      raw[2] +
      raw[3] +
      raw[3]
    ).toLowerCase();
  }
  return fallback;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = normalizeHexColor(hex, '#000000').slice(1);
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function mixHex(hexA: string, hexB: string, ratioB: number): string {
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  const t = Math.max(0, Math.min(1, ratioB));
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

function relativeLuminance(hex: string): number {
  const toLin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}

export function resolveThemeColors(
  themeId: CiyuColorThemeId | undefined,
  customColors?: Partial<CiyuCustomThemeColors>
): { isDark: boolean; colors: CiyuCustomThemeColors } | null {
  const id = themeId || 'system';
  if (id === 'system') return null;
  if (id === 'custom') {
    const colors: CiyuCustomThemeColors = {
      accent: normalizeHexColor(customColors?.accent, DEFAULT_CUSTOM_THEME.accent),
      canvasBg: normalizeHexColor(customColors?.canvasBg, DEFAULT_CUSTOM_THEME.canvasBg),
      surfaceBg: normalizeHexColor(customColors?.surfaceBg, DEFAULT_CUSTOM_THEME.surfaceBg),
      textPrimary: normalizeHexColor(customColors?.textPrimary, DEFAULT_CUSTOM_THEME.textPrimary),
    };
    return {
      isDark: relativeLuminance(colors.canvasBg) < 0.34,
      colors,
    };
  }
  const preset = CIYU_COLOR_THEMES.find((t) => t.id === id);
  if (!preset?.colors) return null;
  return {
    isDark: Boolean(preset.isDark),
    colors: preset.colors,
  };
}

export function applyColorTheme(
  root: HTMLElement,
  themeId?: CiyuColorThemeId,
  customColors?: Partial<CiyuCustomThemeColors>
): void {
  const resolved = resolveThemeColors(themeId, customColors);
  if (!resolved) {
    root.removeAttribute('data-color-theme');
    root.removeAttribute('data-theme');
    for (const v of MANAGED_CSS_VARS) {
      root.style.removeProperty(v);
    }
    return;
  }

  const { isDark, colors } = resolved;
  const { accent, canvasBg, surfaceBg, textPrimary } = colors;
  const accentLum = relativeLuminance(accent);
  const onAccent = accentLum > 0.45 ? '#1c1c1e' : '#ffffff';
  const accentHover = isDark ? mixHex(accent, '#ffffff', 0.14) : mixHex(accent, '#000000', 0.12);
  const accentActive = isDark ? mixHex(accent, '#000000', 0.14) : mixHex(accent, '#000000', 0.22);
  const accentText = isDark
    ? mixHex(accent, '#ffffff', 0.12)
    : accentLum > 0.45
      ? mixHex(accent, '#000000', 0.28)
      : accent;

  const textSecondary = mixHex(textPrimary, surfaceBg, isDark ? 0.3 : 0.34);
  const textTertiary = mixHex(textPrimary, surfaceBg, isDark ? 0.52 : 0.54);
  const readingSubtle = mixHex(surfaceBg, textPrimary, isDark ? 0.08 : 0.05);

  root.setAttribute('data-color-theme', themeId || 'custom');
  root.setAttribute('data-theme', isDark ? 'dark' : 'light');

  const vars: Record<(typeof MANAGED_CSS_VARS)[number], string> = {
    '--ciyu-accent': accent,
    '--ciyu-accent-hover': accentHover,
    '--ciyu-accent-active': accentActive,
    '--ciyu-accent-soft': rgba(accent, isDark ? 0.2 : 0.12),
    '--ciyu-accent-soft-strong': rgba(accent, isDark ? 0.3 : 0.2),
    '--ciyu-accent-border': rgba(accent, isDark ? 0.42 : 0.3),
    '--ciyu-accent-text': accentText,
    '--ciyu-on-accent': onAccent,
    '--ciyu-canvas-bg': canvasBg,
    '--ciyu-reading-bg': rgba(surfaceBg, isDark ? 0.88 : 0.86),
    '--ciyu-reading-bg-solid': surfaceBg,
    '--ciyu-reading-subtle': readingSubtle,
    '--ciyu-input-bg': rgba(surfaceBg, isDark ? 0.72 : 0.78),
    '--ciyu-glass-bg': rgba(surfaceBg, isDark ? 0.68 : 0.64),
    '--ciyu-glass-bg-elevated': rgba(surfaceBg, isDark ? 0.82 : 0.78),
    '--ciyu-glass-bg-popover': rgba(surfaceBg, isDark ? 0.94 : 0.94),
    '--ciyu-glass-thumb-bg': isDark ? mixHex(surfaceBg, '#ffffff', 0.12) : surfaceBg,
    '--ciyu-glass-pill-bg': rgba(textPrimary, isDark ? 0.1 : 0.07),
    '--ciyu-glass-pill-hover': rgba(textPrimary, isDark ? 0.16 : 0.12),
    '--ciyu-sticky-bg': rgba(surfaceBg, 0.94),
    '--ciyu-text-primary': textPrimary,
    '--ciyu-text-secondary': textSecondary,
    '--ciyu-text-tertiary': textTertiary,
    '--ciyu-border-subtle': rgba(textPrimary, isDark ? 0.14 : 0.12),
    '--ciyu-border-outer': rgba(textPrimary, isDark ? 0.2 : 0.15),
    '--ciyu-border-glass': rgba(isDark ? '#ffffff' : '#ffffff', isDark ? 0.14 : 0.78),
    '--ciyu-focus-ring': `0 0 0 2px ${rgba(surfaceBg, 0.92)}, 0 0 0 4px ${rgba(accent, 0.5)}`,
  };

  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, v);
  }
}
