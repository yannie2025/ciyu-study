import { CIYU_CHANGELOG, CIYU_CHANGELOG_FOREWORD, CIYU_VERSION } from '../changelog';
import { el } from '../dom';
import { createBrandLogo, createIcon, type IconName } from '../icons';
import { getProMotionState, probeDisplayRefreshRate, subscribeProMotion } from '../promotion';
import { CIYU_COLOR_THEMES, DEFAULT_CUSTOM_THEME, normalizeHexColor } from '../themes';
import { showCiyuToast } from '../toast';
import type {
  CiyuCustomThemeColors,
  OllamaConnectionStatus,
  SettingsViewCallbacks,
  SettingsViewProps,
  UIComponentHandle,
} from '../types';

type AppleSettingsCategory = 'appearance' | 'dictionaries' | 'speech' | 'model' | 'vault' | 'about';
type SquircleTone = 'blue' | 'cyan' | 'pink' | 'indigo' | 'purple' | 'orange' | 'green' | 'gray';

function connectionMeta(status: OllamaConnectionStatus): {
  label: string;
  pillClass: string;
  dotClass: string;
} {
  switch (status) {
    case 'connected':
      return {
        label: '已连接',
        pillClass: 'ciyu-status-pill ciyu-status-pill--ok',
        dotClass: 'ciyu-status-dot ciyu-status-dot--ok',
      };
    case 'checking':
      return {
        label: '检测中…',
        pillClass: 'ciyu-status-pill ciyu-status-pill--warn',
        dotClass: 'ciyu-status-dot ciyu-status-dot--warn',
      };
    case 'disconnected':
      return {
        label: '未连接',
        pillClass: 'ciyu-status-pill ciyu-status-pill--error',
        dotClass: 'ciyu-status-dot ciyu-status-dot--error',
      };
    case 'error':
      return {
        label: '连接异常',
        pillClass: 'ciyu-status-pill ciyu-status-pill--error',
        dotClass: 'ciyu-status-dot ciyu-status-dot--error',
      };
  }
}

function createSquircleIcon(icon: IconName, tone: SquircleTone): HTMLSpanElement {
  const badge = el('span', `ciyu-squircle ciyu-squircle--${tone}`);
  badge.setAttribute('aria-hidden', 'true');
  badge.appendChild(createIcon(icon, 'sm'));
  return badge;
}

function createAppleGroup(
  headerText: string,
  rows: HTMLElement[],
  footerText?: string
): HTMLElement {
  const group = el('section', 'ciyu-apple-group');
  if (headerText) {
    group.appendChild(el('h4', 'ciyu-apple-group-header', headerText));
  }
  const card = el('div', 'ciyu-surface ciyu-apple-group-card');
  for (const r of rows) card.appendChild(r);
  group.appendChild(card);
  if (footerText) {
    group.appendChild(el('p', 'ciyu-apple-group-footer', footerText));
  }
  return group;
}

const prevAppleSegIndex = new Map<string, number>();

