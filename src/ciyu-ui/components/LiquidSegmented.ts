import { el } from '../dom';
import { normalizeDragVelocity } from '../promotion';

const prevLensIndexMap = new Map<string, number>();

export interface AttachLiquidLensOptions {
  container: HTMLElement;
  buttons: HTMLButtonElement[];
  activeIndex: number;
  cacheKey: string;
  onSelect: (index: number) => void;
}

/**
 * 为任意横向分段栏挂载 iOS 27 悬浮液态玻璃透镜（纯白银亮高光边、零重排 rAF 合帧、全局 window 防丢追踪）
 */
export function attachLiquidLens(options: AttachLiquidLensOptions): void {
  const { container, buttons, activeIndex, cacheKey, onSelect } = options;
  if (buttons.length === 0) return;

  const safeActive = Math.max(0, Math.min(buttons.length - 1, activeIndex));
  const prevIdx = prevLensIndexMap.get(cacheKey);
  prevLensIndexMap.set(cacheKey, safeActive);

  container.classList.add('ciyu-liquid-seg-host');
  const lens = el('div', 'ciyu-liquid-lens');
  lens.setAttribute('aria-hidden', 'true');
  container.insertBefore(lens, container.firstChild);

  let pointerDown = false;
  let isDragging = false;
  let activePointerId = -1;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let hoveredIdx = safeActive;
  let downIdx = safeActive;
  let holdTimer: number | null = null;
  let glideTimer: number | null = null;
  let dragRaf: number | null = null;
  let cachedRect: DOMRect | null = null;
  let cachedBtns: Array<{ left: number; width: number; center: number }> = [];

  function cacheGeometry(): void {
    cachedRect = container.getBoundingClientRect();
    cachedBtns = buttons.map((b) => ({
      left: b.offsetLeft,
      width: b.offsetWidth,
      center: b.offsetLeft + b.offsetWidth / 2,
    }));
  }

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
    const rect = cachedRect ?? container.getBoundingClientRect();
    if (rect.width <= 0 || buttons.length === 0) return 0;
    const rel = Math.max(0, Math.min(rect.width - 1, clientX - rect.left));
    const list =
      cachedBtns.length === buttons.length
        ? cachedBtns
        : buttons.map((b) => ({
            left: b.offsetLeft,
            width: b.offsetWidth,
            center: b.offsetLeft + b.offsetWidth / 2,
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

  function updateDragLens(clientX: number, vx: number): void {
    const rect = cachedRect ?? container.getBoundingClientRect();
    const ref = cachedBtns[hoveredIdx] ?? cachedBtns[0];
    if (!ref || rect.width <= 0) return;
    const lensW = ref.width;
    const minLeft = cachedBtns[0]?.left ?? 3;
    const lastBtn = cachedBtns[cachedBtns.length - 1];
    const maxLeft = lastBtn ? lastBtn.left : Math.max(minLeft, rect.width - lensW - 3);
    let rawLeft = clientX - rect.left - lensW / 2;
    if (rawLeft < minLeft) rawLeft = minLeft - Math.min(8, (minLeft - rawLeft) * 0.2);
    else if (rawLeft > maxLeft) rawLeft = maxLeft + Math.min(8, (rawLeft - maxLeft) * 0.2);

    const speed = Math.min(24, Math.abs(vx));
    const sx = 1.05 + speed * 0.005;
    const sy = 1.1 - speed * 0.002;
    lens.style.width = `${lensW}px`;
    lens.style.transform = `translate3d(${rawLeft.toFixed(1)}px, 0, 0) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;

    const idx = indexFromClientX(clientX);
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
    lastMoveTime = 0;
    container.dataset.dragging = 'true';
    hoveredIdx = indexFromClientX(clientX);
    updateDragLens(clientX, 0);
  }

  let lastMoveTime = 0;
  const onWinMove = (e: PointerEvent) => {
    if (!pointerDown || e.pointerId !== activePointerId) return;
    if (e.pointerType === 'mouse' && e.buttons === 0) {
      finishPointer(e, true);
      return;
    }
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dt = lastMoveTime > 0 ? now - lastMoveTime : 16.67;
    lastMoveTime = now;
    const vx = normalizeDragVelocity(e.clientX - lastX, dt);
    lastX = e.clientX;
    if (!isDragging && Math.hypot(e.clientX - startX, e.clientY - startY) > 4) {
      if (holdTimer) {
        window.clearTimeout(holdTimer);
        holdTimer = null;
      }
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
  const onWinBlur = () => {
    if (!pointerDown) return;
    detachWin();
    pointerDown = false;
    if (holdTimer) {
      window.clearTimeout(holdTimer);
      holdTimer = null;
    }
    if (dragRaf) {
      cancelAnimationFrame(dragRaf);
      dragRaf = null;
    }
    const wasDrag = isDragging;
    isDragging = false;
    delete container.dataset.dragging;
    buttons.forEach((b) => delete b.dataset.dragHover);
    const targetIdx = wasDrag ? indexFromClientX(lastX) : safeActive;
    cachedRect = null;
    positionLens(targetIdx, false);
    if (targetIdx !== safeActive) onSelect(targetIdx);
  };

  function attachWin(): void {
    window.addEventListener('pointermove', onWinMove, true);
    window.addEventListener('pointerup', onWinUp, true);
    window.addEventListener('pointercancel', onWinCancel, true);
    window.addEventListener('blur', onWinBlur);
  }

  function detachWin(): void {
    window.removeEventListener('pointermove', onWinMove, true);
    window.removeEventListener('pointerup', onWinUp, true);
    window.removeEventListener('pointercancel', onWinCancel, true);
    window.removeEventListener('blur', onWinBlur);
  }

  function finishPointer(e: PointerEvent, commit: boolean): void {
    if (!pointerDown || e.pointerId !== activePointerId) return;
    detachWin();
    pointerDown = false;
    if (holdTimer) {
      window.clearTimeout(holdTimer);
      holdTimer = null;
    }
    if (dragRaf) {
      cancelAnimationFrame(dragRaf);
      dragRaf = null;
    }
    try {
      if (container.hasPointerCapture?.(e.pointerId)) container.releasePointerCapture(e.pointerId);
    } catch {}
    const wasDrag = isDragging;
    isDragging = false;
    delete container.dataset.dragging;
    buttons.forEach((b) => delete b.dataset.dragHover);

    const targetIdx = commit ? (wasDrag ? indexFromClientX(e.clientX) : downIdx) : safeActive;
    cachedRect = null;
    if (!wasDrag && targetIdx !== safeActive) {
      container.dataset.gliding = 'true';
      if (glideTimer) window.clearTimeout(glideTimer);
      glideTimer = window.setTimeout(() => {
        delete container.dataset.gliding;
      }, 360);
    }
    positionLens(targetIdx, false);
    if (commit && targetIdx !== safeActive) {
      onSelect(targetIdx);
    }
  }

  container.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    cacheGeometry();
    pointerDown = true;
    isDragging = false;
    activePointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    lastX = e.clientX;
    downIdx = indexFromClientX(e.clientX);
    hoveredIdx = downIdx;
    try {
      container.setPointerCapture(e.pointerId);
    } catch {}
    attachWin();
    if (holdTimer) window.clearTimeout(holdTimer);
    holdTimer = window.setTimeout(() => {
      if (pointerDown && !isDragging) enterDrag(lastX);
    }, 150);
  });

  // 键盘无障碍直触 click
  buttons.forEach((btn, idx) => {
    btn.addEventListener('click', (e) => {
      if (e.detail === 0 && idx !== safeActive) onSelect(idx);
    });
  });

  requestAnimationFrame(() => {
    if (prevIdx !== undefined && prevIdx !== safeActive && buttons[prevIdx]) {
      positionLens(prevIdx, true);
      container.dataset.gliding = 'true';
      requestAnimationFrame(() => {
        positionLens(safeActive, false);
        glideTimer = window.setTimeout(() => {
          delete container.dataset.gliding;
        }, 360);
      });
    } else {
      positionLens(safeActive, true);
    }
  });

  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      if (!isDragging) positionLens(safeActive, true);
    });
    ro.observe(container);
  }
}
