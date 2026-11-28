import { el } from './dom';
import { createIcon, type IconName } from './icons';

export type CiyuToastTone = 'success' | 'error' | 'warning' | 'info';

export interface CiyuToastOptions {
  duration?: number;
  tone?: CiyuToastTone;
}

export interface CiyuToastHandle {
  hide: () => void;
  setMessage: (nextMessage: string) => void;
}

interface ActiveToast {
  id: number;
  node: HTMLDivElement;
  textEl: HTMLSpanElement;
  timer: number | null;
  remainingMs: number;
  startedAt: number;
  dismissed: boolean;
}

let toasterEl: HTMLDivElement | null = null;
let toastSeq = 0;
let isExpanded = false;
const activeToasts: ActiveToast[] = [];
const MAX_VISIBLE = 4;

function inferTone(message: string): CiyuToastTone {
  const m = message.trim();
  if (/失败|错误|异常|无法|超时|未找到|校验失败|出错/u.test(m)) return 'error';
  if (/请先|尚未|没有|无需|已存在|正在进行|为空/u.test(m)) return 'warning';
  if (/已|完成|成功|恢复|合并|插入|保存|复制|导入|导出|更新/u.test(m)) return 'success';
  return 'info';
}

function toneIcon(tone: CiyuToastTone): IconName {
  switch (tone) {
    case 'success':
      return 'check-circle-2';
    case 'error':
      return 'alert-circle';
    case 'warning':
      return 'alert-circle';
    case 'info':
      return 'sparkles';
  }
}

function syncToasterTheme(host: HTMLDivElement): void {
  const body = document.body;
  const isDark = body.classList.contains('theme-dark');
  const sample = document.querySelector<HTMLElement>('.ciyu-ui:not(.ciyu-sonner-toaster)');
  const sampleTheme = sample?.getAttribute('data-theme');
  const resolvedDark = sampleTheme ? sampleTheme === 'dark' : isDark;

  host.classList.toggle('theme-dark', resolvedDark);
  host.setAttribute('data-theme', resolvedDark ? 'dark' : 'light');

  const themeVars = [
    '--ciyu-accent',
    '--ciyu-accent-soft',
    '--ciyu-accent-text',
    '--ciyu-reading-bg-solid',
    '--ciyu-glass-bg-elevated',
    '--ciyu-text-primary',
    '--ciyu-text-secondary',
    '--ciyu-text-tertiary',
    '--ciyu-border-outer',
  ];

  if (sample) {
    const reducedMotion = sample.getAttribute('data-reduced-motion') === 'true';
    const reducedTrans = sample.getAttribute('data-reduced-transparency') === 'true';
    const uiStyle = sample.getAttribute('data-ui-style') || 'apple';
    host.setAttribute('data-ui-style', uiStyle);
    host.classList.toggle('ciyu-reduced-motion', reducedMotion);
    host.setAttribute('data-reduced-motion', String(reducedMotion));
    host.classList.toggle('ciyu-reduced-transparency', reducedTrans);
    host.setAttribute('data-reduced-transparency', String(reducedTrans));
    for (const v of themeVars) {
      const val = sample.style.getPropertyValue(v);
      if (val) host.style.setProperty(v, val);
      else host.style.removeProperty(v);
    }
  }
}

function ensureToaster(): HTMLDivElement | null {
  if (typeof document === 'undefined' || !document.body) return null;
  if (toasterEl && document.body.contains(toasterEl)) {
    syncToasterTheme(toasterEl);
    return toasterEl;
  }
  const host = el('div', 'ciyu-ui ciyu-sonner-toaster');
  host.setAttribute('role', 'region');
  host.setAttribute('aria-label', '词屿通知');
  host.setAttribute('aria-live', 'polite');

  host.addEventListener('mouseenter', () => {
    isExpanded = true;
    host.dataset.expanded = 'true';
    pauseAllTimers();
    layoutStack();
  });
  host.addEventListener('mouseleave', () => {
    isExpanded = false;
    delete host.dataset.expanded;
    resumeAllTimers();
    layoutStack();
  });

  syncToasterTheme(host);
  document.body.appendChild(host);
  toasterEl = host;
  return host;
}

function pauseAllTimers(): void {
  const now = Date.now();
  for (const t of activeToasts) {
    if (t.timer !== null) {
      window.clearTimeout(t.timer);
      t.timer = null;
      const elapsed = now - t.startedAt;
      t.remainingMs = Math.max(800, t.remainingMs - elapsed);
    }
  }
}

function resumeAllTimers(): void {
  const now = Date.now();
  for (const t of activeToasts) {
    if (!t.dismissed && t.remainingMs > 0 && t.timer === null) {
      t.startedAt = now;
      t.timer = window.setTimeout(() => dismissToast(t), t.remainingMs);
    }
  }
}

