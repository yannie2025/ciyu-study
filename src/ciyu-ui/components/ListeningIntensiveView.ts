import { el } from '../dom';
import { createIcon } from '../icons';
import { attachLiquidLens } from './LiquidSegmented';
import { createListeningScoreCalculator } from './ListeningScoreCalculator';
import type {
  ExamChoiceQuestion,
  ListeningIntensiveCallbacks,
  ListeningIntensiveProps,
  ListeningNarrowPane,
  ListeningPlaybackRate,
  ListeningQuestionGroup,
  ListeningSectionId,
  ListeningTranscriptMode,
  UIComponentHandle,
} from '../types';

function formatTime(sec: number): string {
  const safe = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const SECTION_META: ReadonlyArray<{
  id: ListeningSectionId;
  title: string;
  subtitle: string;
}> = [
  { id: 'A', title: 'Section A', subtitle: '长对话' },
  { id: 'B', title: 'Section B', subtitle: '短文理解' },
  { id: 'C', title: 'Section C', subtitle: '讲座或讲话' },
];

const RATES: ReadonlyArray<ListeningPlaybackRate> = [0.75, 1, 1.25, 1.5];

/**
 * 三、扩展内听力自查与逐段精听（支持按 Section / 题组精确截取音频片段 + 丝滑可拖动进度条 + 选项可划词）
 */
export function createListeningIntensiveView(
  initialProps: ListeningIntensiveProps,
  callbacks: ListeningIntensiveCallbacks = {}
): UIComponentHandle<ListeningIntensiveProps> {
  let props = initialProps;
  let showPasteBox = false;
  let pasteDraft = '';

  // 播放器局部 DOM 引用与拖动状态（防止 timeupdate / 拖动进度条时重建 DOM 导致滑块失焦卡顿）
  let isScrubbing = false;
  let scrubPreviewRelSec = 0;
  let playerBarEl: HTMLElement | null = null;
  let playerFillEl: HTMLElement | null = null;
  let playerThumbEl: HTMLElement | null = null;
  let playerCurTimeEl: HTMLElement | null = null;
  let playerDurTimeEl: HTMLElement | null = null;
  let playerPlayBtnEl: HTMLButtonElement | null = null;
  let hideZhBtnEl: HTMLButtonElement | null = null;
  let currentClipStart = 0;
  let currentClipDuration = 1;
  let lastStructureSig = '';
  let lastScrollContext = '';
  let audioBarResizeObs: ResizeObserver | null = null;

  const root = el('section', 'ciyu-listening-view');

  function trackStickyAudioBarHeight(barEl: HTMLElement | null): void {
    audioBarResizeObs?.disconnect();
    audioBarResizeObs = null;
    if (!barEl) {
      root.style.setProperty('--ciyu-audio-bar-h', '0px');
      return;
    }
    const syncHeight = () => {
      const h = Math.ceil(barEl.getBoundingClientRect().height || barEl.offsetHeight || 0);
      if (h > 0) root.style.setProperty('--ciyu-audio-bar-h', `${h}px`);
    };
    syncHeight();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(syncHeight);
    if (typeof ResizeObserver === 'function') {
      audioBarResizeObs = new ResizeObserver(syncHeight);
      audioBarResizeObs.observe(barEl);
    }
  }

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

  function resolveActiveGroup(p: ListeningIntensiveProps): ListeningQuestionGroup | undefined {
    const sectionGroups = p.groups.filter((g) => g.section === p.activeSection);
    return (
      sectionGroups.find((g) => g.id === p.activeGroupId) ??
      sectionGroups[0] ??
      p.groups[0]
    );
  }

  function computeClipWindow(p: ListeningIntensiveProps, grp?: ListeningQuestionGroup) {
    const hasGroupClip =
      Boolean(grp) &&
      typeof grp!.startSec === 'number' &&
      typeof grp!.endSec === 'number' &&
      grp!.endSec! > grp!.startSec!;
    const clipActive = hasGroupClip && (p.clipMode ?? 'group') === 'group';
    const startSec = clipActive ? grp!.startSec! : 0;
    const endSec = clipActive ? grp!.endSec! : Math.max(1, p.durationSec || 1);
    const duration = Math.max(1, endSec - startSec);
    return { hasGroupClip, clipActive, startSec, endSec, duration };
  }

  function structureSignature(p: ListeningIntensiveProps): string {
    return JSON.stringify({
      paperId: p.paperId,
      paperTitle: p.paperTitle,
      isWideOpen: Boolean(p.isWideOpen),
      companionRole: p.companionRole ?? 'full',
      loadingPaper: p.loadingPaper,
      loadError: p.loadError,
      activeSection: p.activeSection,
      activeGroupId: p.activeGroupId,
      clipMode: p.clipMode ?? 'group',
      transcriptMode: p.transcriptMode,
      narrowPane: p.narrowPane,
      audioState: p.audioState,
      audioErrorDetail: p.audioErrorDetail,
      transcriptDownloadStatus: p.transcriptDownloadStatus,
      transcriptSavedPath: p.transcriptSavedPath,
      audioDownloadStatus: p.audioDownloadStatus,
      audioDownloadPercent: p.audioDownloadPercent,
      playbackRate: p.playbackRate,
      loopSegmentId: p.loopSegmentId,
      highlightedQuestionBlockId: p.highlightedQuestionBlockId,
      answersExpanded: p.answersExpanded,
      selfCheck: p.selfCheck,
      mistakeKeys: Object.keys(p.mistakeByQuestion || {}),
      groupsMeta: p.groups.map((g) => ({
        id: g.id,
        s: g.startSec,
        e: g.endSec,
        segCount: g.segments.length,
        ans: g.questions.map((q) => q.selectedKey ?? ''),
      })),
    });
  }

  function applyScrubVisual(relSec: number, durSec: number): void {
    const safeDur = Math.max(1, durSec);
    const clamped = Math.max(0, Math.min(safeDur, relSec));
    const pct = (clamped / safeDur) * 100;
    const pctStr = `${pct.toFixed(2)}%`;
    if (playerFillEl) playerFillEl.style.width = pctStr;
    if (playerThumbEl) playerThumbEl.style.left = pctStr;
    if (playerBarEl) {
      playerBarEl.setAttribute('aria-valuemax', String(Math.round(safeDur)));
      playerBarEl.setAttribute('aria-valuenow', String(Math.round(clamped)));
      playerBarEl.setAttribute('aria-valuetext', `${formatTime(clamped)} / ${formatTime(safeDur)}`);
    }
    if (playerCurTimeEl) playerCurTimeEl.textContent = formatTime(clamped);
    if (playerDurTimeEl) playerDurTimeEl.textContent = formatTime(safeDur);
  }

  function captureVisibleSegmentAnchor(scrollHost: HTMLElement | null): {
    segmentId: string;
    top: number;
  } | null {
    if (!scrollHost || scrollHost.scrollTop <= 2) return null;
    const stickyHead = root.querySelector<HTMLElement>('.ciyu-transcript-sticky-head');
    const hostRect = scrollHost.getBoundingClientRect();
    const visibleTop = stickyHead
      ? Math.max(hostRect.top, stickyHead.getBoundingClientRect().bottom)
      : hostRect.top;
    const items = root.querySelectorAll<HTMLElement>('.ciyu-segment-item[data-segment-id]');
    if (props.activeSegmentId) {
      for (const item of items) {
        if (item.dataset.segmentId === props.activeSegmentId) {
          const r = item.getBoundingClientRect();
          if (r.bottom > visibleTop + 4 && r.top < hostRect.bottom - 16) {
            return { segmentId: props.activeSegmentId, top: r.top };
          }
        }
      }
    }
    for (const item of items) {
      const r = item.getBoundingClientRect();
      if (r.bottom > visibleTop + 4) {
        return { segmentId: item.dataset.segmentId!, top: r.top };
      }
    }
    return null;
  }

  function restoreVisibleSegmentAnchor(
    scrollHost: HTMLElement | null,
    anchor: { segmentId: string; top: number } | null
  ): void {
    if (!scrollHost || !anchor) return;
    const items = root.querySelectorAll<HTMLElement>('.ciyu-segment-item[data-segment-id]');
    for (const item of items) {
      if (item.dataset.segmentId === anchor.segmentId) {
        const afterTop = item.getBoundingClientRect().top;
        const delta = afterTop - anchor.top;
        if (Math.abs(delta) > 0.5) {
          scrollHost.scrollTop = Math.max(0, scrollHost.scrollTop + delta);
        }
        return;
      }
    }
  }

  let scoreCalcOpen = false;
  const scoreCalcWrongs = new Set<number>();

  function patchPlaybackInPlace(): void {
    const activeGroup = resolveActiveGroup(props);
    const clip = computeClipWindow(props, activeGroup);
    currentClipStart = clip.startSec;
    currentClipDuration = clip.duration;

    if (playerPlayBtnEl) {
      playerPlayBtnEl.setAttribute('aria-label', props.playing ? '暂停' : '播放');
      playerPlayBtnEl.setAttribute('aria-pressed', String(props.playing));
      playerPlayBtnEl.replaceChildren(createIcon(props.playing ? 'pause' : 'play', 'md'));
    }

    if (playerBarEl && !isScrubbing) {
      const rel = Math.max(0, Math.min(clip.duration, props.currentTimeSec - clip.startSec));
      applyScrubVisual(rel, clip.duration);
    }

    // 同步隐藏/显示中文状态而不重建 DOM，并按当前视口内的对话条精确锚定纵向像素位置
    const nextHideZh = String(Boolean(props.hideChineseInBilingual));
    if (root.dataset.hideZh !== nextHideZh) {
      const scrollHost = root.closest<HTMLElement>('.ciyu-wide-study-body, .ciyu-sidebar-body');
      const anchor = captureVisibleSegmentAnchor(scrollHost);
      root.dataset.hideZh = nextHideZh;
      restoreVisibleSegmentAnchor(scrollHost, anchor);
    }
    if (hideZhBtnEl) {
      hideZhBtnEl.textContent = props.hideChineseInBilingual ? '显示中文译文' : '单独隐藏中文';
      hideZhBtnEl.className = props.hideChineseInBilingual
        ? 'ciyu-mini-btn ciyu-mini-btn--accent ciyu-toggle-stable-btn--md'
        : 'ciyu-mini-btn ciyu-toggle-stable-btn--md';
      hideZhBtnEl.setAttribute('aria-pressed', String(props.hideChineseInBilingual));
    }

    // 同步段落与句子高亮而不重建 DOM
    root.querySelectorAll<HTMLElement>('.ciyu-segment-item').forEach((item) => {
      const isActive = item.dataset.segmentId === props.activeSegmentId;
      item.dataset.active = String(isActive);
      const selBtn = item.querySelector<HTMLButtonElement>('.ciyu-seg-select-btn');
      if (selBtn) {
        selBtn.textContent = isActive ? '已选本段' : '选定本段';
        selBtn.className = isActive
          ? 'ciyu-mini-btn ciyu-mini-btn--accent ciyu-seg-select-btn'
          : 'ciyu-mini-btn ciyu-seg-select-btn';
      }
    });
    root.querySelectorAll<HTMLElement>('.ciyu-sentence-pair').forEach((pair) => {
      pair.dataset.active = String(pair.dataset.sentenceId === props.activeSentenceId);
    });
  }

  function render(): void {
    const scrollHost = root.closest<HTMLElement>('.ciyu-wide-study-body, .ciyu-sidebar-body');
    const nextScrollContext = `${props.paperId}::${props.activeSection}::${props.activeGroupId}`;
    const sameContext = Boolean(scrollHost && lastScrollContext === nextScrollContext);
    const savedScrollTop = sameContext && scrollHost ? scrollHost.scrollTop : -1;
    const savedAnchor = sameContext ? captureVisibleSegmentAnchor(scrollHost) : null;
    lastScrollContext = nextScrollContext;

    lastStructureSig = structureSignature(props);
    playerBarEl = null;
    playerFillEl = null;
    playerThumbEl = null;
    playerCurTimeEl = null;
    playerDurTimeEl = null;
    playerPlayBtnEl = null;
    hideZhBtnEl = null;

    root.innerHTML = '';
    const companionRole = props.companionRole ?? 'full';
    root.dataset.companionRole = companionRole;
    root.dataset.narrowPane = props.narrowPane;
    root.dataset.hideZh = String(Boolean(props.hideChineseInBilingual));

    const buildTranscriptColumn = (
      activeGroup: ListeningQuestionGroup,
      clip: ReturnType<typeof computeClipWindow>,
      tsLevel: string
    ): HTMLElement => {
      const transcriptCol = el(
        'article',
        'ciyu-surface ciyu-transcript-card ciyu-listen-col-transcript'
      );

      const modeHeader = el('div', 'ciyu-transcript-mode-header');
      const modeTitleWrap = el('div', 'ciyu-paper-info');
      modeTitleWrap.appendChild(el('strong', 'ciyu-settings-title', '听力原文对照'));

      const tsBadge = el(
        'span',
        tsLevel === 'sentence'
          ? 'ciyu-badge ciyu-badge--ok'
          : clip.hasGroupClip || tsLevel === 'paragraph'
          ? 'ciyu-badge ciyu-badge--accent'
          : 'ciyu-badge ciyu-badge--neutral',
        tsLevel === 'sentence'
          ? '句级时间戳'
          : clip.hasGroupClip
          ? `题组切片 ${formatTime(clip.startSec)}–${formatTime(clip.endSec)}`
          : tsLevel === 'paragraph'
          ? '段落级时间戳'
          : '整轨播放'
      );
      modeTitleWrap.appendChild(tsBadge);

      const modeSwitch = el('div', 'ciyu-glass ciyu-mode-switch');
      modeSwitch.setAttribute('role', 'group');
      const modes: Array<{ id: ListeningTranscriptMode; label: string }> = [
        { id: 'blind', label: '盲听' },
        { id: 'en', label: '英文对照' },
        { id: 'bilingual', label: '中英对照' },
      ];
      const modeBtns: HTMLButtonElement[] = [];
      let activeModeIdx = 0;
      modes.forEach((m, idx) => {
        const isCurrent = props.transcriptMode === m.id;
        if (isCurrent) activeModeIdx = idx;
        const mBtn = el('button', 'ciyu-mode-btn', m.label);
        mBtn.type = 'button';
        mBtn.setAttribute('aria-pressed', String(isCurrent));
        modeBtns.push(mBtn);
        modeSwitch.appendChild(mBtn);
      });
      attachLiquidLens({
        container: modeSwitch,
        buttons: modeBtns,
        activeIndex: activeModeIdx,
        cacheKey: 'cet6-listening-transcript-mode',
        onSelect: (idx) => {
          const picked = modes[idx];
          if (picked && picked.id !== props.transcriptMode) {
            callbacks.onChangeTranscriptMode?.(picked.id);
          }
        },
      });
      modeHeader.append(modeTitleWrap, modeSwitch);

      const sourceMeta = el('div', 'ciyu-source-meta-bar');
      const srcInfo = el('span', 'ciyu-paper-info');
      srcInfo.append(
        el('span', 'ciyu-section-label', '来源：'),
        el('span', undefined, props.transcriptSourceLabel)
      );
      sourceMeta.appendChild(srcInfo);

      if (props.transcriptMode === 'bilingual') {
        const hideZhBtn = el(
          'button',
          props.hideChineseInBilingual
            ? 'ciyu-mini-btn ciyu-mini-btn--accent ciyu-toggle-stable-btn--md'
            : 'ciyu-mini-btn ciyu-toggle-stable-btn--md',
          props.hideChineseInBilingual ? '显示中文译文' : '单独隐藏中文'
        );
        hideZhBtn.type = 'button';
        hideZhBtn.setAttribute('aria-pressed', String(props.hideChineseInBilingual));
        hideZhBtn.addEventListener('click', () =>
          callbacks.onToggleHideChinese?.(!props.hideChineseInBilingual)
        );
        hideZhBtnEl = hideZhBtn;
        sourceMeta.appendChild(hideZhBtn);
      }

      const stickyHead = el('div', 'ciyu-transcript-sticky-head');
      stickyHead.append(modeHeader, sourceMeta);
      transcriptCol.appendChild(stickyHead);

      const effectiveMode: ListeningTranscriptMode =
        companionRole === 'transcript-only'
          ? props.transcriptMode
          : props.narrowPane === 'bilingual'
          ? 'bilingual'
          : props.narrowPane === 'en' && props.transcriptMode === 'blind'
          ? 'en'
          : props.transcriptMode;

      if (effectiveMode === 'blind') {
        const blindBox = el('div', 'ciyu-state-card');
        const icon = el('div', 'ciyu-state-icon');
        icon.appendChild(createIcon('headphones', 'lg'));
        blindBox.append(
          icon,
          el('h4', 'ciyu-state-title', '当前处于「盲听自查」模式'),
          el(
            'p',
            'ciyu-state-desc',
            clip.clipActive
              ? `已自动为你截取本题组音频片段（${formatTime(clip.startSec)} – ${formatTime(clip.endSec)}），播完自动暂停。先完成左侧作答再核对答案。`
              : '已收起英文原文、中文译文和参考答案。请先播放音频并完成左侧作答，点「核对本组答案」后再展开原文逐句精听。'
          )
        );
        const revealActions = el('div', 'ciyu-quick-picks');
        const showEn = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm', '展开英文对照');
        showEn.type = 'button';
        showEn.addEventListener('click', () => callbacks.onChangeTranscriptMode?.('en'));

        const showBi = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm', '展开中英对照');
        showBi.type = 'button';
        showBi.addEventListener('click', () => callbacks.onChangeTranscriptMode?.('bilingual'));

        revealActions.append(showEn, showBi);
        blindBox.appendChild(revealActions);
        transcriptCol.appendChild(blindBox);
      } else if (activeGroup.segments.length === 0) {
        const emptyTranscriptCard = el('div', 'ciyu-state-card');
        emptyTranscriptCard.append(
          el('h4', 'ciyu-state-title', '当前套卷暂未附带独立听力文字稿'),
          el(
            'p',
            'ciyu-state-desc',
            '已为你截取每组音频片段并载入全部 25 道选择题与解析，支持选项划词查词与盲听自查。若有英文/双语听力原文（支持 [00:15] 时间戳），可粘贴补充保存。'
          )
        );

        if (callbacks.onPasteTranscript) {
          const togglePasteBtn = el(
            'button',
            'ciyu-btn ciyu-btn--glass ciyu-btn--sm',
            showPasteBox ? '收起原文录入框' : '粘贴补充本套听力原文'
          );
          togglePasteBtn.type = 'button';
          togglePasteBtn.addEventListener('click', () => {
            showPasteBox = !showPasteBox;
            render();
          });
          emptyTranscriptCard.appendChild(togglePasteBtn);

          if (showPasteBox) {
            const pasteForm = el('div', 'ciyu-paste-transcript-box');
            const area = el('textarea', 'ciyu-textarea');
            area.rows = 6;
            area.placeholder =
              '粘贴英文或双语听力原文（支持 [00:12] W: ... 或段落文本），保存后自动写入 词屿/六级题库/听力原文/ 并支持划词翻译。';
            area.value = pasteDraft;
            area.addEventListener('input', () => {
              pasteDraft = area.value;
            });
            const saveTranscriptBtn = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm', '保存并启用原文对照');
            saveTranscriptBtn.type = 'button';
            saveTranscriptBtn.addEventListener('click', () => {
              if (!pasteDraft.trim()) return;
              callbacks.onPasteTranscript?.(props.paperId, pasteDraft.trim());
              showPasteBox = false;
              pasteDraft = '';
            });
            pasteForm.append(area, saveTranscriptBtn);
            emptyTranscriptCard.appendChild(pasteForm);
          }
        }
        transcriptCol.appendChild(emptyTranscriptCard);
      } else {
        const hasDialogueSpeakers = activeGroup.segments.some(
          (s) => s.speakerRole === 'a' || s.speakerRole === 'b'
        );
        const guideText = hasDialogueSpeakers
          ? '♂ 男士（蓝标）· ♀ 女士（玫红标）｜点击「选定本段」自动跳到该段进度（暂停时保持暂停），拖选英文可查词。'
          : '点击「选定本段」可自动跳到该段音频进度（暂停时保持暂停）；直接拖选英文可查词或加入生词本。';
        transcriptCol.appendChild(el('div', 'ciyu-next-review-tag', guideText));

        const segList = el('ul', 'ciyu-segment-list');
        for (const seg of activeGroup.segments) {
          const isSegActive = props.activeSegmentId === seg.id;
          const item = el('li', 'ciyu-segment-item');
          item.dataset.active = String(isSegActive);
          item.dataset.segmentId = seg.id;
          item.dataset.role = seg.speakerRole ?? 'narrator';

          const segTop = el('div', 'ciyu-segment-top');
          const leftBadges = el('div', 'ciyu-paper-info');
          const speakerBadge = el('span', 'ciyu-speaker-badge', seg.speaker);
          if (seg.speakerRole) speakerBadge.dataset.role = seg.speakerRole;
          leftBadges.appendChild(speakerBadge);

          if (seg.questionNumbers && seg.questionNumbers.length > 0) {
            const firstQNo = seg.questionNumbers[0];
            const targetQ = activeGroup.questions.find((q) => q.number === firstQNo);
            const qJump = el(
              'button',
              'ciyu-mini-btn',
              `对应第 ${seg.questionNumbers.join('、')} 题`
            );
            qJump.type = 'button';
            qJump.addEventListener('click', () =>
              callbacks.onJumpToQuestion?.(
                firstQNo,
                targetQ?.blockId ?? `cet6-${props.paperId}-q${firstQNo}`
              )
            );
            leftBadges.appendChild(qJump);
          }
          segTop.appendChild(leftBadges);

          const rightControls = el('div', 'ciyu-paper-actions');
          if (typeof seg.startSec === 'number') {
            const jumpBtn = el(
              'button',
              'ciyu-time-jump-btn',
              seg.timeLabel ?? formatTime(seg.startSec)
            );
            jumpBtn.type = 'button';
            jumpBtn.title = '跳转到本段音频位置（保持当前播放/暂停状态）';
            jumpBtn.addEventListener('click', () => {
              callbacks.onSelectSegment?.(seg.id, false);
            });
            rightControls.appendChild(jumpBtn);
          }
          const manualBtn = el(
            'button',
            isSegActive
              ? 'ciyu-mini-btn ciyu-mini-btn--accent ciyu-seg-select-btn'
              : 'ciyu-mini-btn ciyu-seg-select-btn',
            isSegActive ? '已选本段' : '选定本段'
          );
          manualBtn.type = 'button';
          manualBtn.title = '选定本段并自动跳转到该段音频进度（原暂停则保持暂停）';
          manualBtn.addEventListener('click', () => callbacks.onSelectSegment?.(seg.id, false));
          rightControls.appendChild(manualBtn);
          segTop.appendChild(rightControls);
          item.appendChild(segTop);

          if (seg.sentences && seg.sentences.length > 0) {
            const sentWrap = el('div', 'ciyu-sentence-stack');
            for (const sent of seg.sentences) {
              const isSentActive =
                tsLevel === 'sentence' && props.activeSentenceId === sent.id;
              const pair = el('div', 'ciyu-sentence-pair');
              pair.dataset.active = String(isSentActive);
              pair.dataset.sentenceId = sent.id;

              const enLine = el('p', 'ciyu-segment-en ciyu-selectable-prose');
              if (tsLevel === 'sentence' && typeof sent.startSec === 'number') {
                enLine.classList.add('ciyu-sentence-clickable');
                enLine.title = `点击从该句开始重听 (${sent.timeLabel ?? formatTime(sent.startSec)})`;
                enLine.addEventListener('click', () => {
                  const sel = root.ownerDocument.getSelection();
                  if (sel && !sel.isCollapsed) return;
                  callbacks.onSelectSentence?.(seg.id, sent.id, sent.startSec);
                });
              }
              enLine.textContent = sent.en;
              pair.appendChild(enLine);

              if (effectiveMode === 'bilingual') {
                if (sent.zh) {
                  pair.appendChild(el('p', 'ciyu-segment-zh', sent.zh));
                } else {
                  pair.appendChild(
                    el('p', 'ciyu-segment-zh ciyu-segment-zh--missing', '（来源暂无该句中文译文）')
                  );
                }
              }
              sentWrap.appendChild(pair);
            }
            item.appendChild(sentWrap);
          } else {
            item.appendChild(el('p', 'ciyu-segment-en ciyu-selectable-prose', seg.textEn));
            if (effectiveMode === 'bilingual') {
              if (seg.translationZh) {
                item.appendChild(el('p', 'ciyu-segment-zh', seg.translationZh));
              } else {
                item.appendChild(
                  el('p', 'ciyu-segment-zh ciyu-segment-zh--missing', '（来源缺少本段中文译文，已保留完整英文）')
                );
              }
            }
          }

          segList.appendChild(item);
        }

        if (
          typeof activeGroup.questionsAudioStartSec === 'number' &&
          typeof activeGroup.startSec === 'number' &&
          activeGroup.questionsAudioStartSec > activeGroup.startSec
        ) {
          const qAudioItem = el('li', 'ciyu-segment-item');
          qAudioItem.dataset.role = 'narrator';
          const qTop = el('div', 'ciyu-segment-top');
          const qBadge = el('span', 'ciyu-speaker-badge', `原声读题 · ${activeGroup.questionRange || activeGroup.title}`);
          qBadge.dataset.role = 'narrator';
          const qRight = el('div', 'ciyu-paper-actions');
          const qRelSec = Math.max(0, activeGroup.questionsAudioStartSec - activeGroup.startSec);
          const qTimeBtn = el('button', 'ciyu-time-jump-btn', `~${formatTime(qRelSec)}`);
          qTimeBtn.type = 'button';
          qTimeBtn.title = '跳转到本题组原声提问起点（保持当前播放/暂停状态）';
          qTimeBtn.addEventListener('click', () => callbacks.onSeek?.(activeGroup.questionsAudioStartSec!));
          const qJumpBtn = el('button', 'ciyu-mini-btn', '跳到提问音频');
          qJumpBtn.type = 'button';
          qJumpBtn.addEventListener('click', () => callbacks.onSeek?.(activeGroup.questionsAudioStartSec!));
          qRight.append(qTimeBtn, qJumpBtn);
          qTop.append(qBadge, qRight);
          qAudioItem.append(
            qTop,
            el('p', 'ciyu-toggle-desc', `本题组切片已完整包含 ${activeGroup.questionRange || activeGroup.title} 的原声提问与作答停顿，点击可直接定位到提问处。`)
          );
          segList.appendChild(qAudioItem);
        }

        transcriptCol.appendChild(segList);
      }

      return transcriptCol;
    };

    // 双屏协作·右侧边栏专属模式：整屏专注显示当前题组的英文原文与中英对照翻译，与左侧宽屏实时联动
    if (companionRole === 'transcript-only') {
      trackStickyAudioBarHeight(null);
      const activeGroup = resolveActiveGroup(props);
      const compBar = el('header', 'ciyu-surface ciyu-companion-bar');
      const compMeta = el('div', 'ciyu-companion-meta');
      compMeta.appendChild(el('span', 'ciyu-badge ciyu-badge--accent', '双屏原文'));
      compMeta.appendChild(
        el(
          'span',
          'ciyu-companion-title',
          activeGroup ? `Section ${activeGroup.section} · ${activeGroup.title}` : props.paperTitle
        )
      );
      if (activeGroup?.questionRange) {
        compMeta.appendChild(el('span', 'ciyu-badge ciyu-badge--neutral', activeGroup.questionRange));
      }

      const compActions = el('div', 'ciyu-toolbar-actions');
      if (props.transcriptSavedPath) {
        const openNoteBtn = el('button', 'ciyu-mini-btn');
        openNoteBtn.type = 'button';
        openNoteBtn.title = '在 Obsidian 中打开完整听力原文 Markdown';
        openNoteBtn.append(createIcon('file-text', 'sm'), el('span', undefined, '全文'));
        openNoteBtn.addEventListener('click', () =>
          callbacks.onOpenSavedTranscriptNote?.(props.transcriptSavedPath!)
        );
        compActions.appendChild(openNoteBtn);
      }
      if (callbacks.onOpenInWideWorkspace) {
        const closeWideBtn = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm ciyu-wide-toggle-btn');
        closeWideBtn.type = 'button';
        closeWideBtn.title = '关闭左侧宽屏并恢复侧栏完整听力视图';
        closeWideBtn.setAttribute('aria-pressed', 'true');
        closeWideBtn.append(createIcon('arrow-left', 'sm'), el('span', undefined, '收起宽屏'));
        closeWideBtn.addEventListener('click', () =>
          callbacks.onOpenInWideWorkspace?.(props.paperId)
        );
        compActions.appendChild(closeWideBtn);
      }
      compBar.append(compMeta, compActions);
      root.appendChild(compBar);

      if (props.loadingPaper) {
        const loadingCard = el('div', 'ciyu-surface ciyu-state-card');
        loadingCard.append(
          el('h4', 'ciyu-state-title', '正在同步听力原文…'),
          el('p', 'ciyu-state-desc', '左侧加载完成后将自动显示本组英文原文与中文译文。')
        );
        root.appendChild(loadingCard);
        return;
      }
      if (props.loadError) {
        const errCard = el('div', 'ciyu-surface ciyu-state-card');
        errCard.append(
          el('h4', 'ciyu-state-title', '听力原文暂未载入'),
          el('p', 'ciyu-state-desc', props.loadError)
        );
        root.appendChild(errCard);
        return;
      }
      if (!activeGroup) return;

      const clip = computeClipWindow(props, activeGroup);
      currentClipStart = clip.startSec;
      currentClipDuration = clip.duration;
      const tsLevel = activeGroup.timestampLevel ?? (activeGroup.hasTimestamps ? 'paragraph' : 'none');
      root.appendChild(buildTranscriptColumn(activeGroup, clip, tsLevel));

      if (savedScrollTop >= 0 && scrollHost) {
        scrollHost.scrollTop = savedScrollTop;
        restoreVisibleSegmentAnchor(scrollHost, savedAnchor);
      }
      return;
    }

    // 1. 顶部标题栏 + 套卷快速切换器 + 宽屏自查 / 下载全文 / 下载音频
    const topbar = el('header', 'ciyu-topbar-nav');
    const leftNav = el('div', 'ciyu-paper-info');

    if (callbacks.onBackToBank) {
      const backBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm');
      backBtn.type = 'button';
      backBtn.append(createIcon('arrow-left', 'sm'), el('span', undefined, '题库'));
      backBtn.addEventListener('click', () => callbacks.onBackToBank?.());
      leftNav.appendChild(backBtn);
    }

    if (props.availablePapers && props.availablePapers.length > 0 && callbacks.onSelectPaper) {
      const select = el('select', 'ciyu-select ciyu-select--compact');
      select.setAttribute('aria-label', '切换听力自查真题套卷');
      const formatShortPaperLabel = (p: { id: string; title: string }): string => {
        const cnNums = ['', '一', '二', '三', '四', '五'];
        const m = p.id.match(/^(\d{4})(\d{2})-(\d+)$/);
        if (m) {
          const monthNum = Number(m[2]);
          // 使用半角空格 U+2002（macOS 菜单字体实测与「12月」宽度仅差 0.4px），让「月 · 卷一」严格纵向对齐
          const monthTag = monthNum < 10 ? `${monthNum}\u2002月` : `${monthNum}月`;
          const setIdx = Number(m[3]);
          const setTag = cnNums[setIdx] ? `卷${cnNums[setIdx]}` : `卷${m[3]}`;
          return `「六级」${m[1]}年${monthTag} · ${setTag}`;
        }
        return `「六级」${p.title.replace(/\s+/g, '').replace(/六级真题·第(\d+)套/u, (_, n) => ` · 卷${cnNums[Number(n)] || n}`)}`;
      };
      for (const p of props.availablePapers) {
        const opt = el('option', undefined, formatShortPaperLabel(p));
        opt.value = p.id;
        opt.selected = p.id === props.paperId;
        select.appendChild(opt);
      }
      select.addEventListener('change', () => {
        if (select.value && select.value !== props.paperId) {
          callbacks.onSelectPaper?.(select.value);
        }
      });
      leftNav.appendChild(select);
    } else {
      leftNav.appendChild(el('strong', 'ciyu-settings-title', props.paperTitle));
    }

    const rightTools = el('div', 'ciyu-toolbar-actions ciyu-listening-top-actions');

    const dlTextBtn = el(
      'button',
      props.transcriptDownloadStatus === 'saved'
        ? 'ciyu-btn ciyu-btn--saved ciyu-btn--sm'
        : 'ciyu-btn ciyu-btn--glass ciyu-btn--sm'
    );
    dlTextBtn.type = 'button';
    dlTextBtn.disabled = Boolean(props.loadingPaper) || props.transcriptDownloadStatus === 'saving';
    dlTextBtn.title = '把完整听力题组、英文原文、对照译文与来源保存为独立 Markdown 笔记';
    dlTextBtn.append(
      createIcon(props.transcriptDownloadStatus === 'saved' ? 'check' : 'download', 'sm'),
      el(
        'span',
        undefined,
        props.transcriptDownloadStatus === 'saving'
          ? '保存全文中…'
          : props.transcriptDownloadStatus === 'saved'
          ? '已存全文'
          : '下载全文'
      )
    );
    dlTextBtn.addEventListener('click', () =>
      props.transcriptDownloadStatus === 'saved' && props.transcriptSavedPath
        ? callbacks.onOpenSavedTranscriptNote?.(props.transcriptSavedPath)
        : callbacks.onDownloadTranscriptMarkdown?.(props.paperId)
    );
    rightTools.appendChild(dlTextBtn);

    const dlAudioBtn = el(
      'button',
      props.audioDownloadStatus === 'saved'
        ? 'ciyu-btn ciyu-btn--saved ciyu-btn--sm'
        : 'ciyu-btn ciyu-btn--glass ciyu-btn--sm'
    );
    dlAudioBtn.type = 'button';
    dlAudioBtn.disabled = Boolean(props.loadingPaper) || props.audioDownloadStatus === 'downloading';
    dlAudioBtn.title = '下载音频至 词屿/六级题库/听力音频/ 供离线播放';
    dlAudioBtn.append(
      createIcon(props.audioDownloadStatus === 'saved' ? 'check' : 'download', 'sm'),
      el(
        'span',
        undefined,
        props.audioDownloadStatus === 'downloading'
          ? `下载音频 ${props.audioDownloadPercent ?? 45}%`
          : props.audioDownloadStatus === 'saved'
          ? '音频已离线'
          : '下载音频'
      )
    );
    dlAudioBtn.addEventListener('click', () =>
      callbacks.onDownloadAudioOffline?.(props.paperId)
    );
    rightTools.appendChild(dlAudioBtn);

    const scoreCalcBtn = el(
      'button',
      scoreCalcOpen ? 'ciyu-btn ciyu-btn--primary ciyu-btn--sm' : 'ciyu-btn ciyu-btn--glass ciyu-btn--sm'
    );
    scoreCalcBtn.type = 'button';
    scoreCalcBtn.title = '打开纸质版听力算分器（按四六级官方权重精确算分）';
    scoreCalcBtn.setAttribute('aria-pressed', String(scoreCalcOpen));
    scoreCalcBtn.append(
      createIcon('sliders', 'sm'),
      el('span', undefined, scoreCalcWrongs.size > 0 ? `算分 (${scoreCalcWrongs.size}错)` : '听力算分')
    );
    scoreCalcBtn.addEventListener('click', () => {
      scoreCalcOpen = !scoreCalcOpen;
      render();
    });
    rightTools.appendChild(scoreCalcBtn);

    if (callbacks.onOpenReader) {
      const readerBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm', '整卷');
      readerBtn.type = 'button';
      readerBtn.addEventListener('click', () => callbacks.onOpenReader?.(props.paperId));
      rightTools.appendChild(readerBtn);
    }

    if (callbacks.onOpenInWideWorkspace) {
      const isWide = Boolean(props.isWideOpen);
      const wideBtn = el(
        'button',
        isWide
          ? 'ciyu-btn ciyu-btn--primary ciyu-btn--sm ciyu-wide-toggle-btn'
          : 'ciyu-btn ciyu-btn--glass ciyu-btn--sm ciyu-wide-toggle-btn'
      );
      wideBtn.type = 'button';
      wideBtn.title = isWide
        ? '关闭宽屏工作区并回到侧栏'
        : '在 Obsidian 主阅读区打开左右双栏宽屏听力自查';
      wideBtn.setAttribute('aria-pressed', String(isWide));
      wideBtn.append(
        createIcon(isWide ? 'arrow-left' : 'arrow-up-right', 'sm'),
        el('span', undefined, isWide ? '收起宽屏' : '宽屏自查')
      );
      wideBtn.addEventListener('click', () =>
        callbacks.onOpenInWideWorkspace?.(props.paperId)
      );
      rightTools.appendChild(wideBtn);
    }

    topbar.append(leftNav, rightTools);
    root.appendChild(topbar);

    if (scoreCalcOpen) {
      root.appendChild(
        createListeningScoreCalculator({
          paperTitle: props.paperTitle,
          wrongSet: scoreCalcWrongs,
          getOnlineWrongNumbers: () => {
            const wrongs: number[] = [];
            for (const g of props.groups) {
              for (const q of g.questions) {
                if (q.selectedKey && q.answerKey && q.selectedKey !== q.answerKey) {
                  wrongs.push(q.number);
                }
              }
            }
            return wrongs;
          },
          onClose: () => {
            scoreCalcOpen = false;
            render();
          },
        })
      );
    }

    if (props.loadingPaper) {
      const loadingCard = el('div', 'ciyu-surface ciyu-state-card');
      loadingCard.setAttribute('aria-live', 'polite');
      loadingCard.append(
        el('span', 'ciyu-spinner'),
        el('h4', 'ciyu-state-title', `正在载入「${props.paperTitle}」听力自查题组…`),
        el('p', 'ciyu-state-desc', '正在准备 Section A / B / C 听力题目、分段音频时间戳与解析。')
      );
      root.appendChild(loadingCard);
      return;
    }

    if (props.loadError) {
      const errCard = el('div', 'ciyu-surface ciyu-state-card');
      errCard.setAttribute('role', 'alert');
      const retryBtn = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm');
      retryBtn.type = 'button';
      retryBtn.append(createIcon('refresh-cw', 'sm'), el('span', undefined, '重新加载本套听力'));
      retryBtn.addEventListener('click', () =>
        callbacks.onRetryLoadPaper
          ? callbacks.onRetryLoadPaper(props.paperId)
          : callbacks.onSelectPaper?.(props.paperId)
      );
      errCard.append(
        el('h4', 'ciyu-state-title', '听力题组暂未载入'),
        el('p', 'ciyu-state-desc', props.loadError),
        retryBtn
      );
      root.appendChild(errCard);
      return;
    }

    if (props.transcriptSavedPath || props.sharedTranscriptInfo) {
      const linkStrip = el('div', 'ciyu-toolbar-actions');
      if (props.transcriptSavedPath) {
        const savedChip = el('button', 'ciyu-note-link');
        savedChip.type = 'button';
        savedChip.append(
          createIcon('file-text', 'sm'),
          el('span', undefined, `已保存全文：[[${props.transcriptSavedPath}|打开听力原文 Markdown]]`)
        );
        savedChip.addEventListener('click', () =>
          callbacks.onOpenSavedTranscriptNote?.(props.transcriptSavedPath!)
        );
        linkStrip.appendChild(savedChip);
      }
      if (props.sharedTranscriptInfo) {
        const sharedChip = el('button', 'ciyu-note-link');
        sharedChip.type = 'button';
        sharedChip.append(
          createIcon('link', 'sm'),
          el(
            'span',
            undefined,
            `与「${props.sharedTranscriptInfo.sourcePaperTitle}」共用听力 → 打开同一份原文`
          )
        );
        sharedChip.addEventListener('click', () =>
          callbacks.onOpenSavedTranscriptNote?.(props.sharedTranscriptInfo!.notePath)
        );
        linkStrip.appendChild(sharedChip);
      }
      root.appendChild(linkStrip);
    }

    // 2. Section A / B / C 切换 + 题组片段选择（带精确起止时间戳如 00:33–02:45，统一 iOS 27 悬浮液态玻璃透镜）
    const secTabs = el('div', 'ciyu-glass ciyu-section-tabs');
    secTabs.setAttribute('role', 'tablist');
    const secBtns: HTMLButtonElement[] = [];
    let activeSecIdx = 0;
    SECTION_META.forEach((sec, idx) => {
      const selected = props.activeSection === sec.id;
      if (selected) activeSecIdx = idx;
      const secGroups = props.groups.filter((g) => g.section === sec.id);
      const secQuestions = secGroups.flatMap((g) => g.questions);
      const secAnswered = secQuestions.filter((q) => Boolean(q.selectedKey)).length;
      const firstStart = secGroups.find((g) => typeof g.startSec === 'number')?.startSec;
      const lastEnd = [...secGroups].reverse().find((g) => typeof g.endSec === 'number')?.endSec;
      const rangeStr =
        typeof firstStart === 'number' && typeof lastEnd === 'number'
          ? `${formatTime(firstStart)}–${formatTime(lastEnd)}`
          : secQuestions.length > 0
          ? `${secAnswered}/${secQuestions.length}`
          : '';
      const btn = el('button', 'ciyu-section-tab');
      btn.type = 'button';
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', String(selected));
      btn.append(
        el('span', undefined, sec.title),
        el('small', undefined, rangeStr ? `${sec.subtitle} · ${rangeStr}` : sec.subtitle)
      );
      secBtns.push(btn);
      secTabs.appendChild(btn);
    });
    attachLiquidLens({
      container: secTabs,
      buttons: secBtns,
      activeIndex: activeSecIdx,
      cacheKey: 'cet6-listening-sections',
      onSelect: (idx) => {
        const picked = SECTION_META[idx];
        if (picked && picked.id !== props.activeSection) {
          callbacks.onChangeSection?.(picked.id);
        }
      },
    });
    root.appendChild(secTabs);

    const sectionGroups = props.groups.filter((g) => g.section === props.activeSection);
    const activeGroup = resolveActiveGroup(props);

    const checkedIds = new Set(props.selfCheck?.checkedGroupIds ?? []);
    const fullSubmitted = Boolean(props.selfCheck?.fullSubmitted);

    if (sectionGroups.length > 0) {
      const groupRow = el('div', 'ciyu-group-pills');
      groupRow.setAttribute('role', 'group');
      for (const grp of sectionGroups) {
        const isCurrent = grp.id === activeGroup?.id;
        const grpChecked = fullSubmitted || checkedIds.has(grp.id);
        const pill = el('button', 'ciyu-group-pill');
        pill.type = 'button';
        pill.setAttribute('aria-pressed', String(isCurrent));
        const grpCorrect = grp.questions.filter((q) => q.selectedKey === q.answerKey).length;
        const clipTag =
          grp.timeRangeLabel ||
          (typeof grp.startSec === 'number' && typeof grp.endSec === 'number'
            ? `${formatTime(grp.startSec)}–${formatTime(grp.endSec)}`
            : grp.questionRange);
        pill.append(
          el('span', undefined, grp.title),
          el(
            'span',
            grpChecked
              ? grpCorrect === grp.questions.length
                ? 'ciyu-badge ciyu-badge--ok'
                : 'ciyu-badge ciyu-badge--warn'
              : 'ciyu-badge ciyu-badge--neutral',
            grpChecked ? `${grpCorrect}/${grp.questions.length} 正确` : clipTag
          )
        );
        pill.addEventListener('click', () => callbacks.onSelectGroup?.(grp.id));
        groupRow.appendChild(pill);
      }
      root.appendChild(groupRow);
    }

    const clip = computeClipWindow(props, activeGroup);
    currentClipStart = clip.startSec;
    currentClipDuration = clip.duration;
    const tsLevel = activeGroup?.timestampLevel ?? (activeGroup?.hasTimestamps ? 'paragraph' : 'none');
    const hasAnyTimestamp = tsLevel !== 'none' || clip.hasGroupClip;

    // 3. 在线/离线音频播放器（支持题组精准片段截取 + 60fps 丝滑拖动进度条）
    if (props.audioState === 'audio_error') {
      const errBar = el('div', 'ciyu-banner ciyu-banner--error');
      errBar.setAttribute('role', 'alert');
      const main = el('div', 'ciyu-banner-main');
      main.append(
        createIcon('alert-circle', 'sm'),
        el('span', undefined, props.audioErrorDetail ?? '语音加载失败，请重试加载或打开来源链接。')
      );
      const actions = el('div', 'ciyu-toolbar-actions');
      const retryBtn = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm', '重试加载');
      retryBtn.type = 'button';
      retryBtn.addEventListener('click', () => callbacks.onRetryLoadAudio?.());
      actions.appendChild(retryBtn);
      if (props.sourceAudioUrl && callbacks.onOpenSourceAudioLink) {
        const extBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm', '外部播放音频');
        extBtn.type = 'button';
        extBtn.addEventListener('click', () =>
          callbacks.onOpenSourceAudioLink?.(props.sourceAudioUrl!)
        );
        actions.appendChild(extBtn);
      }
      errBar.append(main, actions);
      root.appendChild(errBar);
    } else if (props.audioState === 'no_audio') {
      const noBar = el('div', 'ciyu-banner');
      const main = el('div', 'ciyu-banner-main');
      main.append(
        createIcon('headphones', 'sm'),
        el('span', undefined, '当前套卷暂无在线音频流，仍可阅读原文自查或关联本地 MP3 音频。')
      );
      const attachBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm', '关联本地音频');
      attachBtn.type = 'button';
      attachBtn.addEventListener('click', () => callbacks.onAttachLocalAudio?.(props.paperId));
      noBar.append(main, attachBtn);
      root.appendChild(noBar);
    } else {
      const player = el('div', 'ciyu-glass ciyu-glass-refract ciyu-audio-bar');
      player.setAttribute('role', 'region');

      const mainRow = el('div', 'ciyu-audio-main');

      const prevBtn = el('button', 'ciyu-icon-btn');
      prevBtn.type = 'button';
      prevBtn.title = '后退 5 秒';
      prevBtn.title = '后退 5 秒（快捷键 ←）';
      prevBtn.setAttribute('aria-label', '后退 5 秒');
      prevBtn.appendChild(createIcon('skip-back', 'sm'));
      prevBtn.addEventListener('click', () => callbacks.onStepSkip?.(-5));

      const playBtn = el('button', 'ciyu-play-btn');
      playBtn.type = 'button';
      playBtn.title = '播放 / 暂停（快捷键 Space）';
      playBtn.setAttribute('aria-label', props.playing ? '暂停' : '播放');
      playBtn.setAttribute('aria-pressed', String(props.playing));
      playBtn.appendChild(createIcon(props.playing ? 'pause' : 'play', 'md'));
      playBtn.addEventListener('click', () => callbacks.onTogglePlay?.());
      playerPlayBtnEl = playBtn;

      const nextBtn = el('button', 'ciyu-icon-btn');
      nextBtn.type = 'button';
      nextBtn.title = '前进 5 秒（快捷键 →）';
      nextBtn.setAttribute('aria-label', '前进 5 秒');
      nextBtn.appendChild(createIcon('skip-forward', 'sm'));
      nextBtn.addEventListener('click', () => callbacks.onStepSkip?.(5));

      const scrubWrap = el('div', 'ciyu-scrubber-wrap');
      const relSec = Math.max(0, Math.min(clip.duration, props.currentTimeSec - clip.startSec));

      const bar = el('div', 'ciyu-scrubber-bar');
      bar.setAttribute('role', 'slider');
      bar.tabIndex = 0;
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', String(Math.round(clip.duration)));
      bar.setAttribute('aria-valuenow', String(Math.round(relSec)));

      const track = el('div', 'ciyu-scrubber-track');
      const fill = el('div', 'ciyu-scrubber-fill');
      const thumb = el('div', 'ciyu-scrubber-thumb');
      track.appendChild(fill);
      bar.append(track, thumb);

      playerBarEl = bar;
      playerFillEl = fill;
      playerThumbEl = thumb;

      const curTimeSpan = el('span', undefined, formatTime(relSec));
      const durTimeSpan = el('span', undefined, formatTime(clip.duration));
      playerCurTimeEl = curTimeSpan;
      playerDurTimeEl = durTimeSpan;
      applyScrubVisual(relSec, clip.duration);

      const relFromClientX = (clientX: number): number => {
        const rect = bar.getBoundingClientRect();
        if (rect.width <= 0) return 0;
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        return ratio * currentClipDuration;
      };

      let activePointerId: number | null = null;
      bar.addEventListener('pointerdown', (e: PointerEvent) => {
        if (e.button !== 0) return;
        e.preventDefault();
        activePointerId = e.pointerId;
        isScrubbing = true;
        bar.dataset.dragging = 'true';
        bar.setPointerCapture?.(e.pointerId);
        scrubPreviewRelSec = relFromClientX(e.clientX);
        applyScrubVisual(scrubPreviewRelSec, currentClipDuration);
      });
      bar.addEventListener('pointermove', (e: PointerEvent) => {
        if (!isScrubbing || activePointerId !== e.pointerId) return;
        scrubPreviewRelSec = relFromClientX(e.clientX);
        applyScrubVisual(scrubPreviewRelSec, currentClipDuration);
      });
      const finishScrub = (e: PointerEvent, commit: boolean) => {
        if (!isScrubbing || activePointerId !== e.pointerId) return;
        isScrubbing = false;
        activePointerId = null;
        delete bar.dataset.dragging;
        if (bar.hasPointerCapture?.(e.pointerId)) {
          bar.releasePointerCapture(e.pointerId);
        }
        if (commit) {
          scrubPreviewRelSec = relFromClientX(e.clientX);
          applyScrubVisual(scrubPreviewRelSec, currentClipDuration);
          callbacks.onSeek?.(currentClipStart + scrubPreviewRelSec);
        }
      };
      bar.addEventListener('pointerup', (e: PointerEvent) => finishScrub(e, true));
      bar.addEventListener('pointercancel', (e: PointerEvent) => finishScrub(e, false));
      bar.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
          e.preventDefault();
          callbacks.onStepSkip?.(-5);
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
          e.preventDefault();
          callbacks.onStepSkip?.(5);
        }
      });

      const modeHint = clip.clipActive
        ? `仅播本段 · 原轨 ${formatTime(clip.startSec)}–${formatTime(clip.endSec)}`
        : tsLevel === 'sentence'
        ? '句级时间戳同步中'
        : clip.hasGroupClip
        ? '整轨播放模式'
        : props.audioDownloadStatus === 'saved'
        ? '离线音频就绪'
        : '在线音频流';

      const timeRow = el('div', 'ciyu-time-row');
      timeRow.append(curTimeSpan, el('span', undefined, modeHint), durTimeSpan);
      scrubWrap.append(bar, timeRow);
      mainRow.append(prevBtn, playBtn, nextBtn, scrubWrap);

      const toolsRow = el('div', 'ciyu-audio-tools');
      const rateGroup = el('div', 'ciyu-rate-group');
      for (const r of RATES) {
        const rBtn = el(
          'button',
          props.playbackRate === r ? 'ciyu-mini-btn ciyu-mini-btn--accent' : 'ciyu-mini-btn',
          `${r}×`
        );
        rBtn.type = 'button';
        rBtn.setAttribute('aria-pressed', String(props.playbackRate === r));
        rBtn.addEventListener('click', () => callbacks.onChangeRate?.(r));
        rateGroup.appendChild(rBtn);
      }
      toolsRow.appendChild(rateGroup);

      const segActions = el('div', 'ciyu-toolbar-actions');
      if (clip.hasGroupClip && callbacks.onToggleClipMode) {
        const clipToggleBtn = el(
          'button',
          clip.clipActive ? 'ciyu-mini-btn ciyu-mini-btn--accent' : 'ciyu-mini-btn',
          clip.clipActive ? '已截取本段' : '截取本段'
        );
        clipToggleBtn.type = 'button';
        clipToggleBtn.title = clip.clipActive
          ? '当前仅播放本题组片段，点击切换回整套音频'
          : '点击仅截取播放当前题组片段';
        clipToggleBtn.addEventListener('click', () =>
          callbacks.onToggleClipMode?.(clip.clipActive ? 'full' : 'group')
        );
        segActions.appendChild(clipToggleBtn);
      }

      if (hasAnyTimestamp && activeGroup) {
        const currentSeg =
          activeGroup.segments.find((s) => s.id === props.activeSegmentId) ??
          activeGroup.segments[0];
        const loopTargetId = currentSeg?.id ?? activeGroup.id;

        const replayBtn = el('button', 'ciyu-mini-btn');
        replayBtn.type = 'button';
        replayBtn.title = '按 R 键重听当前题组';
        replayBtn.append(
          createIcon('rotate-ccw', 'sm'),
          el('span', undefined, '重播本段'),
          el('kbd', 'ciyu-kbd', 'R')
        );
        replayBtn.addEventListener('click', () => {
          if (clip.hasGroupClip && callbacks.onPlayGroupClip) {
            callbacks.onPlayGroupClip(activeGroup.id);
          } else {
            callbacks.onReplaySegment?.(loopTargetId);
          }
        });

        const looping = props.loopSegmentId === loopTargetId;
        const loopBtn = el(
          'button',
          looping
            ? 'ciyu-mini-btn ciyu-mini-btn--accent ciyu-toggle-stable-btn--md'
            : 'ciyu-mini-btn ciyu-toggle-stable-btn--md'
        );
        loopBtn.type = 'button';
        loopBtn.setAttribute('aria-pressed', String(looping));
        loopBtn.append(
          createIcon('repeat', 'sm'),
          el('span', undefined, looping ? '单段循环' : '循环本段')
        );
        loopBtn.addEventListener('click', () =>
          callbacks.onToggleLoopSegment?.(loopTargetId)
        );
        segActions.append(replayBtn, loopBtn);
      }

      if (segActions.childElementCount > 0) {
        toolsRow.appendChild(segActions);
      }

      player.append(mainRow, toolsRow);
      root.appendChild(player);
      trackStickyAudioBarHeight(player);
    }

    if (props.audioState === 'audio_error' || props.audioState === 'no_audio') {
      trackStickyAudioBarHeight(null);
    }

    if (!props.transcriptVerified) {
      const warnBar = el('div', 'ciyu-banner ciyu-banner--warn');
      warnBar.appendChild(
        el('span', undefined, '提示：当前听力文稿来源待人工核对，标点与说话者划分请结合原卷参考。')
      );
      root.appendChild(warnBar);
    }

    if (!activeGroup) return;

    // 4. 窄侧栏专用「自查题目 / 英文原文 / 中英对照」切换条（双屏左栏做题模式下隐藏，避免与右侧原文栏重复）
    if (companionRole !== 'questions-only') {
      const narrowSwitch = el('div', 'ciyu-glass ciyu-narrow-pane-switch');
      narrowSwitch.setAttribute('role', 'tablist');
      const narrowTabs: Array<{ id: ListeningNarrowPane; label: string }> = [
        { id: 'questions', label: '自查题目' },
        { id: 'en', label: '英文原文' },
        { id: 'bilingual', label: '中英对照' },
      ];
      for (const nt of narrowTabs) {
        const active = props.narrowPane === nt.id;
        const btn = el('button', 'ciyu-modal-tab', nt.label);
        btn.type = 'button';
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', String(active));
        btn.addEventListener('click', () => {
          callbacks.onChangeNarrowPane?.(nt.id);
          if (nt.id === 'en' && props.transcriptMode === 'blind') {
            callbacks.onChangeTranscriptMode?.('en');
          } else if (nt.id === 'bilingual' && props.transcriptMode !== 'bilingual') {
            callbacks.onChangeTranscriptMode?.('bilingual');
          }
        });
        narrowSwitch.appendChild(btn);
      }
      root.appendChild(narrowSwitch);
    }

    // 5. 主体双栏（宽窗口：左栏听力自查做题判分，右栏听力原文三模式对照）
    const grid = el('div', 'ciyu-listening-dual-grid');

    // ========== 左栏：当前题组自查作答、核对判分、一键加错题、解析对照 ==========
    const questionCol = el('section', 'ciyu-surface ciyu-question-card ciyu-listen-col-questions');

    const allQuestions = props.groups.flatMap((g) => g.questions);
    const totalAnswered = allQuestions.filter((q) => Boolean(q.selectedKey)).length;
    const groupAnswered = activeGroup.questions.filter((q) => Boolean(q.selectedKey)).length;
    const isGroupChecked = fullSubmitted || checkedIds.has(activeGroup.id);

    const qHead = el('div', 'ciyu-session-head');
    qHead.append(
      el('h4', 'ciyu-session-title', `${activeGroup.title} · ${activeGroup.questionRange}`),
      el(
        'span',
        isGroupChecked ? 'ciyu-badge ciyu-badge--ok' : 'ciyu-badge ciyu-badge--accent',
        isGroupChecked
          ? '已核对答案'
          : `已答 ${groupAnswered} / ${activeGroup.questions.length}`
      )
    );
    questionCol.appendChild(qHead);

    const selfCheckBar = el(
      'div',
      isGroupChecked
        ? 'ciyu-selfcheck-bar ciyu-selfcheck-bar--graded'
        : 'ciyu-selfcheck-bar'
    );

    if (!isGroupChecked) {
      const leftHint = el(
        'span',
        'ciyu-toggle-desc',
        `选项文字支持拖选划词查词；作答后可即刻核对本组（全卷已答 ${totalAnswered}/${allQuestions.length} 题）。`
      );
      const barActions = el('div', 'ciyu-toolbar-actions');

      if (callbacks.onSubmitGroupSelfCheck) {
        const checkGrpBtn = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm');
        checkGrpBtn.type = 'button';
        checkGrpBtn.append(
          createIcon('check-circle-2', 'sm'),
          el('span', undefined, '核对本组答案')
        );
        checkGrpBtn.addEventListener('click', () =>
          callbacks.onSubmitGroupSelfCheck?.(activeGroup.id)
        );
        barActions.appendChild(checkGrpBtn);
      }

      if (callbacks.onSubmitFullSelfCheck && allQuestions.length > activeGroup.questions.length) {
        const checkAllBtn = el(
          'button',
          'ciyu-btn ciyu-btn--glass ciyu-btn--sm',
          `提交整套自查 (${totalAnswered}/${allQuestions.length})`
        );
        checkAllBtn.type = 'button';
        checkAllBtn.addEventListener('click', () => callbacks.onSubmitFullSelfCheck?.());
        barActions.appendChild(checkAllBtn);
      }
      selfCheckBar.append(leftHint, barActions);
    } else {
      const scopeQuestions: ExamChoiceQuestion[] = fullSubmitted
        ? allQuestions
        : activeGroup.questions;
      const correctCount = scopeQuestions.filter((q) => q.selectedKey === q.answerKey).length;
      const wrongQuestions = scopeQuestions.filter(
        (q) => !q.selectedKey || q.selectedKey !== q.answerKey
      );
      const unaddedWrong = wrongQuestions.filter((q) => !props.mistakeByQuestion[q.number]);
      const accuracy = scopeQuestions.length
        ? Math.round((correctCount * 100) / scopeQuestions.length)
        : 0;

      const scoreSummary = el('div', 'ciyu-banner-main');
      scoreSummary.append(
        createIcon('check-circle-2', 'sm'),
        el(
          'strong',
          undefined,
          fullSubmitted
            ? `整套听力自查得分：${correctCount} / ${scopeQuestions.length}（正确率 ${accuracy}%）`
            : `本组自查得分：${correctCount} / ${scopeQuestions.length}（正确率 ${accuracy}%）`
        )
      );

      const barActions = el('div', 'ciyu-toolbar-actions');
      if (unaddedWrong.length > 0 && callbacks.onAddWrongListeningToMistakes) {
        const addWrongsBtn = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm');
        addWrongsBtn.type = 'button';
        addWrongsBtn.append(
          createIcon('flag', 'sm'),
          el('span', undefined, `将 ${unaddedWrong.length} 道错题加入错题本`)
        );
        addWrongsBtn.addEventListener('click', () =>
          callbacks.onAddWrongListeningToMistakes?.(unaddedWrong)
        );
        barActions.appendChild(addWrongsBtn);
      }

      if (callbacks.onResetGroupSelfCheck) {
        const resetBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm', '重做本组');
        resetBtn.type = 'button';
        resetBtn.addEventListener('click', () =>
          callbacks.onResetGroupSelfCheck?.(activeGroup.id)
        );
        barActions.appendChild(resetBtn);
      }

      if (fullSubmitted && callbacks.onResetFullSelfCheck) {
        const resetAllBtn = el('button', 'ciyu-mini-btn', '重置整卷');
        resetAllBtn.type = 'button';
        resetAllBtn.addEventListener('click', () => callbacks.onResetFullSelfCheck?.());
        barActions.appendChild(resetAllBtn);
      }

      selfCheckBar.append(scoreSummary, barActions);
    }

    if (
      callbacks.onSubmitGroupSelfCheck ||
      callbacks.onSubmitFullSelfCheck ||
      isGroupChecked
    ) {
      questionCol.appendChild(selfCheckBar);
    }

    if (activeGroup.directions) {
      questionCol.appendChild(
        el('p', 'ciyu-toggle-desc ciyu-selectable-prose', activeGroup.directions)
      );
    }

    const qList = el('ol', 'ciyu-question-list');
    for (const q of activeGroup.questions) {
      const isHighlighted = props.highlightedQuestionBlockId === q.blockId;
      const qItem = el(
        'li',
        isHighlighted ? 'ciyu-question-item ciyu-block-highlight' : 'ciyu-question-item'
      );
      qItem.dataset.blockId = q.blockId;

      const stemTop = el('div', 'ciyu-question-head-row');
      const stemLabel = q.stem ? `${q.number}. ${q.stem}` : `第 ${q.number} 题`;
      const stem = el('p', 'ciyu-question-stem ciyu-selectable-prose', stemLabel);

      const qTools = el('div', 'ciyu-paper-actions');
      if (isGroupChecked) {
        const isRight = q.selectedKey === q.answerKey;
        qTools.appendChild(
          el(
            'span',
            isRight ? 'ciyu-badge ciyu-badge--ok' : 'ciyu-badge ciyu-badge--error',
            isRight
              ? `✓ 正确 (${q.answerKey})`
              : `✗ 选 ${q.selectedKey ?? '未答'} · 正解 ${q.answerKey}`
          )
        );
      }

      if (q.segmentId) {
        const toSegBtn = el('button', 'ciyu-mini-btn', '对应段落');
        toSegBtn.type = 'button';
        toSegBtn.title = '跳转到该题对应的听力原文段落';
        toSegBtn.addEventListener('click', () => callbacks.onJumpToSegment?.(q.segmentId!));
        qTools.appendChild(toSegBtn);
      }

      const existingMistake = props.mistakeByQuestion[q.number];
      if (existingMistake) {
        const mBtn = el('button', 'ciyu-mistake-chip ciyu-mistake-chip--saved');
        mBtn.type = 'button';
        mBtn.title = existingMistake.mistakeWikiLink;
        mBtn.append(
          createIcon('flag', 'sm'),
          el('span', undefined, '查看错题记录'),
          createIcon('arrow-up-right', 'sm')
        );
        mBtn.addEventListener('click', () =>
          callbacks.onViewMistakeRecord?.(existingMistake)
        );
        qTools.appendChild(mBtn);
      } else {
        const addMBtn = el('button', 'ciyu-mistake-chip');
        addMBtn.type = 'button';
        addMBtn.append(createIcon('plus', 'sm'), el('span', undefined, '加入错题'));
        addMBtn.addEventListener('click', () => callbacks.onAddMistake?.(q, 'listening'));
        qTools.appendChild(addMBtn);
      }

      stemTop.append(stem, qTools);

      const optList = el('div', 'ciyu-option-list');
      for (const opt of q.options) {
        const chosen = q.selectedKey === opt.key;
        let optCls = 'ciyu-option-btn ciyu-selectable-prose';
        if (isGroupChecked) {
          if (opt.key === q.answerKey) {
            optCls += ' ciyu-option-btn--correct';
          } else if (chosen && opt.key !== q.answerKey) {
            optCls += ' ciyu-option-btn--wrong';
          }
        }
        // 使用 div[role="button"] 替代原生 <button>，彻底允许在选项文字中拖选划词查词！
        const optBtn = el('div', optCls);
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
          callbacks.onSelectOption?.(q.number, opt.key);
        });
        optBtn.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            callbacks.onSelectOption?.(q.number, opt.key);
          }
        });
        optList.appendChild(optBtn);
      }

      qItem.append(stemTop, optList);

      if (isGroupChecked && q.explanation) {
        const expNote = el('div', 'ciyu-inline-explanation ciyu-selectable-prose');
        expNote.append(
          el('strong', undefined, '解析：'),
          el('span', undefined, q.explanation)
        );
        qItem.appendChild(expNote);
      }

      qList.appendChild(qItem);
    }
    questionCol.appendChild(qList);

    const weightPerQ = activeGroup.section === 'C' ? 14.2 : 7.1;
    const grpTotal = activeGroup.questions.length;
    const grpCorrectCount = activeGroup.questions.filter(
      (q) => q.selectedKey && q.selectedKey === q.answerKey
    ).length;
    const grpWrongCount = activeGroup.questions.filter(
      (q) => q.selectedKey && q.selectedKey !== q.answerKey
    ).length;
    const grpEarned = Math.round(grpCorrectCount * weightPerQ * 10) / 10;
    const grpMax = Math.round(grpTotal * weightPerQ * 10) / 10;

    const showAnsBox = props.answersExpanded;
    const answerBtn = el(
      'button',
      isGroupChecked ? 'ciyu-disclosure-btn ciyu-disclosure-btn--checked' : 'ciyu-disclosure-btn'
    );
    answerBtn.type = 'button';
    answerBtn.setAttribute('aria-expanded', String(showAnsBox));
    const btnLeft = el('span', 'ciyu-paper-info');
    btnLeft.append(
      createIcon(isGroupChecked ? 'check-circle-2' : 'sparkles', 'sm'),
      el(
        'span',
        undefined,
        isGroupChecked
          ? showAnsBox
            ? `收起本组核对结果（${activeGroup.questionRange}）`
            : `展开本组核对结果（${activeGroup.questionRange}）`
          : `一键核对本组答案（${activeGroup.questionRange}）`
      )
    );
    if (isGroupChecked) {
      btnLeft.appendChild(
        el(
          'span',
          grpWrongCount === 0 && grpCorrectCount === grpTotal
            ? 'ciyu-badge ciyu-badge--ok'
            : 'ciyu-badge ciyu-badge--accent',
          `对 ${grpCorrectCount}/${grpTotal} · ${grpEarned.toFixed(1)}/${grpMax.toFixed(1)} 分`
        )
      );
    }
    answerBtn.appendChild(btnLeft);
    const chev = createIcon('chevron-down', 'sm');
    chev.classList.add('ciyu-disclosure-chevron');
    answerBtn.appendChild(chev);
    answerBtn.addEventListener('click', () => {
      if (!isGroupChecked) {
        callbacks.onSubmitGroupSelfCheck?.(activeGroup.id);
        if (!props.answersExpanded) callbacks.onToggleAnswers?.(true);
      } else {
        callbacks.onToggleAnswers?.(!props.answersExpanded);
      }
    });
    questionCol.appendChild(answerBtn);

    if (showAnsBox) {
      const ansBox = el('div', 'ciyu-answer-box ciyu-answer-box--graded');
      const summaryBar = el('div', 'ciyu-answer-summary-bar');
      summaryBar.append(
        el(
          'span',
          'ciyu-toggle-title',
          `本组核对：对 ${grpCorrectCount} / ${grpTotal} 题 · 得 ${grpEarned.toFixed(1)} / ${grpMax.toFixed(1)} 分`
        )
      );
      const wrongQs = activeGroup.questions.filter(
        (q) => q.selectedKey && q.selectedKey !== q.answerKey
      );
      if (wrongQs.length > 0 && callbacks.onAddWrongListeningToMistakes) {
        const addAllWrongBtn = el('button', 'ciyu-mini-btn ciyu-mini-btn--danger', `本组 ${wrongQs.length} 道错题入错题本`);
        addAllWrongBtn.type = 'button';
        addAllWrongBtn.addEventListener('click', () =>
          callbacks.onAddWrongListeningToMistakes?.(wrongQs)
        );
        summaryBar.appendChild(addAllWrongBtn);
      }
      ansBox.appendChild(summaryBar);

      for (const q of activeGroup.questions) {
        const isCorrect = Boolean(q.selectedKey && q.selectedKey === q.answerKey);
        const isWrong = Boolean(q.selectedKey && q.selectedKey !== q.answerKey);
        const row = el('div', 'ciyu-answer-graded-row');
        const headLine = el('div', 'ciyu-answer-graded-head');
        headLine.append(
          el('strong', 'ciyu-answer-qnum', `第 ${q.number} 题`),
          el(
            'span',
            isCorrect
              ? 'ciyu-badge ciyu-badge--ok'
              : isWrong
                ? 'ciyu-badge ciyu-badge--danger'
                : 'ciyu-badge ciyu-badge--neutral',
            isCorrect
              ? `✓ 正确（选 ${q.answerKey}）`
              : isWrong
                ? `✗ 错 · 选 ${q.selectedKey} → 正解 ${q.answerKey}`
                : `未作答 · 正解 ${q.answerKey}`
          )
        );
        row.appendChild(headLine);
        if (q.explanation) {
          row.appendChild(el('p', 'ciyu-toggle-desc', q.explanation));
        }
        ansBox.appendChild(row);
      }
      questionCol.appendChild(ansBox);
    }

    if (companionRole === 'questions-only') {
      grid.append(questionCol);
    } else {
      grid.append(questionCol, buildTranscriptColumn(activeGroup, clip, tsLevel));
    }
    root.appendChild(grid);

    if (savedScrollTop >= 0 && scrollHost) {
      scrollHost.scrollTop = savedScrollTop;
      restoreVisibleSegmentAnchor(scrollHost, savedAnchor);
    }
  }

  // 精听键盘快捷流（捕获阶段 + 防双视图重复触发 + 防按钮 keyup 二次点击）：
  // Space 播放/暂停，← / → 快退/快进 5 秒，R 重听当前题组
  const onListeningKeydown = (e: KeyboardEvent) => {
    if (props.companionRole === 'transcript-only') return;
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (!root.isConnected || root.hidden) return;
    if (props.groups.length === 0) return;
    const rect = root.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
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
    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (activeEl && activeEl.tagName === 'BUTTON' && root.contains(activeEl)) {
        activeEl.blur();
      }
      callbacks.onTogglePlay?.();
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      callbacks.onStepSkip?.(-5);
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      callbacks.onStepSkip?.(5);
      return;
    }
    if (e.key === 'r' || e.key === 'R') {
      const grp = resolveActiveGroup(props);
      if (grp) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (callbacks.onPlayGroupClip && typeof grp.startSec === 'number') {
          callbacks.onPlayGroupClip(grp.id);
        } else if (typeof grp.startSec === 'number') {
          callbacks.onSeek?.(grp.startSec);
        }
      }
    }
  };
  const keyDoc = root.ownerDocument;
  if (keyDoc) {
    keyDoc.addEventListener('keydown', onListeningKeydown, true);
  }

  render();

  return {
    element: root,
    update(nextProps) {
      props = nextProps;
      const nextSig = structureSignature(props);
      if (nextSig === lastStructureSig && (playerBarEl?.isConnected || props.companionRole === 'transcript-only')) {
        patchPlaybackInPlace();
        return;
      }
      render();
    },
    destroy() {
      if (keyDoc) {
        keyDoc.removeEventListener('keydown', onListeningKeydown, true);
      }
      audioBarResizeObs?.disconnect();
      audioBarResizeObs = null;
      root.remove();
    },
  };
}
