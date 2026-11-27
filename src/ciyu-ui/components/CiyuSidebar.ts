import { CIYU_CHANGELOG, CIYU_CHANGELOG_FOREWORD, CIYU_VERSION } from '../changelog';
import { el } from '../dom';
import { applyGlassPreferences } from '../glass';
import { createIcon } from '../icons';
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

  const header = el('header', 'ciyu-sidebar-header');
  const brandRow = el('div', 'ciyu-brand-row');

  const brand = el('div', 'ciyu-brand');
  brand.append(
    el('span', 'ciyu-brand-mark', '屿'),
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
    callbacks.onToggleLiquidGlass?.(!currentOn);
  });

  const metaPill = el('div', 'ciyu-brand-meta');
  const statusDot = el('span', 'ciyu-status-dot');
  const modelText = el('span');
  metaPill.append(statusDot, modelText);

  let changelogOpen = false;
  const versionBtn = el('button', 'ciyu-version-pill');
  versionBtn.type = 'button';
  versionBtn.title = '点击展开或收起更新日志';
  versionBtn.setAttribute('aria-expanded', 'false');
  const versionLabel = el('span', 'ciyu-version-text', `v${props.appVersion || CIYU_VERSION}`);
  const versionChevron = createIcon('chevron-down', 'sm');
  versionChevron.classList.add('ciyu-version-chevron');
  versionBtn.append(versionLabel, versionChevron);

  const changelogDrawer = el('section', 'ciyu-changelog-drawer');
  changelogDrawer.hidden = true;

  function renderChangelog(): void {
    const ver = props.appVersion || CIYU_VERSION;
    const entries = props.changelog?.length ? props.changelog : CIYU_CHANGELOG;
    versionLabel.textContent = `v${ver}`;
    versionBtn.setAttribute('aria-expanded', String(changelogOpen));
    versionBtn.classList.toggle('ciyu-version-pill--open', changelogOpen);
    changelogDrawer.hidden = !changelogOpen;
    if (!changelogOpen) return;

    changelogDrawer.innerHTML = '';
    const drawerHead = el('div', 'ciyu-changelog-head');
    const titleWrap = el('div', 'ciyu-changelog-title-wrap');
    titleWrap.append(
      el('strong', 'ciyu-changelog-title', '更新日志'),
      el('span', 'ciyu-count-pill', `当前 v${ver}`)
    );
    const closeBtn = el('button', 'ciyu-icon-btn');
    closeBtn.type = 'button';
    closeBtn.title = '收起更新日志';
    closeBtn.appendChild(createIcon('x', 'sm'));
    closeBtn.addEventListener('click', () => {
      changelogOpen = false;
      renderChangelog();
    });
    drawerHead.append(titleWrap, closeBtn);
    changelogDrawer.appendChild(drawerHead);

    const forewordBox = el('div', 'ciyu-changelog-foreword');
    forewordBox.appendChild(el('strong', 'ciyu-changelog-foreword-title', CIYU_CHANGELOG_FOREWORD.title));
    for (const para of CIYU_CHANGELOG_FOREWORD.paragraphs) {
      forewordBox.appendChild(el('p', 'ciyu-changelog-foreword-text', para));
    }
    if (CIYU_CHANGELOG_FOREWORD.wechatId) {
      const wechatId = CIYU_CHANGELOG_FOREWORD.wechatId;
      const contactRow = el('div', 'ciyu-changelog-contact-row');
      contactRow.appendChild(el('span', 'ciyu-changelog-foreword-text', '💬 交流与反馈 · 微信：'));
      const wechatBtn = el('button', 'ciyu-wechat-copy-trigger');
      wechatBtn.type = 'button';
      wechatBtn.setAttribute('aria-label', `点击复制微信号 ${wechatId}`);
      wechatBtn.append(
        el('span', 'ciyu-wechat-id', wechatId),
        el('span', 'ciyu-wechat-hint', '点击复制')
      );
      const hintEl = wechatBtn.querySelector<HTMLElement>('.ciyu-wechat-hint')!;
      let resetTimer: number | null = null;
      wechatBtn.addEventListener('click', () => {
        const markCopied = () => {
          wechatBtn.dataset.copied = 'true';
          hintEl.textContent = '已复制 ✓';
          if (resetTimer) window.clearTimeout(resetTimer);
          resetTimer = window.setTimeout(() => {
            delete wechatBtn.dataset.copied;
            hintEl.textContent = '点击复制';
          }, 1800);
        };
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(wechatId).then(markCopied).catch(() => {
            const ta = document.createElement('textarea');
            ta.value = wechatId;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); } catch {}
            ta.remove();
            markCopied();
          });
        } else {
          markCopied();
        }
      });
      contactRow.appendChild(wechatBtn);
      forewordBox.appendChild(contactRow);
    }
    changelogDrawer.appendChild(forewordBox);

    const list = el('ol', 'ciyu-changelog-list');
    entries.forEach((entry, idx) => {
      const li = el('li', 'ciyu-changelog-item');
      const itemHead = el('div', 'ciyu-changelog-item-head');
      const verBadge = el(
        'span',
        idx === 0 ? 'ciyu-changelog-ver ciyu-changelog-ver--latest' : 'ciyu-changelog-ver',
        `v${entry.version}`
      );
      itemHead.append(
        verBadge,
        el('span', 'ciyu-changelog-item-title', entry.title),
        el('span', 'ciyu-changelog-date', entry.date)
      );
      const ul = el('ul', 'ciyu-changelog-points');
      for (const point of entry.highlights) {
        ul.appendChild(el('li', undefined, point));
      }
      li.append(itemHead, ul);
      list.appendChild(li);
    });
    changelogDrawer.appendChild(list);
  }

  versionBtn.addEventListener('click', () => {
    changelogOpen = !changelogOpen;
    renderChangelog();
  });

  rightTools.append(glassToggleBtn, metaPill, versionBtn);
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

  header.append(brandRow, changelogDrawer, navHandle.element);

  const body = el('main', 'ciyu-sidebar-body');

  const lookupHandle = createLookupView(props.lookup, callbacks.lookup);
  const vocabHandle = createVocabularyView(props.vocabulary, callbacks.vocabulary);
  const reviewHandle = createReviewView(props.review, callbacks.review);
  const archiveHandle = createArchiveView(props.archive, callbacks.archive);
  const settingsHandle = createSettingsView(props.settings, callbacks.settings);

  const dictionaryPanel = el('section', 'ciyu-dictionaries-view');
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

  examsPanel.append(examSubNav, legacyExamsCard);
  const archivePanel = el('section', 'ciyu-notes-view');
  const notesHost = el('div', 'ciyu-note-manager');
  archivePanel.append(notesHost, archiveHandle.element);
  const panelMap = {
    lookup: lookupHandle.element,
    vocabulary: vocabHandle.element,
    review: reviewHandle.element,
    archive: archivePanel,
    dictionaries: dictionaryPanel,
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
    glassToggleText.textContent = glassOn ? '玻璃开' : '实色';
    versionLabel.textContent = `v${props.appVersion || CIYU_VERSION}`;
    if (changelogOpen) renderChangelog();

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

    if (!previous || previous.activeTab !== props.activeTab || previous.dueTodayCount !== props.dueTodayCount) {
      const navFocused = navHandle.element.contains(root.ownerDocument.activeElement);
      navHandle.update({ activeTab: props.activeTab, dueTodayCount: props.dueTodayCount });
      if (navFocused) navHandle.element.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
      for (const tabId of Object.keys(panelMap) as Array<keyof typeof panelMap>) {
        panelMap[tabId].hidden = tabId !== props.activeTab;
      }
    }

    const differs = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
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
      examSubNav.replaceChildren();
      const mistakeTotal = props.mistakes?.items.length ?? props.examBank?.mistakeCount ?? 0;
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

    if (props.examBank) {
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
      examBankHandle.element.hidden = subView !== 'bank';
    } else if (examBankHandle) {
      examBankHandle.element.hidden = true;
    }

    if (props.examWorkspace) {
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
      examWorkspaceHandle.element.hidden = subView !== 'index' && subView !== 'paper';
    } else if (examWorkspaceHandle) {
      examWorkspaceHandle.element.hidden = true;
    }

    if (props.listening) {
      if (!listeningHandle) {
        listeningHandle = createListeningIntensiveView(
          props.listening,
          callbacks.listening
        );
        examsPanel.appendChild(listeningHandle.element);
      } else {
        listeningHandle.update(props.listening);
      }
      listeningHandle.element.hidden = subView !== 'listening';
    } else if (listeningHandle) {
      listeningHandle.element.hidden = true;
    }

    if (props.mistakes) {
      if (!mistakesHandle) {
        mistakesHandle = createMistakeBookView(props.mistakes, callbacks.mistakes);
        examsPanel.appendChild(mistakesHandle.element);
      } else {
        mistakesHandle.update(props.mistakes);
      }
      mistakesHandle.element.hidden = subView !== 'mistakes';
    } else if (mistakesHandle) {
      mistakesHandle.element.hidden = true;
    }
    if (!previous || previous.dictionaryKey !== props.dictionaryKey) {
      dictionaryPanel.replaceChildren();
      callbacks.renderDictionaries?.(dictionaryPanel);
    }
    if (!previous || previous.notesKey !== props.notesKey) {
      notesHost.replaceChildren();
      callbacks.renderNotes?.(notesHost);
    }
    if (!previous) return;
    if (differs(previous.lookup, props.lookup)) lookupHandle.update(props.lookup);
    if (differs(previous.vocabulary, props.vocabulary)) vocabHandle.update(props.vocabulary);
    if (differs(previous.review, props.review)) reviewHandle.update(props.review);
    if (differs(previous.archive, props.archive)) archiveHandle.update(props.archive);
    if (differs(previous.settings, props.settings)) settingsHandle.update(props.settings);
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
