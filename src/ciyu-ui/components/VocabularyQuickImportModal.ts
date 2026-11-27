import { el } from '../dom';
import { createIcon } from '../icons';
import type {
  UIComponentHandle,
  VocabImportTab,
  VocabQuickImportModalCallbacks,
  VocabQuickImportModalProps,
} from '../types';

/**
 * 生词本三合一快捷导入弹窗（Apple System Settings Sheet 风格）
 * 1. 批量粘贴词单（支持纯英文列表自动调离线词库补全音标/词性/中文释义，或中英同行解析）
 * 2. 导入本地词表文件（TXT / CSV / TSV / Anki 导出文件）
 * 3. 从库内 Markdown 笔记一键提取（每日归档、词屿笔记、真题阅读笔记）
 */
export function createVocabularyQuickImportModal(
  initialProps: VocabQuickImportModalProps,
  callbacks: VocabQuickImportModalCallbacks = {}
): UIComponentHandle<VocabQuickImportModalProps> {
  let props = initialProps;
  let wasOpen = false;
  let lastTriggerEl: HTMLElement | null = null;

  const backdrop = el('div', 'ciyu-ui ciyu-modal-backdrop');
  backdrop.hidden = !props.open;

  const dialog = el('div', 'ciyu-modal-dialog ciyu-vocab-import-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  const titleId = `ciyu-vocab-import-title-${Math.random().toString(36).slice(2, 8)}`;
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

  function renderCandidatePreview(container: HTMLElement): void {
    if (props.candidates.length === 0) return;

    const dictCount = props.candidates.filter((c) => c.matchStatus === 'dict').length;
    const parsedCount = props.candidates.filter((c) => c.matchStatus === 'parsed').length;
    const dupCount = props.candidates.filter((c) => c.matchStatus === 'duplicate').length;
    const missingCount = props.candidates.filter((c) => c.matchStatus === 'missing').length;
    const validSelected = props.candidates.filter(
      (c) => c.selected && c.meaningZh.trim().length > 0 && c.matchStatus !== 'duplicate'
    );
    const allValid = props.candidates.filter(
      (c) => c.meaningZh.trim().length > 0 && c.matchStatus !== 'duplicate'
    );

    const previewBox = el('section', 'ciyu-surface ciyu-inset-group');
    const head = el('div', 'ciyu-check-toolbar');
    const stats = el('div', 'ciyu-toolbar-actions');
    stats.appendChild(
      el('span', 'ciyu-badge ciyu-badge--ok', `可导入 ${validSelected.length} 个`)
    );
    if (dictCount > 0) {
      stats.appendChild(
        el('span', 'ciyu-badge ciyu-badge--accent', `离线词库补全 ${dictCount}`)
      );
    }
    if (parsedCount > 0) {
      stats.appendChild(
        el('span', 'ciyu-badge ciyu-badge--neutral', `自带释义 ${parsedCount}`)
      );
    }
    if (dupCount > 0) {
      stats.appendChild(
        el('span', 'ciyu-badge ciyu-badge--neutral', `已存在跳过 ${dupCount}`)
      );
    }
    if (missingCount > 0) {
      stats.appendChild(
        el('span', 'ciyu-badge ciyu-badge--warn', `待补释义 ${missingCount}`)
      );
    }

    const batchBtns = el('div', 'ciyu-toolbar-actions');
    if (missingCount > 0 && props.aiAvailable && callbacks.onAiFillMissing) {
      const aiFillBtn = el('button', 'ciyu-mini-btn ciyu-mini-btn--accent');
      aiFillBtn.type = 'button';
      aiFillBtn.disabled = Boolean(props.busy);
      aiFillBtn.append(
        createIcon('sparkles', 'sm'),
        el('span', undefined, `AI 补全未命中 (${missingCount})`)
      );
      aiFillBtn.addEventListener('click', () => callbacks.onAiFillMissing?.());
      batchBtns.appendChild(aiFillBtn);
    }

    const allChecked = allValid.length > 0 && validSelected.length === allValid.length;
    const toggleAllBtn = el('button', 'ciyu-mini-btn', allChecked ? '清空勾选' : '全选可用');
    toggleAllBtn.type = 'button';
    toggleAllBtn.disabled = Boolean(props.busy) || allValid.length === 0;
    toggleAllBtn.addEventListener('click', () =>
      callbacks.onSelectAllValidCandidates?.(!allChecked)
    );
    batchBtns.appendChild(toggleAllBtn);

    head.append(stats, batchBtns);
    previewBox.appendChild(head);

    const list = el('ul', 'ciyu-vocab-candidate-list');
    for (const item of props.candidates) {
      const row = el('li', 'ciyu-vocab-candidate-row');
      if (item.matchStatus === 'duplicate') {
        row.classList.add('ciyu-vocab-candidate-row--dup');
      }

      const topLine = el('div', 'ciyu-vocab-candidate-top');
      const leftLabel = el('label', 'ciyu-check-pill-left');
      leftLabel.style.cursor = item.matchStatus === 'duplicate' ? 'default' : 'pointer';
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = item.selected && item.matchStatus !== 'duplicate';
      cb.disabled = Boolean(props.busy) || item.matchStatus === 'duplicate';
      cb.addEventListener('change', () =>
        callbacks.onToggleCandidate?.(item.id, cb.checked)
      );
      leftLabel.append(cb, el('strong', 'ciyu-paper-set', item.word));
      if (item.phonetic) {
        leftLabel.appendChild(el('span', 'ciyu-phonetic', item.phonetic));
      }
      if (item.partOfSpeech) {
        leftLabel.appendChild(el('span', 'ciyu-pos-tag', item.partOfSpeech));
      }

      const statusBadge =
        item.matchStatus === 'duplicate'
          ? el('span', 'ciyu-badge ciyu-badge--neutral', '已在生词本')
          : item.matchStatus === 'dict'
          ? el('span', 'ciyu-badge ciyu-badge--ok', item.providerLabel ?? '词库自动补全')
          : item.matchStatus === 'parsed'
          ? el('span', 'ciyu-badge ciyu-badge--accent', '解析成功')
          : el('span', 'ciyu-badge ciyu-badge--warn', '请补中文释义');

      topLine.append(leftLabel, statusBadge);
      row.appendChild(topLine);

      if (item.matchStatus !== 'duplicate') {
        const meaningInput = el('input', 'ciyu-input ciyu-vocab-candidate-input');
        meaningInput.type = 'text';
        meaningInput.placeholder = '点击补充该词中文释义（补全后自动纳入导入）…';
        meaningInput.value = item.meaningZh;
        meaningInput.disabled = Boolean(props.busy);
        meaningInput.addEventListener('change', () =>
          callbacks.onUpdateCandidateMeaning?.(item.id, meaningInput.value)
        );
        row.appendChild(meaningInput);
      } else {
        row.appendChild(el('span', 'ciyu-toggle-desc', item.meaningZh));
      }

      list.appendChild(row);
    }
    previewBox.appendChild(list);
    container.appendChild(previewBox);
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
    }

    dialog.innerHTML = '';
    const busy = Boolean(props.busy);

    // 1. 头部 + 三合一导入方式分段导航
    const header = el('header', 'ciyu-modal-header');
    const titleRow = el('div', 'ciyu-modal-title-row');
    const titleGroup = el('div', 'ciyu-paper-info');
    const iconBadge = el('span', 'ciyu-pack-icon ciyu-pack-icon--accent');
    iconBadge.appendChild(createIcon('download', 'sm'));
    const titleEl = el('h3', 'ciyu-modal-title', '快捷批量导入生词本');
    titleEl.id = titleId;
    titleGroup.append(iconBadge, titleEl);

    const closeBtn = el('button', 'ciyu-icon-btn');
    closeBtn.type = 'button';
    closeBtn.disabled = busy;
    closeBtn.setAttribute('aria-label', '关闭快捷导入弹窗');
    closeBtn.appendChild(createIcon('x', 'sm'));
    closeBtn.addEventListener('click', closeModal);

    titleRow.append(titleGroup, closeBtn);

    const tabs = el('div', 'ciyu-modal-tabs ciyu-modal-tabs--3col');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', '生词本导入来源');
    const tabDefs: Array<{ id: VocabImportTab; label: string }> = [
      { id: 'paste_list', label: '1. 粘贴词单自动补全' },
      { id: 'import_file', label: '2. 导入词表/Anki 文件' },
      { id: 'from_notes', label: '3. 从库内笔记提取' },
    ];
    for (const t of tabDefs) {
      const btn = el('button', 'ciyu-modal-tab', t.label);
      btn.type = 'button';
      btn.disabled = busy;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', String(props.activeTab === t.id));
      btn.addEventListener('click', () => {
        if (props.activeTab !== t.id) callbacks.onTabChange?.(t.id);
      });
      tabs.appendChild(btn);
    }

    header.append(titleRow, tabs);
    dialog.appendChild(header);

    // 2. 主体
    const body = el('div', 'ciyu-modal-body');

    if (props.activeTab === 'paste_list') {
      const pasteCard = el('section', 'ciyu-surface ciyu-inset-group');
      pasteCard.append(
        el('span', 'ciyu-section-label', '直接粘贴单词列表（支持纯英文词表或带释义词条）'),
        el(
          'p',
          'ciyu-toggle-desc',
          '每行一个单词（或逗号分隔），只贴英文即可由内置常用 / 四六级离线词典毫秒级补全音标、词性与中文释义；也支持「word — 释义」或「word + Tab + 释义」格式。'
        )
      );

      const area = el('textarea', 'ciyu-textarea ciyu-vocab-paste-area');
      area.rows = 5;
      area.placeholder =
        '示例（直接粘贴即可）：\nsustainable\nresilience\nunprecedented\nalleviate — 缓解；减轻';
      area.value = props.pasteText;
      area.disabled = busy;
      area.addEventListener('input', () => {
        props.pasteText = area.value;
        callbacks.onPasteTextChange?.(area.value);
      });

      const parseRow = el('div', 'ciyu-form-actions');
      const parseBtn = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm');
      parseBtn.type = 'button';
      parseBtn.disabled = busy;
      parseBtn.append(
        createIcon('sparkles', 'sm'),
        el('span', undefined, busy ? '正在匹配离线词库…' : '智能解析并补全释义')
      );
      parseBtn.addEventListener('click', () => callbacks.onParsePasteList?.(area.value));
      parseRow.appendChild(parseBtn);

      pasteCard.append(area, parseRow);
      body.appendChild(pasteCard);

      renderCandidatePreview(body);
    } else if (props.activeTab === 'import_file') {
      const fileCard = el('section', 'ciyu-surface ciyu-inset-group');
      fileCard.append(
        el('span', 'ciyu-section-label', '选择本地生词表文件（TXT / CSV / TSV / Anki）'),
        el(
          'p',
          'ciyu-toggle-desc',
          '兼容纯英文 TXT 词单（自动查离线词库补全释义）、Excel/表格导出的 CSV / TSV、欧路/有道文本词本，以及 Anki 导出的 TSV 文本牌组。'
        )
      );

      const dropLabel = el('label', 'ciyu-file-drop');
      const fileInput = el('input', 'ciyu-sr-only');
      fileInput.type = 'file';
      fileInput.accept = '.txt,.csv,.tsv,.md,text/plain,text/csv,text/tab-separated-values';
      fileInput.multiple = true;
      fileInput.disabled = busy;
      fileInput.addEventListener('change', () => {
        if (fileInput.files && fileInput.files.length > 0) {
          callbacks.onUploadFiles?.(fileInput.files);
        }
      });
      dropLabel.append(
        createIcon('upload', 'md'),
        el(
          'span',
          undefined,
          props.uploadedFileName
            ? `已读取文件：${props.uploadedFileName}（点击可重新选择）`
            : '点击选择 TXT / CSV / TSV / Anki 词表文件（可多选）'
        ),
        fileInput
      );
      fileCard.appendChild(dropLabel);
      body.appendChild(fileCard);

      renderCandidatePreview(body);
    } else {
      // Tab 3：从库内 Markdown 笔记一键提取
      const notesCard = el('section', 'ciyu-surface ciyu-inset-group');
      const headRow = el('div', 'ciyu-check-toolbar');
      headRow.appendChild(
        el('span', 'ciyu-section-label', '扫描当前库内含词条的 Markdown 笔记')
      );

      const tools = el('div', 'ciyu-toolbar-actions');
      const selectableNotes = props.noteSources.filter((n) => n.newEntries > 0);
      const allNotesChecked =
        selectableNotes.length > 0 && selectableNotes.every((n) => n.selected);

      const selAllBtn = el(
        'button',
        'ciyu-mini-btn',
        allNotesChecked ? '清空选择' : '全选待同步笔记'
      );
      selAllBtn.type = 'button';
      selAllBtn.disabled = busy || selectableNotes.length === 0;
      selAllBtn.addEventListener('click', () =>
        callbacks.onSelectAllNoteSources?.(!allNotesChecked)
      );

      const refreshBtn = el('button', 'ciyu-mini-btn');
      refreshBtn.type = 'button';
      refreshBtn.disabled = busy;
      refreshBtn.append(createIcon('refresh-cw', 'sm'), el('span', undefined, '重新扫描'));
      refreshBtn.addEventListener('click', () => callbacks.onRefreshNoteSources?.());

      tools.append(selAllBtn, refreshBtn);
      headRow.appendChild(tools);
      notesCard.append(
        headRow,
        el(
          'p',
          'ciyu-toggle-desc',
          '自动识别「每日词汇归档」「词屿笔记」及阅读/真题笔记中插入过的 ## / ### 词条，同步后自动保留来源笔记跳转与原句挖空语境。'
        )
      );

      if (props.noteSources.length === 0) {
        notesCard.appendChild(
          el(
            'div',
            'ciyu-next-review-tag',
            '当前库中暂未扫描到带词条格式的 Markdown 笔记。你可先使用「粘贴词单」或「导入文件」。'
          )
        );
      } else {
        const list = el('ul', 'ciyu-inset-list');
        for (const src of props.noteSources) {
          const row = el('li', 'ciyu-inset-row');
          const label = el('label', 'ciyu-inset-row-main');
          label.style.cursor = src.newEntries > 0 ? 'pointer' : 'default';
          const cb = el('input');
          cb.type = 'checkbox';
          cb.checked = src.selected && src.newEntries > 0;
          cb.disabled = busy || src.newEntries === 0;
          cb.addEventListener('change', () =>
            callbacks.onToggleNoteSource?.(src.path, cb.checked)
          );

          const textCol = el('div', 'ciyu-inset-row-text');
          textCol.append(
            el('strong', 'ciyu-toggle-title', src.title),
            el('span', 'ciyu-folder-path', src.path)
          );
          label.append(cb, textCol);

          const rightBadges = el('div', 'ciyu-toolbar-actions');
          rightBadges.appendChild(
            el(
              'span',
              'ciyu-badge ciyu-badge--neutral',
              src.category === 'archive'
                ? '每日归档'
                : src.category === 'study'
                ? '词屿笔记'
                : '阅读笔记'
            )
          );
          rightBadges.appendChild(
            el(
              'span',
              src.newEntries > 0 ? 'ciyu-badge ciyu-badge--ok' : 'ciyu-badge ciyu-badge--neutral',
              src.newEntries > 0
                ? `可新导入 ${src.newEntries} / ${src.totalEntries} 词`
                : `全部 ${src.totalEntries} 词已在生词本`
            )
          );

          row.append(label, rightBadges);
          list.appendChild(row);
        }
        notesCard.appendChild(list);
      }
      body.appendChild(notesCard);
    }

    if (props.statusMessage) {
      const okBanner = el('div', 'ciyu-banner ciyu-banner--ok');
      okBanner.setAttribute('role', 'status');
      okBanner.append(createIcon('check', 'sm'), el('span', undefined, props.statusMessage));
      body.appendChild(okBanner);
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

    // 3. 底部确认栏
    const footer = el('footer', 'ciyu-modal-footer');
    const shortcutTip = el(
      'span',
      'ciyu-toggle-desc',
      '小贴士：平时阅读时选中单词可直接点悬浮胶囊的「+ 生词」或绑定快捷键秒加生词。'
    );

    const actions = el('div', 'ciyu-toolbar-actions');
    const closeFooterBtn = el('button', 'ciyu-btn ciyu-btn--secondary ciyu-btn--sm', '关闭');
    closeFooterBtn.type = 'button';
    closeFooterBtn.disabled = busy;
    closeFooterBtn.addEventListener('click', closeModal);
    actions.appendChild(closeFooterBtn);

    if (props.activeTab === 'from_notes') {
      const totalNewFromNotes = props.noteSources
        .filter((n) => n.selected)
        .reduce((sum, n) => sum + n.newEntries, 0);
      const importNotesBtn = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm');
      importNotesBtn.type = 'button';
      importNotesBtn.disabled = busy || totalNewFromNotes === 0;
      importNotesBtn.append(
        createIcon('download', 'sm'),
        el(
          'span',
          undefined,
          busy
            ? '正在提取入库…'
            : totalNewFromNotes > 0
            ? `一键同步 ${totalNewFromNotes} 个新词入生词本`
            : '请勾选含新词的笔记'
        )
      );
      importNotesBtn.addEventListener('click', () => callbacks.onConfirmImportFromNotes?.());
      actions.appendChild(importNotesBtn);
    } else {
      const readyCount = props.candidates.filter(
        (c) => c.selected && c.meaningZh.trim().length > 0 && c.matchStatus !== 'duplicate'
      ).length;
      const confirmBtn = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm');
      confirmBtn.type = 'button';
      confirmBtn.disabled = busy || readyCount === 0;
      confirmBtn.append(
        createIcon('check', 'sm'),
        el(
          'span',
          undefined,
          busy
            ? '正在批量导入…'
            : readyCount > 0
            ? `确认导入 ${readyCount} 个生词`
            : '请先解析词单或选择词表文件'
        )
      );
      confirmBtn.addEventListener('click', () => callbacks.onConfirmImportCandidates?.());
      actions.appendChild(confirmBtn);
    }

    footer.append(shortcutTip, actions);
    dialog.appendChild(footer);

    if (!wasOpen) {
      wasOpen = true;
      queueMicrotask(() => {
        const firstFocus =
          dialog.querySelector<HTMLElement>('textarea:not([disabled])') ??
          dialog.querySelector<HTMLElement>('.ciyu-modal-tab[aria-selected="true"]');
        firstFocus?.focus();
      });
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
