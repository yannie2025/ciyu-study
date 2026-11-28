import { CIYU_VERSION } from '../changelog';
import { el } from '../dom';
import { applyGlassPreferences } from '../glass';
import { createBrandLogo, createIcon } from '../icons';
import { attachAdaptiveProMotion } from '../promotion';
import type {
  CiyuSidebarCallbacks,
  CiyuSidebarProps,
  ExamSubViewId,
  UIComponentHandle,
} from '../types';
import { createArchiveView } from './ArchiveView';
import { createExamBankView } from './ExamBankView';
import { createExamWorkspaceView } from './ExamWorkspaceView';
import { attachLiquidLens } from './LiquidSegmented';
import { createListeningIntensiveView } from './ListeningIntensiveView';
import { createLookupView } from './LookupView';
import { createMistakeBookView } from './MistakeBookView';
import { createReviewView } from './ReviewView';
import { createSegmentedNav } from './SegmentedNav';
import { createSettingsView } from './SettingsView';
import { createVocabularyView } from './VocabularyView';

/**
 * 词屿 Obsidian 侧栏总容器
 * 负责承载顶部品牌状态、分段导航和五个侧栏视图（查词 / 生词本 / 今日复习 / 每日归档 / 模型设置）。
 * 所有样式严格在 .ciyu-ui 内生效。
 */
