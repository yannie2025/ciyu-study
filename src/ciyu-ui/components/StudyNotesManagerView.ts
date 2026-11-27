import { el } from '../dom';
import { createIcon } from '../icons';
import type {
  StudyNotesManagerCallbacks,
  StudyNotesManagerProps,
  UIComponentHandle,
} from '../types';

/**
 * 词屿笔记管理组件（重绘版 · Apple System Settings Inset Grouped 风格）
 * 支持内联快速新建 Markdown 笔记、撤销最近一次笔记操作、点击打开笔记及二次确认移入回收站。
 */
export function createStudyNotesManagerView(
  initialProps: StudyNotesManagerProps,
  callbacks: StudyNotesManagerCallbacks = {}
): UIComponentHandle<StudyNotesManagerProps> {
  let props = initialProps;
  let creating = false;
  let draftName = '';
  let createError = '';
  let confirmingPath: string | null = null;

  const root = el('section', 'ciyu-surface ciyu-inset-group ciyu-notes-manager-card');
  root.setAttribute('aria-label', '管理词屿笔记');

  function render(): void {
    root.innerHTML = '';

    const head = el('div', 'ciyu-session-head');
    const titleWrap = el('div', 'ciyu-paper-info');
    const badgeIcon = el('span', 'ciyu-pack-icon ciyu-pack-icon--accent');
    badgeIcon.appendChild(createIcon('file-text', 'sm'));
    const txt = el('div');
    txt.append(
      el('h3', 'ciyu-session-title', '词屿笔记工作台'),
      el('span', 'ciyu-toggle-desc', '管理「词屿/笔记」与每日归档，删除文件会安全移入词屿回收站。')
    );
    titleWrap.append(badgeIcon, txt);

    const tools = el('div', 'ciyu-toolbar-actions');
    const undoBtn = el('button', 'ciyu-mini-btn');
    undoBtn.type = 'button';
    undoBtn.disabled = !props.canUndo;
    undoBtn.title = props.undoHint ?? '撤销本次会话内的最近一次笔记写入、新建或删除';
    undoBtn.append(createIcon('undo-2', 'sm'), el('span', undefined, '撤销'));
    undoBtn.addEventListener('click', () => callbacks.onUndoLastAction?.());

    const newBtn = el(
      'button',
      creating ? 'ciyu-mini-btn' : 'ciyu-btn ciyu-btn--primary ciyu-btn--sm'
    );
    newBtn.type = 'button';
    if (creating) {
      newBtn.textContent = '收起';
    } else {
      newBtn.append(createIcon('file-plus', 'sm'), el('span', undefined, '新建笔记'));
    }
    newBtn.addEventListener('click', () => {
      creating = !creating;
      createError = '';
      render();
    });

    tools.append(undoBtn, newBtn);
    head.append(titleWrap, tools);
    root.appendChild(head);

    if (creating) {
      const form = el('form', 'ciyu-inline-create-bar');
      const input = el('input', 'ciyu-input');
      input.type = 'text';
      input.maxLength = 120;
      input.placeholder = '输入新笔记名称（自动保存至 词屿/笔记/）';
      input.value = draftName;
      input.addEventListener('input', () => {
        draftName = input.value;
        if (createError) createError = '';
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          creating = false;
          createError = '';
          render();
        }
      });

      const submitBtn = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm', '创建');
      submitBtn.type = 'submit';

      form.append(input, submitBtn);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const trimmed = draftName.trim();
        if (!trimmed) {
          createError = '请输入有效的笔记名称。';
          render();
          return;
        }
        try {
          await callbacks.onCreateNote?.(trimmed);
          draftName = '';
          createError = '';
          creating = false;
          render();
        } catch (err) {
          createError = (err as Error)?.message || '创建失败，请检查名称。';
          render();
        }
      });
      root.appendChild(form);

      if (createError) {
        const errEl = el('span', 'ciyu-toggle-desc', createError);
        errEl.style.color = 'var(--ciyu-danger)';
        root.appendChild(errEl);
      }

      queueMicrotask(() => input.focus());
    }

    if (props.notes.length === 0) {
      root.appendChild(
        el(
          'p',
          'ciyu-toggle-desc',
          '暂无词屿新建笔记。点击右上角「新建笔记」或在查词结果中点击「保存到今日」即可生成。'
        )
      );
      return;
    }

    const list = el('ul', 'ciyu-inset-list');
    for (const note of props.notes) {
      const row = el('li', 'ciyu-inset-row');
      const isConfirming = confirmingPath === note.path;

      const openRowBtn = el('button', 'ciyu-note-row-trigger');
      openRowBtn.type = 'button';
      openRowBtn.title = `打开 ${note.path}`;
      openRowBtn.append(
        createIcon(note.group === 'archive' ? 'calendar-days' : 'file-text', 'sm'),
        el('span', 'ciyu-note-row-title', note.basename),
        el(
          'span',
          'ciyu-badge ciyu-badge--neutral',
          note.group === 'archive' ? '归档' : '笔记'
        )
      );
      openRowBtn.addEventListener('click', () => callbacks.onOpenNote?.(note.path));

      const right = el('div', 'ciyu-toolbar-actions');
      if (isConfirming) {
        const cancelBtn = el('button', 'ciyu-mini-btn', '取消');
        cancelBtn.type = 'button';
        cancelBtn.addEventListener('click', () => {
          confirmingPath = null;
          render();
        });
        const confirmTrashBtn = el(
          'button',
          'ciyu-btn ciyu-btn--danger ciyu-btn--sm',
          '移到回收站'
        );
        confirmTrashBtn.type = 'button';
        confirmTrashBtn.addEventListener('click', () => {
          confirmingPath = null;
          callbacks.onTrashNote?.(note);
        });
        right.append(cancelBtn, confirmTrashBtn);
      } else {
        const openIconBtn = el('button', 'ciyu-icon-btn');
        openIconBtn.type = 'button';
        openIconBtn.title = '打开笔记';
        openIconBtn.setAttribute('aria-label', `打开 ${note.basename}`);
        openIconBtn.appendChild(createIcon('arrow-up-right', 'sm'));
        openIconBtn.addEventListener('click', () => callbacks.onOpenNote?.(note.path));

        const delIconBtn = el('button', 'ciyu-icon-btn ciyu-icon-btn--danger-hover');
        delIconBtn.type = 'button';
        delIconBtn.title = '移入词屿回收站（可撤销）';
        delIconBtn.setAttribute('aria-label', `删除 ${note.basename}`);
        delIconBtn.appendChild(createIcon('trash-2', 'sm'));
        delIconBtn.addEventListener('click', () => {
          confirmingPath = note.path;
          render();
        });
        right.append(openIconBtn, delIconBtn);
      }

      row.append(openRowBtn, right);
      list.appendChild(row);
    }
    root.appendChild(list);
  }

  render();

  return {
    element: root,
    update(nextProps) {
      props = nextProps;
      render();
    },
    destroy() {
      root.remove();
    },
  };
}
