import { el } from '../dom';
import { createIcon } from '../icons';
import type {
  ArchiveViewCallbacks,
  ArchiveViewProps,
  UIComponentHandle,
} from '../types';

function splitMetaInput(raw: string): string[] {
  return raw
    .split(/[；;\n\r]+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * 视图 5：「每日归档」
 * - 按日期分组，每个单词独立成块清晰区分；
 * - 支持每个词块原地自主添加/编辑「词根词缀」与「派生词」并同步写回归档 Markdown 笔记；
 * - 支持一键定位到 Obsidian 每日归档笔记中的对应词块。
 */
export function createArchiveView(
  initialProps: ArchiveViewProps,
  callbacks: ArchiveViewCallbacks = {}
): UIComponentHandle<ArchiveViewProps> {
  let props = initialProps;
  let editingEntryId: string | null = null;
  let savingEntryId: string | null = null;

  const root = el('section', 'ciyu-archive-view');

  function render(): void {
    root.innerHTML = '';

    if (props.groups.length === 0) {
      const empty = el('div', 'ciyu-surface ciyu-state-card');
      const icon = el('div', 'ciyu-state-icon');
      icon.appendChild(createIcon('calendar-days', 'lg'));
      empty.append(
        icon,
        el('h3', 'ciyu-state-title', '尚无每日归档记录'),
        el(
          'p',
          'ciyu-state-desc',
          '在查词或划词结果卡中点击「保存到今日」，每个单词会自动按独立词块归档到每日笔记，并支持补充词根词缀与派生词。'
        )
      );
      root.appendChild(empty);
      return;
    }

    if (props.returnTarget && callbacks.onReturnToOriginNote) {
      const retBar = el('div', 'ciyu-surface ciyu-archive-return-bar');
      const retInfo = el('div', 'ciyu-paper-info');
      retInfo.append(
        createIcon('file-text', 'sm'),
        el('span', 'ciyu-archive-return-text', `原笔记：${props.returnTarget.title}`)
      );
      const retBtn = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm');
      retBtn.type = 'button';
      retBtn.append(createIcon('arrow-left', 'sm'), el('span', undefined, '返回原笔记'));
      retBtn.addEventListener('click', () => callbacks.onReturnToOriginNote?.());
      retBar.append(retInfo, retBtn);
      root.appendChild(retBar);
    }

    const list = el('ul', 'ciyu-archive-list');

    for (const group of props.groups) {
      const item = el('li', 'ciyu-surface ciyu-archive-group');

      const headerBtn = el('button', 'ciyu-archive-header');
      headerBtn.type = 'button';
      headerBtn.title = `打开归档笔记：${group.notePath}`;

      const left = el('div', 'ciyu-archive-date-wrap');
      const dateRow = el('span', 'ciyu-archive-date');
      dateRow.append(
        createIcon('calendar-days', 'sm'),
        el('span', undefined, group.displayLabel)
      );
      left.append(dateRow, el('span', 'ciyu-archive-sub', group.notePath));

      const right = el('div', 'ciyu-archive-right');
      right.append(
        el('span', 'ciyu-count-pill', `${group.entries.length} 个词块`),
        createIcon('external-link', 'sm')
      );

      headerBtn.append(left, right);
      headerBtn.addEventListener('click', () =>
        callbacks.onOpenArchiveNote?.(group.date, group.notePath)
      );

      item.appendChild(headerBtn);

      if (group.entries.length > 0) {
        const entryList = el('ul', 'ciyu-archive-blocks');
        group.entries.forEach((entry, entryIdx) => {
          const isEditing = editingEntryId === entry.id;
          const isSaving = savingEntryId === entry.id;
          const roots = (entry.roots ?? []).filter(Boolean);
          const derivatives = (entry.derivatives ?? []).filter(Boolean);

          const card = el('li', 'ciyu-archive-word-block');

          // 顶部：序号 + 原词 + 音标/词性 + 操作按钮（添加词根派生词 / 跳转词块）
          const topRow = el('div', 'ciyu-archive-block-head');
          const titleWrap = el('div', 'ciyu-archive-block-title-wrap');

          titleWrap.appendChild(
            el('span', 'ciyu-archive-block-index', String(entryIdx + 1))
          );

          const termBtn = el('button', 'ciyu-archive-word', entry.term);
          termBtn.type = 'button';
          termBtn.title = `在查词栏打开「${entry.term}」详情`;
          termBtn.addEventListener('click', () =>
            callbacks.onSelectEntry?.(entry.term, group.notePath, entry.id)
          );
          titleWrap.appendChild(termBtn);

          if (entry.phonetic) {
            titleWrap.appendChild(el('span', 'ciyu-archive-phonetic', entry.phonetic));
          }
          if (entry.partOfSpeech) {
            titleWrap.appendChild(el('span', 'ciyu-sense-pos', entry.partOfSpeech));
          }

          const actions = el('div', 'ciyu-archive-block-actions');

          if (callbacks.onUpdateEntryMeta) {
            const editMetaBtn = el(
              'button',
              isEditing
                ? 'ciyu-mini-btn ciyu-mini-btn--accent ciyu-toggle-stable-btn--md'
                : 'ciyu-mini-btn ciyu-toggle-stable-btn--md'
            );
            editMetaBtn.type = 'button';
            editMetaBtn.title = '自主添加或编辑该单词的词根词缀与派生词';
            editMetaBtn.setAttribute('aria-expanded', String(isEditing));
            editMetaBtn.append(
              createIcon(isEditing ? 'x' : 'plus', 'sm'),
              el('span', undefined, isEditing ? '收起词根' : '词根/派生')
            );
            editMetaBtn.addEventListener('click', () => {
              editingEntryId = isEditing ? null : entry.id;
              render();
            });
            actions.appendChild(editMetaBtn);
          }

          const isJumpedHere = Boolean(
            props.returnTarget &&
              props.returnTarget.jumpedEntryId === entry.id &&
              callbacks.onReturnToOriginNote
          );
          const jumpBtn = el(
            'button',
            isJumpedHere
              ? 'ciyu-mini-btn ciyu-mini-btn--accent ciyu-toggle-stable-btn--md'
              : 'ciyu-mini-btn ciyu-toggle-stable-btn--md'
          );
          jumpBtn.type = 'button';
          if (isJumpedHere) {
            jumpBtn.title = `一键返回跳转前的笔记：${props.returnTarget!.title}`;
            jumpBtn.append(
              createIcon('arrow-left', 'sm'),
              el('span', undefined, '返回笔记')
            );
            jumpBtn.addEventListener('click', () => callbacks.onReturnToOriginNote?.());
          } else {
            jumpBtn.title = `打开 ${group.date} 笔记并定位到「${entry.term}」词块`;
            jumpBtn.append(
              el('span', undefined, '定位词块'),
              createIcon('arrow-up-right', 'sm')
            );
            jumpBtn.addEventListener('click', () => {
              if (callbacks.onJumpToEntryBlock) {
                callbacks.onJumpToEntryBlock(entry, group.notePath);
              } else {
                callbacks.onOpenArchiveNote?.(group.date, group.notePath);
              }
            });
          }
          actions.appendChild(jumpBtn);

          topRow.append(titleWrap, actions);
          card.appendChild(topRow);

          if (entry.meaningZh) {
            card.appendChild(el('p', 'ciyu-archive-block-meaning', entry.meaningZh));
          }

          // 已添加的词根词缀与派生词标签展示
          if (!isEditing && (roots.length > 0 || derivatives.length > 0)) {
            const metaBox = el('div', 'ciyu-archive-meta-box');
            if (roots.length > 0) {
              const row = el('div', 'ciyu-archive-meta-row');
              row.appendChild(el('span', 'ciyu-archive-meta-label', '词根词缀'));
              const chips = el('div', 'ciyu-archive-meta-chips');
              for (const r of roots) {
                chips.appendChild(el('span', 'ciyu-morpheme', r));
              }
              row.appendChild(chips);
              metaBox.appendChild(row);
            }
            if (derivatives.length > 0) {
              const row = el('div', 'ciyu-archive-meta-row ciyu-archive-meta-row--stack');
              row.appendChild(el('span', 'ciyu-archive-meta-label', '派生词'));
              const derivList = el('ul', 'ciyu-archive-deriv-list');
              for (const rawDeriv of derivatives) {
                const liDeriv = el('li', 'ciyu-archive-deriv-item');
                const match = rawDeriv.match(/^([A-Za-z][A-Za-z\s'-]*?)\s*(?:[—–-]{1,2}|[:：])\s*(.+)$/);
                if (match) {
                  liDeriv.append(
                    el('span', 'ciyu-archive-deriv-word', match[1].trim()),
                    el('span', 'ciyu-archive-deriv-desc', match[2].trim())
                  );
                } else {
                  liDeriv.appendChild(el('span', 'ciyu-archive-deriv-desc', rawDeriv));
                }
                derivList.appendChild(liDeriv);
              }
              row.appendChild(derivList);
              metaBox.appendChild(row);
            }
            card.appendChild(metaBox);
          }

          // 原地自主编辑：词根词缀 + 派生词
          if (isEditing) {
            const form = el('form', 'ciyu-archive-inline-form');

            const rootField = el('div', 'ciyu-field');
            rootField.appendChild(el('label', undefined, '词根词缀 / 词尾（多项用分号或换行分隔）'));
            const rootInput = el('input', 'ciyu-input');
            rootInput.type = 'text';
            rootInput.placeholder = '例如：re-（回）+ sil-（跳）+ -ience（名词后缀）';
            rootInput.value = roots.join('；');
            rootField.appendChild(rootInput);

            const derivField = el('div', 'ciyu-field');
            derivField.appendChild(el('label', undefined, '派生词（多项用分号或换行分隔）'));
            const derivInput = el('input', 'ciyu-input');
            derivInput.type = 'text';
            derivInput.placeholder = '例如：resilient — 有韧性的；resiliently — 有弹性地';
            derivInput.value = derivatives.join('；');
            derivField.appendChild(derivInput);

            const formActions = el('div', 'ciyu-form-actions');
            const cancelBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm', '取消');
            cancelBtn.type = 'button';
            cancelBtn.disabled = isSaving;
            cancelBtn.addEventListener('click', () => {
              editingEntryId = null;
              render();
            });

            const saveBtn = el(
              'button',
              'ciyu-btn ciyu-btn--primary ciyu-btn--sm',
              isSaving ? '保存中…' : '保存到词块'
            );
            saveBtn.type = 'submit';
            saveBtn.disabled = isSaving;
            formActions.append(cancelBtn, saveBtn);

            form.addEventListener('submit', async (e) => {
              e.preventDefault();
              if (savingEntryId) return;
              savingEntryId = entry.id;
              render();
              try {
                await callbacks.onUpdateEntryMeta?.(group.notePath, entry.term, {
                  roots: splitMetaInput(rootInput.value),
                  derivatives: splitMetaInput(derivInput.value),
                });
                editingEntryId = null;
              } finally {
                savingEntryId = null;
                render();
              }
            });

            form.append(rootField, derivField, formActions);
            card.appendChild(form);
          }

          entryList.appendChild(card);
        });
        item.appendChild(entryList);
      }

      list.appendChild(item);
    }

    root.appendChild(list);
  }

  render();

  return {
    element: root,
    update(nextProps) {
      const same = JSON.stringify(props) === JSON.stringify(nextProps);
      props = nextProps;
      if (editingEntryId && !savingEntryId && same) return;
      if (!editingEntryId || !same) {
        if (editingEntryId && !nextProps.groups.some((g) => g.entries.some((e) => e.id === editingEntryId))) {
          editingEntryId = null;
        }
        if (!editingEntryId) render();
      }
    },
    destroy() {
      root.remove();
    },
  };
}