export function createCiyuSidebar(
  initialProps: CiyuSidebarProps,
  callbacks: CiyuSidebarCallbacks
): UIComponentHandle<CiyuSidebarProps> {
  let props: CiyuSidebarProps = { ...initialProps };

  const root = el('aside', 'ciyu-ui ciyu-sidebar');
  const detachProMotion = attachAdaptiveProMotion(root, () => {
    applyGlassPreferences(root, props.preferences);
  });

  const header = el('header', 'ciyu-sidebar-header');
  const brandRow = el('div', 'ciyu-brand-row');

  const brand = el('div', 'ciyu-brand');
  const brandMark = el('span', 'ciyu-brand-mark');
  brandMark.appendChild(createBrandLogo());
  brand.append(
    brandMark,
    el('span', 'ciyu-brand-title', '词屿')
  );

  const rightTools = el('div', 'ciyu-brand-tools');

  const glassToggleBtn = el('button', 'ciyu-glass-quick-toggle');
  glassToggleBtn.type = 'button';
  glassToggleBtn.title = '一键开关 Liquid Glass 材质';
  glassToggleBtn.append(createIcon('sparkles', 'sm'));
  const glassToggleText = el('span', undefined, '玻璃');
  glassToggleBtn.appendChild(glassToggleText);
  glassToggleBtn.addEventListener('click', () => {
    const currentOn =
      props.preferences.liquidGlass && !props.preferences.reducedTransparency;
    const nextOn = !currentOn;
    // 0ms 乐观立即切换视觉材质，不等 iCloud 磁盘写入完成
    props = {
      ...props,
      preferences: {
        ...props.preferences,
        liquidGlass: nextOn,
        reducedTransparency: !nextOn,
      },
    };
    applyGlassPreferences(root, props.preferences);
    glassToggleBtn.setAttribute('aria-pressed', String(nextOn));
    glassToggleText.textContent = nextOn ? '玻璃开' : '玻璃关';
    callbacks.onToggleLiquidGlass?.(nextOn);
  });

  const metaPill = el('div', 'ciyu-brand-meta');
  const statusDot = el('span', 'ciyu-status-dot');
  const modelText = el('span');
  metaPill.append(statusDot, modelText);

  const versionBadge = el('span', 'ciyu-version-pill');
  versionBadge.title = `当前版本 v${props.appVersion || CIYU_VERSION}（完整更新日志请见「设置 → 关于词屿」）`;
  const versionLabel = el('span', 'ciyu-version-text', `v${props.appVersion || CIYU_VERSION}`);
  versionBadge.appendChild(versionLabel);

  let lastStudyTab: CiyuSidebarProps['activeTab'] =
    props.activeTab === 'settings' || props.activeTab === 'dictionaries' ? 'lookup' : props.activeTab;

  const settingsTopBtn = el('button', 'ciyu-settings-top-btn');
  settingsTopBtn.type = 'button';
  settingsTopBtn.title = '设置与离线词库';
  settingsTopBtn.setAttribute('aria-label', '设置');
  settingsTopBtn.appendChild(createIcon('sliders', 'sm'));
  settingsTopBtn.addEventListener('click', () => {
    const inSettings = props.activeTab === 'settings' || props.activeTab === 'dictionaries';
    callbacks.onTabChange?.(inSettings ? lastStudyTab : 'settings');
  });

  rightTools.append(glassToggleBtn, metaPill, versionBadge, settingsTopBtn);
  brandRow.append(brand, rightTools);

  const navHandle = createSegmentedNav(
    {
      activeTab: props.activeTab,
      dueTodayCount: props.dueTodayCount,
    },
    {
      onTabChange: callbacks.onTabChange,
    }
  );

  header.append(brandRow, navHandle.element);

  const body = el('main', 'ciyu-sidebar-body');

  const lookupHandle = createLookupView(props.lookup, callbacks.lookup);
  const vocabHandle = createVocabularyView(props.vocabulary, callbacks.vocabulary);
  const reviewHandle = createReviewView(props.review, callbacks.review);
  const archiveHandle = createArchiveView(props.archive, callbacks.archive);
  const dictionaryPanel = el('section', 'ciyu-dictionaries-view');
  const settingsHandle = createSettingsView(
    {
      ...props.settings,
      dictionarySlot: dictionaryPanel,
      requestedCategory: props.activeTab === 'dictionaries' ? 'dictionaries' : undefined,
    },
    callbacks.settings
  );

  const examsPanel = el('section', 'ciyu-exams-view');

  // 兼容旧版 v0.3.5 未传 examBank 时的回退按钮卡片
  const legacyExamsCard = el('div', 'ciyu-surface ciyu-state-card');
  const examsDescription = el('p', 'ciyu-state-desc');
  const batchCet6 = el('button', 'ciyu-btn ciyu-btn--primary', '批量下载历年真题');
  batchCet6.type = 'button';
  batchCet6.addEventListener('click', () => callbacks.onDownloadCet6?.());
  const localIndex = el('button', 'ciyu-btn ciyu-btn--glass', '打开真题下载索引');
  localIndex.type = 'button';
  localIndex.addEventListener('click', () => callbacks.onOpenCet6Index?.());
  const importExams = el('button', 'ciyu-btn ciyu-btn--glass', '导入样卷或其他试卷');
  importExams.type = 'button';
  importExams.addEventListener('click', () => callbacks.onImportExams?.());
  const openLastExam = el('button', 'ciyu-btn ciyu-btn--glass', '打开上次导入的文字版');
  openLastExam.type = 'button';
  openLastExam.addEventListener('click', () => callbacks.onOpenLastExam?.());
  const openExams = el('button', 'ciyu-btn ciyu-btn--glass', '打开六级题库索引');
  openExams.type = 'button';
  openExams.addEventListener('click', () => callbacks.onOpenExamBank?.());
  legacyExamsCard.append(
    el('h3', 'ciyu-state-title', '六级考试题库'),
    examsDescription,
    batchCet6,
    localIndex,
    importExams,
    openLastExam,
    openExams
  );

  const examSubNav = el('div', 'ciyu-exam-subnav');
  examSubNav.setAttribute('role', 'navigation');
  examSubNav.setAttribute('aria-label', '六级闭环子页面切换');

  let examBankHandle: UIComponentHandle<NonNullable<CiyuSidebarProps['examBank']>> | null = null;
  let examWorkspaceHandle: UIComponentHandle<NonNullable<CiyuSidebarProps['examWorkspace']>> | null = null;
  let listeningHandle: UIComponentHandle<NonNullable<CiyuSidebarProps['listening']>> | null = null;
  let mistakesHandle: UIComponentHandle<NonNullable<CiyuSidebarProps['mistakes']>> | null = null;
  let lastExamSubNavSig = '';
  let lastRenderedDictKey: string | undefined;
  let lastRenderedNotesKey: string | undefined;
  const dirtyPanels = new Set<string>();

  examsPanel.append(examSubNav, legacyExamsCard);
  const archivePanel = el('section', 'ciyu-notes-view');
  const notesHost = el('div', 'ciyu-note-manager');
  archivePanel.append(notesHost, archiveHandle.element);
  const panelMap = {
    lookup: lookupHandle.element,
    vocabulary: vocabHandle.element,
    review: reviewHandle.element,
    archive: archivePanel,
    exams: examsPanel,
    settings: settingsHandle.element,
  } as const;

  Object.entries(panelMap).forEach(([id, panel]) => {
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('data-tab-panel', id);
    body.appendChild(panel);
  });

  root.append(header, body);

  function sync(previous?: CiyuSidebarProps): void {
    applyGlassPreferences(root, props.preferences);

    const glassOn =
      props.preferences.liquidGlass && !props.preferences.reducedTransparency;
    glassToggleBtn.setAttribute('aria-pressed', String(glassOn));
    glassToggleBtn.setAttribute(
      'aria-label',
      glassOn ? '关闭 Liquid Glass 效果' : '开启 Liquid Glass 效果'
    );
    glassToggleText.textContent = glassOn ? '玻璃开' : '玻璃关';
    versionLabel.textContent = `v${props.appVersion || CIYU_VERSION}`;

    statusDot.className =
      props.connectionStatus === 'connected'
        ? 'ciyu-status-dot ciyu-status-dot--ok'
        : props.connectionStatus === 'checking'
        ? 'ciyu-status-dot ciyu-status-dot--warn'
        : 'ciyu-status-dot ciyu-status-dot--error';

    modelText.textContent =
      props.connectionStatus === 'connected' || props.settings.inference
        ? props.activeModelName
        : props.connectionStatus === 'checking'
        ? '连接检测中…'
        : 'Ollama 未连接';

    const inSettings = props.activeTab === 'settings' || props.activeTab === 'dictionaries';
    if (!inSettings) lastStudyTab = props.activeTab;
    settingsTopBtn.classList.toggle('ciyu-settings-top-btn--active', inSettings);
    settingsTopBtn.setAttribute('aria-pressed', String(inSettings));

    if (!previous || previous.activeTab !== props.activeTab || previous.dueTodayCount !== props.dueTodayCount) {
      const navFocused = navHandle.element.contains(root.ownerDocument.activeElement);
      navHandle.update({ activeTab: props.activeTab, dueTodayCount: props.dueTodayCount });
      if (navFocused) navHandle.element.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
      const visiblePanelId = inSettings ? 'settings' : props.activeTab;
      for (const tabId of Object.keys(panelMap) as Array<keyof typeof panelMap>) {
        panelMap[tabId].hidden = tabId !== visiblePanelId;
      }
    }

    const differs = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
    const visiblePanelId = inSettings ? 'settings' : props.activeTab;

    // 仅在当前处于「题库」页签时按需渲染/更新当前子视图，避免后台空转重建 DOM
    if (visiblePanelId === 'exams') {
      const examsAvailable = Boolean(props.examsAvailable);
      openExams.hidden = !examsAvailable;
      openLastExam.hidden = !props.lastExamAvailable;
      localIndex.hidden = !props.cet6IndexAvailable;
      examsDescription.textContent = '下载 2024 年 6 月至 2026 年 6 月的 15 套六级真题，并在目标文件夹生成索引。';

      const subView: ExamSubViewId = props.examSubView ?? 'bank';
      const hasRichExams = Boolean(
        props.examBank || props.examWorkspace || props.listening || props.mistakes
      );
      legacyExamsCard.hidden = hasRichExams;
      examSubNav.hidden = !hasRichExams;

      if (hasRichExams) {
        const mistakeTotal = props.mistakes?.items.length ?? props.examBank?.mistakeCount ?? 0;
        const subNavSig = `${subView}::${mistakeTotal}`;
        if (subNavSig !== lastExamSubNavSig) {
          lastExamSubNavSig = subNavSig;
          examSubNav.replaceChildren();
          const items: Array<{ id: ExamSubViewId; label: string }> = [
            { id: 'bank', label: '题库选卷' },
            { id: 'index', label: '真题索引' },
            { id: 'paper', label: '试卷做题' },
            { id: 'listening', label: '听力自查' },
            {
              id: 'mistakes',
              label: mistakeTotal > 0 ? `错题本 (${mistakeTotal})` : '错题本',
            },
          ];
          const track = el('div', 'ciyu-exam-subnav-track');
          const subBtns: HTMLButtonElement[] = [];
          let activeSubIdx = 0;
          items.forEach((it, idx) => {
            const isCurrent = subView === it.id;
            if (isCurrent) activeSubIdx = idx;
            const btn = el(
              'button',
              isCurrent ? 'ciyu-exam-subnav-btn ciyu-exam-subnav-btn--active' : 'ciyu-exam-subnav-btn',
              it.label
            );
            btn.type = 'button';
            btn.setAttribute('aria-current', String(isCurrent));
            subBtns.push(btn);
            track.appendChild(btn);
          });
          attachLiquidLens({
            container: track,
            buttons: subBtns,
            activeIndex: activeSubIdx,
            cacheKey: 'cet6-exam-subnav',
            onSelect: (idx) => {
              const picked = items[idx];
              if (picked) callbacks.onExamSubViewChange?.(picked.id);
            },
          });
          examSubNav.appendChild(track);
        }
      }

      if (subView === 'bank' && props.examBank) {
        if (!examBankHandle) {
          examBankHandle = createExamBankView(props.examBank, {
            onOpenBatchDownloadModal:
              callbacks.examBank?.onOpenBatchDownloadModal ?? callbacks.onDownloadCet6,
            onOpenCet6Index:
              callbacks.examBank?.onOpenCet6Index ?? callbacks.onOpenCet6Index,
            onOpenImportModal:
              callbacks.examBank?.onOpenImportModal ?? callbacks.onImportExams,
            onOpenLastImported:
              callbacks.examBank?.onOpenLastImported ?? callbacks.onOpenLastExam,
            ...callbacks.examBank,
          });
          examsPanel.appendChild(examBankHandle.element);
        } else {
          examBankHandle.update(props.examBank);
        }
      }
      if (examBankHandle) examBankHandle.element.hidden = subView !== 'bank';

      if ((subView === 'index' || subView === 'paper') && props.examWorkspace) {
        const wsProps = {
          ...props.examWorkspace,
          mode: subView === 'paper' ? ('paper' as const) : ('index' as const),
        };
        if (!examWorkspaceHandle) {
          examWorkspaceHandle = createExamWorkspaceView(wsProps, callbacks.examWorkspace);
          examsPanel.appendChild(examWorkspaceHandle.element);
        } else {
          examWorkspaceHandle.update(wsProps);
        }
      }
      if (examWorkspaceHandle) examWorkspaceHandle.element.hidden = subView !== 'index' && subView !== 'paper';

      if (subView === 'listening' && props.listening) {
        if (!listeningHandle) {
          listeningHandle = createListeningIntensiveView(
            props.listening,
            callbacks.listening
          );
          examsPanel.appendChild(listeningHandle.element);
        } else {
          listeningHandle.update(props.listening);
        }
      }
      if (listeningHandle) listeningHandle.element.hidden = subView !== 'listening';

      if (subView === 'mistakes' && props.mistakes) {
        if (!mistakesHandle) {
          mistakesHandle = createMistakeBookView(props.mistakes, callbacks.mistakes);
          examsPanel.appendChild(mistakesHandle.element);
        } else {
          mistakesHandle.update(props.mistakes);
        }
      }
      if (mistakesHandle) mistakesHandle.element.hidden = subView !== 'mistakes';
    }

    if (visiblePanelId === 'settings' && lastRenderedDictKey !== props.dictionaryKey) {
      lastRenderedDictKey = props.dictionaryKey;
      dictionaryPanel.replaceChildren();
      callbacks.renderDictionaries?.(dictionaryPanel);
    }
    if (visiblePanelId === 'archive' && lastRenderedNotesKey !== props.notesKey) {
      lastRenderedNotesKey = props.notesKey;
      notesHost.replaceChildren();
      callbacks.renderNotes?.(notesHost);
    }

    if (!previous) return;

    // 仅立即刷新当前可见页签；隐藏页签先标脏，切到该页签时再刷新
    if (visiblePanelId === 'lookup') {
      if (dirtyPanels.delete('lookup') || differs(previous.lookup, props.lookup)) {
        lookupHandle.update(props.lookup);
      }
    } else if (previous.lookup !== props.lookup) {
      dirtyPanels.add('lookup');
    }

    if (visiblePanelId === 'vocabulary') {
      if (dirtyPanels.delete('vocabulary') || differs(previous.vocabulary, props.vocabulary)) {
        vocabHandle.update(props.vocabulary);
      }
    } else if (previous.vocabulary !== props.vocabulary) {
      dirtyPanels.add('vocabulary');
    }

    if (visiblePanelId === 'review') {
      if (dirtyPanels.delete('review') || differs(previous.review, props.review)) {
        reviewHandle.update(props.review);
      }
    } else if (previous.review !== props.review) {
      dirtyPanels.add('review');
    }

    if (visiblePanelId === 'archive') {
      if (dirtyPanels.delete('archive') || differs(previous.archive, props.archive)) {
        archiveHandle.update(props.archive);
      }
    } else if (previous.archive !== props.archive) {
      dirtyPanels.add('archive');
    }

    if (visiblePanelId === 'settings') {
      if (
        dirtyPanels.delete('settings') ||
        previous.activeTab !== props.activeTab ||
        differs(previous.settings, props.settings)
      ) {
        settingsHandle.update({
          ...props.settings,
          dictionarySlot: dictionaryPanel,
          requestedCategory: props.activeTab === 'dictionaries' ? 'dictionaries' : undefined,
        });
      }
    } else if (previous.settings !== props.settings) {
      dirtyPanels.add('settings');
    }
  }

  sync();

  return {
    element: root,
    update(nextProps) {
      const previous = props;
      props = { ...nextProps };
      sync(previous);
    },
    destroy() {
      detachProMotion();
      navHandle.destroy();
      lookupHandle.destroy();
      vocabHandle.destroy();
      reviewHandle.destroy();
      archiveHandle.destroy();
      settingsHandle.destroy();
      examBankHandle?.destroy();
      examWorkspaceHandle?.destroy();
      listeningHandle?.destroy();
      mistakesHandle?.destroy();
      root.remove();
    },
  };
}
