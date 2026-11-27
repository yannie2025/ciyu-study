import { appendHighlightedText, el } from '../dom';
import { nativeLookupButtons, speechButton } from './LookupTools';
import { createIcon } from '../icons';
import type {
  ResultCardCallbacks,
  ResultCardProps,
  UIComponentHandle,
} from '../types';

/**
 * 查词结果卡（同时用于「查词」侧栏与「划词」浮窗）
 * 包含高对比正文阅读层 + 折叠详情 + 内联编辑 + 液态玻璃悬浮操作条。
 */
export function createResultCard(
  initialProps: ResultCardProps,
  callbacks: ResultCardCallbacks = {}
): UIComponentHandle<ResultCardProps> {
  let props = initialProps;
  let editing = false;
  let detailsExpanded = initialProps.detailsExpanded ?? true;

  const root = el('article', 'ciyu-result-card');
  root.setAttribute('aria-label', '查词结果');

  const detailsId = `ciyu-details-${Math.random().toString(36).slice(2, 8)}`;

  function render(): void {
    root.innerHTML = '';
    const { entry, targetNotePath, isSpeaking } = props;

    // 1. 稳定高对比阅读层
    const reading = el('div', 'ciyu-surface ciyu-result-reading');

    // 头部：原词、音标、词性 + 朗读/编辑按钮
    const header = el('header', 'ciyu-word-header');
    const titleWrap = el('div', 'ciyu-word-title-wrap');

    const headword = el(
      'h3',
      entry.kind === 'sentence'
        ? 'ciyu-headword ciyu-headword--sentence'
        : 'ciyu-headword',
      entry.term
    );
    titleWrap.appendChild(headword);

    if (entry.phonetic || entry.phoneticUs || entry.phoneticUk || entry.partsOfSpeech.length > 0) {
      const metaRow = el('div', 'ciyu-phonetic-row');
      if (entry.phonetic) metaRow.appendChild(el('span', 'ciyu-phonetic', entry.phonetic));
      if (entry.phoneticUs) {
        metaRow.appendChild(el('span', 'ciyu-phonetic', `美 ${entry.phoneticUs}`));
      }
      if (entry.phoneticUk) {
        metaRow.appendChild(el('span', 'ciyu-phonetic', `英 ${entry.phoneticUk}`));
      }
      for (const pos of entry.partsOfSpeech) {
        metaRow.appendChild(el('span', 'ciyu-pos-tag', pos));
      }
      titleWrap.appendChild(metaRow);
    }

    const tools = el('div', 'ciyu-card-tools');
    tools.setAttribute('role', 'group');
    tools.setAttribute('aria-label', '词条工具');

    const speakBtn = speechButton(entry.term, Boolean(isSpeaking), () => callbacks.onSpeak?.(entry));
    tools.appendChild(speakBtn);

    const editBtn = el(
      'button',
      editing ? 'ciyu-icon-btn ciyu-icon-btn--active' : 'ciyu-icon-btn'
    );
    editBtn.type = 'button';
    editBtn.title = editing ? '取消编辑' : '编辑释义与笔记';
    editBtn.setAttribute('aria-label', editing ? '取消编辑' : '编辑词条');
    editBtn.setAttribute('aria-pressed', String(editing));
    editBtn.appendChild(createIcon('pencil', 'sm'));
    editBtn.addEventListener('click', () => {
      editing = !editing;
      render();
      root.querySelector<HTMLElement>(editing ? 'textarea' : '[aria-label="编辑词条"]')?.focus();
    });
    tools.appendChild(editBtn);

    header.append(titleWrap, tools);
    reading.appendChild(header);

    // 历史 / 今日归档查重提示条 + 一键跳转已有词块按钮
    if (entry.archivedMatch) {
      const match = entry.archivedMatch;
      const dupBanner = el(
        'div',
        match.isToday
          ? 'ciyu-archive-dup-banner ciyu-archive-dup-banner--today'
          : 'ciyu-archive-dup-banner'
      );
      const dupLeft = el('div', 'ciyu-archive-dup-text');
      dupLeft.append(
        createIcon(match.isToday ? 'calendar-check' : 'alert-circle', 'sm'),
        el(
          'span',
          undefined,
          match.isToday
            ? `今日归档中已有该词块（${match.date}）`
            : `此前已归档于 ${match.date}`
        )
      );
      const jumpBtn = el('button', 'ciyu-mini-btn ciyu-mini-btn--accent');
      jumpBtn.type = 'button';
      jumpBtn.title = `跳转到 ${match.notePath} 中的「${match.term}」词块`;
      jumpBtn.append(
        el('span', undefined, '跳转到已有词块'),
        createIcon('arrow-up-right', 'sm')
      );
      jumpBtn.addEventListener('click', () => callbacks.onOpenArchiveMatch?.(match));
      dupBanner.append(dupLeft, jumpBtn);
      reading.appendChild(dupBanner);
    }

    // 内联编辑模式
    if (editing) {
      const form = el('form', 'ciyu-inline-editor');
      form.setAttribute('aria-label', '编辑查词结果');

      const meaningField = el('div', 'ciyu-field');
      const meaningLabel = el('label', undefined, '中文释义（每行一条）');
      const meaningInput = el('textarea', 'ciyu-textarea');
      meaningInput.rows = 3;
      meaningInput.required = true;
      meaningInput.value = entry.senses
        .map((s) => s.meaningZh)
        .join('\n');
      meaningField.append(meaningLabel, meaningInput);

      const rootsField = el('div', 'ciyu-field');
      const rootsLabel = el('label', undefined, '词根词缀 / 词尾（多项用分号分隔）');
      const rootsInput = el('input', 'ciyu-input');
      rootsInput.type = 'text';
      rootsInput.placeholder = '例如：re-（回）+ sil-（跳）+ -ience（名词后缀）';
      rootsInput.value = entry.etymology?.explanation ?? '';
      rootsField.append(rootsLabel, rootsInput);

      const derivField = el('div', 'ciyu-field');
      const derivLabel = el('label', undefined, '派生词（多项用分号分隔）');
      const derivInput = el('input', 'ciyu-input');
      derivInput.type = 'text';
      derivInput.placeholder = '例如：resilient — 有韧性的；resiliently — 有弹性地';
      derivInput.value = entry.derivatives
        .map((d) => (d.meaningZh ? `${d.word} — ${d.meaningZh}` : d.word))
        .join('；');
      derivField.append(derivLabel, derivInput);

      const sourceField = el('div', 'ciyu-field');
      const sourceLabel = el('label', undefined, '来源句');
      const sourceInput = el('textarea', 'ciyu-textarea');
      sourceInput.rows = 2;
      sourceInput.value = entry.sourceSentence ?? '';
      sourceField.append(sourceLabel, sourceInput);

      const noteField = el('div', 'ciyu-field');
      const noteLabel = el('label', undefined, '个人备注');
      const noteInput = el('input', 'ciyu-input');
      noteInput.type = 'text';
      noteInput.placeholder = '例如：在设计文章中常与 materiality 并列出现';
      noteInput.value = entry.note ?? '';
      noteField.append(noteLabel, noteInput);

      const actions = el('div', 'ciyu-form-actions');
      const cancelBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm', '取消');
      cancelBtn.type = 'button';
      cancelBtn.addEventListener('click', () => {
        editing = false;
        render();
      });

      const saveBtn = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm', '保存修改');
      saveBtn.type = 'submit';
      actions.append(cancelBtn, saveBtn);
      if (callbacks.onEditAll) {
        const allBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm', '编辑全部字段');
        allBtn.type = 'button';
        allBtn.addEventListener('click', () => callbacks.onEditAll?.(entry));
        actions.insertBefore(allBtn, saveBtn);
      }

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!meaningInput.value.trim()) return;
        editing = false;
        const splitList = (raw: string) =>
          raw
            .split(/[；;\n\r]+/u)
            .map((v) => v.trim())
            .filter(Boolean);
        callbacks.onEditEntry?.(entry.id, {
          meaningSummary: meaningInput.value.trim(),
          sourceSentence: sourceInput.value.trim(),
          note: noteInput.value.trim(),
          roots: splitList(rootsInput.value),
          derivatives: splitList(derivInput.value),
        });
        render();
        root.querySelector<HTMLElement>('[aria-label="编辑词条"]')?.focus();
      });

      form.append(meaningField, rootsField, derivField, sourceField, noteField, actions);
      reading.appendChild(form);
    } else {
      // 中文释义列表
      const senseList = el('ul', 'ciyu-sense-list');
      senseList.setAttribute('aria-label', entry.kind === 'sentence' ? '中文译文' : '中文释义');
      for (const sense of entry.senses) {
        const li = el('li', 'ciyu-sense-item');
        if (sense.partOfSpeech) {
          li.appendChild(el('span', 'ciyu-sense-pos', sense.partOfSpeech));
        }
        li.appendChild(el('span', undefined, sense.meaningZh));
        senseList.appendChild(li);
      }
      reading.appendChild(senseList);

      // 个人备注（若有）
      if (entry.note) {
        const noteBox = el('div', 'ciyu-etymology-box');
        noteBox.appendChild(el('span', 'ciyu-section-label', '备注 · '));
        noteBox.appendChild(document.createTextNode(entry.note));
        reading.appendChild(noteBox);
      }
    }

    // 来源句（带关键词高亮与来源跳转）
    if (entry.sourceSentence) {
      const sourceBox = el('section', 'ciyu-source-box');
      sourceBox.setAttribute('aria-label', '来源句');

      const sourceTop = el('div', 'ciyu-target-file');
      const label = el('span', 'ciyu-section-label');
      label.appendChild(createIcon('file-text', 'sm'));
      label.appendChild(document.createTextNode('来源句'));
      sourceTop.appendChild(label);

      if (entry.sourceNotePath) {
        const srcBtn = el('button', 'ciyu-target-file-link');
        srcBtn.type = 'button';
        srcBtn.title = `打开来源笔记：${entry.sourceNotePath}`;
        srcBtn.appendChild(el('span', 'ciyu-target-file-path', entry.sourceNotePath));
        srcBtn.appendChild(createIcon('external-link', 'sm'));
        srcBtn.addEventListener('click', () =>
          callbacks.onOpenSourceNote?.(entry.sourceNotePath!)
        );
        sourceTop.appendChild(srcBtn);
      }

      const quote = el('p', 'ciyu-source-quote');
      appendHighlightedText(quote, entry.sourceSentence, entry.term);
      sourceBox.append(sourceTop, quote);
      reading.appendChild(sourceBox);
    }

    // 本地模型自动解析：词根词尾与派生词可勾选模块（点击勾选后一键写入目标笔记或今日归档）
    if (entry.morphemeAssist && entry.morphemeAssist.status !== 'idle') {
      const assist = entry.morphemeAssist;
      const assistBox = el('section', 'ciyu-morpheme-assist');

      const assistHead = el('div', 'ciyu-morpheme-assist-head');
      const headTitle = el('span', 'ciyu-section-label');
      headTitle.append(
        createIcon('sparkles', 'sm'),
        document.createTextNode('词根词尾与派生词模块')
      );

      const headTools = el('div', 'ciyu-archive-block-actions');
      if (assist.modelName) {
        headTools.appendChild(el('span', 'ciyu-morpheme-model-tag', assist.modelName));
      }
      if (assist.status === 'ready' && assist.items.length > 0) {
        const allSelected = assist.items.every((item) => item.selected);
        const toggleAllBtn = el(
          'button',
          'ciyu-mini-btn',
          allSelected ? '清空勾选' : '全选'
        );
        toggleAllBtn.type = 'button';
        toggleAllBtn.addEventListener('click', () =>
          callbacks.onToggleAllMorphemeModules?.(entry.id, !allSelected)
        );
        headTools.appendChild(toggleAllBtn);
      }
      if (assist.status === 'ready' || assist.status === 'error') {
        const retryBtn = el('button', 'ciyu-mini-btn');
        retryBtn.type = 'button';
        retryBtn.title = '重新调用本地模型解析词根词尾与派生词';
        retryBtn.append(createIcon('refresh-cw', 'sm'), el('span', undefined, '重析'));
        retryBtn.addEventListener('click', () => callbacks.onRetryMorphemeAssist?.(entry));
        headTools.appendChild(retryBtn);
      }
      assistHead.append(headTitle, headTools);
      assistBox.appendChild(assistHead);

      if (assist.status === 'loading') {
        const loadingRow = el('div', 'ciyu-morpheme-loading');
        loadingRow.append(
          el('span', 'ciyu-spinner'),
          el('span', undefined, '正在调用本地模型解析词根词尾与派生词…')
        );
        assistBox.appendChild(loadingRow);
      } else if (assist.status === 'error') {
        assistBox.appendChild(
          el(
            'p',
            'ciyu-toggle-desc',
            assist.errorMessage || '本地模型暂未连接，启动 Ollama 后可点击「重析」自动拆解词根与派生词。'
          )
        );
      } else if (assist.items.length === 0) {
        assistBox.appendChild(
          el('p', 'ciyu-toggle-desc', '本地模型暂未拆解出该词的词根或派生词，可点击上方「+ 词根/派生词」手动补充。')
        );
      } else {
        const rootItems = assist.items.filter((item) => item.kind === 'root');
        const derivItems = assist.items.filter((item) => item.kind === 'derivative');

        const renderGroup = (title: string, items: typeof assist.items) => {
          if (!items.length) return;
          const grp = el('div', 'ciyu-morpheme-group');
          grp.appendChild(el('span', 'ciyu-archive-meta-label', title));
          const grid = el('div', 'ciyu-morpheme-grid');
          for (const item of items) {
            const modBtn = el(
              'button',
              item.selected
                ? 'ciyu-morpheme-module ciyu-morpheme-module--selected'
                : 'ciyu-morpheme-module'
            );
            modBtn.type = 'button';
            modBtn.setAttribute('aria-pressed', String(item.selected));
            modBtn.title = item.selected ? '点击取消勾选该模块' : '点击勾选添加到笔记';
            modBtn.appendChild(createIcon(item.selected ? 'check' : 'plus', 'sm'));
            modBtn.appendChild(el('span', 'ciyu-morpheme-module-label', item.label));
            if (item.meaningZh) {
              modBtn.appendChild(el('span', 'ciyu-morpheme-module-zh', item.meaningZh));
            }
            modBtn.addEventListener('click', () =>
              callbacks.onToggleMorphemeModule?.(entry.id, item.id)
            );
            grid.appendChild(modBtn);
          }
          grp.appendChild(grid);
          assistBox.appendChild(grp);
        };

        renderGroup('词根 / 前缀 / 词尾', rootItems);
        renderGroup('派生词', derivItems);

        const selectedCount = assist.items.filter((item) => item.selected).length;
        const actionRow = el('div', 'ciyu-morpheme-actions');
        const addToNoteBtn = el(
          'button',
          selectedCount > 0 ? 'ciyu-btn ciyu-btn--primary ciyu-btn--sm' : 'ciyu-btn ciyu-btn--glass ciyu-btn--sm'
        );
        addToNoteBtn.type = 'button';
        addToNoteBtn.disabled = selectedCount === 0;
        addToNoteBtn.title = selectedCount > 0
          ? '将已勾选的词根词尾与派生词模块添加到目标笔记的该词条块中'
          : '请先点击勾选上方任意词根或派生词模块';
        addToNoteBtn.append(
          createIcon('file-plus', 'sm'),
          el('span', undefined, selectedCount > 0 ? `加入笔记（已选 ${selectedCount}）` : '勾选后加入笔记')
        );
        addToNoteBtn.addEventListener('click', () =>
          callbacks.onAddSelectedMorphemes?.(entry, 'note')
        );

        const addToArchiveBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm');
        addToArchiveBtn.type = 'button';
        addToArchiveBtn.disabled = selectedCount === 0;
        addToArchiveBtn.title = selectedCount > 0
          ? '将已勾选的词根词尾与派生词模块保存到今日归档词块中'
          : '请先点击勾选上方任意词根或派生词模块';
        addToArchiveBtn.append(
          createIcon('calendar-plus', 'sm'),
          el('span', undefined, selectedCount > 0 ? `加入今日归档（${selectedCount}）` : '加入今日归档')
        );
        addToArchiveBtn.addEventListener('click', () =>
          callbacks.onAddSelectedMorphemes?.(entry, 'archive')
        );

        actionRow.append(addToNoteBtn, addToArchiveBtn);
        assistBox.appendChild(actionRow);
      }

      reading.appendChild(assistBox);
    }

    // 折叠详情：派生词、常用搭配、词根词缀、双语例句
    const hasDetails =
      entry.derivatives.length > 0 ||
      entry.collocations.length > 0 ||
      Boolean(entry.etymology) ||
      entry.examples.length > 0;

    if (hasDetails) {
      const toggleBtn = el('button', 'ciyu-disclosure-btn');
      toggleBtn.type = 'button';
      toggleBtn.setAttribute('aria-expanded', String(detailsExpanded));
      toggleBtn.setAttribute('aria-controls', detailsId);

      const summaryParts: string[] = [];
      if (entry.derivatives.length) summaryParts.push('派生词');
      if (entry.collocations.length) summaryParts.push('搭配');
      if (entry.etymology) summaryParts.push('词根');
      if (entry.examples.length) summaryParts.push(`例句 ${entry.examples.length}`);

      toggleBtn.appendChild(
        el(
          'span',
          undefined,
          detailsExpanded
            ? `收起详细解析（${summaryParts.join(' · ')}）`
            : `展开详细解析（${summaryParts.join(' · ')}）`
        )
      );
      const chevron = createIcon('chevron-down', 'sm');
      chevron.classList.add('ciyu-disclosure-chevron');
      toggleBtn.appendChild(chevron);

      toggleBtn.addEventListener('click', () => {
        detailsExpanded = !detailsExpanded;
        callbacks.onToggleDetails?.(detailsExpanded);
        render();
      });
      reading.appendChild(toggleBtn);

      const details = el('div', 'ciyu-details-panel');
      details.id = detailsId;
      details.hidden = !detailsExpanded;

      // 派生词
      if (entry.derivatives.length > 0) {
        const block = el('section', 'ciyu-detail-block');
        block.appendChild(el('span', 'ciyu-section-label', '派生词'));
        const list = el('ul', 'ciyu-chip-list');
        for (const item of entry.derivatives) {
          const li = el('li', 'ciyu-chip');
          li.appendChild(el('span', undefined, item.word));
          li.appendChild(
            el(
              'span',
              'ciyu-chip-meta',
              item.meaningZh ? `${item.partOfSpeech} ${item.meaningZh}` : item.partOfSpeech
            )
          );
          list.appendChild(li);
        }
        block.appendChild(list);
        details.appendChild(block);
      }

      // 常用搭配
      if (entry.collocations.length > 0) {
        const block = el('section', 'ciyu-detail-block');
        block.appendChild(el('span', 'ciyu-section-label', '常用搭配'));
        const list = el('ul', 'ciyu-collocation-list');
        for (const item of entry.collocations) {
          const li = el('li', 'ciyu-collocation-item');
          li.appendChild(el('span', 'ciyu-collocation-phrase', item.phrase));
          li.appendChild(el('span', 'ciyu-collocation-zh', item.meaningZh));
          list.appendChild(li);
        }
        block.appendChild(list);
        details.appendChild(block);
      }

      // 词根词缀
      if (entry.etymology) {
        const block = el('section', 'ciyu-detail-block');
        block.appendChild(el('span', 'ciyu-section-label', '词根词缀'));
        const box = el('div', 'ciyu-etymology-box');
        if (entry.etymology.morphemes.length > 0) {
          const parts = el('div', 'ciyu-etymology-parts');
          for (const morph of entry.etymology.morphemes) {
            parts.appendChild(el('span', 'ciyu-morpheme', morph));
          }
          box.appendChild(parts);
        }
        box.appendChild(el('span', undefined, entry.etymology.explanation));
        block.appendChild(box);
        details.appendChild(block);
      }

      // 双语例句
      if (entry.examples.length > 0) {
        const block = el('section', 'ciyu-detail-block');
        block.appendChild(el('span', 'ciyu-section-label', '双语例句'));
        const list = el('ul', 'ciyu-example-list');
        for (const example of entry.examples) {
          const li = el('li', 'ciyu-example-item');
          const en = el('p', 'ciyu-example-en');
          appendHighlightedText(en, example.en, example.highlight ?? entry.term);
          const zh = el('p', 'ciyu-example-zh', example.zh);
          li.append(en, zh);
          list.appendChild(li);
        }
        block.appendChild(list);
        details.appendChild(block);
      }

      reading.appendChild(details);
    }

    if (entry.forms?.length) {
      const forms = el('p', 'ciyu-toggle-desc', '词形变化：' + entry.forms.join(' · '));
      reading.appendChild(forms);
    }
    if (entry.lookupProvider || callbacks.onNativeLookup || callbacks.onEnrich || callbacks.onEditEntry) {
      const shortcuts = el('div', 'ciyu-quick-picks');
      if (entry.lookupProvider) shortcuts.appendChild(el('span', 'ciyu-toggle-desc', entry.lookupProvider));
      const addShortcut = (label: string, click: () => void) => {
        const button = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm', label);
        button.type = 'button';
        button.addEventListener('click', click);
        shortcuts.appendChild(button);
      };
      if (callbacks.onEditEntry && !editing) {
        addShortcut('+ 词根/派生词', () => {
          editing = true;
          render();
          root.querySelector<HTMLInputElement>('input[placeholder*="词根"], input[placeholder*="re-"]')?.focus();
        });
      }
      if (callbacks.onEnrich && entry.lookupProvider && entry.lookupProvider !== '本地 AI') {
        addShortcut('AI 补充解析', () => callbacks.onEnrich?.(entry));
      }
      nativeLookupButtons(shortcuts, () => entry.term, callbacks.onNativeLookup);
      reading.appendChild(shortcuts);
    }
    root.appendChild(reading);

    // 2. 液态玻璃悬浮操作条（Floating Action Bar）
    const actionBar = el('footer', 'ciyu-glass ciyu-glass-refract ciyu-floating-bar');
    actionBar.setAttribute('role', 'toolbar');
    actionBar.setAttribute('aria-label', '词条快捷操作');

    const targetRow = el('div', 'ciyu-target-file');
    const targetBtn = el('button', 'ciyu-target-file-link');
    targetBtn.type = 'button';
    targetBtn.title = '选择或更换插入笔记';
    targetBtn.setAttribute('aria-label', targetNotePath ? '更换插入笔记' : '选择插入笔记');
    targetBtn.appendChild(createIcon('file-text', 'sm'));
    targetBtn.appendChild(el('span', undefined, '插入目标：'));
    targetBtn.appendChild(el('span', 'ciyu-target-file-path', targetNotePath || '选择笔记'));
    targetBtn.addEventListener('click', () =>
      callbacks.onOpenTargetNote?.(targetNotePath)
    );
    targetRow.appendChild(targetBtn);

    const actionRow = el('div', 'ciyu-action-row');

    const insertBtn = el(
      'button',
      'ciyu-btn ciyu-btn--primary ciyu-action-btn ciyu-action-btn--primary'
    );
    insertBtn.type = 'button';
    insertBtn.appendChild(createIcon('file-plus', 'sm'));
    insertBtn.appendChild(el('span', undefined, targetNotePath ? '插入笔记' : '选择笔记'));
    insertBtn.addEventListener('click', () =>
      callbacks.onInsertToNote?.(entry, targetNotePath)
    );

    const vocabBtn = el(
      'button',
      entry.inVocabulary
        ? 'ciyu-btn ciyu-btn--saved ciyu-action-btn'
        : 'ciyu-btn ciyu-btn--glass ciyu-action-btn'
    );
    vocabBtn.type = 'button';
    vocabBtn.disabled = Boolean(entry.inVocabulary);
    vocabBtn.setAttribute('aria-pressed', String(Boolean(entry.inVocabulary)));
    vocabBtn.appendChild(
      createIcon(entry.inVocabulary ? 'bookmark-check' : 'bookmark', 'sm')
    );
    vocabBtn.appendChild(
      el('span', undefined, entry.inVocabulary ? '已在生词本' : '加入生词本')
    );
    vocabBtn.addEventListener('click', () => callbacks.onAddToVocabulary?.(entry));

    const todayBtn = el(
      'button',
      entry.savedToday
        ? 'ciyu-btn ciyu-btn--saved ciyu-action-btn'
        : 'ciyu-btn ciyu-btn--glass ciyu-action-btn'
    );
    todayBtn.type = 'button';
    todayBtn.disabled = Boolean(entry.savedToday);
    todayBtn.setAttribute('aria-pressed', String(Boolean(entry.savedToday)));
    todayBtn.appendChild(
      createIcon(entry.savedToday ? 'calendar-check' : 'calendar-plus', 'sm')
    );
    todayBtn.appendChild(
      el('span', undefined, entry.savedToday ? '已存今日' : '保存到今日')
    );
    todayBtn.addEventListener('click', () => callbacks.onSaveToToday?.(entry));

    actionRow.append(insertBtn, vocabBtn, todayBtn);
    actionBar.append(targetRow, actionRow);
    root.appendChild(actionBar);
  }

  render();

  return {
    element: root,
    update(nextProps) {
      if (nextProps.entry.id !== props.entry.id) {
        editing = false;
      }
      if (nextProps.detailsExpanded !== undefined) {
        detailsExpanded = nextProps.detailsExpanded;
      }
      const redraw = !editing && JSON.stringify(props) !== JSON.stringify(nextProps);
      props = nextProps;
      if (redraw) render();
    },
    destroy() {
      root.remove();
    },
  };
}
