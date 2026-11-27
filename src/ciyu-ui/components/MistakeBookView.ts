import { el } from '../dom';
import { createIcon } from '../icons';
import type {
  MistakeBookCallbacks,
  MistakeBookProps,
  MistakeQuestionType,
  MistakeReviewStatus,
  UIComponentHandle,
} from '../types';

const TYPE_OPTIONS: ReadonlyArray<{ id: 'all' | MistakeQuestionType; label: string }> = [
  { id: 'all', label: '全部题型' },
  { id: 'listening', label: '听力' },
  { id: 'banked_cloze', label: '选词填空' },
  { id: 'matching', label: '段落匹配' },
  { id: 'careful_reading', label: '仔细阅读' },
];

const STATUS_OPTIONS: ReadonlyArray<{ id: 'all' | MistakeReviewStatus; label: string }> = [
  { id: 'all', label: '全部状态' },
  { id: 'reviewing', label: '待复习' },
  { id: 'mastered', label: '已掌握' },
];

/**
 * 四、错题本与双向块级跳转（MistakeBookView）
 * - 自动维护错题索引（词屿/错题本/六级错题索引.md），支持按考次、题型、复习状态筛选；
 * - 展示考次、套卷、题号、题型、我的答案、正确答案、可编辑备注；支持切换「待复习 / 已掌握」；
 * - 每条记录绑定稳定块 ID（#^mistakeBlockId）与原题块链接（[[试卷名#^questionBlockId|回到原题]]），实现精确到题目的双向跳转。
 */