function createAppleSegmented<T extends string>(
  options: ReadonlyArray<{ id: T; label: string }>,
  activeId: T,
  onSelect: (id: T) => void,
  ariaLabel: string
): HTMLDivElement {
  const wrap = el('div', 'ciyu-apple-segmented');
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', ariaLabel);

  const lens = el('div', 'ciyu-apple-seg-lens');
  lens.setAttribute('aria-hidden', 'true');
  wrap.appendChild(lens);

  const buttons: HTMLButtonElement[] = [];
  const activeIdx = Math.max(0, options.findIndex((o) => o.id === activeId));
  const prevIdx = prevAppleSegIndex.get(ariaLabel);
  prevAppleSegIndex.set(ariaLabel, activeIdx);

  options.forEach((opt, idx) => {
    const active = idx === activeIdx;
    const btn = el(
      'button',
      active ? 'ciyu-apple-seg-btn ciyu-apple-seg-btn--active' : 'ciyu-apple-seg-btn',
      opt.label
    );
    btn.type = 'button';
    btn.setAttribute('aria-pressed', String(active));
    btn.addEventListener('click', (e) => {
      // 键盘或辅助工具直接触发 click
      if (e.detail === 0 && idx !== activeIdx) onSelect(opt.id);
    });
    buttons.push(btn);
    wrap.appendChild(btn);
  });

  function positionLens(index: number, instant = false): void {
    const btn = buttons[index];
    if (!btn) return;
    const left = btn.offsetLeft;
    const width = btn.offsetWidth;
    if (width <= 0) return;
    if (instant) lens.style.transition = 'none';
    else lens.style.transition = '';
    lens.style.width = `${width}px`;
    lens.style.transform = `translate3d(${left}px, 0, 0) scale(1, 1)`;
    if (instant) {
      void lens.offsetWidth;
      lens.style.transition = '';
    }
  }

  function indexFromClientX(clientX: number): number {
    const rect = wrap.getBoundingClientRect();
    if (rect.width <= 0 || buttons.length === 0) return 0;
    const rel = Math.max(0, Math.min(rect.width - 1, clientX - rect.left));
    let best = 0;
    let bestDist = Infinity;
    buttons.forEach((b, i) => {
      const center = b.offsetLeft + b.offsetWidth / 2;
      const d = Math.abs(rel - center);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }

  let pointerDown = false;
  let isDragging = false;
  let activePointerId = -1;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let hoveredIdx = activeIdx;
  let holdTimer: number | null = null;
  let dragRaf: number | null = null;
  let downIdx = activeIdx;
  let cachedRect: DOMRect | null = null;
  let cachedBtns: Array<{ left: number; width: number; center: number }> = [];

  function cacheGeometry(): void {
    cachedRect = wrap.getBoundingClientRect();
    cachedBtns = buttons.map((b) => ({
      left: b.offsetLeft,
      width: b.offsetWidth,
      center: b.offsetLeft + b.offsetWidth / 2,
    }));
  }

  function indexFromClientXCached(clientX: number): number {
    const rect = cachedRect ?? wrap.getBoundingClientRect();
    if (rect.width <= 0 || cachedBtns.length === 0) return indexFromClientX(clientX);
    const rel = Math.max(0, Math.min(rect.width - 1, clientX - rect.left));
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < cachedBtns.length; i++) {
      const d = Math.abs(rel - cachedBtns[i].center);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }

  function updateDragLens(clientX: number, vx: number): void {
    const rect = cachedRect ?? wrap.getBoundingClientRect();
    const ref = cachedBtns[hoveredIdx] ?? cachedBtns[0];
    if (!ref || rect.width <= 0) return;
    const lensW = ref.width;
    const minLeft = cachedBtns[0]?.left ?? 3;
    const lastBtn = cachedBtns[cachedBtns.length - 1];
    const maxLeft = lastBtn ? lastBtn.left : Math.max(minLeft, rect.width - lensW - 3);
    let rawLeft = clientX - rect.left - lensW / 2;
    if (rawLeft < minLeft) rawLeft = minLeft - Math.min(6, (minLeft - rawLeft) * 0.2);
    else if (rawLeft > maxLeft) rawLeft = maxLeft + Math.min(6, (rawLeft - maxLeft) * 0.2);

    const speed = Math.min(20, Math.abs(vx));
    const sx = 1.05 + speed * 0.005;
    const sy = 1.1 - speed * 0.002;
    lens.style.width = `${lensW}px`;
    lens.style.transform = `translate3d(${rawLeft.toFixed(1)}px, 0, 0) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;

    const idx = indexFromClientXCached(clientX);
    if (idx !== hoveredIdx) {
      hoveredIdx = idx;
      buttons.forEach((b, i) => {
        if (i === hoveredIdx) b.dataset.dragHover = 'true';
        else delete b.dataset.dragHover;
      });
    }
  }

  function enterDrag(clientX: number): void {
    if (isDragging) return;
    isDragging = true;
    wrap.dataset.dragging = 'true';
    hoveredIdx = indexFromClientXCached(clientX);
    updateDragLens(clientX, 0);
  }

  const onWinMove = (e: PointerEvent) => {
    if (!pointerDown || e.pointerId !== activePointerId) return;
    if (e.pointerType === 'mouse' && e.buttons === 0) {
      finishPointer(e, true);
      return;
    }
    const vx = e.clientX - lastX;
    lastX = e.clientX;
    if (!isDragging && Math.hypot(e.clientX - startX, e.clientY - startY) > 4) {
      if (holdTimer) { window.clearTimeout(holdTimer); holdTimer = null; }
      enterDrag(e.clientX);
    }
    if (isDragging) {
      if (dragRaf) cancelAnimationFrame(dragRaf);
      const cx = e.clientX;
      dragRaf = requestAnimationFrame(() => {
        dragRaf = null;
        if (isDragging) updateDragLens(cx, vx);
      });
    }
  };

  const onWinUp = (e: PointerEvent) => finishPointer(e, true);
  const onWinCancel = (e: PointerEvent) => finishPointer(e, false);

  function attachWin(): void {
    window.addEventListener('pointermove', onWinMove, true);
    window.addEventListener('pointerup', onWinUp, true);
    window.addEventListener('pointercancel', onWinCancel, true);
  }

  function detachWin(): void {
    window.removeEventListener('pointermove', onWinMove, true);
    window.removeEventListener('pointerup', onWinUp, true);
    window.removeEventListener('pointercancel', onWinCancel, true);
  }

  function finishPointer(e: PointerEvent, commit: boolean): void {
    if (!pointerDown || e.pointerId !== activePointerId) return;
    detachWin();
    pointerDown = false;
    if (holdTimer) { window.clearTimeout(holdTimer); holdTimer = null; }
    if (dragRaf) { cancelAnimationFrame(dragRaf); dragRaf = null; }
    try {
      if (wrap.hasPointerCapture?.(e.pointerId)) wrap.releasePointerCapture(e.pointerId);
    } catch {}
    const wasDrag = isDragging;
    isDragging = false;
    delete wrap.dataset.dragging;
    buttons.forEach((b) => delete b.dataset.dragHover);

    const targetIdx = commit ? (wasDrag ? indexFromClientXCached(e.clientX) : downIdx) : activeIdx;
    cachedRect = null;
    positionLens(targetIdx, false);
    if (commit && targetIdx !== activeIdx && options[targetIdx]) {
      onSelect(options[targetIdx].id);
    }
  }

  wrap.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    cacheGeometry();
    pointerDown = true;
    isDragging = false;
    activePointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    lastX = e.clientX;
    downIdx = indexFromClientXCached(e.clientX);
    hoveredIdx = downIdx;
    try { wrap.setPointerCapture(e.pointerId); } catch {}
    attachWin();
    if (holdTimer) window.clearTimeout(holdTimer);
    holdTimer = window.setTimeout(() => {
      if (pointerDown && !isDragging) enterDrag(lastX);
    }, 150);
  });

  // 初次挂载或重绘时：若刚从另一个选项切换过来，则从旧位置弹簧滑移到新位置
  requestAnimationFrame(() => {
    if (prevIdx !== undefined && prevIdx !== activeIdx && buttons[prevIdx]) {
      positionLens(prevIdx, true);
      requestAnimationFrame(() => positionLens(activeIdx, false));
    } else {
      positionLens(activeIdx, true);
    }
  });
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      if (!isDragging) positionLens(activeIdx, true);
    });
    ro.observe(wrap);
  }

  return wrap;
}

/**
 * 视图 6：Apple System Settings 风格设置中心
 * - 宽屏（>= 560px）：左侧 Squircle 图标分类侧栏 + 右侧 Inset Grouped 详情面板
 * - 窄侧栏（< 560px）：顶部快捷分类胶囊 + 单列 Apple Inset Grouped 分组列表
 */
export function createSettingsView(
  initialProps: SettingsViewProps,
  callbacks: SettingsViewCallbacks = {}
): UIComponentHandle<SettingsViewProps> {
  let props = initialProps;
  let activeCategory: AppleSettingsCategory = initialProps.requestedCategory ?? 'appearance';
  let narrowFilter: AppleSettingsCategory | 'all' = initialProps.requestedCategory ?? 'all';
  let aboutChangelogExpanded = false;
  let proMotionBadgeEl: HTMLSpanElement | null = null;
  const unsubProMotion = subscribeProMotion((state) => {
    if (proMotionBadgeEl) {
      proMotionBadgeEl.textContent = state.label;
      proMotionBadgeEl.className =
        state.tier === 'promotion'
          ? 'ciyu-badge ciyu-badge--ok'
          : state.tier === 'high'
          ? 'ciyu-badge ciyu-badge--accent'
          : 'ciyu-badge ciyu-badge--neutral';
    }
  });

  const root = el('section', 'ciyu-settings-view ciyu-apple-settings');
  root.setAttribute('aria-label', '模型与外观设置');

  function createToggleRow(options: {
    title: string;
    description?: string;
    icon?: IconName;
    tone?: SquircleTone;
    checked: boolean;
    disabled?: boolean;
    onChange: (next: boolean) => void;
  }): HTMLDivElement {
    const row = el('div', 'ciyu-apple-row ciyu-toggle-row');
    if (options.icon) row.classList.add('ciyu-apple-row--with-icon');
    const lead = el('div', 'ciyu-apple-row-lead');
    if (options.icon) {
      lead.appendChild(createSquircleIcon(options.icon, options.tone ?? 'blue'));
    }
    const text = el('div', 'ciyu-toggle-text');
    text.appendChild(el('span', 'ciyu-toggle-title', options.title));
    if (options.description) {
      text.appendChild(el('span', 'ciyu-toggle-desc', options.description));
    }
    lead.appendChild(text);

    const sw = el('button', 'ciyu-switch');
    sw.type = 'button';
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', String(options.checked));
    sw.setAttribute('aria-label', options.title);
    sw.disabled = Boolean(options.disabled);
    sw.addEventListener('click', () => options.onChange(!options.checked));

    row.append(lead, sw);
    return row;
  }

  function render(): void {
    root.innerHTML = '';

    const categories: Array<{
      id: AppleSettingsCategory;
      label: string;
      shortLabel: string;
      icon: IconName;
      tone: SquircleTone;
    }> = [
      { id: 'appearance', label: '外观与配色', shortLabel: '外观', icon: 'sparkles', tone: 'blue' },
      { id: 'dictionaries', label: '离线词库', shortLabel: '词库', icon: 'book-open', tone: 'green' },
      { id: 'speech', label: '朗读与发音', shortLabel: '发音', icon: 'volume-2', tone: 'pink' },
      { id: 'model', label: '本地模型', shortLabel: '模型', icon: 'sliders', tone: 'indigo' },
      { id: 'vault', label: '笔记与归档', shortLabel: '归档', icon: 'calendar-days', tone: 'orange' },
      { id: 'about', label: '关于词屿', shortLabel: '关于', icon: 'file-text', tone: 'gray' },
    ];

    // 1. 窄屏快捷分类过滤胶囊（< 560px 显示）
    const narrowBar = el('div', 'ciyu-apple-narrow-pills');
    const allPill = el(
      'button',
      narrowFilter === 'all' ? 'ciyu-mini-btn ciyu-mini-btn--accent' : 'ciyu-mini-btn',
      '全部'
    );
    allPill.type = 'button';
    allPill.addEventListener('click', () => {
      narrowFilter = 'all';
      render();
    });
    narrowBar.appendChild(allPill);
    for (const cat of categories) {
      const pBtn = el(
        'button',
        narrowFilter === cat.id ? 'ciyu-mini-btn ciyu-mini-btn--accent' : 'ciyu-mini-btn',
        cat.shortLabel
      );
      pBtn.type = 'button';
      pBtn.addEventListener('click', () => {
        narrowFilter = cat.id;
        activeCategory = cat.id;
        render();
      });
      narrowBar.appendChild(pBtn);
    }

    // 2. 宽屏左侧 Apple System Settings 分类导航栏（>= 560px 显示，与顶部导航一致的 iOS 27 悬浮液态玻璃透镜）
    const layout = el('div', 'ciyu-apple-settings-shell');
    const sideNav = el('nav', 'ciyu-glass ciyu-glass-refract ciyu-apple-settings-nav');
    sideNav.setAttribute('aria-label', '设置分类');

    const navLens = el('div', 'ciyu-apple-nav-lens');
    navLens.setAttribute('aria-hidden', 'true');
    sideNav.appendChild(navLens);

    const detail = el('div', 'ciyu-apple-settings-detail');
    detail.dataset.activeCat = activeCategory;
    detail.dataset.narrowFilter = narrowFilter;

    const navButtons: HTMLButtonElement[] = [];
    let navGlideTimer: number | null = null;

    function positionNavLens(index: number, instant = false): void {
      const targetBtn = navButtons[index];
      if (!targetBtn) return;
      const top = targetBtn.offsetTop;
      const height = targetBtn.offsetHeight;
      if (height <= 0) return;
      if (instant) {
        navLens.style.transition = 'none';
      } else {
        navLens.style.transition = '';
      }
      navLens.style.height = `${height}px`;
      navLens.style.transform = `translate3d(0, ${top}px, 0) scale(1, 1)`;
      if (instant) {
        void navLens.offsetHeight;
        navLens.style.transition = '';
      }
    }

    function selectCategory(catId: AppleSettingsCategory, animate = true): void {
      const prevIdx = categories.findIndex((c) => c.id === activeCategory);
      const nextIdx = categories.findIndex((c) => c.id === catId);
      if (nextIdx < 0) return;
      activeCategory = catId;
      detail.dataset.activeCat = catId;
      navButtons.forEach((btn, i) => {
        const isCurrent = i === nextIdx;
        btn.classList.toggle('ciyu-apple-nav-item--active', isCurrent);
        btn.setAttribute('aria-current', String(isCurrent));
        delete btn.dataset.dragHover;
      });
      if (animate && prevIdx !== nextIdx) {
        sideNav.dataset.gliding = 'true';
        if (navGlideTimer) window.clearTimeout(navGlideTimer);
        navGlideTimer = window.setTimeout(() => {
          delete sideNav.dataset.gliding;
        }, 380);
      }
      positionNavLens(nextIdx, !animate);
    }

    for (const cat of categories) {
      const isCurrent = activeCategory === cat.id;
      const itemBtn = el(
        'button',
        isCurrent ? 'ciyu-apple-nav-item ciyu-apple-nav-item--active' : 'ciyu-apple-nav-item'
      );
      itemBtn.type = 'button';
      itemBtn.dataset.catId = cat.id;
      itemBtn.setAttribute('aria-current', String(isCurrent));
      itemBtn.append(
        createSquircleIcon(cat.icon, cat.tone),
        el('span', 'ciyu-apple-nav-label', cat.label)
      );
      navButtons.push(itemBtn);
      sideNav.appendChild(itemBtn);
    }

    // 左侧边栏交互：单击弹簧纵移 + 长按/上下拖拽液态水滴折射 + 缓存几何尺寸与 rAF 合帧防卡顿
    let pointerActive = false;
    let isDragging = false;
    let activePointerId = -1;
    let startX = 0;
    let startY = 0;
    let lastY = 0;
    let lastTime = 0;
    let hoveredIdx = categories.findIndex((c) => c.id === activeCategory);
    let holdTimer: number | null = null;
    let navDragRaf: number | null = null;
    let downCatId: AppleSettingsCategory | null = null;
    let cachedNavRect: DOMRect | null = null;
    let cachedNavBtns: Array<{ top: number; height: number; center: number }> = [];

    function cacheNavGeometry(): void {
      cachedNavRect = sideNav.getBoundingClientRect();
      cachedNavBtns = navButtons.map((b) => ({
        top: b.offsetTop,
        height: b.offsetHeight,
        center: b.offsetTop + b.offsetHeight / 2,
      }));
    }

    function indexFromClientY(clientY: number): number {
      const rect = cachedNavRect ?? sideNav.getBoundingClientRect();
      if (rect.height <= 0 || navButtons.length === 0) return 0;
      const rel = Math.max(0, Math.min(rect.height - 1, clientY - rect.top));
      const list = cachedNavBtns.length === navButtons.length
        ? cachedNavBtns
        : navButtons.map((b) => ({
            top: b.offsetTop,
            height: b.offsetHeight,
            center: b.offsetTop + b.offsetHeight / 2,
          }));
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < list.length; i++) {
        const d = Math.abs(rel - list[i].center);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      return best;
    }

    function updateNavDragLens(clientY: number, velocityY: number): void {
      const rect = cachedNavRect ?? sideNav.getBoundingClientRect();
      const ref = cachedNavBtns[hoveredIdx] ?? cachedNavBtns[0];
      if (!ref || rect.height <= 0) return;
      const lensH = ref.height;
      const minY = cachedNavBtns[0]?.top ?? 8;
      const lastBtn = cachedNavBtns[cachedNavBtns.length - 1];
      const maxY = lastBtn ? lastBtn.top : Math.max(minY, rect.height - lensH - 8);
      let rawY = clientY - rect.top - lensH / 2;
      if (rawY < minY) rawY = minY - Math.min(10, (minY - rawY) * 0.18);
      else if (rawY > maxY) rawY = maxY + Math.min(10, (rawY - maxY) * 0.18);

      const speed = Math.min(1.4, Math.abs(velocityY));
      const scaleY = 1.07 + speed * 0.08;
      const scaleX = Math.max(0.96, 1.03 - speed * 0.03);
      navLens.style.height = `${lensH}px`;
      navLens.style.transform = `translate3d(0, ${rawY.toFixed(1)}px, 0) scale(${scaleX.toFixed(3)}, ${scaleY.toFixed(3)})`;

      const idx = indexFromClientY(clientY);
      if (idx !== hoveredIdx) {
        hoveredIdx = idx;
        navButtons.forEach((b, i) => {
          if (i === hoveredIdx) b.dataset.dragHover = 'true';
          else delete b.dataset.dragHover;
        });
      }
    }

    function enterNavDrag(clientY: number): void {
      if (isDragging) return;
      isDragging = true;
      sideNav.dataset.dragging = 'true';
      hoveredIdx = indexFromClientY(clientY);
      updateNavDragLens(clientY, 0);
    }

    const onNavWinMove = (e: PointerEvent) => {
      if (!pointerActive || e.pointerId !== activePointerId) return;
      if (e.pointerType === 'mouse' && e.buttons === 0) {
        finishNavPointer(e, false);
        return;
      }
      const now = performance.now();
      const dt = Math.max(4, now - lastTime);
      const dy = e.clientY - lastY;
      const vel = dy / dt;
      lastY = e.clientY;
      lastTime = now;
      if (!isDragging && Math.hypot(e.clientX - startX, e.clientY - startY) > 5) {
        if (holdTimer) { window.clearTimeout(holdTimer); holdTimer = null; }
        enterNavDrag(e.clientY);
      }
      if (isDragging) {
        if (navDragRaf) cancelAnimationFrame(navDragRaf);
        const cy = e.clientY;
        navDragRaf = requestAnimationFrame(() => {
          navDragRaf = null;
          if (isDragging) updateNavDragLens(cy, vel);
        });
      }
    };

    const onNavWinUp = (e: PointerEvent) => finishNavPointer(e, false);
    const onNavWinCancel = (e: PointerEvent) => finishNavPointer(e, true);
    const onNavWinBlur = () => {
      if (!pointerActive) return;
      detachNavWinListeners();
      pointerActive = false;
      if (holdTimer) { window.clearTimeout(holdTimer); holdTimer = null; }
      if (navDragRaf) { cancelAnimationFrame(navDragRaf); navDragRaf = null; }
      const wasDrag = isDragging;
      isDragging = false;
      delete sideNav.dataset.dragging;
      const targetIdx = wasDrag ? indexFromClientY(lastY) : categories.findIndex((c) => c.id === activeCategory);
      cachedNavRect = null;
      selectCategory(categories[targetIdx]?.id ?? activeCategory, true);
      downCatId = null;
    };

    function attachNavWinListeners(): void {
      window.addEventListener('pointermove', onNavWinMove, true);
      window.addEventListener('pointerup', onNavWinUp, true);
      window.addEventListener('pointercancel', onNavWinCancel, true);
      window.addEventListener('blur', onNavWinBlur);
    }

    function detachNavWinListeners(): void {
      window.removeEventListener('pointermove', onNavWinMove, true);
      window.removeEventListener('pointerup', onNavWinUp, true);
      window.removeEventListener('pointercancel', onNavWinCancel, true);
      window.removeEventListener('blur', onNavWinBlur);
    }

    sideNav.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      cacheNavGeometry();
      const hitBtn = (e.target as HTMLElement | null)?.closest<HTMLButtonElement>('.ciyu-apple-nav-item');
      downCatId = (hitBtn?.dataset.catId as AppleSettingsCategory | undefined) ?? null;
      pointerActive = true;
      isDragging = false;
      activePointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      lastY = e.clientY;
      lastTime = performance.now();
      try { sideNav.setPointerCapture(e.pointerId); } catch {}
      attachNavWinListeners();
      if (holdTimer) window.clearTimeout(holdTimer);
      holdTimer = window.setTimeout(() => {
        if (pointerActive && !isDragging) enterNavDrag(lastY);
      }, 160);
    });

    const finishNavPointer = (e: PointerEvent, cancelled = false) => {
      if (!pointerActive || e.pointerId !== activePointerId) return;
      detachNavWinListeners();
      pointerActive = false;
      if (holdTimer) { window.clearTimeout(holdTimer); holdTimer = null; }
      if (navDragRaf) { cancelAnimationFrame(navDragRaf); navDragRaf = null; }
      try {
        if (sideNav.hasPointerCapture?.(e.pointerId)) sideNav.releasePointerCapture(e.pointerId);
      } catch {}
      if (isDragging) {
        isDragging = false;
        delete sideNav.dataset.dragging;
        const releaseIdx = indexFromClientY(e.clientY);
        cachedNavRect = null;
        const target = !cancelled ? categories[releaseIdx]?.id : activeCategory;
        selectCategory(target ?? activeCategory, true);
      } else if (!cancelled && downCatId) {
        cachedNavRect = null;
        selectCategory(downCatId, true);
      } else {
        cachedNavRect = null;
      }
      downCatId = null;
    };

    // 键盘回车/空格无障碍支持
    navButtons.forEach((btn, idx) => {
      btn.addEventListener('click', (e) => {
        if (e.detail === 0) selectCategory(categories[idx].id, true);
      });
    });

    // 初次挂载与容器尺寸变化时自动校准透镜位置（含切到设置页/拖拽窗格宽度）
    const syncLensNow = () => {
      const idx = categories.findIndex((c) => c.id === activeCategory);
      positionNavLens(idx >= 0 ? idx : 0, true);
    };
    requestAnimationFrame(syncLensNow);
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        if (!isDragging) syncLensNow();
      });
      ro.observe(sideNav);
    }

    // ==================== 分类 A：外观与配色 ====================
    const appearancePane = el('div', 'ciyu-apple-pane');
    appearancePane.dataset.applePane = 'appearance';
    appearancePane.appendChild(el('h3', 'ciyu-apple-pane-title', '外观与配色'));

    const activeThemeId = props.preferences.colorTheme ?? 'system';
    const currentCustom: CiyuCustomThemeColors = {
      ...DEFAULT_CUSTOM_THEME,
      ...(props.preferences.customTheme || {}),
    };

    // 迷你 macOS 窗口色板行
    const paletteRow = el('div', 'ciyu-apple-row ciyu-apple-row--stack');
    const themeGrid = el('div', 'ciyu-theme-grid ciyu-apple-theme-grid');
    for (const preset of CIYU_COLOR_THEMES) {
      const isSelected = activeThemeId === preset.id;
      const swatchBtn = el(
        'button',
        isSelected ? 'ciyu-apple-theme-card ciyu-apple-theme-card--active' : 'ciyu-apple-theme-card'
      );
      swatchBtn.type = 'button';
      swatchBtn.dataset.cardStyle = preset.uiStyle ?? 'apple';
      swatchBtn.setAttribute('aria-pressed', String(isSelected));
      swatchBtn.title = preset.source ? `${preset.name}（${preset.source}）` : preset.name;

      const isSys = preset.id === 'system';
      const canvasHex = isSys
        ? '#f2f2f7'
        : preset.id === 'custom'
          ? currentCustom.canvasBg
          : preset.colors!.canvasBg;
      const surfHex = isSys
        ? '#ffffff'
        : preset.id === 'custom'
          ? currentCustom.surfaceBg
          : preset.colors!.surfaceBg;
      const accentHex = isSys
        ? '#007aff'
        : preset.id === 'custom'
          ? currentCustom.accent
          : preset.colors!.accent;

      const textHex = isSys
        ? '#1d1d1f'
        : preset.id === 'custom'
          ? currentCustom.textPrimary
          : preset.colors!.textPrimary;

      const winPreview = el('div', 'ciyu-mini-win');
      winPreview.style.background = isSys
        ? 'linear-gradient(135deg, #f2f2f7 50%, #1c1c1e 50%)'
        : canvasHex;
      const winBody = el('div', 'ciyu-mini-win-body');
      const winCard = el('div', 'ciyu-mini-win-card');
      winCard.style.background = surfHex;
      const winBar = el('span', 'ciyu-mini-win-accent');
      winBar.style.background = accentHex;
      const winLine = el('span', 'ciyu-mini-win-line');
      winLine.style.background = textHex;
      winCard.append(winBar, winLine);
      winBody.appendChild(winCard);
      winPreview.appendChild(winBody);

      const meta = el('div', 'ciyu-theme-meta');
      meta.append(
        el('span', 'ciyu-theme-name', preset.name),
        el('span', 'ciyu-theme-tag', preset.tag)
      );

      swatchBtn.append(winPreview, meta);
      swatchBtn.addEventListener('click', () => callbacks.onSelectColorTheme?.(preset.id));
      themeGrid.appendChild(swatchBtn);
    }
    paletteRow.appendChild(themeGrid);

    const themeRows: HTMLElement[] = [paletteRow];
    const activePreset = CIYU_COLOR_THEMES.find((t) => t.id === activeThemeId);
    if (activePreset?.colors && activeThemeId !== 'custom') {
      const forkRow = el('div', 'ciyu-apple-row');
      forkRow.append(
        el('span', 'ciyu-toggle-desc', `当前使用「${activePreset.name}」`),
        (() => {
          const actions = el('div', 'ciyu-theme-actions');
          const forkBtn = el('button', 'ciyu-mini-btn ciyu-mini-btn--accent', '以此为基础微调');
          forkBtn.type = 'button';
          forkBtn.addEventListener('click', () =>
            callbacks.onCustomThemeChange?.({ ...activePreset.colors! })
          );
          const resetSysBtn = el('button', 'ciyu-mini-btn', '恢复默认');
          resetSysBtn.type = 'button';
          resetSysBtn.addEventListener('click', () => callbacks.onSelectColorTheme?.('system'));
          actions.append(forkBtn, resetSysBtn);
          return actions;
        })()
      );
      themeRows.push(forkRow);
    }

    if (activeThemeId === 'custom') {
      const fields: Array<{ key: keyof CiyuCustomThemeColors; label: string; desc: string }> = [
        { key: 'accent', label: '主题强调色', desc: '按钮、进度条与选中高亮' },
        { key: 'canvasBg', label: '画布背景色', desc: '主面板与工作区底色' },
        { key: 'surfaceBg', label: '卡片表面色', desc: '分组卡片、浮窗与输入框底色' },
        { key: 'textPrimary', label: '正文文字色', desc: '主文字颜色（次级文字自动推算）' },
      ];
      for (const f of fields) {
        const row = el('div', 'ciyu-apple-row');
        const info = el('div', 'ciyu-toggle-text');
        info.append(
          el('span', 'ciyu-toggle-title', f.label),
          el('span', 'ciyu-toggle-desc', f.desc)
        );
        const controls = el('div', 'ciyu-color-picker-controls');
        const currentVal = normalizeHexColor(currentCustom[f.key], DEFAULT_CUSTOM_THEME[f.key]);

        const colorInput = el('input', 'ciyu-color-input');
        colorInput.type = 'color';
        colorInput.value = currentVal;
        colorInput.setAttribute('aria-label', `${f.label}取色器`);

        const hexInput = el('input', 'ciyu-input ciyu-hex-input');
        hexInput.type = 'text';
        hexInput.defaultValue = currentVal;
        hexInput.value = currentVal;
        hexInput.maxLength = 7;
        hexInput.setAttribute('aria-label', `${f.label}色值`);

        const commitColor = (nextHex: string) => {
          const safe = normalizeHexColor(nextHex, currentVal);
          if (safe === currentVal) return;
          callbacks.onCustomThemeChange?.({ ...currentCustom, [f.key]: safe });
        };

        colorInput.addEventListener('change', () => {
          hexInput.value = colorInput.value;
          commitColor(colorInput.value);
        });
        hexInput.addEventListener('change', () => {
          const val = hexInput.value.trim();
          if (/^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(val)) {
            const normalized = normalizeHexColor(val.startsWith('#') ? val : `#${val}`, currentVal);
            hexInput.value = normalized;
            colorInput.value = normalized;
            commitColor(normalized);
          } else {
            hexInput.value = currentVal;
          }
        });

        controls.append(colorInput, hexInput);
        row.append(info, controls);
        themeRows.push(row);
      }

      const resetRow = el('div', 'ciyu-apple-row ciyu-apple-row--stack');
      const actionsHead = el('div', 'ciyu-slider-head');
      const actions = el('div', 'ciyu-theme-actions');

      const copyThemeBtn = el('button', 'ciyu-mini-btn ciyu-mini-btn--accent', '复制配色');
      copyThemeBtn.type = 'button';
      copyThemeBtn.addEventListener('click', () => {
        const payload = JSON.stringify(currentCustom);
        const done = () => showCiyuToast('已复制 4 色配色代码，可直接备份或分享', { tone: 'success' });
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(payload).then(done).catch(() => {
            const ta = document.createElement('textarea');
            ta.value = payload;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); } catch {}
            ta.remove();
            done();
          });
        } else {
          done();
        }
      });

      const importForm = el('form', 'ciyu-endpoint-row');
      importForm.hidden = true;
      const importInput = el('input', 'ciyu-input');
      importInput.type = 'text';
      importInput.placeholder = '粘贴配色 JSON 或 4 个 #hex 色值…';
      importInput.setAttribute('aria-label', '导入配色代码');
      const applyImportBtn = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm', '应用');
      applyImportBtn.type = 'submit';
      importForm.append(importInput, applyImportBtn);
      importForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const raw = importInput.value.trim();
        if (!raw) return;
        let parsed: Partial<CiyuCustomThemeColors> | null = null;
        try {
          const obj = JSON.parse(raw);
          if (obj && typeof obj === 'object') parsed = obj;
        } catch {
          const hexes = raw.match(/#[0-9a-fA-F]{3,6}\b/g);
          if (hexes && hexes.length >= 4) {
            parsed = {
              accent: hexes[0],
              canvasBg: hexes[1],
              surfaceBg: hexes[2],
              textPrimary: hexes[3],
            };
          }
        }
        if (!parsed) {
          showCiyuToast('未识别到有效配色代码，请粘贴 JSON 或 4 个 #hex 色值', { tone: 'warning' });
          return;
        }
        const next: CiyuCustomThemeColors = {
          accent: normalizeHexColor(parsed.accent, currentCustom.accent),
          canvasBg: normalizeHexColor(parsed.canvasBg, currentCustom.canvasBg),
          surfaceBg: normalizeHexColor(parsed.surfaceBg, currentCustom.surfaceBg),
          textPrimary: normalizeHexColor(parsed.textPrimary, currentCustom.textPrimary),
        };
        importForm.hidden = true;
        importInput.value = '';
        callbacks.onCustomThemeChange?.(next);
        showCiyuToast('已导入并应用自定义配色', { tone: 'success' });
      });

      const importToggleBtn = el('button', 'ciyu-mini-btn', '导入配色');
      importToggleBtn.type = 'button';
      importToggleBtn.addEventListener('click', () => {
        importForm.hidden = !importForm.hidden;
        if (!importForm.hidden) importInput.focus();
      });

      const resetCustomBtn = el('button', 'ciyu-mini-btn', '重置色值');
      resetCustomBtn.type = 'button';
      resetCustomBtn.addEventListener('click', () =>
        callbacks.onCustomThemeChange?.({ ...DEFAULT_CUSTOM_THEME })
      );
      const backSysBtn = el('button', 'ciyu-mini-btn', '切回默认');
      backSysBtn.type = 'button';
      backSysBtn.addEventListener('click', () => callbacks.onSelectColorTheme?.('system'));

      actions.append(copyThemeBtn, importToggleBtn, resetCustomBtn, backSysBtn);
      actionsHead.append(el('span', 'ciyu-toggle-desc', '分享与重置'), actions);
      resetRow.append(actionsHead, importForm);
      themeRows.push(resetRow);
    }

    appearancePane.appendChild(
      createAppleGroup(
        '主题配色',
        themeRows,
        '除系统黑白默认外，内置 Catppuccin、Nord、Rosé Pine、Everforest、Solarized 等 MIT 开源色板，并支持 4 色自定义实时预览。'
      )
    );

    // iOS 27 Liquid Glass 与无障碍分组
    const glassActive =
      props.preferences.liquidGlass && !props.preferences.reducedTransparency;
    const glassOpacity =
      typeof props.preferences.glassOpacity === 'number'
        ? Math.max(10, Math.min(100, Math.round(props.preferences.glassOpacity)))
        : 42;

    const opacityRow = el('div', 'ciyu-apple-row ciyu-apple-row--stack');
    if (!glassActive) opacityRow.classList.add('ciyu-slider-row--disabled');
    const opacityHead = el('div', 'ciyu-slider-head');
    const opacityLead = el('div', 'ciyu-apple-row-lead');
    opacityLead.append(
      createSquircleIcon('sparkles', 'cyan'),
      (() => {
        const t = el('div', 'ciyu-toggle-text');
        t.append(
          el('span', 'ciyu-toggle-title', '玻璃不透明度'),
          el('span', 'ciyu-toggle-desc', 'iOS 27 水晶通透曲线，数值越低越晶莹透底')
        );
        return t;
      })()
    );
    const opacityValueBadge = el('span', 'ciyu-apple-value', `${glassOpacity}%`);
    opacityHead.append(opacityLead, opacityValueBadge);

    const opacitySliderWrap = el('div', 'ciyu-opacity-slider-wrap');
    const opacitySlider = el('input', 'ciyu-opacity-slider');
    opacitySlider.type = 'range';
    opacitySlider.min = '10';
    opacitySlider.max = '100';
    opacitySlider.step = '2';
    opacitySlider.defaultValue = String(glassOpacity);
    opacitySlider.value = String(glassOpacity);
    opacitySlider.disabled = !glassActive;
    opacitySlider.setAttribute('aria-label', '玻璃不透明度');
    const updateSliderFill = (pct: number) => {
      const ratio = Math.max(0, Math.min(100, ((pct - 10) / 90) * 100));
      opacitySlider.style.setProperty('--ciyu-slider-pct', `${ratio}%`);
    };
    updateSliderFill(glassOpacity);
    opacitySliderWrap.appendChild(opacitySlider);

    const applyLivePreview = (pct: number) => {
      opacityValueBadge.textContent = `${pct}%`;
      updateSliderFill(pct);
      const host = root.closest<HTMLElement>('.ciyu-ui');
      if (host && glassActive) {
        const glassPct = Math.max(10, Math.min(96, Math.round(pct * 0.62)));
        const elevatedPct = Math.max(16, Math.min(96, Math.round(pct * 0.78)));
        const readingPct = Math.max(14, Math.min(96, Math.round(pct * 0.74)));
        const stickyPct = Math.min(94, Math.max(46, Math.round(pct * 0.86)));
        const blurPx = Math.round(8 + ((100 - pct) / 90) * 6);
        const blurHeavyPx = Math.round(11 + ((100 - pct) / 90) * 7);
        host.style.setProperty('--ciyu-glass-bg', `color-mix(in srgb, var(--ciyu-reading-bg-solid) ${glassPct}%, transparent)`);
        host.style.setProperty('--ciyu-glass-bg-elevated', `color-mix(in srgb, var(--ciyu-reading-bg-solid) ${elevatedPct}%, transparent)`);
        host.style.setProperty('--ciyu-reading-bg', `color-mix(in srgb, var(--ciyu-reading-bg-solid) ${readingPct}%, transparent)`);
        host.style.setProperty('--ciyu-sticky-bg', `color-mix(in srgb, var(--ciyu-reading-bg-solid) ${stickyPct}%, transparent)`);
        host.style.setProperty('--ciyu-glass-blur', `${blurPx}px`);
        host.style.setProperty('--ciyu-glass-blur-heavy', `${blurHeavyPx}px`);
      }
    };

    opacitySlider.addEventListener('input', () => applyLivePreview(Number(opacitySlider.value)));
    opacitySlider.addEventListener('change', () =>
      callbacks.onGlassOpacityChange?.(Number(opacitySlider.value))
    );

    const quickRow = el('div', 'ciyu-theme-actions');
    for (const p of [
      { label: '极透 24%', val: 24 },
      { label: '清透 42%', val: 42 },
      { label: '默认 58%', val: 58 },
      { label: '柔和 76%', val: 76 },
      { label: '实色 94%', val: 94 },
    ]) {
      const qBtn = el(
        'button',
        glassOpacity === p.val ? 'ciyu-mini-btn ciyu-mini-btn--accent' : 'ciyu-mini-btn',
        p.label
      );
      qBtn.type = 'button';
      qBtn.disabled = !glassActive;
      qBtn.addEventListener('click', () => {
        opacitySlider.value = String(p.val);
        updateSliderFill(p.val);
        applyLivePreview(p.val);
        callbacks.onGlassOpacityChange?.(p.val);
      });
      quickRow.appendChild(qBtn);
    }
    opacityRow.append(opacityHead, opacitySliderWrap, quickRow);

    const pmState = getProMotionState();
    const proMotionRow = el('div', 'ciyu-apple-row ciyu-apple-row--with-icon');
    const pmLead = el('div', 'ciyu-apple-row-lead');
    pmLead.appendChild(createSquircleIcon('sparkles', 'green'));
    const pmText = el('div', 'ciyu-toggle-text');
    pmText.append(
      el('span', 'ciyu-toggle-title', '自适应 ProMotion 刷新率'),
      el('span', 'ciyu-toggle-desc', '自动探测屏幕 60Hz / 90Hz / 120Hz，动态调节弹簧时长与模糊预算，静止 0 消耗')
    );
    pmLead.appendChild(pmText);

    const pmRight = el('div', 'ciyu-toolbar-actions');
    const pmBadge = el(
      'span',
      pmState.tier === 'promotion'
        ? 'ciyu-badge ciyu-badge--ok'
        : pmState.tier === 'high'
        ? 'ciyu-badge ciyu-badge--accent'
        : 'ciyu-badge ciyu-badge--neutral',
      pmState.label
    );
    proMotionBadgeEl = pmBadge;
    const pmReprobeBtn = el('button', 'ciyu-mini-btn', '重测');
    pmReprobeBtn.type = 'button';
    pmReprobeBtn.title = '重新采样当前显示器刷新率（跨屏或切换省电模式后可手动刷新）';
    pmReprobeBtn.addEventListener('click', () => {
      probeDisplayRefreshRate(true, (state) => {
        showCiyuToast(`当前屏幕刷新率：${state.label}`, { tone: 'success' });
      });
    });
    pmRight.append(pmBadge, pmReprobeBtn);
    proMotionRow.append(pmLead, pmRight);

    appearancePane.appendChild(
      createAppleGroup(
        'LIQUID GLASS 材质与无障碍',
        [
          createToggleRow({
            title: 'Liquid Glass 清透材质',
            description: '液态玻璃、磨砂透底与高光边缘',
            icon: 'sparkles',
            tone: 'cyan',
            checked: glassActive,
            onChange: (next) => callbacks.onToggleLiquidGlass?.(next),
          }),
          opacityRow,
          proMotionRow,
          createToggleRow({
            title: '边缘微折射效果',
            description: '在玻璃壳层边缘叠加低幅度光学折射',
            icon: 'layers',
            tone: 'blue',
            checked: props.preferences.edgeRefraction && glassActive,
            disabled: !glassActive,
            onChange: (next) => callbacks.onToggleEdgeRefraction?.(next),
          }),
          createToggleRow({
            title: '降低透明度（纯色模式）',
            description: '关闭半透明与折射，切换高对比纯色表面',
            icon: 'sliders',
            tone: 'gray',
            checked: props.preferences.reducedTransparency || !props.preferences.liquidGlass,
            onChange: (next) => callbacks.onToggleReducedTransparency?.(next),
          }),
          createToggleRow({
            title: '减少动态效果',
            description: '关闭弹簧滑移与微交互过渡，适配系统无障碍偏好',
            icon: 'refresh-cw',
            tone: 'blue',
            checked: props.preferences.reducedMotion,
            onChange: (next) => callbacks.onToggleReducedMotion?.(next),
          }),
        ]
      )
    );

    // ==================== 分类 B：朗读与发音 ====================
    const speechPane = el('div', 'ciyu-apple-pane');
    speechPane.dataset.applePane = 'speech';
    speechPane.appendChild(el('h3', 'ciyu-apple-pane-title', '朗读与发音'));

    const speechEngine = props.speechEngine ?? 'human';
    const speechAccent = props.speechAccent ?? 'us';

    const engineRow = el('div', 'ciyu-apple-row ciyu-apple-row--with-icon');
    const engineLead = el('div', 'ciyu-apple-row-lead');
    engineLead.append(
      createSquircleIcon('volume-2', 'pink'),
      (() => {
        const t = el('div', 'ciyu-toggle-text');
        t.append(
          el('span', 'ciyu-toggle-title', '发音来源'),
          el('span', 'ciyu-toggle-desc', speechEngine === 'human' ? '真人播音优先，离线回退' : '仅使用系统离线语音')
        );
        return t;
      })()
    );
    engineRow.append(
      engineLead,
      createAppleSegmented(
        [
          { id: 'human' as const, label: '真人优先' },
          { id: 'system' as const, label: '系统离线' },
        ],
        speechEngine,
        (id) => callbacks.onSpeechEngineChange?.(id),
        '朗读发音来源'
      )
    );

    const accentRow = el('div', 'ciyu-apple-row ciyu-apple-row--with-icon');
    const accentLead = el('div', 'ciyu-apple-row-lead');
    accentLead.append(
      createSquircleIcon('headphones', 'pink'),
      (() => {
        const t = el('div', 'ciyu-toggle-text');
        t.append(
          el('span', 'ciyu-toggle-title', '英语口音'),
          el('span', 'ciyu-toggle-desc', '适用于单词与整句朗读')
        );
        return t;
      })()
    );
    accentRow.append(
      accentLead,
      createAppleSegmented(
        [
          { id: 'us' as const, label: '美音 US' },
          { id: 'uk' as const, label: '英音 UK' },
        ],
        speechAccent,
        (id) => callbacks.onSpeechAccentChange?.(id),
        '英语口音偏好'
      )
    );

    const previewRow = el('div', 'ciyu-apple-row');
    previewRow.append(
      el('span', 'ciyu-toggle-title', '试听效果'),
      (() => {
        const btns = el('div', 'ciyu-theme-actions');
        const previewWordBtn = el('button', 'ciyu-mini-btn');
        previewWordBtn.type = 'button';
        previewWordBtn.append(createIcon('volume-2', 'sm'), el('span', undefined, 'resilience'));
        previewWordBtn.addEventListener('click', () => callbacks.onPreviewSpeech?.('resilience'));
        const previewSentBtn = el('button', 'ciyu-mini-btn');
        previewSentBtn.type = 'button';
        previewSentBtn.append(createIcon('volume-2', 'sm'), el('span', undefined, '英文整句'));
        previewSentBtn.addEventListener('click', () =>
          callbacks.onPreviewSpeech?.('They have helped boost the local economy.')
        );
        btns.append(previewWordBtn, previewSentBtn);
        return btns;
      })()
    );

    speechPane.appendChild(
      createAppleGroup(
        '英语真人发音',
        [engineRow, accentRow, previewRow],
        '单词与短语优先使用有道真人录音并自动本地缓存，整句优先自然语音，离线自动优选 macOS 高级/增强音色。'
      )
    );

    if (props.nativeDictionaries) {
      const dictRow = el('div', 'ciyu-apple-row ciyu-apple-row--with-icon');
      const dLead = el('div', 'ciyu-apple-row-lead');
      dLead.append(
        createSquircleIcon('book-open', 'green'),
        (() => {
          const t = el('div', 'ciyu-toggle-text');
          t.append(
            el('span', 'ciyu-toggle-title', 'macOS 桌面词典联动'),
            el('span', 'ciyu-toggle-desc', '可交给系统词典、有道桌面或 Easydict')
          );
          return t;
        })()
      );
      const link = el('a', 'ciyu-mini-btn', 'Easydict 发布页');
      link.href = 'https://github.com/tisfeng/Easydict/releases';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      dictRow.append(dLead, link);
      speechPane.appendChild(createAppleGroup('桌面词典', [dictRow]));
    }

    // ==================== 分类 C：本地模型 ====================
    const modelPane = el('div', 'ciyu-apple-pane');
    modelPane.dataset.applePane = 'model';
    modelPane.appendChild(el('h3', 'ciyu-apple-pane-title', '本地模型'));

    // Ollama 连接状态分组
    const connStatusRow = el('div', 'ciyu-apple-row ciyu-apple-row--with-icon');
    const connLead = el('div', 'ciyu-apple-row-lead');
    connLead.append(
      createSquircleIcon('sliders', 'indigo'),
      el('span', 'ciyu-toggle-title', 'Ollama 本地服务')
    );
    const meta = connectionMeta(props.connectionStatus);
    const pill = el('span', meta.pillClass);
    pill.append(el('span', meta.dotClass), el('span', undefined, meta.label));
    connStatusRow.append(connLead, pill);

    const epRowWrap = el('div', 'ciyu-apple-row ciyu-apple-row--stack');
    const epRow = el('div', 'ciyu-endpoint-row');
    const epInput = el('input', 'ciyu-input');
    epInput.type = 'url';
    epInput.defaultValue = props.endpoint;
    epInput.placeholder = 'http://127.0.0.1:11434';
    epInput.setAttribute('aria-label', 'Ollama 服务地址');

    const checkBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm');
    checkBtn.type = 'button';
    checkBtn.disabled = props.connectionStatus === 'checking' || Boolean(props.deletingModelId);
    checkBtn.append(createIcon('refresh-cw', 'sm'), el('span', undefined, '检测'));
    checkBtn.addEventListener('click', () => {
      if (epInput.value.trim() !== props.endpoint) callbacks.onEndpointChange?.(epInput.value.trim());
      else callbacks.onCheckConnection?.();
    });
    epInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        checkBtn.click();
      }
    });
    epRow.append(epInput, checkBtn);
    epRowWrap.appendChild(epRow);

    const connFooterRow = el('div', 'ciyu-apple-row');
    const ollamaLink = el('a', 'ciyu-mini-btn', '下载 Ollama');
    ollamaLink.href = 'https://ollama.com/download';
    ollamaLink.target = '_blank';
    ollamaLink.rel = 'noopener noreferrer';
    connFooterRow.append(
      el('span', 'ciyu-toggle-desc', props.connectionDetail || '仅连接本机回环地址 127.0.0.1'),
      ollamaLink
    );

    modelPane.appendChild(createAppleGroup('服务连接', [connStatusRow, epRowWrap, connFooterRow]));

    // 自动发现本机模型（若有）
    if (props.discovery && callbacks.onDiscoverModels) {
      const discTopRow = el('div', 'ciyu-apple-row ciyu-apple-row--with-icon');
      const dLead = el('div', 'ciyu-apple-row-lead');
      dLead.append(
        createSquircleIcon('search', 'purple'),
        (() => {
          const t = el('div', 'ciyu-toggle-text');
          t.append(
            el('span', 'ciyu-toggle-title', '自动发现本机模型'),
            el(
              'span',
              'ciyu-toggle-desc',
              props.inference ? `当前使用：${props.inference.model}` : '检测 Ollama、LM Studio 及兼容端口'
            )
          );
          return t;
        })()
      );
      const searchBtn = el(
        'button',
        'ciyu-btn ciyu-btn--glass ciyu-btn--sm',
        props.discovery.status === 'finding' ? '检测中…' : '搜索本机模型'
      );
      searchBtn.type = 'button';
      searchBtn.disabled = props.discovery.status === 'finding';
      searchBtn.addEventListener('click', () => callbacks.onDiscoverModels?.());
      discTopRow.append(dLead, searchBtn);

      const discRows: HTMLElement[] = [discTopRow];
      if (props.discovery.status === 'ready' && !props.discovery.models.length) {
        const emptyRow = el('div', 'ciyu-apple-row');
        emptyRow.appendChild(el('span', 'ciyu-toggle-desc', '未发现可用的本机模型，请先启动本地服务。'));
        discRows.push(emptyRow);
      }
      for (const item of props.discovery.models) {
        const row = el('div', 'ciyu-apple-row');
        const info = el('div', 'ciyu-model-info');
        info.append(
          el('strong', 'ciyu-model-name', item.model),
          el('span', 'ciyu-toggle-desc', `${item.label} · ${item.port}`)
        );
        const use = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm', '接入');
        use.type = 'button';
        use.addEventListener('click', () => callbacks.onUseDiscovered?.(item));
        row.append(info, use);
        discRows.push(row);
      }
      modelPane.appendChild(createAppleGroup('本机兼容推理服务', discRows));
    }

    // 翻译与释义模型列表
    const modelRows: HTMLElement[] = [];
    const curModelRow = el('div', 'ciyu-apple-row');
    curModelRow.append(
      el('span', 'ciyu-toggle-title', '当前选定模型'),
      el(
        'span',
        'ciyu-apple-value',
        'Ollama：' +
          props.selectedModelId +
          (props.models.some((m) => m.id === props.selectedModelId && m.installed) ? '' : '（未安装）')
      )
    );
    modelRows.push(curModelRow);

    for (const model of props.models) {
      const selected = model.id === props.selectedModelId && !props.inference;
      const row = el('div', 'ciyu-apple-row ciyu-model-option');
      row.setAttribute('data-selected', String(selected));
      const info = el('div', 'ciyu-model-info');
      info.append(
        el('span', 'ciyu-model-name', model.name),
        el('span', 'ciyu-model-desc', `${model.sizeLabel} · ${model.recommendation}`)
      );

      if (model.installed) {
        const useBtn = el(
          'button',
          selected ? 'ciyu-btn ciyu-btn--saved ciyu-btn--sm' : 'ciyu-btn ciyu-btn--glass ciyu-btn--sm',
          selected ? '使用中' : '切换'
        );
        useBtn.type = 'button';
        useBtn.setAttribute('aria-pressed', String(selected));
        useBtn.disabled = Boolean(props.deletingModelId);
        useBtn.addEventListener('click', () => callbacks.onSelectModel?.(model.id));
        const actions = el('div', 'ciyu-model-actions');
        actions.appendChild(useBtn);
        if (callbacks.onDeleteModel) {
          const deleting = props.deletingModelId === model.id;
          const remove = el('button', 'ciyu-btn ciyu-btn--danger ciyu-btn--sm', deleting ? '删除中…' : '删除');
          remove.type = 'button';
          remove.setAttribute('aria-label', '删除本地模型 ' + model.name);
          remove.disabled =
            Boolean(props.deletingModelId) ||
            props.download.status === 'downloading' ||
            props.connectionStatus !== 'connected';
          remove.addEventListener('click', () => callbacks.onDeleteModel?.(model.id));
          actions.appendChild(remove);
        }
        row.append(info, actions);
      } else {
        const isDownloadingThis =
          props.download.status === 'downloading' && props.download.modelId === model.id;
        const dlBtn = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm');
        dlBtn.type = 'button';
        dlBtn.disabled = props.download.status === 'downloading' || Boolean(props.deletingModelId);
        dlBtn.append(
          createIcon('download', 'sm'),
          el('span', undefined, isDownloadingThis ? '下载中…' : '下载')
        );
        dlBtn.addEventListener('click', () => callbacks.onStartDownload?.(model.id));
        row.append(info, dlBtn);
      }
      modelRows.push(row);
    }

    if (callbacks.onCustomModel) {
      const formRow = el('div', 'ciyu-apple-row ciyu-apple-row--stack');
      const form = el('form', 'ciyu-endpoint-row');
      const custom = el('input', 'ciyu-input');
      custom.placeholder = '输入本地模型名称（如 qwen2.5:1.5b）';
      custom.setAttribute('aria-label', '本地模型名称');
      custom.required = true;
      custom.maxLength = 200;
      const add = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm', '选择');
      add.type = 'submit';
      form.append(custom, add);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        callbacks.onCustomModel?.(custom.value.trim());
      });
      formRow.appendChild(form);
      modelRows.push(formRow);
    }

    if (props.download.status !== 'idle') {
      const dlRow = el('div', 'ciyu-apple-row ciyu-apple-row--stack');
      const dlBox = el('div', 'ciyu-download-box');
      const dlMeta = el('div', 'ciyu-download-meta');
      if (props.download.status === 'downloading') {
        dlMeta.append(
          el('strong', undefined, `正在拉取 ${props.download.modelId ?? ''}`),
          el('span', undefined, `${props.download.progressPercent}%`)
        );
        const track = el('div', 'ciyu-progress-track');
        track.setAttribute('role', 'progressbar');
        track.setAttribute('aria-valuemin', '0');
        track.setAttribute('aria-valuemax', '100');
        track.setAttribute('aria-valuenow', String(props.download.progressPercent));
        const fill = el('div', 'ciyu-progress-fill');
        fill.style.width = `${props.download.progressPercent}%`;
        track.appendChild(fill);
        const bottom = el('div', 'ciyu-download-meta');
        bottom.appendChild(
          el(
            'span',
            undefined,
            [props.download.downloadedLabel, props.download.speedLabel].filter(Boolean).join(' · ')
          )
        );
        const cancelBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm', '取消');
        cancelBtn.type = 'button';
        cancelBtn.addEventListener('click', () => callbacks.onCancelDownload?.());
        bottom.appendChild(cancelBtn);
        dlBox.append(dlMeta, track, bottom);
      } else if (props.download.status === 'completed') {
        dlMeta.append(
          el('span', undefined, `${props.download.modelId ?? '模型'} 已下载就绪`),
          el('span', 'ciyu-status-pill ciyu-status-pill--ok', '100%')
        );
        dlBox.appendChild(dlMeta);
      } else if (props.download.status === 'error') {
        dlMeta.append(
          el('span', undefined, props.download.errorMessage ?? '模型下载中断'),
          el('span', 'ciyu-status-pill ciyu-status-pill--error', '失败')
        );
        const retryBtn = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm');
        retryBtn.type = 'button';
        retryBtn.append(createIcon('refresh-cw', 'sm'), el('span', undefined, '重试下载'));
        retryBtn.addEventListener('click', () =>
          callbacks.onRetryDownload?.(props.download.modelId ?? props.selectedModelId)
        );
        dlBox.append(dlMeta, retryBtn);
      }
      dlRow.appendChild(dlBox);
      modelRows.push(dlRow);
    }

    const easterEggModels: ReadonlyArray<{
      id: string;
      name: string;
      size: string;
      tag: string;
      reply: string;
    }> = [
      {
        id: 'lingbao-honor:v99',
        name: '王者灵宝',
        size: '0.01 GB',
        tag: '峡谷伴学',
        reply: '🦊 王者灵宝正在峡谷帮你抢蓝 Buff，暂时没空背单词，请选用上方正经本地模型~',
      },
      {
        id: 'talking-tom:pro',
        name: '会说话的汤姆猫',
        size: '1.14 MB',
        tag: '复读机引擎',
        reply: '🐱 汤姆猫只会用尖嗓子学你读单词，不会拆解词根，还是交给 Qwen 吧！',
      },
    ];

    for (const egg of easterEggModels) {
      const eggRow = el('div', 'ciyu-apple-row');
      const eggLead = el('div', 'ciyu-toggle-text');
      const eggHead = el('div', 'ciyu-paper-info');
      eggHead.append(
        el('span', 'ciyu-toggle-title', egg.name),
        el('span', 'ciyu-badge ciyu-badge--neutral', egg.tag)
      );
      eggLead.append(
        eggHead,
        el('span', 'ciyu-toggle-desc', `${egg.id} · ${egg.size}`)
      );
      const eggBtn = el('button', 'ciyu-mini-btn', '选用');
      eggBtn.type = 'button';
      eggBtn.addEventListener('click', () => {
        showCiyuToast(egg.reply, { tone: 'info' });
      });
      eggRow.append(eggLead, eggBtn);
      modelRows.push(eggRow);
    }

    modelPane.appendChild(createAppleGroup('翻译与释义模型', modelRows));

    // 测试翻译分组
    const testTopRow = el('div', 'ciyu-apple-row ciyu-apple-row--with-icon');
    const testLead = el('div', 'ciyu-apple-row-lead');
    testLead.append(
      createSquircleIcon('sparkles', 'purple'),
      (() => {
        const t = el('div', 'ciyu-toggle-text');
        t.append(
          el('span', 'ciyu-toggle-title', '测试翻译连通性'),
          el('span', 'ciyu-toggle-desc', `测试词：${props.translationTest.sampleText}`)
        );
        return t;
      })()
    );
    const runBtn = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm');
    runBtn.type = 'button';
    runBtn.disabled = props.translationTest.status === 'running';
    runBtn.append(
      createIcon(props.translationTest.status === 'error' ? 'refresh-cw' : 'sparkles', 'sm'),
      el(
        'span',
        undefined,
        props.translationTest.status === 'running'
          ? '测试中…'
          : props.translationTest.status === 'error'
            ? '重试测试'
            : '运行测试'
      )
    );
    runBtn.addEventListener('click', () => {
      if (props.translationTest.status === 'error') callbacks.onRetryTranslationTest?.();
      else callbacks.onRunTranslationTest?.();
    });
    testTopRow.append(testLead, runBtn);

    const testRows: HTMLElement[] = [testTopRow];
    if (props.translationTest.status === 'success' && props.translationTest.outputText) {
      const okRow = el('div', 'ciyu-apple-row ciyu-apple-row--stack');
      const okBox = el('div', 'ciyu-test-result ciyu-test-result--ok');
      okBox.append(
        el('div', undefined, props.translationTest.outputText),
        el('span', 'ciyu-next-review-tag', `响应正常 · 耗时 ${props.translationTest.latencyMs ?? 420} ms`)
      );
      okRow.appendChild(okBox);
      testRows.push(okRow);
    } else if (props.translationTest.status === 'error') {
      const errRow = el('div', 'ciyu-apple-row ciyu-apple-row--stack');
      const errBox = el('div', 'ciyu-test-result ciyu-test-result--error');
      errBox.setAttribute('role', 'alert');
      errBox.appendChild(
        el(
          'div',
          undefined,
          props.translationTest.errorMessage ?? '翻译测试超时：请检查本地 Ollama 是否已加载对应模型。'
        )
      );
      errRow.appendChild(errBox);
      testRows.push(errRow);
    }
    modelPane.appendChild(createAppleGroup('翻译自检', testRows));

    // ==================== 分类 D：笔记与归档 ====================
    const vaultPane = el('div', 'ciyu-apple-pane');
    vaultPane.dataset.applePane = 'vault';
    vaultPane.appendChild(el('h3', 'ciyu-apple-pane-title', '笔记与归档'));

    if (props.archiveFolder !== undefined) {
      const dirRow = el('div', 'ciyu-apple-row ciyu-apple-row--stack');
      const dirLead = el('div', 'ciyu-apple-row-lead');
      dirLead.append(
        createSquircleIcon('calendar-days', 'orange'),
        (() => {
          const t = el('div', 'ciyu-toggle-text');
          t.append(
            el('span', 'ciyu-toggle-title', '每日词汇归档目录'),
            el('span', 'ciyu-toggle-desc', '以「一词一独立块」按日期归档，并支持跨天查重跳转')
          );
          return t;
        })()
      );
      const form = el('form', 'ciyu-endpoint-row');
      const folder = el('input', 'ciyu-input');
      folder.defaultValue = props.archiveFolder;
      folder.setAttribute('aria-label', '每日归档目录');
      folder.required = true;
      const save = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm', '保存目录');
      save.type = 'submit';
      form.append(folder, save);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        callbacks.onArchiveFolderChange?.(folder.value.trim());
      });
      dirRow.append(dirLead, form);

      vaultPane.appendChild(
        createAppleGroup('每日归档与划词上下文', [
          dirRow,
          createToggleRow({
            title: '划词使用附近上下文',
            description: '将选区附近句子一并交给本地模型提升释义准确度',
            icon: 'file-text',
            tone: 'orange',
            checked: Boolean(props.useContext),
            onChange: (next) => callbacks.onContextChange?.(next),
          }),
        ])
      );
    } else {
      const emptyVaultRow = el('div', 'ciyu-apple-row');
      emptyVaultRow.appendChild(el('span', 'ciyu-toggle-desc', '在 Obsidian 仓库内打开设置即可配置每日归档目录。'));
      vaultPane.appendChild(createAppleGroup('每日归档', [emptyVaultRow]));
    }

    // ==================== 分类 E：关于词屿 ====================
    const aboutPane = el('div', 'ciyu-apple-pane');
    aboutPane.dataset.applePane = 'about';
    aboutPane.appendChild(el('h3', 'ciyu-apple-pane-title', '关于词屿'));

    const heroRow = el('div', 'ciyu-apple-row ciyu-apple-about-hero');
    const brandIcon = el('span', 'ciyu-apple-about-icon');
    brandIcon.appendChild(createBrandLogo());
    const brandInfo = el('div', 'ciyu-toggle-text');
    brandInfo.append(
      el('strong', 'ciyu-apple-about-name', '词屿 · Ciyu Study'),
      el('span', 'ciyu-toggle-desc', `版本 v${CIYU_VERSION} · Obsidian 英语查词、生词复习与六级精听插件`)
    );
    heroRow.append(brandIcon, brandInfo);

    const githubRow = el('div', 'ciyu-apple-row ciyu-apple-row--with-icon');
    const githubLead = el('div', 'ciyu-apple-row-lead');
    githubLead.append(
      createSquircleIcon('book-open', 'gray'),
      (() => {
        const t = el('div', 'ciyu-toggle-text');
        t.append(
          el('span', 'ciyu-toggle-title', '开源至 GitHub'),
          el('span', 'ciyu-toggle-desc', '查看源码、更新日志和正式安装包')
        );
        return t;
      })()
    );
    const githubLink = el('a', 'ciyu-mini-btn', '打开 GitHub');
    githubLink.href = 'https://github.com/yannie2025/ciyu-study';
    githubLink.target = '_blank';
    githubLink.rel = 'noopener noreferrer';
    githubRow.append(githubLead, githubLink);

    const logToggleRow = el('button', 'ciyu-apple-row ciyu-apple-row--with-icon ciyu-apple-row--clickable');
    logToggleRow.type = 'button';
    logToggleRow.setAttribute('aria-expanded', String(aboutChangelogExpanded));
    const logLead = el('div', 'ciyu-apple-row-lead');
    logLead.append(
      createSquircleIcon('file-text', 'blue'),
      el('span', 'ciyu-toggle-title', '缘起与完整更新日志')
    );
    const logRight = el('span', 'ciyu-apple-value', aboutChangelogExpanded ? '收起 ▴' : `v${CIYU_VERSION} ▾`);
    logToggleRow.append(logLead, logRight);
    logToggleRow.addEventListener('click', () => {
      aboutChangelogExpanded = !aboutChangelogExpanded;
      render();
    });

    const aboutRows: HTMLElement[] = [heroRow, githubRow, logToggleRow];
    if (aboutChangelogExpanded) {
      const logBoxRow = el('div', 'ciyu-apple-row ciyu-apple-row--stack');
      const fw = el('div', 'ciyu-changelog-foreword');
      fw.appendChild(el('strong', 'ciyu-changelog-foreword-title', CIYU_CHANGELOG_FOREWORD.title));
      for (const para of CIYU_CHANGELOG_FOREWORD.paragraphs) {
        fw.appendChild(el('p', 'ciyu-changelog-foreword-text', para));
      }
      const list = el('ol', 'ciyu-changelog-list');
      CIYU_CHANGELOG.forEach((entry, idx) => {
        const li = el('li', 'ciyu-changelog-item');
        const head = el('div', 'ciyu-changelog-item-head');
        head.append(
          el(
            'span',
            idx === 0 ? 'ciyu-changelog-ver ciyu-changelog-ver--latest' : 'ciyu-changelog-ver',
            `v${entry.version}`
          ),
          el('span', 'ciyu-changelog-item-title', entry.title),
          el('span', 'ciyu-changelog-date', entry.date)
        );
        const ul = el('ul', 'ciyu-changelog-points');
        for (const pt of entry.highlights) ul.appendChild(el('li', undefined, pt));
        li.append(head, ul);
        list.appendChild(li);
      });
      logBoxRow.append(fw, list);
      aboutRows.push(logBoxRow);
    }

    aboutPane.appendChild(createAppleGroup('通用信息', aboutRows));

    // ==================== 分类 B：离线词库 ====================
    const dictionariesPane = el('div', 'ciyu-apple-pane');
    dictionariesPane.dataset.applePane = 'dictionaries';
    dictionariesPane.appendChild(el('h3', 'ciyu-apple-pane-title', '离线词库'));
    if (props.dictionarySlot) {
      dictionariesPane.appendChild(props.dictionarySlot);
    } else {
      dictionariesPane.appendChild(
        createAppleGroup('词库包', [
          el('div', 'ciyu-apple-row', '暂无可管理的离线词库包。'),
        ])
      );
    }

    detail.append(appearancePane, dictionariesPane, speechPane, modelPane, vaultPane, aboutPane);
    layout.append(sideNav, detail);
    root.append(narrowBar, layout);
  }

  render();

  return {
    element: root,
    update(nextProps) {
      const focused = root.ownerDocument.activeElement;
      const inputs = Array.from(root.querySelectorAll('input'));
      const edited = inputs
        .filter((input) => input.value !== input.defaultValue)
        .map((input) => [input.getAttribute('aria-label'), input.value] as const);
      const focusLabel = root.contains(focused) ? focused?.getAttribute('aria-label') : null;
      const old = props;
      props = nextProps;
      if (nextProps.requestedCategory && nextProps.requestedCategory !== old.requestedCategory) {
        activeCategory = nextProps.requestedCategory;
        narrowFilter = nextProps.requestedCategory;
      }
      render();
      for (const input of root.querySelectorAll('input')) {
        const label = input.getAttribute('aria-label');
        if (
          (label !== 'Ollama 服务地址' || old.endpoint === props.endpoint) &&
          (label !== '每日归档目录' || old.archiveFolder === props.archiveFolder) &&
          (label !== '本地模型名称' || old.selectedModelId === props.selectedModelId) &&
          label !== '玻璃不透明度'
        ) {
          const editedInput = edited.find((item) => item[0] === label);
          if (editedInput) input.value = editedInput[1];
        }
        if (focusLabel && label === focusLabel) input.focus();
      }
      if (focusLabel) {
        Array.from(root.querySelectorAll('button'))
          .find((button) => button.getAttribute('aria-label') === focusLabel)
          ?.focus();
      }
    },
    destroy() {
      unsubProMotion();
      root.remove();
    },
  };
}