function layoutStack(): void {
  let cumulativeOffset = 0;
  // 最新项在数组末尾，排在最前端（index = 0）
  for (let i = activeToasts.length - 1, visualIdx = 0; i >= 0; i--, visualIdx++) {
    const item = activeToasts[i];
    item.node.style.setProperty('--ciyu-toast-index', String(visualIdx));
    item.node.style.zIndex = String(100 - visualIdx);
    if (visualIdx >= MAX_VISIBLE) {
      item.node.dataset.hidden = 'true';
    } else {
      delete item.node.dataset.hidden;
    }
    if (isExpanded) {
      item.node.style.setProperty('--ciyu-toast-y', `${-cumulativeOffset}px`);
      const h = item.node.offsetHeight || 44;
      cumulativeOffset += h + 8;
    } else {
      item.node.style.setProperty('--ciyu-toast-y', `${-visualIdx * 10}px`);
    }
  }
}

function dismissToast(item: ActiveToast): void {
  if (item.dismissed) return;
  item.dismissed = true;
  if (item.timer !== null) {
    window.clearTimeout(item.timer);
    item.timer = null;
  }
  const idx = activeToasts.indexOf(item);
  if (idx >= 0) activeToasts.splice(idx, 1);
  item.node.dataset.leaving = 'true';
  layoutStack();
  window.setTimeout(() => {
    item.node.remove();
    if (activeToasts.length === 0 && toasterEl) {
      delete toasterEl.dataset.expanded;
      isExpanded = false;
    }
  }, 240);
}

/**
 * 弹出一条 Sonner 风格 Liquid Glass 轻提示（支持堆叠、悬停展开、右滑关闭）
 */
export function showCiyuToast(
  message: string,
  options: CiyuToastOptions = {}
): CiyuToastHandle | null {
  const host = ensureToaster();
  if (!host) return null;

  const text = String(message ?? '').trim();
  if (!text) return null;

  const tone = options.tone ?? inferTone(text);
  const duration =
    typeof options.duration === 'number'
      ? options.duration === 0
        ? 0
        : Math.max(1200, options.duration)
      : 3600;

  const node = el('div', `ciyu-sonner-toast ciyu-sonner-toast--${tone}`);
  node.setAttribute('role', 'status');

  const iconWrap = el('span', `ciyu-sonner-icon ciyu-sonner-icon--${tone}`);
  iconWrap.setAttribute('aria-hidden', 'true');
  iconWrap.appendChild(createIcon(toneIcon(tone), 'sm'));

  const textEl = el('span', 'ciyu-sonner-text', text);

  const closeBtn = el('button', 'ciyu-sonner-close');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', '关闭提示');
  closeBtn.appendChild(createIcon('x', 'sm'));

  node.append(iconWrap, textEl, closeBtn);
  if (duration > 0) {
    const bar = el('span', 'ciyu-sonner-progress');
    bar.setAttribute('aria-hidden', 'true');
    bar.style.setProperty('--ciyu-toast-duration', `${duration}ms`);
    node.appendChild(bar);
  }
  host.appendChild(node);

  const item: ActiveToast = {
    id: ++toastSeq,
    node,
    textEl,
    timer: null,
    remainingMs: duration,
    startedAt: Date.now(),
    dismissed: false,
  };

  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dismissToast(item);
  });

  // 支持向右轻滑关闭（Sonner 手势交互）
  let swipeStartX = 0;
  let swiping = false;
  node.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || (e.target as HTMLElement)?.closest('.ciyu-sonner-close')) return;
    swipeStartX = e.clientX;
    swiping = true;
    try {
      node.setPointerCapture(e.pointerId);
    } catch {}
  });
  node.addEventListener('pointermove', (e) => {
    if (!swiping) return;
    const dx = Math.max(0, e.clientX - swipeStartX);
    if (dx > 2) {
      node.style.setProperty('--ciyu-toast-swipe-x', `${dx}px`);
    }
  });
  const endSwipe = (e: PointerEvent) => {
    if (!swiping) return;
    swiping = false;
    try {
      if (node.hasPointerCapture?.(e.pointerId)) node.releasePointerCapture(e.pointerId);
    } catch {}
    const dx = Math.max(0, e.clientX - swipeStartX);
    if (dx > 48) {
      dismissToast(item);
    } else {
      node.style.removeProperty('--ciyu-toast-swipe-x');
    }
  };
  node.addEventListener('pointerup', endSwipe);
  node.addEventListener('pointercancel', endSwipe);

  activeToasts.push(item);
  // 超出最大缓存条数时平滑淘汰最早一条
  if (activeToasts.length > MAX_VISIBLE + 1) {
    dismissToast(activeToasts[0]);
  }

  requestAnimationFrame(() => {
    node.dataset.mounted = 'true';
    layoutStack();
  });

  if (duration > 0 && !isExpanded) {
    item.startedAt = Date.now();
    item.timer = window.setTimeout(() => dismissToast(item), duration);
  }

  return {
    hide() {
      dismissToast(item);
    },
    setMessage(nextMessage: string) {
      textEl.textContent = String(nextMessage ?? '');
      layoutStack();
    },
  };
}

export function destroyCiyuToasts(): void {
  while (activeToasts.length > 0) {
    const t = activeToasts.pop()!;
    if (t.timer !== null) window.clearTimeout(t.timer);
    t.node.remove();
  }
  if (toasterEl) {
    toasterEl.remove();
    toasterEl = null;
  }
  isExpanded = false;
}
