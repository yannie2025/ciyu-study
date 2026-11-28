import { el } from '../dom';
import { createIcon, type IconName } from '../icons';
import { normalizeDragVelocity } from '../promotion';
import type { CiyuTabId, UIComponentHandle } from '../types';

export interface SegmentedNavProps {
  activeTab: CiyuTabId;
  dueTodayCount: number;
}

export interface SegmentedNavCallbacks {
  onTabChange?: (tab: CiyuTabId) => void;
}

const NAV_ITEMS: ReadonlyArray<{
  id: CiyuTabId;
  label: string;
  fullLabel: string;
  icon: IconName;
}> = [
  { id: 'lookup', label: '查词', fullLabel: '查词', icon: 'search' },
  { id: 'vocabulary', label: '生词', fullLabel: '生词本', icon: 'book-open' },
  { id: 'review', label: '复习', fullLabel: '今日复习', icon: 'layers' },
  { id: 'archive', label: '归档', fullLabel: '每日归档', icon: 'calendar-days' },
  { id: 'exams', label: '题库', fullLabel: '六级题库', icon: 'file-text' },
];

/**
 * 分段导航控件（iOS 26 / macOS 风格 Liquid Glass 交互式可拖拽液态玻璃胶囊）
 * 支持点击弹簧滑移，以及按住拖动时的液态玻璃放大折射、速度拉伸形变与吸附回弹。
 */
