import { el } from '../dom';
import { createIcon } from '../icons';
import type {
  Cet6AudioAvailability,
  Cet6PaperStatus,
  ExamChoiceQuestion,
  ExamIndexFilter,
  ExamPaperSectionId,
  ExamWorkspaceCallbacks,
  ExamWorkspaceProps,
  MistakeQuestionType,
  UIComponentHandle,
} from '../types';

function formatClock(sec: number): string {
  const safe = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function statusTag(status: Cet6PaperStatus): { label: string; cls: string } {
  switch (status) {
    case 'downloaded':
      return { label: '已导入', cls: 'ciyu-badge ciyu-badge--ok' };
    case 'downloading':
      return { label: '导入中…', cls: 'ciyu-badge ciyu-badge--accent' };
    case 'error':
      return { label: '下载失败', cls: 'ciyu-badge ciyu-badge--error' };
    case 'not_downloaded':
    default:
      return { label: '未导入', cls: 'ciyu-badge ciyu-badge--neutral' };
  }
}

function audioTag(audio: Cet6AudioAvailability): { label: string; cls: string } {
  switch (audio) {
    case 'local_ready':
      return { label: '听力就绪', cls: 'ciyu-badge ciyu-badge--accent' };
    case 'link_only':
      return { label: '在线音频', cls: 'ciyu-badge ciyu-badge--neutral' };
    case 'unverified_transcript':
      return { label: '原文待核对', cls: 'ciyu-badge ciyu-badge--warn' };
    case 'audio_error':
      return { label: '音频异常', cls: 'ciyu-badge ciyu-badge--error' };
    case 'no_audio':
    default:
      return { label: '无听力音频', cls: 'ciyu-badge ciyu-badge--neutral' };
  }
}

const TOC_ITEMS: ReadonlyArray<{ id: ExamPaperSectionId; label: string }> = [
  { id: 'writing', label: '写作' },
  { id: 'listening', label: '听力' },
  { id: 'banked', label: '选词填空' },
  { id: 'matching', label: '段落匹配' },
  { id: 'careful', label: '仔细阅读' },
  { id: 'translation', label: '翻译' },
  { id: 'answers', label: '参考答案' },
];

/**
 * 二、真题索引与忠实原卷阅读做题（ExamWorkspaceView）
 * - 真题索引：展示库内可点击真题索引、状态筛选、直达试卷与精听；
 * - 忠实原卷：严格保留写作 → 听力（内置在线播放器 + 独立下载全文/音频） → 选词填空（原空号 + 词库）
 *   → 段落匹配（段落字母 A–I） → 仔细阅读（题随文后） → 翻译 → 默认折叠参考答案/解析/译文；
 * - 每道题分配稳定 Obsidian 块 ID（#^blockId），附低干扰「加入错题 / 查看错题记录」双向段落跳转。
 */
export function createExamWorkspaceView(
  initialProps: ExamWorkspaceProps,
  callbacks: ExamWorkspaceCallbacks = {}
): UIComponentHandle<ExamWorkspaceProps> {
  let props = initialProps;
  let lastScrolledBlockId: string | null = null;

  const root = el('section', 'ciyu-exam-workspace');

  const searchCapsule = el('div', 'ciyu-glass ciyu-search-capsule');
  searchCapsule.style.minHeight = '36px';
  const sIcon = createIcon('search', 'sm');
  sIcon.classList.add('ciyu-search-icon');
  const searchInput = el('input', 'ciyu-search-input');
  searchInput.type = 'search';
  searchInput.placeholder = '按年份、月份或套卷筛选…';
  searchInput.setAttribute('aria-label', '筛选真题索引');
  searchInput.addEventListener('input', () => callbacks.onSearchChange?.(searchInput.value));
  searchCapsule.append(sIcon, searchInput);

  const host = el('div', 'ciyu-exam-workspace');
  root.appendChild(host);

  root.addEventListener('mouseup', () => {
    const doc = root.ownerDocument;
    const sel = doc.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString().trim();
    if (!text || text.length > 240) return;
    const anchorNode = sel.anchorNode;
    const anchorEl = anchorNode?.nodeType === 1 ? (anchorNode as Element) : anchorNode?.parentElement;
    if (!anchorEl || !anchorEl.closest('.ciyu-selectable-prose')) return;
    const contextText = anchorEl.closest('.ciyu-selectable-prose')?.textContent?.trim() ?? text;
    const rect = sel.rangeCount > 0 ? sel.getRangeAt(0).getBoundingClientRect() : undefined;
    callbacks.onLookupSelection?.(text, contextText, rect);
  });

  /** 渲染每题右上角低干扰「加入错题」或「查看错题记录（双向块跳转）」 */
  function createMistakeActionControl(params: {
    paperId: string;
    questionNumber: number;
    blockId: string;
    questionType: MistakeQuestionType;
    stemPreview: string;
    myAnswer: string;
    correctAnswer: string;
  }): HTMLElement {
    const existing = props.mistakeByQuestion[params.questionNumber];
    if (existing) {
      const linkBtn = el('button', 'ciyu-mistake-chip ciyu-mistake-chip--saved');
      linkBtn.type = 'button';
      linkBtn.title = `Obsidian 双向块链接：${existing.mistakeWikiLink}`;
      linkBtn.append(
        createIcon('flag', 'sm'),
        el('span', undefined, '查看错题记录'),
        createIcon('arrow-up-right', 'sm')
      );
      linkBtn.addEventListener('click', () => callbacks.onViewMistakeRecord?.(existing));
      return linkBtn;
    }

    const addBtn = el('button', 'ciyu-mistake-chip');
    addBtn.type = 'button';
    addBtn.title = `加入错题本（绑定块 #^${params.blockId}）`;
    addBtn.append(createIcon('plus', 'sm'), el('span', undefined, '加入错题'));
    addBtn.addEventListener('click', () => callbacks.onAddQuestionToMistakes?.(params));
    return addBtn;
  }

  function renderChoiceQuestion(
    paperId: string,
    q: ExamChoiceQuestion,
    qType: MistakeQuestionType,
    twoColOptions = false
  ): HTMLLIElement {
    const isTarget = props.highlightedQuestionBlockId === q.blockId;
    const qItem = el(
      'li',
      isTarget ? 'ciyu-question-item ciyu-block-highlight' : 'ciyu-question-item'
    );
    qItem.dataset.blockId = q.blockId;
    qItem.id = q.blockId;

    const headRow = el('div', 'ciyu-question-head-row');
    const stem = el('p', 'ciyu-question-stem ciyu-selectable-prose', `${q.number}. ${q.stem}`);

    const rightMeta = el('div', 'ciyu-paper-actions');
    rightMeta.appendChild(el('code', 'ciyu-block-id-tag', `#^${q.blockId}`));
    rightMeta.appendChild(
      createMistakeActionControl({
        paperId,
        questionNumber: q.number,
        blockId: q.blockId,
        questionType: qType,
        stemPreview: q.stem,
        myAnswer: q.selectedKey ?? '未作答',
        correctAnswer: q.answerKey,
      })
    );
    headRow.append(stem, rightMeta);

    const optGrid = el(
      'div',
      twoColOptions ? 'ciyu-option-list ciyu-option-list--2col' : 'ciyu-option-list'
    );
    for (const opt of q.options) {
      const chosen = q.selectedKey === opt.key;
      let cls = 'ciyu-option-btn ciyu-selectable-prose';
      if (props.graded && chosen && opt.key !== q.answerKey) {
        cls += ' ciyu-option-btn--wrong';
      } else if (props.graded && opt.key === q.answerKey) {
        cls += ' ciyu-option-btn--correct';
      }
      const optBtn = el('div', cls);
      optBtn.setAttribute('role', 'button');
      optBtn.tabIndex = 0;
      optBtn.setAttribute('aria-pressed', String(chosen));
      optBtn.append(
        el('span', 'ciyu-option-key', `${opt.key})`),
        el('span', undefined, opt.text)
      );
      optBtn.addEventListener('click', () => {
        const sel = root.ownerDocument.getSelection();
        if (sel && !sel.isCollapsed) return;
        callbacks.onAnswerObjective?.(q.number, opt.key);
      });
      optBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          callbacks.onAnswerObjective?.(q.number, opt.key);
        }
      });
      optGrid.appendChild(optBtn);
    }

    qItem.append(headRow, optGrid);
    return qItem;
  }

  function renderIndex(): void {
    const topBar = el('div', 'ciyu-glass ciyu-vault-bar');
    const leftMeta = el('div', 'ciyu-vault-meta');
    if (callbacks.onBackToBank) {
      const backBtn = el('button', 'ciyu-mini-btn');
      backBtn.type = 'button';
      backBtn.append(createIcon('arrow-left', 'sm'), el('span', undefined, '返回题库'));
      backBtn.addEventListener('click', () => callbacks.onBackToBank?.());
      leftMeta.appendChild(backBtn);
    }
    const chip = el('span', 'ciyu-vault-chip', `真题索引.md · ${props.vaultName}`);
    const targetSpan = el(
      'span',
      'ciyu-folder-path',
      props.indexNotePath ?? '词屿/六级题库/真题索引.md'
    );
    leftMeta.append(chip, targetSpan);

    const topActions = el('div', 'ciyu-toolbar-actions');
    if (props.indexNotePath) {
      const openIdxBtn = el('button', 'ciyu-mini-btn');
      openIdxBtn.type = 'button';
      openIdxBtn.append(createIcon('file-text', 'sm'), el('span', undefined, '打开索引笔记'));
      openIdxBtn.addEventListener('click', () =>
        callbacks.onOpenIndexNote?.(props.indexNotePath!)
      );
      topActions.appendChild(openIdxBtn);
    }
    if (callbacks.onOpenMistakeBook) {
      const misBtn = el('button', 'ciyu-mini-btn');
      misBtn.type = 'button';
      misBtn.append(createIcon('flag', 'sm'), el('span', undefined, '六级错题索引'));
      misBtn.addEventListener('click', () => callbacks.onOpenMistakeBook?.());
      topActions.appendChild(misBtn);
    }

    topBar.append(leftMeta, topActions);
    host.appendChild(topBar);

    const filterBar = el('div', 'ciyu-index-filter-bar');
    const filterPills = el('div', 'ciyu-filter-pills');
    const filters: Array<{ id: ExamIndexFilter; label: string }> = [
      { id: 'all', label: '全部套卷' },
      { id: 'downloaded', label: '已导入' },
      { id: 'with_audio', label: '含听力' },
      { id: 'pending', label: '未导入' },
    ];
    for (const f of filters) {
      const btn = el(
        'button',
        props.filter === f.id ? 'ciyu-mini-btn ciyu-mini-btn--accent' : 'ciyu-mini-btn',
        f.label
      );
      btn.type = 'button';
      btn.setAttribute('aria-pressed', String(props.filter === f.id));
      btn.addEventListener('click', () => callbacks.onFilterChange?.(f.id));
      filterPills.appendChild(btn);
    }
    if (root.ownerDocument.activeElement !== searchInput && searchInput.value !== props.searchQuery) {
      searchInput.value = props.searchQuery;
    }
    filterBar.append(filterPills, searchCapsule);
    host.appendChild(filterBar);

    const table = el('div', 'ciyu-index-table');
    table.setAttribute('role', 'list');
    table.setAttribute('aria-label', '可点击真题索引列表');

    const q = props.searchQuery.trim().toLowerCase();
    const allPapers = props.sessions.flatMap((s) => s.papers);
    const filtered = allPapers.filter((p) => {
      if (props.filter === 'downloaded' && p.status !== 'downloaded') return false;
      if (
        props.filter === 'with_audio' &&
        p.audioStatus !== 'local_ready' &&
        p.audioStatus !== 'link_only'
      ) {
        return false;
      }
      if (props.filter === 'pending' && p.status === 'downloaded') return false;
      if (q && !`${p.session} 第 ${p.setNumber} 套 ${p.title}`.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });

    for (const paper of filtered) {
      const row = el('div', 'ciyu-surface ciyu-index-row');
      row.setAttribute('role', 'listitem');

      const main = el('div', 'ciyu-index-row-main');
      main.appendChild(
        el('span', 'ciyu-index-row-title', `${paper.session} · 第 ${paper.setNumber} 套`)
      );

      const badges = el('div', 'ciyu-index-row-badges');
      const st = statusTag(paper.status);
      const au = audioTag(paper.audioStatus);
      badges.append(el('span', st.cls, st.label), el('span', au.cls, au.label));
      if (paper.notePath) {
        badges.appendChild(el('span', 'ciyu-next-review-tag', paper.notePath));
      }
      main.appendChild(badges);

      const actions = el('div', 'ciyu-paper-actions');
      if (paper.status === 'downloaded') {
        const readBtn = el('button', 'ciyu-mini-btn ciyu-mini-btn--accent', '打开试卷');
        readBtn.type = 'button';
        readBtn.addEventListener('click', () => callbacks.onSelectPaper?.(paper.id));

        const listenBtn = el('button', 'ciyu-mini-btn');
        listenBtn.type = 'button';
        listenBtn.append(createIcon('headphones', 'sm'), el('span', undefined, '逐段精听'));
        listenBtn.addEventListener('click', () => callbacks.onOpenPaperListening?.(paper.id));

        actions.append(readBtn, listenBtn);

        if (paper.notePath) {
          const noteBtn = el('button', 'ciyu-mini-btn', '笔记文件');
          noteBtn.type = 'button';
          noteBtn.addEventListener('click', () => callbacks.onOpenLocalNote?.(paper.notePath!));
          actions.appendChild(noteBtn);
        }
      } else {
        const dlBtn = el('button', 'ciyu-mini-btn', '回题库导入');
        dlBtn.type = 'button';
        dlBtn.addEventListener('click', () =>
          callbacks.onBackToBank ? callbacks.onBackToBank() : callbacks.onOpenBatchDownloadModal?.()
        );
        actions.appendChild(dlBtn);
      }

      row.append(main, actions);
      table.appendChild(row);
    }

    host.appendChild(table);
  }

  function renderPaper(): void {
    const paper = props.activePaper;
    if (!paper) {
      renderIndex();
      return;
    }

    // 1. 卷首导航栏
    const header = el('header', 'ciyu-topbar-nav');
    const left = el('div', 'ciyu-paper-info');
    const backIdx = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm');
    backIdx.type = 'button';
    backIdx.append(createIcon('arrow-left', 'sm'), el('span', undefined, '真题索引'));
    backIdx.addEventListener('click', () => callbacks.onChangeMode?.('index'));
    left.append(backIdx, el('strong', 'ciyu-settings-title', paper.title));

    const right = el('div', 'ciyu-toolbar-actions');
    const listenBtn = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm');
    listenBtn.type = 'button';
    listenBtn.append(createIcon('headphones', 'sm'), el('span', undefined, '选段精听'));
    listenBtn.addEventListener('click', () => callbacks.onOpenPaperListening?.(paper.paperId));
    right.appendChild(listenBtn);

    if (callbacks.onOpenMistakeBook) {
      const misBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm');
      misBtn.type = 'button';
      misBtn.append(createIcon('flag', 'sm'), el('span', undefined, '错题本'));
      misBtn.addEventListener('click', () => callbacks.onOpenMistakeBook?.());
      right.appendChild(misBtn);
    }

    if (paper.notePath) {
      const noteBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm');
      noteBtn.type = 'button';
      noteBtn.append(createIcon('file-text', 'sm'), el('span', undefined, 'Markdown 笔记'));
      noteBtn.addEventListener('click', () => callbacks.onOpenLocalNote?.(paper.notePath!));
      right.appendChild(noteBtn);
    }

    header.append(left, right);
    host.appendChild(header);

    // 2. 卷首可跳转目录（Sticky TOC）
    const toc = el('nav', 'ciyu-glass ciyu-glass-refract ciyu-paper-jumper');
    toc.setAttribute('aria-label', '卷首分节目录');
    for (const item of TOC_ITEMS) {
      const active = props.activeSection === item.id;
      const btn = el('button', 'ciyu-jump-btn', item.label);
      btn.type = 'button';
      btn.setAttribute('aria-current', String(active));
      btn.addEventListener('click', () => {
        callbacks.onJumpSection?.(item.id);
        const target = host.querySelector<HTMLElement>(`[data-paper-section="${item.id}"]`);
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      toc.appendChild(btn);
    }
    host.appendChild(toc);

    // 交卷自动判分与批量错题收集栏
    const allObjQuestions = [
      ...paper.listening.groups.flatMap((g) => g.questions),
      ...paper.bankedCloze.questions,
      ...paper.matching.questions,
      ...paper.carefulReading.passages.flatMap((p) => p.questions),
    ];
    const answered = allObjQuestions.filter((q) => Boolean(q.selectedKey));
    const wrongAnswered = answered.filter((q) => q.selectedKey !== q.answerKey);

    const gradeStrip = el('div', 'ciyu-banner');
    const gradeLeft = el('div', 'ciyu-banner-main');
    gradeLeft.appendChild(
      el(
        'span',
        undefined,
        props.graded
          ? `已判分：已作答 ${answered.length} 题，答错 ${wrongAnswered.length} 题（正文英文支持划词查词与加生词）。`
          : `做题进度：已作答 ${answered.length} / ${allObjQuestions.length} 道示例题 · 点击题旁「加入错题」或交卷自动汇总错题。`
      )
    );
    const gradeActions = el('div', 'ciyu-toolbar-actions');
    const submitBtn = el(
      'button',
      props.graded ? 'ciyu-btn ciyu-btn--glass ciyu-btn--sm' : 'ciyu-btn ciyu-btn--primary ciyu-btn--sm',
      props.graded ? '重新判分' : '交卷自动判分'
    );
    submitBtn.type = 'button';
    submitBtn.addEventListener('click', () => callbacks.onSubmitGrading?.());
    gradeActions.appendChild(submitBtn);

    if (props.graded && wrongAnswered.length > 0) {
      const batchWrongBtn = el(
        'button',
        'ciyu-btn ciyu-btn--primary ciyu-btn--sm',
        `将本次错题加入错题本 (${wrongAnswered.length})`
      );
      batchWrongBtn.type = 'button';
      batchWrongBtn.addEventListener('click', () => callbacks.onAddAllWrongToMistakes?.());
      gradeActions.appendChild(batchWrongBtn);
    }
    gradeStrip.append(gradeLeft, gradeActions);
    host.appendChild(gradeStrip);

    // 3. Part I · 写作
    const writingSec = el('section', 'ciyu-surface ciyu-paper-section');
    writingSec.dataset.paperSection = 'writing';
    writingSec.dataset.blockId = paper.writing.blockId;
    writingSec.append(
      el('h4', undefined, 'Part I · Writing'),
      el('blockquote', 'ciyu-directions-box ciyu-selectable-prose', paper.writing.directions),
      el('p', 'ciyu-paper-prose ciyu-selectable-prose', paper.writing.prompt)
    );

    // 4. Part II · 听力理解（内置在线播放器 + 下载全文 + 下载音频 + 逐段精听入口）
    const listeningSec = el('section', 'ciyu-surface ciyu-paper-section');
    listeningSec.dataset.paperSection = 'listening';

    const lHead = el('div', 'ciyu-session-head');
    lHead.appendChild(el('h4', undefined, 'Part II · Listening Comprehension'));

    const lActions = el('div', 'ciyu-toolbar-actions');
    const dlTextBtn = el(
      'button',
      paper.listening.transcriptSaved
        ? 'ciyu-mini-btn ciyu-mini-btn--accent'
        : 'ciyu-mini-btn'
    );
    dlTextBtn.type = 'button';
    dlTextBtn.append(
      createIcon(paper.listening.transcriptSaved ? 'check' : 'download', 'sm'),
      el('span', undefined, paper.listening.transcriptSaved ? '已下载全文' : '下载全文')
    );
    dlTextBtn.addEventListener('click', () =>
      callbacks.onDownloadTranscriptMarkdown?.(paper.paperId)
    );

    const dlAudioBtn = el(
      'button',
      paper.listening.audioSaved ? 'ciyu-mini-btn ciyu-mini-btn--accent' : 'ciyu-mini-btn'
    );
    dlAudioBtn.type = 'button';
    dlAudioBtn.append(
      createIcon(paper.listening.audioSaved ? 'check' : 'download', 'sm'),
      el('span', undefined, paper.listening.audioSaved ? '音频已离线' : '下载音频')
    );
    dlAudioBtn.addEventListener('click', () =>
      callbacks.onDownloadAudioOffline?.(paper.paperId)
    );

    lActions.append(dlTextBtn, dlAudioBtn);
    lHead.appendChild(lActions);
    listeningSec.appendChild(lHead);

    // 试卷内跳转至听力原文 Markdown 的链接（点击「下载全文」后自动出现，或共用同考次原文）
    if (paper.transcriptNotePath || paper.sharedListeningNotePath) {
      const linkRow = el('div', 'ciyu-toolbar-actions');
      if (paper.transcriptNotePath) {
        const trNoteBtn = el('button', 'ciyu-note-link');
        trNoteBtn.type = 'button';
        trNoteBtn.append(
          createIcon('file-text', 'sm'),
          el('span', undefined, `听力全文笔记：[[${paper.transcriptNotePath}|打开对照全文]]`)
        );
        trNoteBtn.addEventListener('click', () =>
          callbacks.onOpenLocalNote?.(paper.transcriptNotePath!)
        );
        linkRow.appendChild(trNoteBtn);
      }
      if (paper.sharedListeningNotePath) {
        const sharedBtn = el('button', 'ciyu-note-link');
        sharedBtn.type = 'button';
        sharedBtn.append(
          createIcon('link', 'sm'),
          el('span', undefined, `本套与同考次共用听力：[[${paper.sharedListeningNotePath}]]`)
        );
        sharedBtn.addEventListener('click', () =>
          callbacks.onOpenLocalNote?.(paper.sharedListeningNotePath!)
        );
        linkRow.appendChild(sharedBtn);
      }
      listeningSec.appendChild(linkRow);
    }

    // 内嵌在线音频控制栏（播放/暂停/进度/倍速/前后跳转）
    const embedPlayer = el('div', 'ciyu-glass ciyu-audio-bar');
    const pRow = el('div', 'ciyu-audio-main');

    const backStepBtn = el('button', 'ciyu-icon-btn');
    backStepBtn.type = 'button';
    backStepBtn.title = '后退 5 秒';
    backStepBtn.setAttribute('aria-label', '后退 5 秒');
    backStepBtn.appendChild(createIcon('skip-back', 'sm'));
    backStepBtn.addEventListener('click', () => callbacks.onStepEmbeddedAudio?.(-5));

    const playBtn = el('button', 'ciyu-play-btn');
    playBtn.type = 'button';
    playBtn.setAttribute('aria-label', paper.listening.playing ? '暂停听力' : '播放听力');
    playBtn.appendChild(createIcon(paper.listening.playing ? 'pause' : 'play', 'sm'));
    playBtn.addEventListener('click', () => callbacks.onToggleEmbeddedPlay?.());

    const fwdStepBtn = el('button', 'ciyu-icon-btn');
    fwdStepBtn.type = 'button';
    fwdStepBtn.title = '前进 5 秒';
    fwdStepBtn.setAttribute('aria-label', '前进 5 秒');
    fwdStepBtn.appendChild(createIcon('skip-forward', 'sm'));
    fwdStepBtn.addEventListener('click', () => callbacks.onStepEmbeddedAudio?.(5));

    const curSec = paper.listening.currentTimeSec ?? 16;
    const totSec = paper.listening.durationSec ?? 49;
    const scrub = el('div', 'ciyu-scrubber-wrap');
    const track = el('div', 'ciyu-progress-track');
    const fill = el('div', 'ciyu-progress-fill');
    fill.style.width = `${Math.min(100, (curSec / Math.max(1, totSec)) * 100)}%`;
    track.appendChild(fill);
    const timeMeta = el('div', 'ciyu-time-row');
    timeMeta.append(
      el('span', undefined, `${formatClock(curSec)} / ${formatClock(totSec)}`),
      el('span', undefined, `倍速 ${paper.listening.playbackRate ?? 1}× · 在线/本地自适应`)
    );
    scrub.append(track, timeMeta);

    const intensiveJumpBtn = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm');
    intensiveJumpBtn.type = 'button';
    intensiveJumpBtn.append(
      createIcon('headphones', 'sm'),
      el('span', undefined, '逐段精听与原文对照')
    );
    intensiveJumpBtn.addEventListener('click', () =>
      callbacks.onOpenPaperListening?.(paper.paperId)
    );

    pRow.append(backStepBtn, playBtn, fwdStepBtn, scrub, intensiveJumpBtn);
    embedPlayer.appendChild(pRow);
    listeningSec.appendChild(embedPlayer);

    listeningSec.appendChild(
      el('blockquote', 'ciyu-directions-box ciyu-selectable-prose', paper.listening.directions)
    );

    for (const grp of paper.listening.groups) {
      const grpBlock = el('div', 'ciyu-detail-block');
      const grpHead = el('div', 'ciyu-session-head');
      grpHead.appendChild(
        el('strong', 'ciyu-toggle-title', `${grp.sectionLabel} · ${grp.title}（${grp.questionRange}）`)
      );
      const grpListenBtn = el('button', 'ciyu-mini-btn ciyu-mini-btn--accent');
      grpListenBtn.type = 'button';
      grpListenBtn.append(createIcon('headphones', 'sm'), el('span', undefined, '精听本段'));
      grpListenBtn.addEventListener('click', () =>
        callbacks.onOpenPaperListening?.(paper.paperId, grp.id)
      );
      grpHead.appendChild(grpListenBtn);
      grpBlock.appendChild(grpHead);

      if (grp.directions) {
        grpBlock.appendChild(
          el('p', 'ciyu-toggle-desc ciyu-selectable-prose', grp.directions)
        );
      }

      const qList = el('ol', 'ciyu-question-list');
      for (const q of grp.questions) {
        qList.appendChild(renderChoiceQuestion(paper.paperId, q, 'listening', true));
      }
      grpBlock.appendChild(qList);
      listeningSec.appendChild(grpBlock);
    }

    // 5. Part III · Section A 选词填空（保留原空号与 A–O 词库）
    const bankedSec = el('section', 'ciyu-surface ciyu-paper-section');
    bankedSec.dataset.paperSection = 'banked';
    bankedSec.append(
      el('h4', undefined, 'Part III · Reading Comprehension · Section A（选词填空）'),
      el('blockquote', 'ciyu-directions-box ciyu-selectable-prose', paper.bankedCloze.directions)
    );
    for (const para of paper.bankedCloze.paragraphsWithBlanks) {
      bankedSec.appendChild(el('p', 'ciyu-paper-prose ciyu-selectable-prose', para));
    }

    const wbBox = el('div', 'ciyu-wordbank-grid ciyu-selectable-prose');
    wbBox.setAttribute('aria-label', '选词填空备选词库 A–O');
    for (const item of paper.bankedCloze.wordBank) {
      const cell = el('span', 'ciyu-wordbank-cell');
      cell.append(
        el('strong', 'ciyu-option-key', `${item.key})`),
        el('span', undefined, ` ${item.word}`)
      );
      wbBox.appendChild(cell);
    }
    bankedSec.appendChild(wbBox);

    const bankedList = el('div', 'ciyu-question-list');
    for (const bq of paper.bankedCloze.questions) {
      const isTarget = props.highlightedQuestionBlockId === bq.blockId;
      const row = el(
        'div',
        isTarget ? 'ciyu-question-item ciyu-block-highlight' : 'ciyu-question-item'
      );
      row.dataset.blockId = bq.blockId;
      row.id = bq.blockId;
      const head = el('div', 'ciyu-question-head-row');
      const leftWrap = el('div', 'ciyu-paper-info');
      leftWrap.appendChild(el('strong', undefined, `空 〔${bq.number}〕 选择词库字母：`));

      const select = el('select', 'ciyu-select');
      select.style.width = 'auto';
      select.style.padding = '3px 8px';
      select.appendChild(el('option', undefined, '未选'));
      for (const wb of paper.bankedCloze.wordBank) {
        const opt = el('option', undefined, `${wb.key}) ${wb.word}`);
        opt.value = wb.key;
        opt.selected = bq.selectedKey === wb.key;
        select.appendChild(opt);
      }
      select.addEventListener('change', () =>
        callbacks.onAnswerObjective?.(bq.number, select.value)
      );
      leftWrap.appendChild(select);

      const rightWrap = el('div', 'ciyu-paper-actions');
      rightWrap.appendChild(el('code', 'ciyu-block-id-tag', `#^${bq.blockId}`));
      rightWrap.appendChild(
        createMistakeActionControl({
          paperId: paper.paperId,
          questionNumber: bq.number,
          blockId: bq.blockId,
          questionType: 'banked_cloze',
          stemPreview: `选词填空第 〔${bq.number}〕 空`,
          myAnswer: bq.selectedKey ?? '未作答',
          correctAnswer: `${bq.answerKey} (${bq.answerWord})`,
        })
      );
      head.append(leftWrap, rightWrap);
      row.appendChild(head);
      bankedList.appendChild(row);
    }
    bankedSec.appendChild(bankedList);

    // 6. Part III · Section B 段落匹配（保留段落字母 A–I）
    const matchingSec = el('section', 'ciyu-surface ciyu-paper-section');
    matchingSec.dataset.paperSection = 'matching';
    matchingSec.append(
      el('h4', undefined, 'Part III · Section B（长篇阅读段落匹配）'),
      el('blockquote', 'ciyu-directions-box ciyu-selectable-prose', paper.matching.directions)
    );
    for (const p of paper.matching.paragraphs) {
      const pEl = el('p', 'ciyu-paper-prose ciyu-selectable-prose');
      pEl.append(
        el('strong', 'ciyu-option-key', `${p.letter}) `),
        document.createTextNode(p.text)
      );
      matchingSec.appendChild(pEl);
    }
    const matchList = el('div', 'ciyu-question-list');
    for (const mq of paper.matching.questions) {
      const isTarget = props.highlightedQuestionBlockId === mq.blockId;
      const row = el(
        'div',
        isTarget ? 'ciyu-question-item ciyu-block-highlight' : 'ciyu-question-item'
      );
      row.dataset.blockId = mq.blockId;
      row.id = mq.blockId;
      const head = el('div', 'ciyu-question-head-row');
      head.appendChild(
        el('p', 'ciyu-question-stem ciyu-selectable-prose', `${mq.number}. ${mq.statement}`)
      );

      const rightWrap = el('div', 'ciyu-paper-actions');
      const select = el('select', 'ciyu-select');
      select.style.width = 'auto';
      select.style.padding = '3px 8px';
      select.setAttribute('aria-label', `第 ${mq.number} 题匹配段落`);
      const emptyOpt = el('option', undefined, '段落');
      emptyOpt.value = '';
      select.appendChild(emptyOpt);
      for (const p of paper.matching.paragraphs) {
        const opt = el('option', undefined, p.letter);
        opt.value = p.letter;
        opt.selected = mq.selectedKey === p.letter;
        select.appendChild(opt);
      }
      select.addEventListener('change', () =>
        callbacks.onAnswerObjective?.(mq.number, select.value)
      );

      rightWrap.append(
        select,
        el('code', 'ciyu-block-id-tag', `#^${mq.blockId}`),
        createMistakeActionControl({
          paperId: paper.paperId,
          questionNumber: mq.number,
          blockId: mq.blockId,
          questionType: 'matching',
          stemPreview: mq.statement,
          myAnswer: mq.selectedKey || '未作答',
          correctAnswer: mq.answerKey,
        })
      );
      head.appendChild(rightWrap);
      row.appendChild(head);
      matchList.appendChild(row);
    }
    matchingSec.appendChild(matchList);

    // 7. Part III · Section C 仔细阅读（阅读题严格跟在对应文章后）
    const carefulSec = el('section', 'ciyu-surface ciyu-paper-section');
    carefulSec.dataset.paperSection = 'careful';
    carefulSec.append(
      el('h4', undefined, 'Part III · Section C（仔细阅读 · 题随文后）'),
      el(
        'blockquote',
        'ciyu-directions-box ciyu-selectable-prose',
        paper.carefulReading.directions
      )
    );

    for (const passage of paper.carefulReading.passages) {
      const pWrap = el('div', 'ciyu-detail-block');
      pWrap.appendChild(el('strong', 'ciyu-settings-title', passage.title));
      for (const para of passage.paragraphs) {
        pWrap.appendChild(el('p', 'ciyu-paper-prose ciyu-selectable-prose', para));
      }
      const qList = el('ol', 'ciyu-question-list');
      for (const q of passage.questions) {
        qList.appendChild(
          renderChoiceQuestion(paper.paperId, q, 'careful_reading', true)
        );
      }
      pWrap.appendChild(qList);
      carefulSec.appendChild(pWrap);
    }

    // 8. Part IV · 汉译英
    const transSec = el('section', 'ciyu-surface ciyu-paper-section');
    transSec.dataset.paperSection = 'translation';
    transSec.dataset.blockId = paper.translation.blockId;
    transSec.append(
      el('h4', undefined, 'Part IV · Translation（汉译英）'),
      el('blockquote', 'ciyu-directions-box ciyu-selectable-prose', paper.translation.directions),
      el('p', 'ciyu-paper-prose', paper.translation.sourceZh)
    );

    // 9. 参考答案、解析与参考译文（默认折叠）
    const ansSec = el('section', 'ciyu-surface ciyu-paper-section');
    ansSec.dataset.paperSection = 'answers';
    ansSec.appendChild(el('h4', undefined, '参考答案、解析与参考译文'));

    const toggleAns = el('button', 'ciyu-disclosure-btn');
    toggleAns.type = 'button';
    toggleAns.setAttribute('aria-expanded', String(props.answersExpanded));
    toggleAns.appendChild(
      el(
        'span',
        undefined,
        props.answersExpanded
          ? '收起参考答案、客观题解析与参考译文'
          : '展开参考答案、客观题解析与参考译文（默认折叠）'
      )
    );
    const chev = createIcon('chevron-down', 'sm');
    chev.classList.add('ciyu-disclosure-chevron');
    toggleAns.appendChild(chev);
    toggleAns.addEventListener('click', () =>
      callbacks.onToggleAnswers?.(!props.answersExpanded)
    );
    ansSec.appendChild(toggleAns);

    if (props.answersExpanded) {
      const table = el('table', 'ciyu-answer-table');
      const thead = el('thead');
      const hr = el('tr');
      hr.append(
        el('th', undefined, '分节'),
        el('th', undefined, '题号'),
        el('th', undefined, '参考答案')
      );
      thead.appendChild(hr);
      const tbody = el('tbody');
      for (const row of paper.answerSummaryRows) {
        const tr = el('tr');
        tr.append(
          el('td', undefined, row.sectionLabel),
          el('td', undefined, row.rangeLabel),
          el('td', undefined, row.answersText)
        );
        tbody.appendChild(tr);
      }
      table.append(thead, tbody);
      ansSec.appendChild(table);

      if (paper.writing.sampleEssay) {
        const wBox = el('div', 'ciyu-answer-box');
        wBox.append(
          el('strong', undefined, 'Part I 写作参考范文'),
          el('p', 'ciyu-paper-prose ciyu-selectable-prose', paper.writing.sampleEssay)
        );
        ansSec.appendChild(wBox);
      }
      if (paper.translation.referenceEn) {
        const tBox = el('div', 'ciyu-answer-box');
        tBox.append(
          el('strong', undefined, 'Part IV 翻译参考译文'),
          el('p', 'ciyu-paper-prose ciyu-selectable-prose', paper.translation.referenceEn)
        );
        ansSec.appendChild(tBox);
      }
    }

    host.append(
      writingSec,
      listeningSec,
      bankedSec,
      matchingSec,
      carefulSec,
      transSec,
      ansSec
    );

    // 若从错题本点击「回到原题 (#^blockId)」跳入，自动平滑滚动到目标题块
    if (
      props.highlightedQuestionBlockId &&
      props.highlightedQuestionBlockId !== lastScrolledBlockId
    ) {
      lastScrolledBlockId = props.highlightedQuestionBlockId;
      requestAnimationFrame(() => {
        const target = host.querySelector<HTMLElement>(
          `[data-block-id="${props.highlightedQuestionBlockId}"]`
        );
        target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    } else if (!props.highlightedQuestionBlockId) {
      lastScrolledBlockId = null;
    }
  }

  function render(): void {
    host.replaceChildren();
    if (props.mode === 'paper' && props.activePaper) {
      renderPaper();
    } else {
      renderIndex();
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
