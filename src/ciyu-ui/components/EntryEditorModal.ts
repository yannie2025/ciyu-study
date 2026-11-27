import { el } from '../dom';
import { createIcon } from '../icons';
import type {
  EntryEditorFieldValues,
  EntryEditorModalCallbacks,
  EntryEditorModalProps,
  UIComponentHandle,
} from '../types';

/**
 * 词条完整编辑 / 手动添加生词弹窗（重绘版 · Apple System Settings 分组表单）
 */
export function createEntryEditorModal(
  initialProps: EntryEditorModalProps,
  callbacks: EntryEditorModalCallbacks = {}
): UIComponentHandle<EntryEditorModalProps> {
  let props = initialProps;
  let draft: EntryEditorFieldValues = { ...initialProps.values };
  let localError = '';
  let wasOpen = false;
  let lastTriggerEl: HTMLElement | null = null;

  const backdrop = el('div', 'ciyu-ui ciyu-modal-backdrop');
  backdrop.hidden = !props.open;

  const dialog = el('div', 'ciyu-modal-dialog ciyu-entry-editor-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  const titleId = `ciyu-entry-modal-title-${Math.random().toString(36).slice(2, 8)}`;
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
    }
  };
  document.addEventListener('keydown', onKeyDown, true);

  function makeField<K extends keyof EntryEditorFieldValues>(
    key: K,
    labelText: string,
    opts: {
      multiline?: boolean;
      rows?: number;
      placeholder?: string;
      required?: boolean;
      maxLength?: number;
    } = {}
  ): HTMLElement {
    const wrap = el('label', 'ciyu-field');
    wrap.appendChild(
      el('span', 'ciyu-field-label', opts.required ? `${labelText} *` : labelText)
    );
    if (opts.multiline) {
      const area = el('textarea', 'ciyu-textarea');
      area.rows = opts.rows ?? 2;
      area.maxLength = opts.maxLength ?? 2000;
      if (opts.placeholder) area.placeholder = opts.placeholder;
      area.value = draft[key] ?? '';
      area.disabled = Boolean(props.busy);
      area.addEventListener('input', () => {
        draft[key] = area.value;
      });
      wrap.appendChild(area);
    } else {
      const input = el('input', 'ciyu-input');
      input.type = 'text';
      input.maxLength = opts.maxLength ?? 1000;
      if (opts.placeholder) input.placeholder = opts.placeholder;
      if (opts.required) input.required = true;
      input.value = draft[key] ?? '';
      input.disabled = Boolean(props.busy);
      input.dataset.entryField = key;
      input.addEventListener('input', () => {
        draft[key] = input.value;
      });
      wrap.appendChild(input);
    }
    return wrap;
  }

  function render(): void {
    backdrop.hidden = !props.open;
    if (!props.open) {
      if (wasOpen && lastTriggerEl?.isConnected) lastTriggerEl.focus();
      wasOpen = false;
      return;
    }
    if (!wasOpen) {
      lastTriggerEl = document.activeElement as HTMLElement | null;
      draft = { ...props.values };
      localError = '';
    }

    dialog.innerHTML = '';

    const header = el('header', 'ciyu-modal-header');
    const titleRow = el('div', 'ciyu-modal-title-row');
    const titleGroup = el('div', 'ciyu-paper-info');
    const iconBadge = el('span', 'ciyu-pack-icon ciyu-pack-icon--accent');
    iconBadge.appendChild(createIcon('pencil', 'sm'));
    const titleEl = el('h3', 'ciyu-modal-title', props.title);
    titleEl.id = titleId;
    titleGroup.append(iconBadge, titleEl);

    const closeBtn = el('button', 'ciyu-icon-btn');
    closeBtn.type = 'button';
    closeBtn.disabled = Boolean(props.busy);
    closeBtn.setAttribute('aria-label', '关闭编辑弹窗');
    closeBtn.appendChild(createIcon('x', 'sm'));
    closeBtn.addEventListener('click', closeModal);

    titleRow.append(titleGroup, closeBtn);
    header.appendChild(titleRow);
    dialog.appendChild(header);

    const form = el('form', 'ciyu-entry-editor-form');
    const body = el('div', 'ciyu-modal-body');

    // 分组 1：核心词义
    const coreGroup = el('section', 'ciyu-surface ciyu-inset-group');
    coreGroup.appendChild(el('span', 'ciyu-section-label', '核心词义'));
    const twoCol = el('div', 'ciyu-form-two-col');
    twoCol.append(
      makeField('term', '原词 / 短语', {
        required: true,
        placeholder: '例如 resilience',
        maxLength: 1000,
      }),
      makeField('pronunciation', '音标', { placeholder: '/rɪˈzɪliəns/' })
    );
    const posRow = el('div', 'ciyu-form-two-col');
    posRow.append(
      makeField('partOfSpeech', '词性', { placeholder: 'n. / v. / adj.' }),
      makeField('forms', '词形变化', { placeholder: '复数、过去式等（每行或分号分隔）' })
    );
    coreGroup.append(
      twoCol,
      posRow,
      makeField('translation', '中文释义', {
        multiline: true,
        rows: 2,
        required: true,
        placeholder: '填写核心中文释义',
      }),
      makeField('otherMeanings', '其他常用义', {
        multiline: true,
        rows: 2,
        placeholder: '每行一条补充释义（可选）',
        maxLength: 6011,
      })
    );
    body.appendChild(coreGroup);

    // 分组 2：搭配与词源拓展
    const lexGroup = el('section', 'ciyu-surface ciyu-inset-group');
    lexGroup.appendChild(el('span', 'ciyu-section-label', '搭配与词根词缀（可选）'));
    lexGroup.append(
      makeField('phrases', '常用搭配', {
        multiline: true,
        rows: 2,
        placeholder: '每行一条，例如 build resilience — 增强韧性',
        maxLength: 6011,
      }),
      makeField('derivatives', '派生词', {
        multiline: true,
        rows: 2,
        placeholder: '每行一条，例如 resilient — 有韧性的',
        maxLength: 6011,
      }),
      makeField('roots', '词根词缀', {
        multiline: true,
        rows: 2,
        placeholder: '例如 re-（回）+ salire（跳）',
        maxLength: 6011,
      })
    );
    body.appendChild(lexGroup);

    // 分组 3：例句、来源与个人备注
    const ctxGroup = el('section', 'ciyu-surface ciyu-inset-group');
    ctxGroup.appendChild(el('span', 'ciyu-section-label', '语境与个人备注（可选）'));
    ctxGroup.append(
      makeField('examples', '双语例句', {
        multiline: true,
        rows: 2,
        placeholder: '英文例句 — 中文译文（每行一条）',
        maxLength: 6011,
      }),
      makeField('context', '来源原句', {
        multiline: true,
        rows: 2,
        placeholder: '摘自真题或阅读笔记的原句（可用于挖空复习）',
      }),
      makeField('note', '个人助记 / 备注', {
        multiline: true,
        rows: 2,
        placeholder: '记录易混辨析或记忆线索',
      })
    );
    body.appendChild(ctxGroup);

    const errText = localError || props.errorMessage;
    if (errText) {
      const errBanner = el('div', 'ciyu-banner ciyu-banner--error');
      errBanner.setAttribute('role', 'alert');
      errBanner.append(createIcon('alert-circle', 'sm'), el('span', undefined, errText));
      body.appendChild(errBanner);
    }

    const footer = el('footer', 'ciyu-modal-footer');
    footer.appendChild(
      el('span', 'ciyu-toggle-desc', '带 * 为必填项，按 Esc 可随时取消关闭。')
    );
    const actions = el('div', 'ciyu-toolbar-actions');
    const cancelBtn = el('button', 'ciyu-btn ciyu-btn--secondary ciyu-btn--sm', '取消');
    cancelBtn.type = 'button';
    cancelBtn.disabled = Boolean(props.busy);
    cancelBtn.addEventListener('click', closeModal);

    const saveBtn = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm');
    saveBtn.type = 'submit';
    saveBtn.disabled = Boolean(props.busy);
    saveBtn.append(
      createIcon('check', 'sm'),
      el('span', undefined, props.busy ? '正在保存…' : '保存词条')
    );

    actions.append(cancelBtn, saveBtn);
    footer.appendChild(actions);

    form.append(body, footer);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (props.busy) return;
      if (!draft.term.trim() || !draft.translation.trim()) {
        localError = '请填写原词和中文释义。';
        render();
        return;
      }
      localError = '';
      try {
        await callbacks.onSave?.({ ...draft });
      } catch (err) {
        localError = (err as Error)?.message || '保存失败，请重试。';
        render();
      }
    });

    dialog.appendChild(form);

    if (!wasOpen) {
      wasOpen = true;
      queueMicrotask(() => {
        dialog.querySelector<HTMLInputElement>('input[data-entry-field="term"]')?.focus();
      });
    }
  }

  render();

  return {
    element: backdrop,
    update(nextProps) {
      const reopening = !props.open && nextProps.open;
      props = nextProps;
      if (reopening) {
        draft = { ...nextProps.values };
        localError = '';
      }
      render();
    },
    destroy() {
      document.removeEventListener('keydown', onKeyDown, true);
      backdrop.remove();
    },
  };
}