export function createSegmentedNav(
  initialProps: SegmentedNavProps,
  callbacks: SegmentedNavCallbacks = {}
): UIComponentHandle<SegmentedNavProps> {
  let props = initialProps;
  const nav = el('nav', 'ciyu-glass ciyu-glass-refract ciyu-segmented');
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', '词屿主导航');

  // 悬浮液态玻璃透镜层（独立于按钮，支持按住拖动实时折射形变与弹簧吸附）
  const lens = el('div', 'ciyu-seg-lens');
  lens.setAttribute('aria-hidden', 'true');
  nav.appendChild(lens);

  const buttons: HTMLButtonElement[] = [];
  let reviewBadgeEl: HTMLSpanElement | null = null;

  NAV_ITEMS.forEach((item, index) => {
    const btn = el('button', 'ciyu-seg-btn');
    btn.type = 'button';
    btn.dataset.tabId = item.id;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-label', item.fullLabel);
    btn.title = item.fullLabel;
    btn.appendChild(createIcon(item.icon, 'sm'));
    btn.appendChild(el('span', undefined, item.label));

    if (item.id === 'review') {
      reviewBadgeEl = el('span', 'ciyu-seg-badge');
      reviewBadgeEl.hidden = true;
      btn.appendChild(reviewBadgeEl);
    }

    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const delta = e.key === 'ArrowRight' ? 1 : -1;
        const nextIdx = (index + delta + NAV_ITEMS.length) % NAV_ITEMS.length;
        const next = NAV_ITEMS[nextIdx];
        callbacks.onTabChange?.(next.id);
        requestAnimationFrame(() => buttons[nextIdx]?.focus());
      }
    });

    buttons.push(btn);
    nav.appendChild(btn);
  });

  function activeIndex(): number {
    return NAV_ITEMS.findIndex((i) => i.id === props.activeTab);
  }

  function positionLensToIndex(index: number, instant = false): void {
    if (index < 0) {
      lens.style.opacity = '0';
      return;
    }
    const targetBtn = buttons[index];
    if (!targetBtn) return;
    lens.style.opacity = '';
    const navRect = nav.getBoundingClientRect();
    const btnRect = targetBtn.getBoundingClientRect();
    if (navRect.width <= 0 || btnRect.width <= 0) {
      // 未挂载或不可见时用百分比兜底
      const pct = 100 / NAV_ITEMS.length;
      lens.style.width = `calc(${pct}% - 4px)`;
      lens.style.transform = `translate3d(calc(${index * 100}% + ${index * 2}px), 0, 0) scale(1, 1)`;
      return;
    }
    const left = btnRect.left - navRect.left;
    const width = btnRect.width;
    if (instant) {
      lens.style.transition = 'none';
    } else {
      lens.style.transition = '';
    }
    lens.style.width = `${width}px`;
    lens.style.transform = `translate3d(${left}px, 0, 0) scale(1, 1)`;
    if (instant) {
      void lens.offsetWidth;
      lens.style.transition = '';
    }
  }

  function syncSelection(instantLens = false): void {
    const idx = activeIndex();
    buttons.forEach((btn, i) => {
      const selected = i === idx;
      btn.setAttribute('aria-selected', String(selected));
      btn.tabIndex = (idx >= 0 ? selected : i === 0) ? 0 : -1;
      delete btn.dataset.dragHover;
    });
    if (reviewBadgeEl) {
      if (props.dueTodayCount > 0) {
        reviewBadgeEl.hidden = false;
        reviewBadgeEl.textContent = props.dueTodayCount > 99 ? '99+' : String(props.dueTodayCount);
        reviewBadgeEl.setAttribute('aria-label', `今日待复习 ${props.dueTodayCount} 项`);
      } else {
        reviewBadgeEl.hidden = true;
      }
    }
    if (!isDragging) {
      positionLensToIndex(idx, instantLens);
    }
  }

  // ---------- Liquid Glass 按住拖动 & 单击跨项弹簧滑移 ----------
  let pointerDown = false;
  let isDragging = false;
  let activePointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let hoveredIdx = -1;
  let settleRaf: number | null = null;
  let holdTimer: number | null = null;
  let glideTimer: number | null = null;
  let suppressNextClick = false;

  function triggerGlideHighlight(): void {
    nav.dataset.gliding = 'true';
    if (glideTimer) window.clearTimeout(glideTimer);
    glideTimer = window.setTimeout(() => {
      delete nav.dataset.gliding;
      glideTimer = null;
    }, 360);
  }

  let cachedNavRect: DOMRect | null = null;
  let cachedBtnRects: Array<{ left: number; width: number }> = [];

  function cacheNavGeometry(): void {
    cachedNavRect = nav.getBoundingClientRect();
    cachedBtnRects = buttons.map((b) => {
      const r = b.getBoundingClientRect();
      return { left: r.left - cachedNavRect!.left, width: r.width };
    });
  }

  function enterDragMode(clientX: number): void {
    if (isDragging) return;
    isDragging = true;
    lens.style.opacity = '';
    nav.dataset.dragging = 'true';
    delete nav.dataset.gliding;
    updateDragLens(clientX, 0);
  }

  function indexFromClientX(clientX: number): number {
    const navRect = cachedNavRect ?? nav.getBoundingClientRect();
    if (navRect.width <= 0) return activeIndex();
    const rel = Math.max(0, Math.min(navRect.width - 1, clientX - navRect.left));
    const idx = Math.floor((rel / navRect.width) * NAV_ITEMS.length);
    return Math.max(0, Math.min(NAV_ITEMS.length - 1, idx));
  }

  function updateDragLens(clientX: number, velocityX: number): void {
    const navRect = cachedNavRect ?? nav.getBoundingClientRect();
    if (navRect.width <= 0) return;
    const pad = 3;
    const firstCached = cachedBtnRects[0];
    const lensW = firstCached ? firstCached.width : (navRect.width - pad * 2) / NAV_ITEMS.length;
    const minLeft = firstCached ? firstCached.left : pad;
    const lastCached = cachedBtnRects[cachedBtnRects.length - 1];
    const maxLeft = lastCached ? lastCached.left : Math.max(minLeft, navRect.width - lensW - pad);
    const rawLeft = clientX - navRect.left - lensW / 2;

    // 边缘橡皮筋弹性阻尼
    let clampedLeft = rawLeft;
    if (rawLeft < minLeft) {
      clampedLeft = minLeft - Math.min(8, (minLeft - rawLeft) * 0.22);
    } else if (rawLeft > maxLeft) {
      clampedLeft = maxLeft + Math.min(8, (rawLeft - maxLeft) * 0.22);
    }

    // 速度驱动液态玻璃拉伸/回弹形变（快拖微拉长、慢拖如水滴饱满隆起）
    const speed = Math.min(28, Math.abs(velocityX));
    const scaleX = 1.07 + speed * 0.0055;
    const scaleY = 1.13 - speed * 0.0022;
    const sheenPct = Math.max(15, Math.min(85, ((clientX - navRect.left) / navRect.width) * 100));

    lens.style.width = `${lensW}px`;
    lens.style.setProperty('--ciyu-lens-sheen-x', `${sheenPct.toFixed(1)}%`);
    lens.style.transform = `translate3d(${clampedLeft.toFixed(1)}px, 0, 0) scale(${scaleX.toFixed(3)}, ${scaleY.toFixed(3)})`;

    const nextHover = indexFromClientX(clientX);
    if (nextHover !== hoveredIdx) {
      hoveredIdx = nextHover;
      buttons.forEach((btn, i) => {
        if (i === hoveredIdx) btn.dataset.dragHover = 'true';
        else delete btn.dataset.dragHover;
      });
    }
  }

  let lastMoveTime = 0;
  const onWinPointerMove = (e: PointerEvent) => {
    if (!pointerDown || activePointerId !== e.pointerId) return;
    // 在窗口外松开鼠标后再移回时，buttons 变为 0，立即完成吸附切换
    if (e.pointerType === 'mouse' && e.buttons === 0) {
      finishPointer(e, true);
      return;
    }
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dt = lastMoveTime > 0 ? now - lastMoveTime : 16.67;
    lastMoveTime = now;
    const vx = normalizeDragVelocity(e.clientX - lastX, dt);
    lastX = e.clientX;
    if (!isDragging && Math.hypot(e.clientX - startX, e.clientY - startY) > 5) {
      if (holdTimer) {
        window.clearTimeout(holdTimer);
        holdTimer = null;
      }
      enterDragMode(e.clientX);
      return;
    }
    if (!isDragging) return;
    if (settleRaf) cancelAnimationFrame(settleRaf);
    const cx = e.clientX;
    settleRaf = requestAnimationFrame(() => {
      if (!isDragging) return;
      updateDragLens(cx, vx);
    });
  };

  const onWinPointerUp = (e: PointerEvent) => finishPointer(e, true);
  const onWinPointerCancel = (e: PointerEvent) => finishPointer(e, false);
  const onWinBlur = () => {
    if (!pointerDown) return;
    const commitIdx = hoveredIdx >= 0 ? hoveredIdx : indexFromClientX(lastX);
    detachGlobalPointerListeners();
    pointerDown = false;
    isDragging = false;
    activePointerId = null;
    if (holdTimer) { window.clearTimeout(holdTimer); holdTimer = null; }
    if (settleRaf) { cancelAnimationFrame(settleRaf); settleRaf = null; }
    delete nav.dataset.dragging;
    buttons.forEach((btn) => delete btn.dataset.dragHover);
    hoveredIdx = -1;
    positionLensToIndex(commitIdx, false);
    const targetItem = NAV_ITEMS[commitIdx];
    if (targetItem && targetItem.id !== props.activeTab) {
      callbacks.onTabChange?.(targetItem.id);
    }
  };

  function attachGlobalPointerListeners(): void {
    window.addEventListener('pointermove', onWinPointerMove, true);
    window.addEventListener('pointerup', onWinPointerUp, true);
    window.addEventListener('pointercancel', onWinPointerCancel, true);
    window.addEventListener('blur', onWinBlur);
  }

  function detachGlobalPointerListeners(): void {
    window.removeEventListener('pointermove', onWinPointerMove, true);
    window.removeEventListener('pointerup', onWinPointerUp, true);
    window.removeEventListener('pointercancel', onWinPointerCancel, true);
    window.removeEventListener('blur', onWinBlur);
  }

  nav.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0) return;
    cacheNavGeometry();
    pointerDown = true;
    isDragging = false;
    activePointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    lastX = e.clientX;
    lastMoveTime = 0;
    hoveredIdx = -1;
    try { nav.setPointerCapture(e.pointerId); } catch {}
    attachGlobalPointerListeners();

    // 长按 160ms（不移动）也进入液态玻璃水滴隆起态；快速单击则保持在原位置，松手后完整滑移
    if (holdTimer) window.clearTimeout(holdTimer);
    const downX = e.clientX;
    holdTimer = window.setTimeout(() => {
      holdTimer = null;
      if (pointerDown && !isDragging) {
        enterDragMode(downX);
      }
    }, 160);
  });

  const finishPointer = (e: PointerEvent, commit: boolean) => {
    if (!pointerDown || activePointerId !== e.pointerId) return;
    detachGlobalPointerListeners();
    const wasDragging = isDragging;
    pointerDown = false;
    isDragging = false;
    activePointerId = null;
    if (holdTimer) {
      window.clearTimeout(holdTimer);
      holdTimer = null;
    }
    if (settleRaf) {
      cancelAnimationFrame(settleRaf);
      settleRaf = null;
    }
    delete nav.dataset.dragging;
    try {
      if (nav.hasPointerCapture?.(e.pointerId)) nav.releasePointerCapture(e.pointerId);
    } catch {}

    const prevIdx = activeIndex();
    const targetIdx = commit ? indexFromClientX(e.clientX) : prevIdx;
    cachedNavRect = null;
    cachedBtnRects = [];
    buttons.forEach((btn) => delete btn.dataset.dragHover);
    hoveredIdx = -1;

    suppressNextClick = true;
    window.setTimeout(() => { suppressNextClick = false; }, 0);

    const targetItem = NAV_ITEMS[targetIdx];
    if (!wasDragging && targetIdx !== prevIdx) {
      // 单击切换：玻璃胶囊从上一个页签平滑弹簧滑移到目标页签
      triggerGlideHighlight();
    }
    positionLensToIndex(targetIdx, false);
    if (commit && targetItem && targetItem.id !== props.activeTab) {
      callbacks.onTabChange?.(targetItem.id);
    }
  };

  // 键盘回车或辅助工具直接触发 click 时仍正常带滑移动画切换
  buttons.forEach((btn, i) => {
    btn.addEventListener('click', (e) => {
      if (suppressNextClick) {
        e.preventDefault();
        return;
      }
      const item = NAV_ITEMS[i];
      if (props.activeTab !== item.id) {
        triggerGlideHighlight();
        positionLensToIndex(i, false);
        callbacks.onTabChange?.(item.id);
      }
    });
  });

  let resizeObs: ResizeObserver | null = null;
  if (typeof ResizeObserver === 'function') {
    resizeObs = new ResizeObserver(() => {
      if (!isDragging) positionLensToIndex(activeIndex(), true);
    });
    resizeObs.observe(nav);
  }

  syncSelection(true);
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => positionLensToIndex(activeIndex(), true));
  }

  return {
    element: nav,
    update(nextProps) {
      const prevTab = props.activeTab;
      props = nextProps;
      if (prevTab !== props.activeTab && !isDragging) {
        triggerGlideHighlight();
      }
      syncSelection(false);
    },
    destroy() {
      detachGlobalPointerListeners();
      if (holdTimer) window.clearTimeout(holdTimer);
      if (glideTimer) window.clearTimeout(glideTimer);
      if (settleRaf) cancelAnimationFrame(settleRaf);
      resizeObs?.disconnect();
      resizeObs = null;
      nav.remove();
    },
  };
}
