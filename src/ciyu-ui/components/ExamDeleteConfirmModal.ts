import { el } from '../dom';
import { createIcon } from '../icons';
import type {
  ExamDeleteConfirmModalCallbacks,
  ExamDeleteConfirmModalProps,
  ExamDeleteMode,
  ExamDeleteOptions,
  UIComponentHandle,
} from '../types';

/**
 * 六级真题批量/单套删除确认与选项弹窗（Apple System Settings Sheet + Liquid Glass）
 * 提供安全「移入词屿回收站」与「彻底删除」两种模式，以及同步更新真题索引、关联音频/原文、错题记录等可勾选项。
 */
export function createExamDeleteConfirmModal(
  initialProps: ExamDeleteConfirmModalProps,
  callbacks: ExamDeleteConfirmModalCallbacks = {}
): UIComponentHandle<ExamDeleteConfirmModalProps> {
  let props = initialProps;
  let lastTriggerEl: HTMLElement | null = null;
  let wasOpen = false;

  const backdrop = el('div', 'ciyu-ui ciyu-modal-backdrop');
  backdrop.hidden = !props.open;

  const dialog = el('div', 'ciyu-modal-dialog ciyu-delete-confirm-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  const titleId = `ciyu-delete-modal-title-${Math.random().toString(36).slice(2, 8)}`;
  dialog.setAttribute('aria-labelledby', titleId);

  backdrop.appendChild(dialog);

  function closeModal(): void {
    if (props.busy) return;
    callbacks.onClose?.();
  }

  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) closeModal();
  });

  const onKeyDown = (e: KeyboardEvent) => {
    if (!props.open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeModal();
      return;
    }
    if (e.key === 'Tab') {
      const focusables = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((node) => !node.closest('[hidden]'));
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!dialog.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  document.addEventListener('keydown', onKeyDown, true);

  function patchOptions(patch: Partial<ExamDeleteOptions>): void {
    const next: ExamDeleteOptions = {
      ...props.options,
      ...patch,
    };
    if (patch.mode === 'trash') {
      next.acknowledgePermanent = false;
    }
    props = { ...props, options: next };
    callbacks.onOptionsChange?.(next);
    render();
  }

  function render(): void {
    backdrop.hidden = !props.open;
    if (!props.open) {
      if (wasOpen && lastTriggerEl?.isConnected) {
        lastTriggerEl.focus();
      }
      wasOpen = false;
      return;
    }
    if (!wasOpen) {
      lastTriggerEl = document.activeElement as HTMLElement | null;
    }
    const previousFocusKey = dialog.contains(document.activeElement)
      ? (document.activeElement as HTMLElement | null)?.dataset?.focusKey
      : undefined;

    dialog.innerHTML = '';
    const count = props.targets.length;
    const opts = props.options;
    const busy = Boolean(props.busy);
    const trashFolder = props.trashFolderLabel || '词屿/回收站';

    // 1. 头部
    const header = el('header', 'ciyu-modal-header');
    const titleRow = el('div', 'ciyu-modal-title-row');
    const titleGroup = el('div', 'ciyu-paper-info');
    const dangerIconBadge = el('span', 'ciyu-alert-icon ciyu-alert-icon--danger');
    dangerIconBadge.appendChild(createIcon('trash-2', 'sm'));
    const titleEl = el(
      'h3',
      'ciyu-modal-title',
      count > 1 ? `确认批量删除 ${count} 套六级真题` : '确认删除已导入真题'
    );
    titleEl.id = titleId;
    titleGroup.append(dangerIconBadge, titleEl);

    const closeBtn = el('button', 'ciyu-icon-btn');
    closeBtn.type = 'button';
    closeBtn.disabled = busy;
    closeBtn.setAttribute('aria-label', '关闭删除确认弹窗');
    closeBtn.appendChild(createIcon('x', 'sm'));
    closeBtn.addEventListener('click', closeModal);

    titleRow.append(titleGroup, closeBtn);
    header.appendChild(titleRow);
    dialog.appendChild(header);

    // 2. 主体内容
    const body = el('div', 'ciyu-modal-body');

    // 待删除试卷预览列表
    const targetSection = el('section', 'ciyu-delete-target-box');
    targetSection.appendChild(
      el('span', 'ciyu-section-label', `即将处理的真题（共 ${count} 套）`)
    );
    const targetList = el('ul', 'ciyu-delete-target-list');
    for (const item of props.targets) {
      const li = el('li', 'ciyu-delete-target-row');
      const left = el('div', 'ciyu-delete-target-main');
      left.append(
        el('strong', 'ciyu-paper-set', item.title),
        el('span', 'ciyu-folder-path', item.notePath)
      );
      const badges = el('div', 'ciyu-toolbar-actions');
      if (item.hasTranscript) {
        badges.appendChild(el('span', 'ciyu-badge ciyu-badge--neutral', '含听力全文'));
      }
      if (item.hasOfflineAudio) {
        badges.appendChild(el('span', 'ciyu-badge ciyu-badge--accent', '含离线音频'));
      }
      if (item.mistakeCount && item.mistakeCount > 0) {
        badges.appendChild(
          el('span', 'ciyu-badge ciyu-badge--warn', `错题 ${item.mistakeCount} 条`)
        );
      }
      li.append(left, badges);
      targetList.appendChild(li);
    }
    targetSection.appendChild(targetList);
    body.appendChild(targetSection);

    // 删除方式选择（Apple 分组单选卡片）
    const modeSection = el('div', 'ciyu-delete-mode-group');
    modeSection.setAttribute('role', 'radiogroup');
    modeSection.setAttribute('aria-label', '选择真题删除方式');
    modeSection.appendChild(el('span', 'ciyu-section-label', '删除方式'));

    const modes: Array<{
      id: ExamDeleteMode;
      title: string;
      badge: string;
      badgeCls: string;
      desc: string;
    }> = [
      {
        id: 'trash',
        title: `移入「${trashFolder}」`,
        badge: '推荐 · 可恢复',
        badgeCls: 'ciyu-badge ciyu-badge--ok',
        desc: '将真题笔记安全移入词屿回收站，保留你在卷中写过的批注，误删后可一键撤销或手动找回。',
      },
      {
        id: 'permanent',
        title: '彻底从当前库中删除',
        badge: '不可撤销',
        badgeCls: 'ciyu-badge ciyu-badge--error',
        desc: '直接永久移除库内的真题 Markdown 文件，无法通过词屿撤销恢复。',
      },
    ];

    const modeCards = el('div', 'ciyu-delete-mode-cards');
    for (const m of modes) {
      const active = opts.mode === m.id;
      const card = el(
        'label',
        active
          ? `ciyu-delete-mode-card ciyu-delete-mode-card--active ciyu-delete-mode-card--${m.id}`
          : 'ciyu-delete-mode-card'
      );
      const radioRow = el('div', 'ciyu-session-legend-row');
      const left = el('span', 'ciyu-check-pill-left');
      const radio = el('input');
      radio.type = 'radio';
      radio.name = 'ciyu-exam-delete-mode';
      radio.dataset.focusKey = `mode-${m.id}`;
      radio.checked = active;
      radio.disabled = busy;
      radio.addEventListener('change', () => {
        if (radio.checked) patchOptions({ mode: m.id });
      });
      left.append(radio, el('strong', 'ciyu-toggle-title', m.title));
      radioRow.append(left, el('span', m.badgeCls, m.badge));
      card.append(radioRow, el('p', 'ciyu-toggle-desc', m.desc));
      modeCards.appendChild(card);
    }
    modeSection.appendChild(modeCards);
    body.appendChild(modeSection);

    // 关联清理选项（Apple Inset Grouped Checkboxes）
    const optGroup = el('section', 'ciyu-surface ciyu-delete-options-card');
    optGroup.appendChild(el('span', 'ciyu-section-label', '确定删除的关联选项'));

    const makeOptionRow = (
      key: keyof Pick<
        ExamDeleteOptions,
        'updateIndexNote' | 'deleteAssociatedMedia' | 'deleteAssociatedMistakes'
      >,
      title: string,
      desc: string
    ) => {
      const row = el('label', 'ciyu-delete-option-row');
      const textWrap = el('div', 'ciyu-delete-option-text');
      textWrap.append(
        el('span', 'ciyu-toggle-title', title),
        el('span', 'ciyu-toggle-desc', desc)
      );
      const cb = el('input');
      cb.type = 'checkbox';
      cb.dataset.focusKey = `opt-${key}`;
      cb.checked = Boolean(opts[key]);
      cb.disabled = busy;
      cb.addEventListener('change', () => patchOptions({ [key]: cb.checked }));
      row.append(textWrap, cb);
      return row;
    };

    optGroup.append(
      makeOptionRow(
        'updateIndexNote',
        '同步更新「真题索引.md」',
        '将已删除套卷在索引表中恢复为「待导入」，避免残留失效双链。'
      ),
      makeOptionRow(
        'deleteAssociatedMedia',
        '同时删除关联的独立听力原文与离线音频',
        '清理 听力原文/ 与 听力音频/ 下对应文件；仍被其他已导入套卷共用的听力将自动保留。'
      ),
      makeOptionRow(
        'deleteAssociatedMistakes',
        '同时清除所选套卷的错题本记录',
        '默认不勾选，以便继续保留你整理过的错题与复盘笔记。'
      )
    );
    body.appendChild(optGroup);

    // 彻底删除二次确认勾选
    if (opts.mode === 'permanent') {
      const warnBox = el('label', 'ciyu-banner ciyu-banner--error ciyu-delete-ack-row');
      const cb = el('input');
      cb.type = 'checkbox';
      cb.dataset.focusKey = 'ack-permanent';
      cb.checked = opts.acknowledgePermanent;
      cb.disabled = busy;
      cb.addEventListener('change', () =>
        patchOptions({ acknowledgePermanent: cb.checked })
      );
      const txt = el(
        'span',
        undefined,
        '我已知晓彻底删除后原卷及可能包含的个人手写批注无法恢复，确认永久删除。'
      );
      warnBox.append(cb, txt);
      body.appendChild(warnBox);
    }

    if (props.errorMessage) {
      const errBanner = el('div', 'ciyu-banner ciyu-banner--error');
      errBanner.setAttribute('role', 'alert');
      errBanner.append(
        createIcon('alert-circle', 'sm'),
        el('span', undefined, props.errorMessage)
      );
      body.appendChild(errBanner);
    }

    dialog.appendChild(body);

    // 3. 底部操作栏（默认焦点在取消按钮，防止误按回车直接删库）
    const footer = el('footer', 'ciyu-modal-footer');
    const hint = el(
      'span',
      'ciyu-toggle-desc',
      opts.mode === 'trash'
        ? `安全提示：移入「${trashFolder}」后可随时恢复。`
        : opts.acknowledgePermanent
        ? '已勾选永久删除确认，请谨慎执行。'
        : '请先勾选上方的永久删除确认项。'
    );

    const actions = el('div', 'ciyu-toolbar-actions');
    const cancelBtn = el('button', 'ciyu-btn ciyu-btn--secondary ciyu-btn--sm', '取消');
    cancelBtn.type = 'button';
    cancelBtn.dataset.focusKey = 'cancel-delete';
    cancelBtn.disabled = busy;
    cancelBtn.addEventListener('click', closeModal);

    const canConfirm =
      count > 0 && !busy && (opts.mode === 'trash' || opts.acknowledgePermanent);
    const confirmBtn = el('button', 'ciyu-btn ciyu-btn--danger ciyu-btn--sm');
    confirmBtn.type = 'button';
    confirmBtn.dataset.focusKey = 'confirm-delete';
    confirmBtn.disabled = !canConfirm;
    confirmBtn.append(
      createIcon('trash-2', 'sm'),
      el(
        'span',
        undefined,
        busy
          ? '正在处理删除…'
          : opts.mode === 'trash'
          ? `确认移入回收站（${count} 套）`
          : `确认彻底删除（${count} 套）`
      )
    );
    confirmBtn.addEventListener('click', () => {
      if (!canConfirm) return;
      callbacks.onConfirmDelete?.(
        props.targets.map((t) => t.paperId),
        opts
      );
    });

    actions.append(cancelBtn, confirmBtn);
    footer.append(hint, actions);
    dialog.appendChild(footer);

    if (!wasOpen) {
      wasOpen = true;
      queueMicrotask(() => cancelBtn.focus());
    } else if (previousFocusKey) {
      const target = dialog.querySelector<HTMLElement>(
        `[data-focus-key="${previousFocusKey}"]`
      );
      target?.focus();
    }
  }

  render();

  return {
    element: backdrop,
    update(nextProps) {
      props = nextProps;
      render();
    },
    destroy() {
      document.removeEventListener('keydown', onKeyDown, true);
      backdrop.remove();
    },
  };
}
