import { el } from '../dom';
import { speechButton } from './LookupTools';
import { createIcon } from '../icons';
import type {
  UIComponentHandle,
  VocabularyDraft,
  VocabularyItem,
  VocabularyViewCallbacks,
  VocabularyViewProps,
} from '../types';

/**
 * 视图 3：「生词本」列表
 * 提供搜索、手动添加、编辑、删除确认、来源笔记跳转、今日待复习数量及 Anki 导出入口。
 */
export function createVocabularyView(
  initialProps: VocabularyViewProps,
  callbacks: VocabularyViewCallbacks = {}
): UIComponentHandle<VocabularyViewProps> {
  let props = initialProps;
  let editorMode: null | { type: 'add' } | { type: 'edit'; item: VocabularyItem } = null;
  let confirmingDeleteId: string | null = null;

  const root = el('section', 'ciyu-vocab-view');
  root.setAttribute('aria-label', '生词本');

  // 持久胶囊搜索框，避免输入时丢失焦点
  const searchWrap = el('div', 'ciyu-glass ciyu-glass-refract ciyu-search-capsule');
  searchWrap.setAttribute('role', 'search');
  const sIcon = createIcon('search', 'sm');
  sIcon.classList.add('ciyu-search-icon');

  const searchInput = el('input', 'ciyu-search-input');
  searchInput.type = 'search';
  searchInput.placeholder = '搜索单词、释义或来源笔记…';
  searchInput.setAttribute('aria-label', '搜索生词本');
  searchInput.value = initialProps.searchQuery;

  const clearBtn = el('button', 'ciyu-icon-btn');
  clearBtn.type = 'button';
  clearBtn.setAttribute('aria-label', '清除搜索');
  clearBtn.appendChild(createIcon('x', 'sm'));
  clearBtn.hidden = initialProps.searchQuery.length === 0;
  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.hidden = true;
    callbacks.onSearchChange?.('');
    searchInput.focus();
  });

  searchInput.addEventListener('input', () => {
    clearBtn.hidden = searchInput.value.length === 0;
    callbacks.onSearchChange?.(searchInput.value);
  });

  searchWrap.append(sIcon, searchInput, clearBtn);

  const summaryHost = el('div');
  const editorHost = el('div');
  const listHost = el('div');

  root.append(summaryHost, searchWrap, editorHost, listHost);

  function renderSummary(): void {
    summaryHost.innerHTML = '';
    const strip = el('div', 'ciyu-glass ciyu-summary-strip');

    const dueBtn = el('button', 'ciyu-due-pill');
    dueBtn.type = 'button';
    dueBtn.title = '进入今日复习';
    dueBtn.append(
      el('span', undefined, '今日待复习'),
      el('span', 'ciyu-due-count', String(props.dueTodayCount))
    );
    dueBtn.addEventListener('click', () => callbacks.onStartReview?.());

    const actions = el('div', 'ciyu-toolbar-actions');

    if (callbacks.onOpenQuickImport) {
      const quickImportBtn = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm');
      quickImportBtn.type = 'button';
      quickImportBtn.title = '批量粘贴词单、导入 TXT/CSV/Anki 文件，或从库内笔记一键提取';
      quickImportBtn.append(
        createIcon('download', 'sm'),
        el('span', undefined, '快捷导入')
      );
      quickImportBtn.addEventListener('click', () => callbacks.onOpenQuickImport?.());
      actions.appendChild(quickImportBtn);
    }

    const addBtn = el(
      'button',
      callbacks.onOpenQuickImport
        ? 'ciyu-btn ciyu-btn--glass ciyu-btn--sm'
        : 'ciyu-btn ciyu-btn--primary ciyu-btn--sm'
    );
    addBtn.type = 'button';
    addBtn.append(createIcon('plus', 'sm'), el('span', undefined, '添加'));
    addBtn.addEventListener('click', () => {
      editorMode = editorMode?.type === 'add' ? null : { type: 'add' };
      confirmingDeleteId = null;
      renderEditor();
    });

    const exportBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm');
    exportBtn.type = 'button';
    exportBtn.title = '导出为 Anki 牌组 (.tsv)';
    exportBtn.append(createIcon('upload', 'sm'), el('span', undefined, '导出'));
    exportBtn.addEventListener('click', () => callbacks.onExportAnki?.());

    actions.append(addBtn, exportBtn);
    strip.append(dueBtn, actions);
    summaryHost.appendChild(strip);
  }

  function renderEditor(): void {
    editorHost.innerHTML = '';
    if (!editorMode) return;

    const isEdit = editorMode.type === 'edit';
    const current = editorMode.type === 'edit' ? editorMode.item : null;

    const form = el('form', 'ciyu-surface ciyu-inline-editor');
    form.setAttribute('aria-label', isEdit ? '编辑生词' : '手动添加生词');

    const title = el(
      'strong',
      'ciyu-settings-title',
      isEdit ? `编辑「${current!.word}」` : '手动添加生词'
    );

    const wordField = el('div', 'ciyu-field');
    wordField.appendChild(el('label', undefined, '单词或短语 *'));
    const wordRow = el('div', 'ciyu-endpoint-row');
    const wordInput = el('input', 'ciyu-input');
    wordInput.required = true;
    wordInput.placeholder = '输入英文，点右侧自动补全释义';
    wordInput.value = current?.word ?? '';
    wordRow.appendChild(wordInput);

    if (callbacks.onAutoFillDraft) {
      const autoBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm', '词库补全');
      autoBtn.type = 'button';
      autoBtn.title = '从内置离线词典自动带出音标、词性与中文释义';
      const triggerAutoFill = async () => {
        const w = wordInput.value.trim();
        if (!w) return;
        const filled = await callbacks.onAutoFillDraft?.(w);
        if (!filled) return;
        if (filled.phonetic && !phoneticInput.value.trim()) phoneticInput.value = filled.phonetic;
        if (filled.partOfSpeech && (!posInput.value.trim() || posInput.value === 'n.')) {
          posInput.value = filled.partOfSpeech;
        }
        if (filled.meaningZh && !meaningInput.value.trim()) meaningInput.value = filled.meaningZh;
      };
      autoBtn.addEventListener('click', () => void triggerAutoFill());
      wordInput.addEventListener('blur', () => {
        if (!isEdit && wordInput.value.trim() && !meaningInput.value.trim()) {
          void triggerAutoFill();
        }
      });
      wordRow.appendChild(autoBtn);
    }
    wordField.appendChild(wordRow);

    const metaGrid = el('div', 'ciyu-endpoint-row');
    const posField = el('div', 'ciyu-field');
    posField.style.flex = '1';
    posField.appendChild(el('label', undefined, '词性'));
    const posInput = el('input', 'ciyu-input');
    posInput.placeholder = 'n. / adj.';
    posInput.value = current?.partOfSpeech ?? 'n.';
    posField.appendChild(posInput);

    const phoneticField = el('div', 'ciyu-field');
    phoneticField.style.flex = '1.4';
    phoneticField.appendChild(el('label', undefined, '音标'));
    const phoneticInput = el('input', 'ciyu-input');
    phoneticInput.placeholder = '/ˌserənˈdɪpəti/';
    phoneticInput.value = current?.phonetic ?? '';
    phoneticField.appendChild(phoneticInput);
    metaGrid.append(posField, phoneticField);

    const meaningField = el('div', 'ciyu-field');
    meaningField.appendChild(el('label', undefined, '中文释义 *'));
    const meaningInput = el('input', 'ciyu-input');
    meaningInput.required = true;
    meaningInput.placeholder = '例如：意外发现美好事物的运气；机缘巧合';
    meaningInput.value = current?.meaningZh ?? '';
    meaningField.appendChild(meaningInput);

    const sourceField = el('div', 'ciyu-field');
    sourceField.appendChild(el('label', undefined, '来源笔记路径'));
    const sourceInput = el('input', 'ciyu-input');
    sourceInput.placeholder = '例如：阅读笔记/交互设计随笔.md';
    sourceInput.value = current?.sourceNotePath ?? '';
    sourceField.appendChild(sourceInput);

    const sentenceField = el('div', 'ciyu-field');
    sentenceField.appendChild(el('label', undefined, '来源例句（可选）'));
    const sentenceInput = el('textarea', 'ciyu-textarea');
    sentenceInput.rows = 2;
    sentenceInput.placeholder = '贴入原文语境，复习时可启用原句挖空';
    sentenceInput.value = current?.sourceSentence ?? '';
    sentenceField.appendChild(sentenceInput);

    const actions = el('div', 'ciyu-form-actions');
    const cancelBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm', '取消');
    cancelBtn.type = 'button';
    cancelBtn.addEventListener('click', () => {
      editorMode = null;
      renderEditor();
    });

    const submitBtn = el(
      'button',
      'ciyu-btn ciyu-btn--primary ciyu-btn--sm',
      isEdit ? '保存更改' : '添加到生词本'
    );
    submitBtn.type = 'submit';
    actions.append(cancelBtn, submitBtn);
    if (isEdit && current && callbacks.onEditItemDetails) {
      const fullEdit = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm', '编辑全部字段');
      fullEdit.type = 'button';
      fullEdit.addEventListener('click', () => {
        editorMode = null;
        renderEditor();
        callbacks.onEditItemDetails?.(current.id);
      });
      actions.insertBefore(fullEdit, submitBtn);
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const draft: VocabularyDraft = {
        word: wordInput.value.trim(),
        phonetic: phoneticInput.value.trim(),
        partOfSpeech: posInput.value.trim(),
        meaningZh: meaningInput.value.trim(),
        sourceNotePath: sourceInput.value.trim(),
        sourceSentence: sentenceInput.value.trim(),
      };
      if (!draft.word || !draft.meaningZh) return;
      if (submitBtn.disabled) return;
      submitBtn.disabled = true;
      try {
        if (isEdit && current) await callbacks.onEditItem?.(current.id, draft);
        else await callbacks.onAddItem?.(draft);
        editorMode = null;
        renderEditor();
      } catch (error) {
        let message = form.querySelector<HTMLElement>('[role="alert"]');
        if (!message) {
          message = el('p', 'ciyu-toggle-desc');
          message.setAttribute('role', 'alert');
          form.insertBefore(message, actions);
        }
        message.textContent = error instanceof Error ? error.message : '保存失败。';
      } finally {
        submitBtn.disabled = false;
      }
    });

    form.append(
      title,
      wordField,
      metaGrid,
      meaningField,
      sourceField,
      sentenceField,
      actions
    );
    editorHost.appendChild(form);
    requestAnimationFrame(() => wordInput.focus());
  }

  function renderList(): void {
    listHost.innerHTML = '';

    const q = props.searchQuery.trim().toLowerCase();
    const filtered = q
      ? props.items.filter(
          (item) =>
            item.word.toLowerCase().includes(q) ||
            item.meaningZh.toLowerCase().includes(q) ||
            item.searchableDetails?.some(value => value.toLowerCase().includes(q)) ||
            (item.sourceNotePath ?? '').toLowerCase().includes(q)
        )
      : props.items;

    if (filtered.length === 0) {
      const empty = el('div', 'ciyu-surface ciyu-state-card');
      const icon = el('div', 'ciyu-state-icon');
      icon.appendChild(createIcon('book-open', 'lg'));
      empty.append(
        icon,
        el('h3', 'ciyu-state-title', q ? '没有匹配的生词' : '生词本还是空的'),
        el(
          'p',
          'ciyu-state-desc',
          q
            ? `未找到包含「${props.searchQuery}」的词条，可换个关键词或直接添加。`
            : '支持批量粘贴单词单（自动补全释义）、导入 TXT / CSV / Anki 文件，或从库内笔记一键提取。'
        )
      );
      if (!q && callbacks.onOpenQuickImport) {
        const emptyImportBtn = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm');
        emptyImportBtn.type = 'button';
        emptyImportBtn.append(
          createIcon('download', 'sm'),
          el('span', undefined, '快捷批量导入生词')
        );
        emptyImportBtn.addEventListener('click', () => callbacks.onOpenQuickImport?.());
        empty.appendChild(emptyImportBtn);
      }
      listHost.appendChild(empty);
      return;
    }

    const ul = el('ul', 'ciyu-vocab-list');
    ul.setAttribute('aria-label', '生词列表');

    for (const item of filtered) {
      const li = el('li', 'ciyu-surface ciyu-vocab-item');

      const top = el('div', 'ciyu-vocab-top');
      const titleArea = el('div', 'ciyu-word-title-wrap');

      const wordBtn = el('button', 'ciyu-vocab-word', item.word);
      wordBtn.type = 'button';
      wordBtn.style.textAlign = 'left';
      wordBtn.title = '在查词面板查看详情';
      wordBtn.addEventListener('click', () => callbacks.onInspectWord?.(item.word, item.id));
      titleArea.appendChild(wordBtn);

      const metaBadges = el('div', 'ciyu-phonetic-row');
      if (item.partOfSpeech) {
        metaBadges.appendChild(el('span', 'ciyu-pos-tag', item.partOfSpeech));
      }
      if (item.phonetic) {
        metaBadges.appendChild(el('span', 'ciyu-phonetic', item.phonetic));
      }
      titleArea.appendChild(metaBadges);

      const tools = el('div', 'ciyu-card-tools');
      const editBtn = el('button', 'ciyu-icon-btn');
      editBtn.type = 'button';
      editBtn.title = '编辑词条';
      editBtn.setAttribute('aria-label', `编辑 ${item.word}`);
      editBtn.appendChild(createIcon('pencil', 'sm'));
      editBtn.addEventListener('click', () => {
        editorMode = { type: 'edit', item };
        confirmingDeleteId = null;
        renderEditor();
        renderList();
      });

      const delBtn = el('button', 'ciyu-icon-btn');
      delBtn.type = 'button';
      delBtn.title = '删除词条';
      delBtn.setAttribute('aria-label', `删除 ${item.word}`);
      delBtn.appendChild(createIcon('trash-2', 'sm'));
      delBtn.addEventListener('click', () => {
        confirmingDeleteId = confirmingDeleteId === item.id ? null : item.id;
        renderList();
      });

      tools.append(editBtn, delBtn);
      top.append(titleArea, tools);

      const meaning = el('p', 'ciyu-vocab-meaning', item.meaningZh);

      const footer = el('div', 'ciyu-vocab-meta');
      if (callbacks.onSpeak) footer.appendChild(speechButton(item.word, Boolean(item.isSpeaking), () => callbacks.onSpeak?.(item.word)));
      if (item.sourceNotePath) {
        const noteBtn = el('button', 'ciyu-note-link');
        noteBtn.type = 'button';
        noteBtn.title = `跳转到来源笔记：${item.sourceNotePath}`;
        noteBtn.append(
          createIcon('file-text', 'sm'),
          el('span', undefined, item.sourceNoteTitle ?? item.sourceNotePath)
        );
        noteBtn.addEventListener('click', () =>
          callbacks.onOpenSourceNote?.(item.sourceNotePath!)
        );
        footer.appendChild(noteBtn);
      } else {
        footer.appendChild(el('span', 'ciyu-next-review-tag', '手动录入'));
      }

      footer.appendChild(
        el(
          'span',
          'ciyu-next-review-tag',
          item.dueToday ? '今日待复习' : `下次复习：${item.nextReviewLabel}`
        )
      );

      li.append(top, meaning, footer);

      // 删除确认条
      if (confirmingDeleteId === item.id) {
        const confirmBar = el('div', 'ciyu-confirm-bar');
        confirmBar.setAttribute('role', 'alertdialog');
        confirmBar.setAttribute('aria-label', `确认删除 ${item.word}`);
        confirmBar.appendChild(el('span', undefined, `确认删除「${item.word}」？`));

        const confirmActions = el('div', 'ciyu-form-actions');
        const cancelDel = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm', '取消');
        cancelDel.type = 'button';
        cancelDel.addEventListener('click', () => {
          confirmingDeleteId = null;
          renderList();
        });

        const okDel = el('button', 'ciyu-btn ciyu-btn--danger ciyu-btn--sm', '删除');
        okDel.type = 'button';
        okDel.addEventListener('click', () => {
          confirmingDeleteId = null;
          callbacks.onDeleteItem?.(item.id);
        });

        confirmActions.append(cancelDel, okDel);
        confirmBar.appendChild(confirmActions);
        li.appendChild(confirmBar);
      }

      ul.appendChild(li);
    }

    listHost.appendChild(ul);
  }

  function renderAll(): void {
    if (document.activeElement !== searchInput && searchInput.value !== props.searchQuery) {
      searchInput.value = props.searchQuery;
      clearBtn.hidden = searchInput.value.length === 0;
    }
    renderSummary();
    if (!editorMode) renderEditor();
    renderList();
  }

  renderAll();

  return {
    element: root,
    update(nextProps) {
      props = nextProps;
      renderAll();
    },
    destroy() {
      root.remove();
    },
  };
}
