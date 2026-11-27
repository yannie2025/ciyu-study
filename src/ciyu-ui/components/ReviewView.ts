import { appendClozeSentence, appendHighlightedText, el } from '../dom';
import { speechButton } from './LookupTools';
import { attachLiquidLens } from './LiquidSegmented';
import { createIcon } from '../icons';
import type {
  ReviewRating,
  ReviewViewCallbacks,
  ReviewViewProps,
  UIComponentHandle,
} from '../types';

const RATING_CONFIG: ReadonlyArray<{
  key: ReviewRating;
  label: string;
  className: string;
}> = [
  { key: 'again', label: '忘记', className: 'ciyu-rate-btn ciyu-rate-btn--again' },
  { key: 'hard', label: '模糊', className: 'ciyu-rate-btn ciyu-rate-btn--hard' },
  { key: 'good', label: '记得', className: 'ciyu-rate-btn ciyu-rate-btn--good' },
  { key: 'easy', label: '轻松', className: 'ciyu-rate-btn ciyu-rate-btn--easy' },
];

/**
 * 视图 4：「今日复习」卡片
 * 支持只看原词 / 原句挖空模式，揭晓后显示「忘记 / 模糊 / 记得 / 轻松」及下次复习间隔提示；
 * 完整补齐「无待复习」与「复习完成」状态。
 */
