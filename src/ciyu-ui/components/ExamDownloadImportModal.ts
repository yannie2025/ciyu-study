import { el } from '../dom';
import { createIcon } from '../icons';
import type {
  ExamModalCallbacks,
  ExamModalProps,
  ExamModalTab,
  UIComponentHandle,
} from '../types';

/**
 * 2. 下载和导入弹窗（ExamDownloadImportModal）
 * 包含「批量下载历年真题」与「导入样卷或其他试卷」双页签；
 * 支持考次分组、每套独立勾选、全选/清空、目标路径与文件夹选择、失败重试，
 * 以及官方样卷、HTTPS 直链与本地多文件（PDF/TXT/MD）导入；适配 320px+ 小窗口与键盘无障碍。
 */
export function createExamDownloadImportModal(
  initialProps: ExamModalProps,
  callbacks: ExamModalCallbacks = {}
): UIComponentHandle<ExamModalProps> {
  let props = initialProps;
  let lastTriggerEl: HTMLElement | null = null;
  let wasOpen = false;

  const backdrop = el('div', 'ciyu-ui ciyu-modal-backdrop');
  backdrop.hidden = !props.open;

  const dialog = el('div', 'ciyu-modal-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  const titleId = `ciyu-exam-modal-title-${Math.random().toString(36).slice(2, 8)}`;
  dialog.setAttribute('aria-labelledby', titleId);

  backdrop.appendChild(dialog);

  function closeModal(): void {
    if (props.busy) return;
    callbacks.onClose?.();
  }

  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) closeModal();
  });

  const onDocumentKeyDown = (e: KeyboardEvent) => {
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
      if (focusables.length === 0) return;
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
  document.addEventListener('keydown', onDocumentKeyDown, true);

  function createDestinationField(): HTMLElement {
    const wrap = el('div', 'ciyu-field');
    const label = el(
      'label',
      undefined,
      `目标文件夹（当前库：${props.vaultName || 'Obsidian Vault'}，留空为库根目录）`
    );
    const row = el('div', 'ciyu-endpoint-row');
    const input = el('input', 'ciyu-input');
    input.type = 'text';
    input.dataset.focusKey = 'target-folder';
    input.placeholder = '例如：词屿/六级题库';
    input.value = props.targetFolder;
    input.disabled = props.busy;
    input.setAttribute('aria-label', '目标文件夹相对路径');
    input.addEventListener('input', () => {
      props.targetFolder = input.value;
      callbacks.onTargetFolderChange?.(input.value);
    });

    const pickBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm');
    pickBtn.type = 'button';
    pickBtn.disabled = props.busy;
    pickBtn.append(createIcon('folder', 'sm'), el('span', undefined, '选择文件夹'));
    pickBtn.addEventListener('click', () => callbacks.onPickTargetFolder?.());

    row.append(input, pickBtn);
    wrap.append(label, row);

    if (props.folderError) {
      const err = el('span', 'ciyu-toggle-desc', props.folderError);
      err.style.color = 'var(--ciyu-danger)';
      wrap.appendChild(err);
    }
    return wrap;
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
    if (props.busy) {
      dialog.setAttribute('aria-busy', 'true');
    } else {
      dialog.removeAttribute('aria-busy');
    }

    // 1. 弹窗头部 + 分段切换
    const header = el('header', 'ciyu-modal-header');
    const titleRow = el('div', 'ciyu-modal-title-row');
    const title = el(
      'h3',
      'ciyu-modal-title',
      props.activeTab === 'batch_download' ? '批量下载历年六级真题' : '导入六级样卷或其他试卷'
    );
    title.id = titleId;

    const closeBtn = el('button', 'ciyu-icon-btn');
    closeBtn.type = 'button';
    closeBtn.disabled = props.busy;
    closeBtn.title = '关闭弹窗 (Esc)';
    closeBtn.setAttribute('aria-label', '关闭弹窗');
    closeBtn.appendChild(createIcon('x', 'sm'));
    closeBtn.addEventListener('click', closeModal);

    titleRow.append(title, closeBtn);

    const tabs = el('div', 'ciyu-modal-tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', '下载或导入方式');

    const makeTab = (id: ExamModalTab, text: string) => {
      const btn = el('button', 'ciyu-modal-tab', text);
      btn.type = 'button';
      btn.dataset.focusKey = `tab-${id}`;
      btn.disabled = props.busy;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', String(props.activeTab === id));
      btn.addEventListener('click', () => {
        if (props.activeTab !== id) callbacks.onTabChange?.(id);
      });
      return btn;
    };

    tabs.append(
      makeTab('batch_download', '批量下载历年真题'),
      makeTab('import_exam', '导入样卷 / 链接 / 本地')
    );

    header.append(titleRow, tabs);
    dialog.appendChild(header);

    // 2. 弹窗主体
    const body = el('div', 'ciyu-modal-body');
    body.appendChild(createDestinationField());

    const selectedSet = new Set(props.selectedPaperIds);
    const totalPapers = props.sessions.reduce((sum, s) => sum + s.papers.length, 0);

    if (props.activeTab === 'batch_download') {
      const toolbar = el('div', 'ciyu-check-toolbar');
      toolbar.appendChild(
        el(
          'span',
          'ciyu-section-label',
          `已勾选 ${selectedSet.size} / ${totalPapers} 套真题（2024.06 – 2026.06）`
        )
      );

      const allPapers = props.sessions.flatMap((s) => s.papers);
      const importedSelectedIds = allPapers
        .filter((p) => selectedSet.has(p.id) && p.status === 'downloaded')
        .map((p) => p.id);
      const totalImported = allPapers.filter((p) => p.status === 'downloaded').length;

      const batchTools = el('div', 'ciyu-toolbar-actions');
      const selectAllBtn = el('button', 'ciyu-mini-btn', '全选');
      selectAllBtn.type = 'button';
      selectAllBtn.dataset.focusKey = 'select-all';
      selectAllBtn.disabled = props.busy || selectedSet.size === totalPapers;
      selectAllBtn.addEventListener('click', () => callbacks.onSelectAllPapers?.());

      if (totalImported > 0) {
        const selectImpBtn = el('button', 'ciyu-mini-btn', '选已存');
        selectImpBtn.type = 'button';
        selectImpBtn.dataset.focusKey = 'select-imported';
        selectImpBtn.disabled = props.busy;
        selectImpBtn.addEventListener('click', () => callbacks.onSelectImportedPapers?.());
        batchTools.appendChild(selectImpBtn);
      }

      const clearAllBtn = el('button', 'ciyu-mini-btn', '清空');
      clearAllBtn.type = 'button';
      clearAllBtn.dataset.focusKey = 'clear-all';
      clearAllBtn.disabled = props.busy || selectedSet.size === 0;
      clearAllBtn.addEventListener('click', () => callbacks.onClearAllPapers?.());

      batchTools.append(selectAllBtn, clearAllBtn);
      toolbar.appendChild(batchTools);
      body.appendChild(toolbar);

      // 按考次分组独立勾选
      for (const session of props.sessions) {
        const fieldset = el('fieldset', 'ciyu-session-fieldset');
        const allCheckedInSession = session.papers.every((p) => selectedSet.has(p.id));

        const legendRow = el('div', 'ciyu-session-legend-row');
        const sessionToggleLabel = el('label', 'ciyu-check-pill-left');
        sessionToggleLabel.style.cursor = 'pointer';
        const sessionBox = el('input');
        sessionBox.type = 'checkbox';
        sessionBox.dataset.focusKey = `session-${session.sessionId}`;
        sessionBox.checked = allCheckedInSession;
        sessionBox.disabled = props.busy;
        sessionBox.setAttribute('aria-label', `全选 ${session.sessionLabel}`);
        sessionBox.addEventListener('change', () =>
          callbacks.onToggleSession?.(session.sessionId, sessionBox.checked)
        );
        sessionToggleLabel.append(
          sessionBox,
          el('strong', 'ciyu-toggle-title', session.sessionLabel)
        );

        const savedCount = session.papers.filter((p) => p.status === 'downloaded').length;
        legendRow.append(
          sessionToggleLabel,
          el(
            'span',
            'ciyu-next-review-tag',
            savedCount > 0 ? `本地已存 ${savedCount} 套` : '待下载'
          )
        );

        const grid = el('div', 'ciyu-checkbox-grid');
        for (const paper of session.papers) {
          const pill = el('label', 'ciyu-check-pill');
          const left = el('span', 'ciyu-check-pill-left');
          const cb = el('input');
          cb.type = 'checkbox';
          cb.dataset.focusKey = `paper-${paper.id}`;
          cb.checked = selectedSet.has(paper.id);
          cb.disabled = props.busy;
          cb.addEventListener('change', () =>
            callbacks.onTogglePaper?.(paper.id, cb.checked)
          );
          left.append(cb, el('span', undefined, `第 ${paper.setNumber} 套`));
          pill.appendChild(left);

          if (paper.status === 'downloaded') {
            pill.appendChild(el('span', 'ciyu-badge ciyu-badge--ok', '已存'));
          } else if (paper.status === 'error') {
            pill.appendChild(el('span', 'ciyu-badge ciyu-badge--error', '失败'));
          }
          grid.appendChild(pill);
        }

        fieldset.append(legendRow, grid);
        body.appendChild(fieldset);
      }

      // 下载进度与失败重试反馈
      if (props.progressStatus && props.progressStatus !== 'idle') {
        const statusBox = el('div', 'ciyu-download-box');
        statusBox.setAttribute('aria-live', 'polite');
        const meta = el('div', 'ciyu-download-meta');
        meta.append(
          el('strong', undefined, props.progressLabel ?? '正在处理真题…'),
          typeof props.progressPercent === 'number'
            ? el('span', undefined, `${props.progressPercent}%`)
            : el('span')
        );
        statusBox.appendChild(meta);

        if (typeof props.progressPercent === 'number') {
          const track = el('div', 'ciyu-progress-track');
          const fill = el('div', 'ciyu-progress-fill');
          fill.style.width = `${Math.max(5, Math.min(100, props.progressPercent))}%`;
          track.appendChild(fill);
          statusBox.appendChild(track);
        }

        if (props.failedPapers.length > 0) {
          const failList = el('ul', 'ciyu-failed-list');
          for (const f of props.failedPapers) {
            failList.appendChild(el('li', undefined, `${f.title}：${f.reason}`));
          }
          const retryFailedBtn = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm');
          retryFailedBtn.type = 'button';
          retryFailedBtn.disabled = props.busy;
          retryFailedBtn.style.alignSelf = 'flex-start';
          retryFailedBtn.append(
            createIcon('refresh-cw', 'sm'),
            el('span', undefined, `重试失败的 ${props.failedPapers.length} 套真题`)
          );
          retryFailedBtn.addEventListener('click', () =>
            callbacks.onRetryFailedPapers?.(
              props.failedPapers.map((f) => f.paperId),
              props.targetFolder.trim()
            )
          );
          statusBox.append(failList, retryFailedBtn);
        }
        body.appendChild(statusBox);
      }
    } else {
      // Tab 2：导入官方样卷、HTTPS 直链、本地多文件
      // 区块 1：官方样卷
      const officialBlock = el('section', 'ciyu-import-block');
      const offHead = el('div', 'ciyu-import-block-head');
      offHead.append(
        el('h4', 'ciyu-import-block-title', '1. 官方六级笔试样卷'),
        el(
          'span',
          props.officialSample.installed
            ? 'ciyu-badge ciyu-badge--ok'
            : 'ciyu-badge ciyu-badge--accent',
          props.officialSample.installed ? '已导入库内' : 'macOS 本机 OCR'
        )
      );
      officialBlock.append(
        offHead,
        el(
          'p',
          'ciyu-toggle-desc',
          props.officialSample.statusText ??
            '包含官方笔试样卷试题、听力文字稿与参考答案，文字识别在 macOS 本机离线完成。'
        )
      );
      const offBtn = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm');
      offBtn.type = 'button';
      offBtn.style.alignSelf = 'flex-start';
      offBtn.disabled = props.busy || !props.officialSample.ocrSupported;
      offBtn.append(
        createIcon('download', 'sm'),
        el(
          'span',
          undefined,
          props.officialSample.installed ? '重新导入官方六级样卷' : '下载并导入官方六级样卷'
        )
      );
      offBtn.addEventListener('click', () =>
        callbacks.onImportOfficialSample?.(props.targetFolder.trim())
      );
      officialBlock.appendChild(offBtn);

      // 区块 2：HTTPS 试卷文件直链
      const urlBlock = el('section', 'ciyu-import-block');
      urlBlock.append(
        el('h4', 'ciyu-import-block-title', '2. HTTPS 试卷文件直链'),
        el(
          'p',
          'ciyu-toggle-desc',
          '支持 https:// 开头的 PDF、TXT 或 Markdown 试卷文件直链（自动拒绝网页 HTML）。'
        )
      );
      const urlRow = el('div', 'ciyu-endpoint-row');
      const urlInput = el('input', 'ciyu-input');
      urlInput.type = 'url';
      urlInput.placeholder = 'https://example.edu.cn/cet6-sample.pdf';
      urlInput.value = props.directUrl;
      urlInput.disabled = props.busy;
      urlInput.setAttribute('aria-label', 'HTTPS 试卷文件直链');
      urlInput.addEventListener('input', () => {
        props.directUrl = urlInput.value;
        urlBtn.disabled = props.busy || !urlInput.value.trim();
        callbacks.onDirectUrlChange?.(urlInput.value);
      });

      const urlBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm', '下载并导入');
      urlBtn.type = 'button';
      urlBtn.disabled = props.busy || !props.directUrl.trim();
      urlBtn.addEventListener('click', () =>
        callbacks.onImportFromUrl?.(urlInput.value.trim(), props.targetFolder.trim())
      );
      urlRow.append(urlInput, urlBtn);
      urlBlock.appendChild(urlRow);

      if (props.directUrlError) {
        const err = el('span', 'ciyu-toggle-desc', props.directUrlError);
        err.style.color = 'var(--ciyu-danger)';
        urlBlock.appendChild(err);
      }

      // 区块 3：本地多文件导入（PDF / TXT / Markdown）
      const localBlock = el('section', 'ciyu-import-block');
      localBlock.append(
        el('h4', 'ciyu-import-block-title', '3. 批量导入本地试卷文件'),
        el('p', 'ciyu-toggle-desc', '可一次多选 PDF（带文字层）、TXT 或 Markdown 文件，单文件不超过 32 MB。')
      );

      const dropLabel = el('label', 'ciyu-file-drop');
      const fileInput = el('input', 'ciyu-sr-only');
      fileInput.type = 'file';
      fileInput.accept = '.pdf,.txt,.md,text/plain,text/markdown,application/pdf';
      fileInput.multiple = true;
      fileInput.disabled = props.busy;
      fileInput.addEventListener('change', () => {
        if (fileInput.files && fileInput.files.length > 0) {
          callbacks.onChooseLocalFiles?.(fileInput.files);
        }
      });
      dropLabel.append(
        createIcon('upload', 'md'),
        el('span', undefined, '点击选择本地 PDF / TXT / Markdown 试卷（支持多选）'),
        fileInput
      );
      localBlock.appendChild(dropLabel);

      if (props.selectedLocalFiles.length > 0) {
        const list = el('ul', 'ciyu-local-file-list');
        for (const item of props.selectedLocalFiles) {
          const row = el('li', 'ciyu-local-file-row');
          const info = el('div', 'ciyu-paper-info');
          info.append(
            el('span', 'ciyu-paper-set', item.name),
            el(
              'span',
              item.tooLarge || item.invalidExt
                ? 'ciyu-badge ciyu-badge--error'
                : 'ciyu-badge ciyu-badge--neutral',
              item.tooLarge ? `${item.sizeLabel} · 超过 32 MB` : item.sizeLabel
            )
          );
          const rmBtn = el('button', 'ciyu-icon-btn');
          rmBtn.type = 'button';
          rmBtn.disabled = props.busy;
          rmBtn.setAttribute('aria-label', `移除 ${item.name}`);
          rmBtn.appendChild(createIcon('x', 'sm'));
          rmBtn.addEventListener('click', () => callbacks.onRemoveLocalFile?.(item.id));
          row.append(info, rmBtn);
          list.appendChild(row);
        }
        localBlock.appendChild(list);
      }

      const validFiles = props.selectedLocalFiles.filter((f) => !f.tooLarge && !f.invalidExt);
      const localBtn = el(
        'button',
        'ciyu-btn ciyu-btn--primary ciyu-btn--sm',
        validFiles.length > 0 ? `导入所选 ${validFiles.length} 个文件` : '请先选择本地文件'
      );
      localBtn.type = 'button';
      localBtn.style.alignSelf = 'flex-start';
      localBtn.disabled = props.busy || validFiles.length === 0;
      localBtn.addEventListener('click', () =>
        callbacks.onImportLocalFiles?.(props.targetFolder.trim())
      );
      localBlock.appendChild(localBtn);

      body.append(officialBlock, urlBlock, localBlock);

      if (props.progressLabel || props.importError) {
        const statusBanner = el(
          'div',
          props.importError ? 'ciyu-banner ciyu-banner--error' : 'ciyu-banner ciyu-banner--info'
        );
        statusBanner.setAttribute('role', props.importError ? 'alert' : 'status');
        statusBanner.textContent = props.importError ?? props.progressLabel ?? '';
        body.appendChild(statusBanner);
      }
    }

    dialog.appendChild(body);

    // 3. 弹窗底部操作栏
    const footer = el('footer', 'ciyu-modal-footer');
    if (props.activeTab === 'batch_download') {
      footer.appendChild(
        el(
          'span',
          'ciyu-next-review-tag',
          '已存在且内容未变的笔记会自动跳过，不会覆盖你的手写批注。'
        )
      );
      const actions = el('div', 'ciyu-form-actions');
      const cancelBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm', '关闭');
      cancelBtn.type = 'button';
      cancelBtn.disabled = props.busy;
      cancelBtn.addEventListener('click', closeModal);

      const importedChecked = props.sessions
        .flatMap((s) => s.papers)
        .filter((p) => selectedSet.has(p.id) && p.status === 'downloaded')
        .map((p) => p.id);
      if (importedChecked.length > 0 && callbacks.onRequestBatchDeletePapers) {
        const delBtn = el('button', 'ciyu-btn ciyu-btn--danger ciyu-btn--sm');
        delBtn.type = 'button';
        delBtn.disabled = props.busy;
        delBtn.append(
          createIcon('trash-2', 'sm'),
          el('span', undefined, `删除已存 (${importedChecked.length})`)
        );
        delBtn.addEventListener('click', () =>
          callbacks.onRequestBatchDeletePapers?.(importedChecked)
        );
        actions.appendChild(delBtn);
      }

      const startBtn = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm');
      startBtn.type = 'button';
      startBtn.disabled = props.busy || selectedSet.size === 0;
      startBtn.append(
        createIcon('download', 'sm'),
        el(
          'span',
          undefined,
          props.busy ? '正在下载并生成索引…' : `下载所选 (${selectedSet.size}) 并生成索引`
        )
      );
      startBtn.addEventListener('click', () =>
        callbacks.onStartBatchDownload?.(
          Array.from(selectedSet),
          props.targetFolder.trim()
        )
      );

      actions.append(cancelBtn, startBtn);
      footer.appendChild(actions);
    } else {
      footer.appendChild(
        el('span', 'ciyu-next-review-tag', '同名笔记若内容不同将自动编号保存，绝不覆盖旧笔记。')
      );
      const doneBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm', '完成关闭');
      doneBtn.type = 'button';
      doneBtn.disabled = props.busy;
      doneBtn.addEventListener('click', closeModal);
      footer.appendChild(doneBtn);
    }
    dialog.appendChild(footer);

    if (!wasOpen) {
      wasOpen = true;
      requestAnimationFrame(() => {
        const firstFocus =
          dialog.querySelector<HTMLElement>('.ciyu-modal-tab[aria-selected="true"]') ??
          dialog.querySelector<HTMLElement>('input:not([disabled]), button:not([disabled])');
        firstFocus?.focus();
      });
    } else if (previousFocusKey) {
      const restored = dialog.querySelector<HTMLElement>(
        `[data-focus-key="${previousFocusKey}"]:not([disabled])`
      );
      restored?.focus({ preventScroll: true });
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
      document.removeEventListener('keydown', onDocumentKeyDown, true);
      backdrop.remove();
    },
  };
}
