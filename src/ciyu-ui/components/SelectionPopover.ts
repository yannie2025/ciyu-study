import { el } from '../dom';
import { createIcon } from '../icons';
import type {
  SelectionPopoverCallbacks,
  SelectionPopoverProps,
  UIComponentHandle,
} from '../types';
import { createResultCard } from './ResultCard';

/**
 * 视图 2：「划词」浮窗
 * 采用高对比度实色卡片材质（不使用 Liquid Glass 半透明模糊），支持按住顶部标题栏自由鼠标拖动。
 * 根节点自带 .ciyu-ui，可由 Obsidian 编辑器浮层独立挂载。
 */
export function createSelectionPopover(
  initialProps: SelectionPopoverProps,
  callbacks: SelectionPopoverCallbacks = {}
): UIComponentHandle<SelectionPopoverProps> {
  let props = initialProps;
  let cardHandle: UIComponentHandle<any> | null = null;

  const shell = el('div', 'ciyu-ui ciyu-reduced-transparency ciyu-popover-shell');
  shell.dataset.reducedTransparency = 'true';
  shell.setAttribute('role', 'dialog');
  shell.setAttribute('aria-modal', 'false');
  shell.setAttribute('aria-label', '词屿划词释义浮窗');

  const header = el('header', 'ciyu-popover-header');
  header.title = '按住顶栏可拖动浮窗位置';

  const pill = el('span', 'ciyu-popover-pill');
  pill.appendChild(createIcon('languages', 'sm'));
  const pillLabel = el('span', undefined, initialProps.selectionLabel ?? '划词翻译');
  pill.appendChild(pillLabel);

  const grip = el('span', 'ciyu-popover-drag-grip');
  grip.setAttribute('aria-hidden', 'true');

  const controls = el('div', 'ciyu-card-tools');

  const pinBtn = el('button', 'ciyu-icon-btn');
  pinBtn.type = 'button';
  pinBtn.title = '固定到右侧查词栏';
  pinBtn.setAttribute('aria-label', '固定到右侧查词栏');
  pinBtn.appendChild(createIcon('pin', 'sm'));
  pinBtn.addEventListener('click', () => callbacks.onPinToSidebar?.(props.entry));

  const closeBtn = el('button', 'ciyu-icon-btn');
  closeBtn.type = 'button';
  closeBtn.title = '关闭浮窗 (Esc)';
  closeBtn.setAttribute('aria-label', '关闭划词浮窗');
  closeBtn.appendChild(createIcon('x', 'sm'));
  closeBtn.addEventListener('click', () => callbacks.onClose?.());

  controls.append(pinBtn, closeBtn);
  header.append(pill, grip, controls);

  const body = el('div', 'ciyu-popover-body');
  shell.append(header, body);

  // 鼠标按住顶栏自由拖动
  let dragState: {
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null = null;

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, a, input, textarea, select')) return;
    const win = shell.ownerDocument.defaultView ?? window;
    const rect = shell.getBoundingClientRect();
    dragState = {
      pointerId: e.pointerId,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    };
    shell.dataset.dragging = 'true';
    header.setPointerCapture?.(e.pointerId);
    shell.style.left = `${Math.max(8, Math.min(rect.left, win.innerWidth - rect.width - 8))}px`;
    shell.style.top = `${Math.max(8, Math.min(rect.top, win.innerHeight - rect.height - 8))}px`;
    e.preventDefault();
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    const win = shell.ownerDocument.defaultView ?? window;
    const width = shell.offsetWidth || 360;
    const height = shell.offsetHeight || 240;
    const nextX = Math.max(8, Math.min(win.innerWidth - width - 8, e.clientX - dragState.offsetX));
    const nextY = Math.max(8, Math.min(win.innerHeight - height - 8, e.clientY - dragState.offsetY));
    shell.style.left = `${nextX}px`;
    shell.style.top = `${nextY}px`;
    callbacks.onDragMove?.({ x: nextX, y: nextY });
  };

  const endDrag = (e: PointerEvent) => {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    if (header.hasPointerCapture?.(e.pointerId)) {
      header.releasePointerCapture(e.pointerId);
    }
    dragState = null;
    delete shell.dataset.dragging;
  };

  header.addEventListener('pointerdown', onPointerDown);
  header.addEventListener('pointermove', onPointerMove);
  header.addEventListener('pointerup', endDrag);
  header.addEventListener('pointercancel', endDrag);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && props.visible) {
      callbacks.onClose?.();
    }
  };
  shell.addEventListener('keydown', onKeyDown);

  function render(): void {
    shell.hidden = !props.visible;
    pillLabel.textContent = props.selectionLabel ?? '划词翻译';

    if (!props.visible) return;

    if (!cardHandle) {
      cardHandle = createResultCard(
        {
          entry: props.entry,
          targetNotePath: props.targetNotePath,
          detailsExpanded: props.detailsExpanded ?? false,
          isSpeaking: props.isSpeaking,
          compact: true,
        },
        callbacks
      );
      body.appendChild(cardHandle.element);
    } else {
      cardHandle.update({
        entry: props.entry,
        targetNotePath: props.targetNotePath,
        detailsExpanded: props.detailsExpanded ?? false,
        isSpeaking: props.isSpeaking,
        compact: true,
      });
    }
  }

  render();

  return {
    element: shell,
    update(nextProps) {
      props = nextProps;
      render();
    },
    destroy() {
      header.removeEventListener('pointerdown', onPointerDown);
      header.removeEventListener('pointermove', onPointerMove);
      header.removeEventListener('pointerup', endDrag);
      header.removeEventListener('pointercancel', endDrag);
      shell.removeEventListener('keydown', onKeyDown);
      cardHandle?.destroy();
      shell.remove();
    },
  };
}