export function createReviewView(
  initialProps: ReviewViewProps,
  callbacks: ReviewViewCallbacks = {}
): UIComponentHandle<ReviewViewProps> {
  let props = initialProps;

  const root = el('section', 'ciyu-review-view');
  root.setAttribute('aria-label', '今日复习');

  function render(): void {
    root.innerHTML = '';

    // 1. 无待复习状态
    if (props.status === 'empty') {
      const card = el('div', 'ciyu-surface ciyu-state-card');
      const icon = el('div', 'ciyu-state-icon ciyu-state-icon--success');
      icon.appendChild(createIcon('check', 'lg'));

      card.append(
        icon,
        el('h3', 'ciyu-state-title', '今日暂无待复习词条'),
        el(
          'p',
          'ciyu-state-desc',
          props.nextUpcomingHint ??
            '当前记忆曲线都很稳固，下一批词条将在明天 09:00 提醒复习。'
        )
      );

      const actions = el('div', 'ciyu-quick-picks');
      const vocabBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm');
      vocabBtn.type = 'button';
      vocabBtn.append(createIcon('book-open', 'sm'), el('span', undefined, '浏览生词本'));
      vocabBtn.addEventListener('click', () => callbacks.onGoToVocabulary?.());
      actions.appendChild(vocabBtn);
      card.appendChild(actions);

      root.appendChild(card);
      return;
    }

    // 2. 复习完成状态
    if (props.status === 'completed') {
      const card = el('div', 'ciyu-surface ciyu-state-card');
      const icon = el('div', 'ciyu-state-icon ciyu-state-icon--success');
      icon.appendChild(createIcon('sparkles', 'lg'));

      const summary = props.summary ?? {
        totalReviewed: 0,
        againCount: 0,
        hardCount: 0,
        goodCount: 0,
        easyCount: 0,
      };

      card.append(
        icon,
        el('h3', 'ciyu-state-title', '今日复习已全部完成'),
        el(
          'p',
          'ciyu-state-desc',
          `本次共完成 ${summary.totalReviewed} 张卡片，间隔重复计划已同步更新。`
        )
      );

      const stats = el('div', 'ciyu-review-stats');
      const items = [
        { label: '忘记', count: summary.againCount },
        { label: '模糊', count: summary.hardCount },
        { label: '记得', count: summary.goodCount },
        { label: '轻松', count: summary.easyCount },
      ];
      for (const item of items) {
        const box = el('div', 'ciyu-stat-box');
        box.append(
          el('span', 'ciyu-stat-num', String(item.count)),
          el('span', 'ciyu-stat-name', item.label)
        );
        stats.appendChild(box);
      }
      card.appendChild(stats);

      const actions = el('div', 'ciyu-quick-picks');
      const restartBtn = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm');
      restartBtn.type = 'button';
      restartBtn.append(createIcon('refresh-cw', 'sm'), el('span', undefined, '检查待复习'));
      restartBtn.addEventListener('click', () => callbacks.onRestartPractice?.());

      const vocabBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm', '返回生词本');
      vocabBtn.type = 'button';
      vocabBtn.addEventListener('click', () => callbacks.onGoToVocabulary?.());

      actions.append(restartBtn, vocabBtn);
      card.appendChild(actions);
      root.appendChild(card);
      return;
    }

    // 3. 活跃复习态
    const cardData = props.currentCard;
    if (!cardData) return;

    // 顶部栏：模式切换 + 进度
    const topbar = el('div', 'ciyu-review-topbar');

    const modeSwitch = el('div', 'ciyu-glass ciyu-mode-switch');
    modeSwitch.setAttribute('role', 'group');
    modeSwitch.setAttribute('aria-label', '复习题面模式');

    const wordModeBtn = el('button', 'ciyu-mode-btn', '只看原词');
    wordModeBtn.type = 'button';
    wordModeBtn.setAttribute('aria-pressed', String(props.mode === 'word'));

    const clozeModeBtn = el('button', 'ciyu-mode-btn', '原句挖空');
    clozeModeBtn.type = 'button';
    clozeModeBtn.setAttribute('aria-pressed', String(props.mode === 'cloze'));

    modeSwitch.append(wordModeBtn, clozeModeBtn);
    attachLiquidLens({
      container: modeSwitch,
      buttons: [wordModeBtn, clozeModeBtn],
      activeIndex: props.mode === 'cloze' ? 1 : 0,
      cacheKey: 'ciyu-review-mode',
      onSelect: (idx) => {
        const nextMode = idx === 1 ? 'cloze' : 'word';
        if (nextMode !== props.mode) callbacks.onChangeMode?.(nextMode);
      },
    });

    const progressLabel = el(
      'span',
      'ciyu-progress-label',
      `${Math.min(props.currentIndex + 1, props.totalCount)} / ${props.totalCount}`
    );
    topbar.append(modeSwitch, progressLabel);

    const progressTrack = el('div', 'ciyu-progress-track');
    progressTrack.setAttribute('role', 'progressbar');
    progressTrack.setAttribute('aria-valuemin', '0');
    progressTrack.setAttribute('aria-valuemax', String(props.totalCount));
    progressTrack.setAttribute('aria-valuenow', String(props.currentIndex + 1));
    const fill = el('div', 'ciyu-progress-fill');
    const ratio = props.totalCount > 0 ? ((props.currentIndex + 1) / props.totalCount) * 100 : 0;
    fill.style.width = `${Math.min(100, Math.max(8, ratio))}%`;
    progressTrack.appendChild(fill);

    // 卡片主体（高对比稳定阅读层）
    const flashcard = el('article', 'ciyu-surface ciyu-flashcard');

    const front = el('div', 'ciyu-flashcard-front');
    if (props.mode === 'word') {
      front.appendChild(el('h3', 'ciyu-flashcard-word', cardData.word));
      const meta = el('div', 'ciyu-phonetic-row');
      if (cardData.partOfSpeech) {
        meta.appendChild(el('span', 'ciyu-pos-tag', cardData.partOfSpeech));
      }
      if (cardData.phonetic) {
        meta.appendChild(el('span', 'ciyu-phonetic', cardData.phonetic));
      }

      const speakBtn = speechButton(cardData.word, Boolean(props.isSpeaking), () => callbacks.onSpeak?.(cardData.word));
      meta.appendChild(speakBtn);

      front.appendChild(meta);
    } else {
      front.appendChild(el('span', 'ciyu-section-label', '根据上下文回忆挖空词汇'));
      const clozeP = el('p', 'ciyu-cloze-sentence');
      if (cardData.maskedSentence === undefined) {
        appendClozeSentence(clozeP, cardData.sourceSentence, cardData.word, props.revealed);
      } else if (!cardData.maskedSentence) {
        clozeP.textContent = cardData.word;
        front.appendChild(el('span', 'ciyu-toggle-desc', '这张卡没有可挖空的原句或例句。'));
      } else if (props.revealed) {
        appendHighlightedText(clozeP, cardData.sourceSentence, cardData.word);
      } else {
        const parts = cardData.maskedSentence.split('_____');
        parts.forEach((part, index) => {
          if (index > 0) {
            const blank = el('span', 'ciyu-cloze-blank', '______');
            blank.setAttribute('aria-label', '待回忆词汇');
            clozeP.appendChild(blank);
          }
          clozeP.append(part);
        });
      }
      front.appendChild(clozeP);

      const hintRow = el('div', 'ciyu-phonetic-row');
      if (cardData.partOfSpeech) {
        hintRow.appendChild(el('span', 'ciyu-pos-tag', cardData.partOfSpeech));
      }
      if (cardData.phonetic && props.revealed) {
        hintRow.appendChild(el('span', 'ciyu-phonetic', cardData.phonetic));
      }
      front.appendChild(hintRow);
    }

    flashcard.appendChild(front);

    if (!props.revealed) {
      const revealWrap = el('div', 'ciyu-quick-picks');
      const revealBtn = el('button', 'ciyu-btn ciyu-btn--primary');
      revealBtn.type = 'button';
      revealBtn.style.width = '100%';
      revealBtn.append(
        createIcon('eye', 'sm'),
        el('span', undefined, '揭晓释义'),
        el('kbd', 'ciyu-kbd', 'Space')
      );
      revealBtn.addEventListener('click', () => callbacks.onReveal?.());
      revealWrap.appendChild(revealBtn);
      flashcard.appendChild(revealWrap);
    } else {
      const answer = el('div', 'ciyu-flashcard-answer');
      if (props.mode === 'cloze') {
        const wordRow = el('div', 'ciyu-word-header');
        wordRow.appendChild(el('strong', 'ciyu-vocab-word', cardData.word));
        const speakBtn = speechButton(cardData.word, Boolean(props.isSpeaking), () => callbacks.onSpeak?.(cardData.word));
        wordRow.appendChild(speakBtn);
        answer.appendChild(wordRow);
      }

      answer.appendChild(el('p', 'ciyu-vocab-meaning', cardData.meaningZh));

      if (props.mode === 'word' && cardData.sourceSentence) {
        const srcBox = el('div', 'ciyu-source-box');
        srcBox.appendChild(el('span', 'ciyu-section-label', '原句语境'));
        const quote = el('p', 'ciyu-source-quote');
        appendHighlightedText(quote, cardData.sourceSentence, cardData.word);
        srcBox.appendChild(quote);
        answer.appendChild(srcBox);
      }

      if (cardData.sourceNotePath) {
        const noteBtn = el('button', 'ciyu-note-link');
        noteBtn.type = 'button';
        noteBtn.style.alignSelf = 'flex-start';
        noteBtn.append(
          createIcon('file-text', 'sm'),
          el('span', undefined, cardData.sourceNoteTitle ?? cardData.sourceNotePath)
        );
        noteBtn.addEventListener('click', () =>
          callbacks.onOpenSourceNote?.(cardData.sourceNotePath!)
        );
        answer.appendChild(noteBtn);
      }

      flashcard.appendChild(answer);
    }

    root.append(topbar, progressTrack, flashcard);

    // 揭晓后：悬浮液态玻璃反馈评分条
    if (props.revealed) {
      const ratingBar = el('footer', 'ciyu-glass ciyu-glass-refract ciyu-rating-grid');
      ratingBar.setAttribute('role', 'toolbar');
      ratingBar.setAttribute('aria-label', '选择记忆熟悉度');

      RATING_CONFIG.forEach((cfg, idx) => {
        const btn = el('button', cfg.className);
        btn.type = 'button';
        const top = el('span', 'ciyu-rate-head');
        top.append(el('span', 'ciyu-rate-label', cfg.label), el('kbd', 'ciyu-kbd', String(idx + 1)));
        btn.append(top, el('span', 'ciyu-rate-hint', cardData.intervals[cfg.key]));
        btn.addEventListener('click', () => callbacks.onRate?.(cardData.id, cfg.key));
        ratingBar.appendChild(btn);
      });

      root.appendChild(ratingBar);
    }
  }

  // 键盘快捷复习：Space 揭晓释义，1–4 快速评分（仅在复习页可见且焦点不在输入框时生效）
  const onReviewKeydown = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!root.isConnected || root.hidden || root.offsetParent === null) return;
    if (props.status !== 'active' || !props.currentCard) return;
    const activeEl = root.ownerDocument?.activeElement as HTMLElement | null;
    if (
      activeEl &&
      (activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.tagName === 'SELECT' ||
        activeEl.isContentEditable)
    ) {
      return;
    }
    if (!props.revealed && (e.code === 'Space' || e.key === ' ')) {
      e.preventDefault();
      callbacks.onReveal?.();
      return;
    }
    if (props.revealed && ['1', '2', '3', '4'].includes(e.key)) {
      const cfg = RATING_CONFIG[Number(e.key) - 1];
      if (cfg) {
        e.preventDefault();
        callbacks.onRate?.(props.currentCard.id, cfg.key);
      }
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onReviewKeydown);
  }

  render();

  return {
    element: root,
    update(nextProps) {
      props = nextProps;
      render();
    },
    destroy() {
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', onReviewKeydown);
      }
      root.remove();
    },
  };
}