export function createMistakeBookView(
  initialProps: MistakeBookProps,
  callbacks: MistakeBookCallbacks = {}
): UIComponentHandle<MistakeBookProps> {
  let props = initialProps;
  let editingNoteId: string | null = null;
  let lastScrolledMistakeBlock: string | null = null;

  const root = el('section', 'ciyu-mistake-view');
  root.setAttribute('aria-label', '六级错题本与双向跳转');

  function render(): void {
    root.innerHTML = '';

    const reviewingCount = props.items.filter((i) => i.status === 'reviewing').length;
    const masteredCount = props.items.filter((i) => i.status === 'mastered').length;

    // 1. 顶部索引信息栏
    const topBar = el('div', 'ciyu-glass ciyu-vault-bar');
    const leftMeta = el('div', 'ciyu-vault-meta');
    if (callbacks.onBackToBank) {
      const backBtn = el('button', 'ciyu-mini-btn');
      backBtn.type = 'button';
      backBtn.append(createIcon('arrow-left', 'sm'), el('span', undefined, '返回题库'));
      backBtn.addEventListener('click', () => callbacks.onBackToBank?.());
      leftMeta.appendChild(backBtn);
    }
    const chip = el('span', 'ciyu-vault-chip');
    chip.append(createIcon('flag', 'sm'), el('span', undefined, '六级错题本'));
    leftMeta.append(
      chip,
      el('span', 'ciyu-folder-path', props.indexNotePath),
      el('span', 'ciyu-badge ciyu-badge--warn', `待复习 ${reviewingCount}`),
      el('span', 'ciyu-badge ciyu-badge--ok', `已掌握 ${masteredCount}`)
    );

    const openIdxBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm');
    openIdxBtn.type = 'button';
    openIdxBtn.append(createIcon('file-text', 'sm'), el('span', undefined, '打开错题索引笔记'));
    openIdxBtn.addEventListener('click', () =>
      callbacks.onOpenMistakeIndexNote?.(props.indexNotePath)
    );
    topBar.append(leftMeta, openIdxBtn);
    root.appendChild(topBar);

    // 2. 多维筛选栏：考次 / 题型 / 复习状态
    const filterCard = el('div', 'ciyu-surface ciyu-mistake-filters');

    const sessionSelect = el('select', 'ciyu-select');
    sessionSelect.style.width = 'auto';
    sessionSelect.setAttribute('aria-label', '按考次筛选错题');
    const allSessionOpt = el('option', undefined, '全部考次');
    allSessionOpt.value = 'all';
    allSessionOpt.selected = props.sessionFilter === 'all';
    sessionSelect.appendChild(allSessionOpt);
    for (const s of props.availableSessions) {
      const opt = el('option', undefined, s);
      opt.value = s;
      opt.selected = props.sessionFilter === s;
      sessionSelect.appendChild(opt);
    }
    sessionSelect.addEventListener('change', () =>
      callbacks.onSessionFilterChange?.(sessionSelect.value)
    );

    const typePills = el('div', 'ciyu-filter-pills');
    for (const t of TYPE_OPTIONS) {
      const btn = el(
        'button',
        props.typeFilter === t.id ? 'ciyu-mini-btn ciyu-mini-btn--accent' : 'ciyu-mini-btn',
        t.label
      );
      btn.type = 'button';
      btn.setAttribute('aria-pressed', String(props.typeFilter === t.id));
      btn.addEventListener('click', () => callbacks.onTypeFilterChange?.(t.id));
      typePills.appendChild(btn);
    }

    const statusPills = el('div', 'ciyu-filter-pills');
    for (const st of STATUS_OPTIONS) {
      const btn = el(
        'button',
        props.statusFilter === st.id ? 'ciyu-mini-btn ciyu-mini-btn--accent' : 'ciyu-mini-btn',
        st.label
      );
      btn.type = 'button';
      btn.setAttribute('aria-pressed', String(props.statusFilter === st.id));
      btn.addEventListener('click', () => callbacks.onStatusFilterChange?.(st.id));
      statusPills.appendChild(btn);
    }

    filterCard.append(sessionSelect, typePills, statusPills);
    root.appendChild(filterCard);

    // 3. 过滤后的错题列表
    const filtered = props.items.filter((item) => {
      if (props.sessionFilter !== 'all' && item.session !== props.sessionFilter) return false;
      if (props.typeFilter !== 'all' && item.questionType !== props.typeFilter) return false;
      if (props.statusFilter !== 'all' && item.status !== props.statusFilter) return false;
      return true;
    });

    if (filtered.length === 0) {
      const empty = el('div', 'ciyu-surface ciyu-state-card');
      const icon = el('div', 'ciyu-state-icon');
      icon.appendChild(createIcon('flag', 'lg'));
      empty.append(
        icon,
        el('h4', 'ciyu-state-title', '当前筛选下暂无错题记录'),
        el(
          'p',
          'ciyu-state-desc',
          '在试卷做题或听力精听时点击任意题旁的「加入错题」，或交卷后一键归集错题即可在此复盘。'
        )
      );
      root.appendChild(empty);
      return;
    }

    const list = el('ul', 'ciyu-session-list');
    list.setAttribute('aria-label', '六级错题条目列表');

    for (const item of filtered) {
      const isHighlighted = props.highlightedMistakeBlockId === item.mistakeBlockId;
      const card = el(
        'li',
        isHighlighted ? 'ciyu-surface ciyu-session-card ciyu-block-highlight' : 'ciyu-surface ciyu-session-card'
      );
      card.dataset.mistakeBlockId = item.mistakeBlockId;
      card.id = item.mistakeBlockId;

      const head = el('div', 'ciyu-question-head-row');
      const metaLeft = el('div', 'ciyu-paper-info');
      metaLeft.append(
        el('strong', 'ciyu-session-title', `${item.session} · ${item.setLabel} · 第 ${item.questionNumber} 题`),
        el('span', 'ciyu-badge ciyu-badge--accent', item.questionTypeLabel),
        el('code', 'ciyu-block-id-tag', `#^${item.mistakeBlockId}`)
      );

      const headActions = el('div', 'ciyu-paper-actions');

      // 复习状态切换：待复习 / 已掌握
      const statusBtn = el(
        'button',
        item.status === 'mastered'
          ? 'ciyu-badge ciyu-badge--ok'
          : 'ciyu-badge ciyu-badge--warn',
        item.status === 'mastered' ? '已掌握（点击设为待复习）' : '待复习（点击标为已掌握）'
      );
      statusBtn.type = 'button';
      statusBtn.style.cursor = 'pointer';
      statusBtn.addEventListener('click', () =>
        callbacks.onToggleMistakeStatus?.(
          item.id,
          item.status === 'mastered' ? 'reviewing' : 'mastered'
        )
      );

      // 核心双向跳转按钮：精确跳回原题 #^questionBlockId
      const backToQBtn = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm');
      backToQBtn.type = 'button';
      backToQBtn.title = `精确段落链接：${item.backToQuestionWikiLink}`;
      backToQBtn.append(
        el('span', undefined, '回到原题'),
        createIcon('arrow-up-right', 'sm')
      );
      backToQBtn.addEventListener('click', () =>
        callbacks.onJumpToOriginalQuestion?.(item)
      );

      headActions.append(statusBtn, backToQBtn);
      head.append(metaLeft, headActions);
      card.appendChild(head);

      card.appendChild(el('p', 'ciyu-question-stem ciyu-selectable-prose', item.stemPreview));

      // 我的答案 vs 正确答案对比条 + Obsidian 双链预览
      const compareRow = el('div', 'ciyu-mistake-compare');
      compareRow.append(
        el('span', 'ciyu-badge ciyu-badge--error', `我的答案：${item.myAnswer}`),
        el('span', 'ciyu-badge ciyu-badge--ok', `正确答案：${item.correctAnswer}`),
        el('code', 'ciyu-wikilink-pill', item.backToQuestionWikiLink)
      );
      card.appendChild(compareRow);

      // 备注展示与内联编辑
      if (editingNoteId === item.id) {
        const noteForm = el('form', 'ciyu-inline-editor');
        const input = el('input', 'ciyu-input');
        input.type = 'text';
        input.value = item.note;
        input.placeholder = '记录错因，例如：转折连词后才是女士真实意图…';
        const formBtns = el('div', 'ciyu-form-actions');
        const cancelBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm', '取消');
        cancelBtn.type = 'button';
        cancelBtn.addEventListener('click', () => {
          editingNoteId = null;
          render();
        });
        const saveBtn = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm', '保存备注');
        saveBtn.type = 'submit';
        formBtns.append(cancelBtn, saveBtn);
        noteForm.append(input, formBtns);
        noteForm.addEventListener('submit', (e) => {
          e.preventDefault();
          callbacks.onUpdateMistakeNote?.(item.id, input.value.trim());
          editingNoteId = null;
          render();
        });
        card.appendChild(noteForm);
      } else {
        const noteRow = el('div', 'ciyu-vocab-meta');
        noteRow.appendChild(
          el(
            'span',
            'ciyu-toggle-desc',
            item.note ? `错因备注：${item.note}` : '错因备注：点击右侧按钮补充复盘笔记'
          )
        );
        const tools = el('div', 'ciyu-card-tools');
        const editBtn = el('button', 'ciyu-mini-btn', '编辑备注');
        editBtn.type = 'button';
        editBtn.addEventListener('click', () => {
          editingNoteId = item.id;
          render();
        });
        const rmBtn = el('button', 'ciyu-icon-btn');
        rmBtn.type = 'button';
        rmBtn.title = '移除该条错题';
        rmBtn.setAttribute('aria-label', '移除错题');
        rmBtn.appendChild(createIcon('trash-2', 'sm'));
        rmBtn.addEventListener('click', () => callbacks.onRemoveMistake?.(item.id));
        tools.append(editBtn, rmBtn);
        noteRow.appendChild(tools);
        card.appendChild(noteRow);
      }

      list.appendChild(card);
    }

    root.appendChild(list);

    if (
      props.highlightedMistakeBlockId &&
      props.highlightedMistakeBlockId !== lastScrolledMistakeBlock
    ) {
      lastScrolledMistakeBlock = props.highlightedMistakeBlockId;
      requestAnimationFrame(() => {
        const target = root.querySelector<HTMLElement>(
          `[data-mistake-block-id="${props.highlightedMistakeBlockId}"]`
        );
        target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    } else if (!props.highlightedMistakeBlockId) {
      lastScrolledMistakeBlock = null;
    }
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
