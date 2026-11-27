import './preview.css';
import {
  applyGlassPreferences,
  createCiyuSidebar,
  createDictionaryPacksView,
  createEntryEditorModal,
  createExamDeleteConfirmModal,
  createExamDownloadImportModal,
  createExamWorkspaceView,
  createListeningIntensiveView,
  createMistakeBookView,
  createSelectionPopover,
  createStudyNotesManagerView,
  createVocabularyQuickImportModal,
  type Cet6OverallStatus,
  type Cet6PaperSummary,
  type CiyuSidebarProps,
  type DictionaryPackItem,
  type EntryEditorModalProps,
  type ExamDeleteConfirmModalProps,
  type ExamDeleteOptions,
  type ExamModalProps,
  type ExamWorkspaceProps,
  type ListeningIntensiveProps,
  type MistakeBookProps,
  type MistakeEntryItem,
  type MistakeLinkRef,
  type MistakeQuestionType,
  type StudyNoteFileItem,
  type VocabQuickImportModalProps,
  type WordEntry,
} from '../src/ciyu-ui';
import {
  buildInitialCet6Sessions,
  buildVaultPaths,
  INITIAL_MISTAKE_ITEMS,
  INITIAL_PREVIEW_ARCHIVE,
  INITIAL_PREVIEW_MODELS,
  INITIAL_PREVIEW_REVIEW,
  INITIAL_PREVIEW_VOCAB,
  SYNTHETIC_FULL_PAPER,
  SYNTHETIC_LISTENING_GROUPS,
  SYNTHETIC_WORD_BANK,
} from './mockCet6Data';

type MainStageMode = 'index' | 'paper' | 'listening' | 'mistakes';

const params = new URLSearchParams(window.location.search);

let themeMode: 'light' | 'dark' = params.get('theme') === 'dark' ? 'dark' : 'light';
let sidebarWidth = Number(params.get('sidebar') || 360);
let mainStage: MainStageMode =
  (params.get('stage') as MainStageMode) || 'listening';

const VAULT_NAME = '大学英语学习库';
let rootFolder = '词屿';
let vaultPaths = buildVaultPaths(rootFolder);
let sessions = buildInitialCet6Sessions(rootFolder);

let playTimer: number | null = null;
let batchTimer: number | null = null;

function countDownloaded(): number {
  return sessions.flatMap((s) => s.papers).filter((p) => p.status === 'downloaded').length;
}

function computeOverallStatus(): Cet6OverallStatus {
  const all = sessions.flatMap((s) => s.papers);
  if (all.some((p) => p.status === 'downloading')) return 'downloading';
  const ready = all.filter((p) => p.status === 'downloaded').length;
  const errs = all.filter((p) => p.status === 'error').length;
  if (ready === 0 && errs > 0) return 'error';
  if (ready === 0) return 'not_downloaded';
  if (ready === all.length) return 'downloaded';
  return 'partial';
}

const mistakeState: MistakeBookProps = {
  indexNotePath: vaultPaths.mistakeIndexNote,
  items: INITIAL_MISTAKE_ITEMS.map((m) => ({ ...m })),
  sessionFilter: 'all',
  typeFilter: 'all',
  statusFilter: 'all',
  availableSessions: ['2026 年 6 月', '2025 年 12 月', '2025 年 6 月'],
  highlightedMistakeBlockId: null,
};

function buildMistakeMap(): Record<number, MistakeLinkRef> {
  const map: Record<number, MistakeLinkRef> = {};
  for (const m of mistakeState.items) {
    map[m.questionNumber] = {
      mistakeId: m.id,
      mistakeBlockId: m.mistakeBlockId,
      mistakeWikiLink: m.viewMistakeWikiLink,
    };
  }
  return map;
}

const initialGlass = params.get('glass') !== 'false';

const listeningState: ListeningIntensiveProps = {
  paperId: '202606-1',
  paperTitle: '2026 年 6 月六级真题 · 第 1 套',
  notePath: `${vaultPaths.papersFolder}/2026 年 6 月六级真题 · 第 1 套.md`,
  availablePapers: sessions.flatMap((s) =>
    s.papers.map((p) => ({
      id: p.id,
      title: p.title,
      session: p.session,
      imported: p.status === 'downloaded',
      hasAudio: true,
    }))
  ),
  activeSection: 'A',
  activeGroupId: 'sec-a-conv-1',
  groups: SYNTHETIC_LISTENING_GROUPS.map((g) => ({
    ...g,
    segments: g.segments.map((s) => ({
      ...s,
      sentences: s.sentences?.map((sn) => ({ ...sn })),
    })),
    questions: g.questions.map((q) => ({ ...q })),
  })),
  selfCheck: {
    checkedGroupIds: [],
    fullSubmitted: false,
  },
  transcriptMode: 'bilingual',
  hideChineseInBilingual: false,
  narrowPane: 'bilingual',
  audioState: 'ready',
  sourceAudioUrl: 'https://example.edu.cn/cet6/mock/202606-1.mp3',
  transcriptDownloadStatus: 'idle',
  sharedTranscriptInfo: {
    sourcePaperTitle: '2026 年 6 月第 1、2 套共用听力',
    notePath: `${vaultPaths.transcriptsFolder}/2026 年 6 月六级听力原文.md`,
  },
  audioDownloadStatus: 'idle',
  transcriptSourceLabel: '自写双语对齐示例文稿（句级时间戳）',
  transcriptSourceUrl: 'https://example.edu.cn/cet6/mock/202606-1.html',
  transcriptVerified: true,
  playing: false,
  currentTimeSec: 16,
  durationSec: 48,
  playbackRate: 1,
  loopSegmentId: null,
  activeSegmentId: 'seg-2',
  activeSentenceId: 'sent-2a',
  highlightedQuestionBlockId: null,
  mistakeByQuestion: buildMistakeMap(),
  answersExpanded: false,
};

const workspaceState: ExamWorkspaceProps = {
  mode: 'paper',
  vaultName: VAULT_NAME,
  targetFolder: `${rootFolder}/六级题库`,
  indexNotePath: vaultPaths.examIndexNote,
  filter: 'all',
  searchQuery: '',
  sessions,
  activePaper: structuredClone(SYNTHETIC_FULL_PAPER),
  activeSection: 'writing',
  answersExpanded: false,
  graded: false,
  mistakeByQuestion: buildMistakeMap(),
  highlightedQuestionBlockId: null,
};

const sidebarState: CiyuSidebarProps = {
  activeTab: 'exams',
  examSubView: 'bank',
  dueTodayCount: INITIAL_PREVIEW_VOCAB.length,
  connectionStatus: 'connected',
  activeModelName: 'qwen2.5:3b',
  preferences: {
    liquidGlass: initialGlass,
    reducedTransparency: !initialGlass,
    reducedMotion: params.get('reducedMotion') === 'true',
    edgeRefraction: true,
  },
  lookup: {
    query: 'sustainable',
    status: 'success',
    result: { ...SYNTHETIC_WORD_BANK['sustainable'] },
    recentQueries: ['sustainable'],
    targetNotePath: workspaceState.activePaper!.notePath!,
    detailsExpanded: true,
    activeModelName: 'qwen2.5:3b',
  },
  vocabulary: {
    items: INITIAL_PREVIEW_VOCAB.map((v) => ({ ...v })),
    searchQuery: '',
    dueTodayCount: INITIAL_PREVIEW_VOCAB.length,
  },
  review: {
    status: 'active',
    mode: 'cloze',
    revealed: false,
    currentIndex: 0,
    totalCount: INITIAL_PREVIEW_REVIEW.length,
    currentCard: { ...INITIAL_PREVIEW_REVIEW[0] },
  },
  archive: {
    groups: INITIAL_PREVIEW_ARCHIVE.map((g) => ({ ...g, entries: [...g.entries] })),
  },
  settings: {
    endpoint: 'http://127.0.0.1:11434',
    connectionStatus: 'connected',
    connectionDetail: '本机 Ollama 运行正常（模拟预览）',
    models: INITIAL_PREVIEW_MODELS.map((m) => ({ ...m })),
    selectedModelId: 'qwen2.5:3b',
    download: { status: 'idle', progressPercent: 0 },
    translationTest: {
      status: 'success',
      sampleText: 'Consistent spaced review strengthens long-term retention.',
      outputText: '规律的间隔重复能巩固长期记忆保持。',
      latencyMs: 260,
    },
    preferences: {
      liquidGlass: initialGlass,
      reducedTransparency: !initialGlass,
      reducedMotion: false,
      edgeRefraction: true,
    },
  },
  examBank: {
    vaultName: VAULT_NAME,
    targetFolder: `${rootFolder}/六级题库`,
    vaultPaths,
    overallStatus: computeOverallStatus(),
    sessions,
    selectedPaperIds: ['202506-1', '202506-2'],
    downloadedCount: countDownloaded(),
    totalCount: 15,
    indexNotePath: vaultPaths.examIndexNote,
    indexAvailable: true,
    justImported: null,
    duplicateClickNotice: null,
    mistakeCount: mistakeState.items.length,
    errorMessage: '已导入 5 套，另有 1 套（2025 年 12 月第 3 套）超时，可一键重试。',
  },
};

const modalState: ExamModalProps = {
  open: false,
  activeTab: 'import_exam',
  vaultName: VAULT_NAME,
  targetFolder: `${rootFolder}/六级题库/历年真题`,
  sessions,
  selectedPaperIds: ['202506-1', '202506-2'],
  busy: false,
  failedPapers: [],
  officialSample: {
    installed: true,
    ocrSupported: true,
  },
  directUrl: '',
  selectedLocalFiles: [],
};

let previewPacks: DictionaryPackItem[] = [
  { id: 'common', label: '常用英汉词库', count: 27466, sourceLabel: 'ECDICT 离线包', enabled: true, isPrimary: true },
  { id: 'cet6', label: '大学英语六级 (CET-6)', count: 5406, sourceLabel: 'ECDICT 离线包', enabled: true, isPrimary: false },
  { id: 'cet4', label: '大学英语四级 (CET-4)', count: 3846, sourceLabel: 'ECDICT 离线包', enabled: false, isPrimary: false },
];

let previewStudyNotes: StudyNoteFileItem[] = [
  { path: '词屿/笔记/六级高频同义替换整理.md', basename: '六级高频同义替换整理', group: 'study' },
  { path: '词屿/笔记/听力长对话转折信号词.md', basename: '听力长对话转折信号词', group: 'study' },
  { path: '词屿/每日词汇/2026-11-27.md', basename: '2026-11-27', group: 'archive' },
];
let previewTrashedNoteStack: StudyNoteFileItem[] = [];

let lastDeletedSnapshot: Cet6PaperSummary[] | null = null;

const deleteModalState: ExamDeleteConfirmModalProps = {
  open: false,
  targets: [],
  trashFolderLabel: '词屿/回收站',
  options: {
    mode: 'trash',
    updateIndexNote: true,
    deleteAssociatedMedia: false,
    deleteAssociatedMistakes: false,
    acknowledgePermanent: false,
  },
};

const vocabImportState: VocabQuickImportModalProps = {
  open: false,
  activeTab: 'paste_list',
  pasteText: 'sustainable\nresilience\nunprecedented\nalleviate — 缓解；减轻',
  candidates: [
    {
      id: 'cand-1',
      selected: true,
      word: 'resilience',
      phonetic: '/rɪˈzɪliəns/',
      partOfSpeech: 'n.',
      meaningZh: 'n. 韧性；恢复力；弹性',
      matchStatus: 'dict',
      providerLabel: '大学英语六级 CET-6',
    },
    {
      id: 'cand-2',
      selected: true,
      word: 'unprecedented',
      phonetic: '/ʌnˈpresɪdentɪd/',
      partOfSpeech: 'adj.',
      meaningZh: 'adj. 前所未有的；空前的',
      matchStatus: 'dict',
      providerLabel: '常用英汉词库',
    },
    {
      id: 'cand-3',
      selected: true,
      word: 'alleviate',
      phonetic: '/əˈliːvieɪt/',
      partOfSpeech: 'v.',
      meaningZh: '缓解；减轻',
      matchStatus: 'parsed',
    },
    {
      id: 'cand-4',
      selected: false,
      word: 'sustainable',
      phonetic: '/səˈsteɪnəbl/',
      partOfSpeech: 'adj.',
      meaningZh: '可持续的；能长期维持的',
      matchStatus: 'duplicate',
    },
  ],
  noteSources: [
    {
      path: '词屿/每日词汇/2026-11-27.md',
      title: '2026-11-27',
      category: 'archive',
      totalEntries: 6,
      newEntries: 4,
      selected: true,
    },
    {
      path: '词屿/六级题库/历年真题/2026 年 6 月六级真题 · 第 1 套.md',
      title: '2026 年 6 月六级真题 · 第 1 套',
      category: 'note',
      totalEntries: 5,
      newEntries: 3,
      selected: true,
    },
  ],
  aiAvailable: true,
};

const entryModalState: EntryEditorModalProps = {
  open: false,
  title: '编辑词条',
  values: {
    term: 'sustainable',
    translation: '可持续的；能长期维持的',
    pronunciation: '/səˈsteɪnəbl/',
    partOfSpeech: 'adj.',
    otherMeanings: '生态友好的',
    derivatives: 'sustainability — 可持续性\nsustain — 维持；支撑',
    phrases: 'sustainable development — 可持续发展',
    roots: 'sus-（在下面）+ tain（握住、支撑）',
    examples: 'Sustainable energy reduces carbon emissions. — 可持续能源可减少碳排放。',
    forms: '比较级 more sustainable',
    context: 'Urban planners prioritize sustainable transit networks.',
    note: '六级仔细阅读与环保类作文核心高频词',
  },
};

function openBatchDeleteConfirm(paperIds: string[]): void {
  const targets = sessions
    .flatMap((s) => s.papers)
    .filter((p) => paperIds.includes(p.id) && p.status === 'downloaded')
    .map((p) => ({
      paperId: p.id,
      title: p.title,
      session: p.session,
      notePath: p.notePath ?? `${vaultPaths.papersFolder}/${p.title}.md`,
      hasTranscript: p.id === '202606-1',
      hasOfflineAudio: p.audioStatus === 'local_ready',
      mistakeCount: mistakeState.items.filter((m) => m.paperId === p.id).length,
    }));
  if (!targets.length) return;
  deleteModalState.targets = targets;
  deleteModalState.options = {
    mode: 'trash',
    updateIndexNote: true,
    deleteAssociatedMedia: false,
    deleteAssociatedMistakes: false,
    acknowledgePermanent: false,
  };
  deleteModalState.open = true;
  logEvent('examBank.onRequestBatchDeletePapers', { paperIds: targets.map((t) => t.paperId) });
  syncAll();
}

function executePreviewDelete(paperIds: string[], opts: ExamDeleteOptions): void {
  const deletingSet = new Set(paperIds);
  const snapshot: Cet6PaperSummary[] = [];
  for (const s of sessions) {
    for (const p of s.papers) {
      if (deletingSet.has(p.id) && p.status === 'downloaded') {
        snapshot.push({ ...p });
        p.status = 'not_downloaded';
        p.notePath = undefined;
        if (opts.deleteAssociatedMedia) {
          p.audioStatus = 'link_only';
          p.audioFilePath = undefined;
          p.transcriptNotePath = undefined;
        }
      }
    }
  }
  if (opts.deleteAssociatedMistakes) {
    mistakeState.items = mistakeState.items.filter((m) => !deletingSet.has(m.paperId));
  }
  lastDeletedSnapshot = opts.mode === 'trash' ? snapshot : null;
  const bank = sidebarState.examBank!;
  bank.downloadedCount = countDownloaded();
  bank.overallStatus = computeOverallStatus();
  bank.selectedPaperIds = bank.selectedPaperIds.filter((id) => !deletingSet.has(id));
  bank.justImported = null;
  bank.justDeleted = {
    count: snapshot.length,
    mode: opts.mode,
    canUndo: opts.mode === 'trash' && snapshot.length > 0,
  };
  deleteModalState.open = false;
  logEvent('examBank.onConfirmDelete', { count: snapshot.length, options: opts });
  syncAll();
}

let popoverVisible = false;
let popoverEntry: WordEntry = { ...SYNTHETIC_WORD_BANK['sustainable'] };
let popoverPos = { x: 260, y: 180 };

function logEvent(name: string, payload?: unknown): void {
  const elLog = document.getElementById('pv-event-log');
  if (elLog) {
    elLog.textContent = `callback → ${name}${
      payload !== undefined ? ' ' + JSON.stringify(payload) : ''
    }`;
  }
}

function addMistakeRecord(params: {
  paperId: string;
  questionNumber: number;
  blockId: string;
  questionType: MistakeQuestionType;
  stemPreview: string;
  myAnswer: string;
  correctAnswer: string;
}): void {
  if (mistakeState.items.some((m) => m.questionBlockId === params.blockId)) return;
  const typeLabelMap: Record<MistakeQuestionType, string> = {
    listening: '听力理解',
    banked_cloze: '选词填空',
    matching: '段落匹配',
    careful_reading: '仔细阅读',
    writing_translation: '写作与翻译',
  };
  const paperTitle = '2026 年 6 月六级真题 · 第 1 套';
  const mistakeBlockId = `mistake-${params.paperId}-q${params.questionNumber}`;
  const item: MistakeEntryItem = {
    id: `m-${Date.now()}-${params.questionNumber}`,
    mistakeBlockId,
    questionBlockId: params.blockId,
    paperId: params.paperId,
    paperTitle,
    paperNotePath: `${vaultPaths.papersFolder}/${paperTitle}.md`,
    session: '2026 年 6 月',
    setLabel: '第 1 套',
    questionNumber: params.questionNumber,
    questionType: params.questionType,
    questionTypeLabel: typeLabelMap[params.questionType],
    stemPreview: params.stemPreview,
    myAnswer: params.myAnswer || '未作答',
    correctAnswer: params.correctAnswer,
    note: '',
    status: 'reviewing',
    backToQuestionWikiLink: `[[${paperTitle}#^${params.blockId}|回到原题]]`,
    viewMistakeWikiLink: `[[六级错题索引#^${mistakeBlockId}|查看错题记录]]`,
    createdAt: '2026-11-27',
  };
  mistakeState.items = [item, ...mistakeState.items];
  logEvent('mistakes.onAddQuestion', {
    questionNumber: params.questionNumber,
    questionBlockId: params.blockId,
    mistakeBlockId,
  });
}

/** 模拟核心闭环：一键下载并导入文字版 → 自动创建目录并显示真题索引 + 打开试卷入口 */
function runImportPapers(paperIds: string[]): void {
  if (paperIds.length === 0) return;
  if (batchTimer) window.clearInterval(batchTimer);

  const bank = sidebarState.examBank!;
  bank.duplicateClickNotice = null;
  bank.overallStatus = 'downloading';
  bank.progressPercent = 25;
  bank.progressText = `正在自动创建「${vaultPaths.rootFolder}/六级题库」目录并下载排版 1 / ${paperIds.length} 套…`;
  for (const s of sessions) {
    for (const p of s.papers) {
      if (paperIds.includes(p.id) && p.status !== 'downloaded') {
        p.status = 'downloading';
      }
    }
  }
  syncAll();

  let pct = 25;
  batchTimer = window.setInterval(() => {
    pct = Math.min(100, pct + 40);
    bank.progressPercent = pct;
    bank.progressText = `正在写入 Markdown 真题与更新「真题索引.md」 (${pct}%)…`;
    if (pct >= 100) {
      if (batchTimer) window.clearInterval(batchTimer);
      batchTimer = null;
      for (const s of sessions) {
        for (const p of s.papers) {
          if (paperIds.includes(p.id)) {
            p.status = 'downloaded';
            p.audioStatus = 'local_ready';
            p.notePath = `${vaultPaths.papersFolder}/${p.title}.md`;
            p.errorMessage = undefined;
          }
        }
      }
      const firstId = paperIds[0];
      const firstPaper = sessions.flatMap((s) => s.papers).find((p) => p.id === firstId);
      bank.downloadedCount = countDownloaded();
      bank.overallStatus = computeOverallStatus();
      bank.selectedPaperIds = [];
      bank.justImported = {
        count: paperIds.length,
        primaryPaperId: firstId,
        primaryPaperTitle: firstPaper?.title ?? '六级真题',
        indexNotePath: vaultPaths.examIndexNote,
      };
      // 导入完成后主阅读区自动展示可点击的真题索引！
      mainStage = 'index';
      workspaceState.mode = 'index';
      logEvent('examBank.onImportComplete', {
        importedCount: paperIds.length,
        indexNote: vaultPaths.examIndexNote,
      });
    }
    syncAll();
  }, 360);
}

function handleLookupSelection(term: string, contextSentence: string, rect?: DOMRect): void {
  const clean = term.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '');
  const found = SYNTHETIC_WORD_BANK[clean] ?? SYNTHETIC_WORD_BANK[clean.toLowerCase()];
  popoverEntry = found
    ? { ...found, sourceSentence: contextSentence || found.sourceSentence }
    : {
        id: `sel-${Date.now()}`,
        term: term.trim(),
        kind: term.trim().split(/\s+/).length >= 4 ? 'sentence' : 'word',
        phoneticUs: '/ˈsæm.pəl/',
        partsOfSpeech: ['n. / adj.'],
        lookupProvider: '离线六级词库（模拟）',
        senses: [{ partOfSpeech: '释义', meaningZh: `「${term.trim()}」的模拟上下文释义` }],
        derivatives: [],
        collocations: [],
        examples: [],
        sourceSentence: contextSentence,
        sourceNotePath: workspaceState.activePaper?.notePath,
      };
  popoverVisible = true;
  if (rect) {
    popoverPos = {
      x: Math.max(12, Math.min(rect.left, window.innerWidth - 392)),
      y: Math.max(54, Math.min(rect.bottom + 8, window.innerHeight - 340)),
    };
  }
  logEvent('onLookupSelection', { term });
  syncAll();
}

/* ==================== 搭建双栏预览 DOM ==================== */

const app = document.getElementById('preview-app')!;

const toolbar = document.createElement('header');
toolbar.className = 'pv-toolbar';
toolbar.innerHTML = `
  <div class="pv-group">
    <span class="pv-title">词屿 v0.5 · 六级全链路闭环预览</span>
    <button type="button" class="pv-btn" data-theme="light">浅色</button>
    <button type="button" class="pv-btn" data-theme="dark">深色</button>
    <button type="button" class="pv-btn" id="pv-glass-btn">Liquid Glass：开</button>
    <button type="button" class="pv-btn" data-stage="index">主区：真题索引</button>
    <button type="button" class="pv-btn" data-stage="paper">主区：忠实原卷</button>
    <button type="button" class="pv-btn" data-stage="listening">主区：三模精听对照</button>
    <button type="button" class="pv-btn" data-stage="mistakes">主区：错题本双向跳转</button>
  </div>
  <div class="pv-group">
    <button type="button" class="pv-btn" data-width="360">侧栏 360px</button>
    <button type="button" class="pv-btn" data-width="320">窄栏 320px</button>
    <select class="pv-select" id="pv-preset" aria-label="快速切换闭环状态">
      <option value="">快速切换闭环演示状态…</option>
      <option value="bank-imported-cta">1. 题库选卷 · 导入成功（显示打开试卷/打开索引）</option>
      <option value="batch-delete-confirm">1. 批量删除真题 · 确定删除与关联清理选项弹窗</option>
      <option value="batch-delete-permanent">1. 批量删除真题 · 彻底删除二次确认保护</option>
      <option value="bank-duplicate">1. 题库选卷 · 重复点击防覆盖提示</option>
      <option value="paper-faithful">2. 忠实原卷 · 完整题型与卷首目录</option>
      <option value="paper-graded">2. 忠实原卷 · 交卷判分与一键加错题</option>
      <option value="listen-selfcheck-graded">3. 扩展内听力自查 · 即时核对得分与错题入本</option>
      <option value="listen-blind">3. 听力自查 · 模式 1：盲听自查</option>
      <option value="listen-en-sentence">3. 听力自查 · 模式 2：英文对照（句级跳播）</option>
      <option value="listen-bilingual">3. 听力自查 · 模式 3：中英对照（逐句对齐）</option>
      <option value="listen-missing-zh">3. 听力自查 · 段落级时间戳 & 缺译文标明</option>
      <option value="listen-no-ts">3. 听力自查 · 无时间戳整轨精读</option>
      <option value="sidebar-narrow-listen">3. 窄侧栏 360px ·「自查题目 / 原文 / 中英」切换</option>
      <option value="mistakes-jump">4. 错题本 · 稳定块 ID 与回到原题</option>
      <option value="redrawn-dictionaries">5. 风格统一重绘 · 离线词库（Apple 分组卡片）</option>
      <option value="redrawn-notes">5. 风格统一重绘 · 词屿笔记工作台与每日归档</option>
      <option value="redrawn-entry-modal">5. 风格统一重绘 · 词条完整编辑弹窗</option>
    </select>
  </div>
`;

const workbench = document.createElement('div');
workbench.className = 'pv-workbench';

const mainSlot = document.createElement('main');
mainSlot.className = 'pv-main-slot';
const mainLeaf = document.createElement('div');
mainLeaf.className = 'ciyu-ui ciyu-workspace-leaf';
const mainInner = document.createElement('div');
mainInner.className = 'ciyu-workspace-inner';
mainLeaf.appendChild(mainInner);
mainSlot.appendChild(mainLeaf);

const sidebarSlot = document.createElement('div');
sidebarSlot.className = 'pv-sidebar-slot';

workbench.append(mainSlot, sidebarSlot);

const eventBar = document.createElement('footer');
eventBar.className = 'pv-event-bar';
eventBar.innerHTML = `
  <span class="pv-event-log" id="pv-event-log">闭环路径：右侧勾选套卷 → 点击「下载并导入文字版」→ 打开试卷 → 逐段精听 → 加入错题 → 点击「回到原题」</span>
  <span>主阅读区约 800px + 窄侧栏 360px · <code>.ciyu-ui</code></span>
`;

app.append(toolbar, workbench, eventBar);

/* ==================== 共享回调定义 ==================== */

const listeningCallbacks = {
  onOpenReader(paperId: string) {
    mainStage = 'paper';
    workspaceState.mode = 'paper';
    logEvent('listening.onOpenReader', { paperId });
    syncAll();
  },
  onChangeSection(sec: 'A' | 'B' | 'C') {
    listeningState.activeSection = sec;
    const grp = listeningState.groups.find((g) => g.section === sec);
    if (grp) {
      listeningState.activeGroupId = grp.id;
      listeningState.activeSegmentId = grp.segments[0]?.id ?? null;
      listeningState.activeSentenceId = grp.segments[0]?.sentences?.[0]?.id ?? null;
    }
    listeningState.answersExpanded = false;
    logEvent('listening.onChangeSection', { section: sec });
    syncAll();
  },
  onSelectGroup(groupId: string) {
    listeningState.activeGroupId = groupId;
    const grp = listeningState.groups.find((g) => g.id === groupId);
    listeningState.activeSegmentId = grp?.segments[0]?.id ?? null;
    listeningState.activeSentenceId = grp?.segments[0]?.sentences?.[0]?.id ?? null;
    listeningState.answersExpanded = false;
    logEvent('listening.onSelectGroup', { groupId });
    syncAll();
  },
  onChangeTranscriptMode(mode: ListeningIntensiveProps['transcriptMode']) {
    listeningState.transcriptMode = mode;
    if (mode === 'en') listeningState.narrowPane = 'en';
    if (mode === 'bilingual') listeningState.narrowPane = 'bilingual';
    logEvent('listening.onChangeTranscriptMode', { mode });
    syncAll();
  },
  onToggleHideChinese(hide: boolean) {
    listeningState.hideChineseInBilingual = hide;
    logEvent('listening.onToggleHideChinese', { hide });
    syncAll();
  },
  onChangeNarrowPane(pane: ListeningIntensiveProps['narrowPane']) {
    listeningState.narrowPane = pane;
    logEvent('listening.onChangeNarrowPane', {
      pane,
      preservedTimeSec: listeningState.currentTimeSec,
      preservedSegmentId: listeningState.activeSegmentId,
    });
    syncAll();
  },
  onTogglePlay() {
    listeningState.playing = !listeningState.playing;
    if (playTimer) {
      window.clearInterval(playTimer);
      playTimer = null;
    }
    if (listeningState.playing) {
      playTimer = window.setInterval(() => {
        listeningState.currentTimeSec += listeningState.playbackRate;
        if (listeningState.currentTimeSec >= listeningState.durationSec) {
          listeningState.currentTimeSec = 0;
        }
        const grp = listeningState.groups.find((g) => g.id === listeningState.activeGroupId);
        if (grp) {
          for (const seg of grp.segments) {
            if (
              typeof seg.startSec === 'number' &&
              typeof seg.endSec === 'number' &&
              listeningState.currentTimeSec >= seg.startSec &&
              listeningState.currentTimeSec < seg.endSec
            ) {
              listeningState.activeSegmentId = seg.id;
              const sent = seg.sentences?.find(
                (sn) =>
                  typeof sn.startSec === 'number' &&
                  typeof sn.endSec === 'number' &&
                  listeningState.currentTimeSec >= sn.startSec &&
                  listeningState.currentTimeSec < sn.endSec
              );
              if (sent) listeningState.activeSentenceId = sent.id;
            }
          }
        }
        syncAll();
      }, 1000);
    }
    logEvent('listening.onTogglePlay', { playing: listeningState.playing });
    syncAll();
  },
  onStepSkip(deltaSec: number) {
    listeningState.currentTimeSec = Math.max(
      0,
      Math.min(listeningState.durationSec, listeningState.currentTimeSec + deltaSec)
    );
    logEvent('listening.onStepSkip', { deltaSec, currentTimeSec: listeningState.currentTimeSec });
    syncAll();
  },
  onSeek(timeSec: number) {
    listeningState.currentTimeSec = timeSec;
    logEvent('listening.onSeek', { timeSec });
    syncAll();
  },
  onChangeRate(rate: 0.75 | 1 | 1.25 | 1.5) {
    listeningState.playbackRate = rate;
    logEvent('listening.onChangeRate', { rate });
    syncAll();
  },
  onSelectSegment(segmentId: string) {
    listeningState.activeSegmentId = segmentId;
    logEvent('listening.onSelectSegment', { segmentId });
    syncAll();
  },
  onSelectSentence(segmentId: string, sentenceId: string, startSec?: number) {
    listeningState.activeSegmentId = segmentId;
    listeningState.activeSentenceId = sentenceId;
    if (typeof startSec === 'number') listeningState.currentTimeSec = startSec;
    logEvent('listening.onSelectSentence', { segmentId, sentenceId, startSec });
    syncAll();
  },
  onReplaySegment(segmentId: string) {
    listeningState.activeSegmentId = segmentId;
    const grp = listeningState.groups.find((g) => g.id === listeningState.activeGroupId);
    const seg = grp?.segments.find((s) => s.id === segmentId);
    if (typeof seg?.startSec === 'number') listeningState.currentTimeSec = seg.startSec;
    logEvent('listening.onReplaySegment', { segmentId });
    syncAll();
  },
  onToggleLoopSegment(segmentId: string) {
    listeningState.loopSegmentId =
      listeningState.loopSegmentId === segmentId ? null : segmentId;
    logEvent('listening.onToggleLoopSegment', { segmentId });
    syncAll();
  },
  onDownloadTranscriptMarkdown(paperId: string) {
    const savedPath = `${vaultPaths.transcriptsFolder}/2026 年 6 月六级真题 · 第 1 套-听力原文.md`;
    listeningState.transcriptDownloadStatus = 'saved';
    listeningState.transcriptSavedPath = savedPath;
    if (workspaceState.activePaper) {
      workspaceState.activePaper.transcriptNotePath = savedPath;
      workspaceState.activePaper.listening.transcriptSaved = true;
    }
    logEvent('listening.onDownloadTranscriptMarkdown', { paperId, savedPath });
    syncAll();
  },
  onOpenSavedTranscriptNote(notePath: string) {
    logEvent('listening.onOpenSavedTranscriptNote', { notePath });
  },
  onDownloadAudioOffline(paperId: string) {
    const audioPath = `${vaultPaths.audioFolder}/${paperId}.mp3`;
    listeningState.audioDownloadStatus = 'saved';
    listeningState.audioSavedPath = audioPath;
    if (workspaceState.activePaper) {
      workspaceState.activePaper.audioFilePath = audioPath;
      workspaceState.activePaper.listening.audioSaved = true;
    }
    logEvent('listening.onDownloadAudioOffline', { paperId, audioPath });
    syncAll();
  },
  onSelectOption(qNo: number, key: 'A' | 'B' | 'C' | 'D') {
    for (const g of listeningState.groups) {
      for (const q of g.questions) {
        if (q.number === qNo) q.selectedKey = key;
      }
    }
    logEvent('listening.onSelectOption', { qNo, key });
    syncAll();
  },
  onSelectPaper(paperId: string) {
    const found = sessions.flatMap((s) => s.papers).find((p) => p.id === paperId);
    listeningState.paperId = paperId;
    if (found) listeningState.paperTitle = found.title;
    listeningState.selfCheck = { checkedGroupIds: [], fullSubmitted: false };
    logEvent('listening.onSelectPaper', { paperId });
    syncAll();
  },
  onSubmitGroupSelfCheck(groupId: string) {
    const cur = listeningState.selfCheck ?? { checkedGroupIds: [], fullSubmitted: false };
    if (!cur.checkedGroupIds.includes(groupId)) {
      cur.checkedGroupIds = [...cur.checkedGroupIds, groupId];
    }
    listeningState.selfCheck = { ...cur };
    logEvent('listening.onSubmitGroupSelfCheck', { groupId });
    syncAll();
  },
  onResetGroupSelfCheck(groupId: string) {
    const cur = listeningState.selfCheck ?? { checkedGroupIds: [], fullSubmitted: false };
    listeningState.selfCheck = {
      checkedGroupIds: cur.checkedGroupIds.filter((id) => id !== groupId),
      fullSubmitted: false,
    };
    const grp = listeningState.groups.find((g) => g.id === groupId);
    grp?.questions.forEach((q) => {
      q.selectedKey = undefined;
    });
    logEvent('listening.onResetGroupSelfCheck', { groupId });
    syncAll();
  },
  onSubmitFullSelfCheck() {
    listeningState.selfCheck = {
      checkedGroupIds: listeningState.groups.map((g) => g.id),
      fullSubmitted: true,
    };
    logEvent('listening.onSubmitFullSelfCheck');
    syncAll();
  },
  onResetFullSelfCheck() {
    listeningState.selfCheck = { checkedGroupIds: [], fullSubmitted: false };
    listeningState.groups.forEach((g) => g.questions.forEach((q) => (q.selectedKey = undefined)));
    logEvent('listening.onResetFullSelfCheck');
    syncAll();
  },
  onAddWrongListeningToMistakes(questions: ListeningIntensiveProps['groups'][0]['questions']) {
    for (const q of questions) {
      addMistakeRecord({
        paperId: listeningState.paperId,
        questionNumber: q.number,
        blockId: q.blockId,
        questionType: 'listening',
        stemPreview: `${q.number}. ${q.stem}`,
        myAnswer: q.selectedKey ?? '未作答',
        correctAnswer: q.answerKey,
      });
    }
    syncAll();
  },
  onPasteTranscript(paperId: string, rawTranscript: string) {
    logEvent('listening.onPasteTranscript', { paperId, length: rawTranscript.length });
    syncAll();
  },
  onJumpToQuestion(questionNumber: number, blockId: string) {
    listeningState.narrowPane = 'questions';
    listeningState.highlightedQuestionBlockId = blockId;
    logEvent('listening.onJumpToQuestion', { questionNumber, blockId });
    syncAll();
  },
  onJumpToSegment(segmentId: string) {
    listeningState.activeSegmentId = segmentId;
    if (listeningState.transcriptMode === 'blind') {
      listeningState.transcriptMode = 'en';
    }
    if (listeningState.narrowPane === 'questions') {
      listeningState.narrowPane =
        listeningState.transcriptMode === 'bilingual' ? 'bilingual' : 'en';
    }
    logEvent('listening.onJumpToSegment', { segmentId });
    syncAll();
  },
  onAddMistake(q: ListeningIntensiveProps['groups'][0]['questions'][0], qType: MistakeQuestionType) {
    addMistakeRecord({
      paperId: listeningState.paperId,
      questionNumber: q.number,
      blockId: q.blockId,
      questionType: qType,
      stemPreview: `${q.number}. ${q.stem}`,
      myAnswer: q.selectedKey ?? '未作答',
      correctAnswer: q.answerKey,
    });
    syncAll();
  },
  onViewMistakeRecord(ref: MistakeLinkRef) {
    mistakeState.highlightedMistakeBlockId = ref.mistakeBlockId;
    mainStage = 'mistakes';
    sidebarState.examSubView = 'mistakes';
    logEvent('onViewMistakeRecord', {
      mistakeBlockId: ref.mistakeBlockId,
      wikiLink: ref.mistakeWikiLink,
    });
    syncAll();
  },
  onToggleAnswers(expanded: boolean) {
    listeningState.answersExpanded = expanded;
    syncAll();
  },
  onLookupSelection: handleLookupSelection,
};

const workspaceCallbacks = {
  onChangeMode(mode: 'index' | 'paper') {
    workspaceState.mode = mode;
    mainStage = mode;
    syncAll();
  },
  onFilterChange(filter: ExamWorkspaceProps['filter']) {
    workspaceState.filter = filter;
    syncAll();
  },
  onSearchChange(query: string) {
    workspaceState.searchQuery = query;
    syncAll();
  },
  onOpenMistakeBook() {
    mainStage = 'mistakes';
    sidebarState.examSubView = 'mistakes';
    syncAll();
  },
  onSelectPaper(paperId: string) {
    workspaceState.mode = 'paper';
    workspaceState.highlightedQuestionBlockId = null;
    mainStage = 'paper';
    logEvent('examWorkspace.onSelectPaper', { paperId });
    syncAll();
  },
  onOpenPaperListening(paperId: string, groupId?: string) {
    if (groupId) listeningState.activeGroupId = groupId;
    mainStage = 'listening';
    logEvent('examWorkspace.onOpenPaperListening', { paperId, groupId });
    syncAll();
  },
  onOpenLocalNote(notePath: string) {
    logEvent('examWorkspace.onOpenLocalNote', { notePath });
  },
  onJumpSection(section: ExamWorkspaceProps['activeSection']) {
    workspaceState.activeSection = section;
    logEvent('examWorkspace.onJumpSection', { section });
    syncAll();
  },
  onToggleEmbeddedPlay() {
    if (!workspaceState.activePaper) return;
    workspaceState.activePaper.listening.playing =
      !workspaceState.activePaper.listening.playing;
    logEvent('examWorkspace.onToggleEmbeddedPlay', {
      playing: workspaceState.activePaper.listening.playing,
    });
    syncAll();
  },
  onStepEmbeddedAudio(delta: number) {
    if (!workspaceState.activePaper) return;
    const cur = workspaceState.activePaper.listening.currentTimeSec ?? 18;
    const tot = workspaceState.activePaper.listening.durationSec ?? 48;
    workspaceState.activePaper.listening.currentTimeSec = Math.max(
      0,
      Math.min(tot, cur + delta)
    );
    syncAll();
  },
  onDownloadTranscriptMarkdown: listeningCallbacks.onDownloadTranscriptMarkdown,
  onDownloadAudioOffline: listeningCallbacks.onDownloadAudioOffline,
  onAnswerObjective(questionNumber: number, answerKey: string) {
    const p = workspaceState.activePaper;
    if (!p) return;
    for (const g of p.listening.groups) {
      for (const q of g.questions) {
        if (q.number === questionNumber) q.selectedKey = answerKey as any;
      }
    }
    for (const bq of p.bankedCloze.questions) {
      if (bq.number === questionNumber) bq.selectedKey = answerKey;
    }
    for (const mq of p.matching.questions) {
      if (mq.number === questionNumber) mq.selectedKey = answerKey;
    }
    for (const ps of p.carefulReading.passages) {
      for (const q of ps.questions) {
        if (q.number === questionNumber) q.selectedKey = answerKey as any;
      }
    }
    logEvent('examWorkspace.onAnswerObjective', { questionNumber, answerKey });
    syncAll();
  },
  onSubmitGrading() {
    workspaceState.graded = true;
    logEvent('examWorkspace.onSubmitGrading');
    syncAll();
  },
  onAddAllWrongToMistakes() {
    const p = workspaceState.activePaper;
    if (!p) return;
    for (const g of p.listening.groups) {
      for (const q of g.questions) {
        if (q.selectedKey && q.selectedKey !== q.answerKey) {
          addMistakeRecord({
            paperId: p.paperId,
            questionNumber: q.number,
            blockId: q.blockId,
            questionType: 'listening',
            stemPreview: `${q.number}. ${q.stem}`,
            myAnswer: q.selectedKey,
            correctAnswer: q.answerKey,
          });
        }
      }
    }
    for (const bq of p.bankedCloze.questions) {
      if (bq.selectedKey && bq.selectedKey !== bq.answerKey) {
        addMistakeRecord({
          paperId: p.paperId,
          questionNumber: bq.number,
          blockId: bq.blockId,
          questionType: 'banked_cloze',
          stemPreview: `选词填空第 〔${bq.number}〕 空`,
          myAnswer: bq.selectedKey,
          correctAnswer: `${bq.answerKey} (${bq.answerWord})`,
        });
      }
    }
    for (const ps of p.carefulReading.passages) {
      for (const q of ps.questions) {
        if (q.selectedKey && q.selectedKey !== q.answerKey) {
          addMistakeRecord({
            paperId: p.paperId,
            questionNumber: q.number,
            blockId: q.blockId,
            questionType: 'careful_reading',
            stemPreview: `${q.number}. ${q.stem}`,
            myAnswer: q.selectedKey,
            correctAnswer: q.answerKey,
          });
        }
      }
    }
    logEvent('examWorkspace.onAddAllWrongToMistakes');
    syncAll();
  },
  onAddQuestionToMistakes: addMistakeRecord,
  onViewMistakeRecord: listeningCallbacks.onViewMistakeRecord,
  onToggleAnswers(expanded: boolean) {
    workspaceState.answersExpanded = expanded;
    syncAll();
  },
  onLookupSelection: handleLookupSelection,
};

const mistakeCallbacks = {
  onOpenMistakeIndexNote(notePath: string) {
    logEvent('mistakes.onOpenMistakeIndexNote', { notePath });
  },
  onSessionFilterChange(s: string) {
    mistakeState.sessionFilter = s;
    syncAll();
  },
  onTypeFilterChange(t: MistakeBookProps['typeFilter']) {
    mistakeState.typeFilter = t;
    syncAll();
  },
  onStatusFilterChange(st: MistakeBookProps['statusFilter']) {
    mistakeState.statusFilter = st;
    syncAll();
  },
  onJumpToOriginalQuestion(item: MistakeEntryItem) {
    // 从错题条目精确跳回原题 #^questionBlockId 段落！
    workspaceState.mode = 'paper';
    workspaceState.highlightedQuestionBlockId = item.questionBlockId;
    mainStage = 'paper';
    if (sidebarState.examSubView === 'mistakes') {
      sidebarState.examSubView = 'paper';
    }
    logEvent('mistakes.onJumpToOriginalQuestion', {
      wikiLink: item.backToQuestionWikiLink,
      targetBlockId: item.questionBlockId,
    });
    syncAll();
  },
  onToggleMistakeStatus(id: string, nextStatus: 'reviewing' | 'mastered') {
    mistakeState.items = mistakeState.items.map((m) =>
      m.id === id ? { ...m, status: nextStatus } : m
    );
    logEvent('mistakes.onToggleMistakeStatus', { id, nextStatus });
    syncAll();
  },
  onUpdateMistakeNote(id: string, note: string) {
    mistakeState.items = mistakeState.items.map((m) =>
      m.id === id ? { ...m, note } : m
    );
    logEvent('mistakes.onUpdateMistakeNote', { id, note });
    syncAll();
  },
  onRemoveMistake(id: string) {
    mistakeState.items = mistakeState.items.filter((m) => m.id !== id);
    syncAll();
  },
};

const mainWorkspaceHandle = createExamWorkspaceView(workspaceState, workspaceCallbacks);
const mainListeningHandle = createListeningIntensiveView(listeningState, listeningCallbacks);
const mainMistakesHandle = createMistakeBookView(mistakeState, mistakeCallbacks);
mainInner.append(
  mainWorkspaceHandle.element,
  mainListeningHandle.element,
  mainMistakesHandle.element
);

const sidebarHandle = createCiyuSidebar(sidebarState, {
  onTabChange(tab) {
    sidebarState.activeTab = tab;
    syncAll();
  },
  onExamSubViewChange(subView) {
    sidebarState.examSubView = subView;
    logEvent('sidebar.onExamSubViewChange', { subView });
    syncAll();
  },
  onToggleLiquidGlass(enabled) {
    sidebarState.preferences.liquidGlass = enabled;
    sidebarState.preferences.reducedTransparency = !enabled;
    sidebarState.settings.preferences.liquidGlass = enabled;
    sidebarState.settings.preferences.reducedTransparency = !enabled;
    syncAll();
  },
  renderDictionaries(root) {
    const handle = createDictionaryPacksView(
      { packs: previewPacks },
      {
        onSetPrimary(packId) {
          previewPacks = previewPacks
            .map((p) => ({ ...p, isPrimary: p.id === packId, enabled: p.id === packId ? true : p.enabled }))
            .sort((a, b) => (a.isPrimary ? -1 : b.isPrimary ? 1 : 0));
          sidebarState.dictionaryKey = JSON.stringify(previewPacks);
          syncAll();
        },
        onAddPack(packId) {
          const anyPrimary = previewPacks.some((p) => p.isPrimary && p.enabled);
          previewPacks = previewPacks.map((p) =>
            p.id === packId ? { ...p, enabled: true, isPrimary: !anyPrimary } : p
          );
          sidebarState.dictionaryKey = JSON.stringify(previewPacks);
          syncAll();
        },
        onRemovePack(packId) {
          previewPacks = previewPacks.map((p) =>
            p.id === packId ? { ...p, enabled: false, isPrimary: false } : p
          );
          const firstEnabled = previewPacks.find((p) => p.enabled);
          if (firstEnabled && !previewPacks.some((p) => p.isPrimary)) {
            firstEnabled.isPrimary = true;
          }
          sidebarState.dictionaryKey = JSON.stringify(previewPacks);
          syncAll();
        },
      }
    );
    root.appendChild(handle.element);
  },
  renderNotes(root) {
    const handle = createStudyNotesManagerView(
      {
        notes: previewStudyNotes,
        canUndo: previewTrashedNoteStack.length > 0,
      },
      {
        onCreateNote(title) {
          previewStudyNotes = [
            { path: `词屿/笔记/${title}.md`, basename: title, group: 'study' },
            ...previewStudyNotes,
          ];
          sidebarState.notesKey = JSON.stringify([previewStudyNotes, previewTrashedNoteStack.length]);
          syncAll();
        },
        onUndoLastAction() {
          const restored = previewTrashedNoteStack.pop();
          if (restored) {
            previewStudyNotes = [restored, ...previewStudyNotes];
            sidebarState.notesKey = JSON.stringify([previewStudyNotes, previewTrashedNoteStack.length]);
            syncAll();
          }
        },
        onOpenNote(path) {
          logEvent('notes.onOpenNote', { path });
        },
        onTrashNote(item) {
          previewTrashedNoteStack.push(item);
          previewStudyNotes = previewStudyNotes.filter((n) => n.path !== item.path);
          sidebarState.notesKey = JSON.stringify([previewStudyNotes, previewTrashedNoteStack.length]);
          syncAll();
        },
      }
    );
    root.appendChild(handle.element);
  },
  examBank: {
    onTogglePaperSelect(paperId, selected) {
      const set = new Set(sidebarState.examBank!.selectedPaperIds);
      if (selected) set.add(paperId);
      else set.delete(paperId);
      sidebarState.examBank!.selectedPaperIds = Array.from(set);
      syncAll();
    },
    onToggleSessionSelect(sessionId, selected) {
      const s = sessions.find((it) => it.sessionId === sessionId);
      if (!s) return;
      const set = new Set(sidebarState.examBank!.selectedPaperIds);
      for (const p of s.papers) {
        if (selected) set.add(p.id);
        else set.delete(p.id);
      }
      sidebarState.examBank!.selectedPaperIds = Array.from(set);
      syncAll();
    },
    onSelectAllPapers() {
      sidebarState.examBank!.selectedPaperIds = sessions.flatMap((s) =>
        s.papers.map((p) => p.id)
      );
      syncAll();
    },
    onSelectImportedPapers() {
      sidebarState.examBank!.selectedPaperIds = sessions
        .flatMap((s) => s.papers)
        .filter((p) => p.status === 'downloaded')
        .map((p) => p.id);
      syncAll();
    },
    onClearSelection() {
      sidebarState.examBank!.selectedPaperIds = [];
      syncAll();
    },
    onRequestBatchDeletePapers(paperIds) {
      openBatchDeleteConfirm(paperIds);
    },
    onRequestDeleteSinglePaper(paperId) {
      openBatchDeleteConfirm([paperId]);
    },
    onUndoLastDelete() {
      if (lastDeletedSnapshot) {
        for (const snap of lastDeletedSnapshot) {
          const target = sessions.flatMap((s) => s.papers).find((p) => p.id === snap.id);
          if (target) Object.assign(target, snap);
        }
        lastDeletedSnapshot = null;
      }
      sidebarState.examBank!.justDeleted = null;
      sidebarState.examBank!.downloadedCount = countDownloaded();
      sidebarState.examBank!.overallStatus = computeOverallStatus();
      logEvent('examBank.onUndoLastDelete');
      syncAll();
    },
    onDismissDeleteNotice() {
      sidebarState.examBank!.justDeleted = null;
      syncAll();
    },
    onDownloadAndImportSelected(paperIds) {
      logEvent('examBank.onDownloadAndImportSelected', { paperIds });
      runImportPapers(paperIds);
    },
    onDownloadAllPapers() {
      const allIds = sessions.flatMap((s) => s.papers.map((p) => p.id));
      logEvent('examBank.onDownloadAllPapers', { count: allIds.length });
      runImportPapers(allIds);
    },
    onDownloadSinglePaper(paperId) {
      const target = sessions.flatMap((s) => s.papers).find((p) => p.id === paperId);
      if (target?.status === 'downloaded') {
        // 重复点击已导入套卷：展示防覆盖保护横幅并提供打开已有笔记入口！
        sidebarState.examBank!.duplicateClickNotice = {
          paperId: target.id,
          title: target.title,
          notePath: target.notePath ?? `${vaultPaths.papersFolder}/${target.title}.md`,
        };
        logEvent('examBank.onDuplicateImportBlocked', { paperId });
        syncAll();
        return;
      }
      runImportPapers([paperId]);
    },
    onDismissDuplicateNotice() {
      sidebarState.examBank!.duplicateClickNotice = null;
      syncAll();
    },
    onRetryFailedPapers(paperIds) {
      runImportPapers(paperIds);
    },
    onPickTargetFolder() {
      rootFolder = rootFolder === '词屿' ? '英语备考/词屿' : '词屿';
      vaultPaths = buildVaultPaths(rootFolder);
      sidebarState.examBank!.vaultPaths = vaultPaths;
      logEvent('examBank.onPickTargetFolder', { rootFolder });
      syncAll();
    },
    onOpenCet6Index() {
      mainStage = 'index';
      workspaceState.mode = 'index';
      syncAll();
    },
    onOpenMistakeBook() {
      mainStage = 'mistakes';
      syncAll();
    },
    onOpenImportModal() {
      modalState.open = true;
      modalState.activeTab = 'import_exam';
      syncAll();
    },
    onOpenPaperReader(paperId) {
      mainStage = 'paper';
      workspaceState.mode = 'paper';
      workspaceState.highlightedQuestionBlockId = null;
      logEvent('examBank.onOpenPaperReader', { paperId });
      syncAll();
    },
    onOpenPaperListening(paperId) {
      mainStage = 'listening';
      logEvent('examBank.onOpenPaperListening', { paperId });
      syncAll();
    },
    onOpenPaperNote(paperId, notePath) {
      logEvent('examBank.onOpenPaperNote', { paperId, notePath });
    },
  },
  examWorkspace: {
    ...workspaceCallbacks,
    onBackToBank() {
      sidebarState.examSubView = 'bank';
      syncAll();
    },
  },
  listening: {
    ...listeningCallbacks,
    onBackToBank() {
      sidebarState.examSubView = 'bank';
      syncAll();
    },
  },
  mistakes: {
    ...mistakeCallbacks,
    onBackToBank() {
      sidebarState.examSubView = 'bank';
      syncAll();
    },
  },
  lookup: {
    onSearch(q) {
      sidebarState.lookup.query = q;
      syncAll();
    },
    onEditAll() {
      entryModalState.open = true;
      entryModalState.title = '编辑词条';
      syncAll();
    },
  },
  vocabulary: {
    onOpenQuickImport() {
      vocabImportState.open = true;
      syncAll();
    },
    async onAutoFillDraft(word) {
      const hit = SYNTHETIC_WORD_BANK[word.toLowerCase()];
      if (!hit) return { phonetic: '/ˈwɜːd/', partOfSpeech: 'n.', meaningZh: `${word} 的离线词库释义` };
      return {
        phonetic: hit.phoneticUs ?? hit.phonetic ?? '',
        partOfSpeech: hit.partsOfSpeech[0] ?? 'n.',
        meaningZh: hit.senses[0]?.meaningZh ?? '',
      };
    },
    onEditItemDetails() {
      entryModalState.open = true;
      entryModalState.title = '编辑生词详情';
      syncAll();
    },
  },
  review: {},
  archive: {},
  settings: {
    onToggleLiquidGlass(enabled) {
      sidebarState.preferences.liquidGlass = enabled;
      sidebarState.preferences.reducedTransparency = !enabled;
      syncAll();
    },
  },
});
sidebarSlot.appendChild(sidebarHandle.element);

const modalHandle = createExamDownloadImportModal(modalState, {
  onClose() {
    modalState.open = false;
    syncAll();
  },
  onTabChange(tab) {
    modalState.activeTab = tab;
    syncAll();
  },
  onRequestBatchDeletePapers(paperIds) {
    modalState.open = false;
    openBatchDeleteConfirm(paperIds);
  },
});
document.body.appendChild(modalHandle.element);

const deleteModalHandle = createExamDeleteConfirmModal(deleteModalState, {
  onClose() {
    deleteModalState.open = false;
    syncAll();
  },
  onOptionsChange(nextOptions) {
    deleteModalState.options = nextOptions;
  },
  onConfirmDelete(paperIds, options) {
    executePreviewDelete(paperIds, options);
  },
});
document.body.appendChild(deleteModalHandle.element);

const entryModalHandle = createEntryEditorModal(entryModalState, {
  onClose() {
    entryModalState.open = false;
    syncAll();
  },
  onSave(values) {
    entryModalState.values = values;
    entryModalState.open = false;
    logEvent('entryModal.onSave', { term: values.term });
    syncAll();
  },
});
document.body.appendChild(entryModalHandle.element);

const vocabImportModalHandle = createVocabularyQuickImportModal(vocabImportState, {
  onClose() {
    vocabImportState.open = false;
    syncAll();
  },
  onTabChange(tab) {
    vocabImportState.activeTab = tab;
    syncAll();
  },
  onToggleCandidate(id, selected) {
    vocabImportState.candidates = vocabImportState.candidates.map((c) =>
      c.id === id ? { ...c, selected } : c
    );
    syncAll();
  },
  onSelectAllValidCandidates(selected) {
    vocabImportState.candidates = vocabImportState.candidates.map((c) =>
      c.matchStatus !== 'duplicate' && c.meaningZh ? { ...c, selected } : c
    );
    syncAll();
  },
  onConfirmImportCandidates() {
    const chosen = vocabImportState.candidates.filter(
      (c) => c.selected && c.matchStatus !== 'duplicate'
    );
    for (const c of chosen) {
      sidebarState.vocabulary.items.unshift({
        id: `imp-${Date.now()}-${c.id}`,
        word: c.word,
        phonetic: c.phonetic,
        partOfSpeech: c.partOfSpeech,
        meaningZh: c.meaningZh,
        dueToday: true,
        nextReviewLabel: '今日新导入',
        createdAt: new Date().toISOString(),
      });
    }
    sidebarState.dueTodayCount = sidebarState.vocabulary.items.length;
    sidebarState.vocabulary.dueTodayCount = sidebarState.vocabulary.items.length;
    vocabImportState.open = false;
    logEvent('vocabulary.onConfirmImportCandidates', { importedCount: chosen.length });
    syncAll();
  },
  onToggleNoteSource(path, selected) {
    vocabImportState.noteSources = vocabImportState.noteSources.map((n) =>
      n.path === path ? { ...n, selected } : n
    );
    syncAll();
  },
  onConfirmImportFromNotes() {
    vocabImportState.open = false;
    logEvent('vocabulary.onConfirmImportFromNotes');
    syncAll();
  },
});
document.body.appendChild(vocabImportModalHandle.element);

const popoverHandle = createSelectionPopover(
  {
    visible: popoverVisible,
    entry: popoverEntry,
    targetNotePath: workspaceState.activePaper!.notePath!,
    selectionLabel: '真题/精听划词翻译',
  },
  {
    onClose() {
      popoverVisible = false;
      syncAll();
    },
    onDragMove(pos) {
      popoverPos = pos;
    },
    onAddToVocabulary(entry) {
      entry.inVocabulary = !entry.inVocabulary;
      logEvent('popover.onAddToVocabulary', { term: entry.term });
      syncAll();
    },
  }
);
popoverHandle.element.classList.add('pv-floating-popover');
document.body.appendChild(popoverHandle.element);

/* ==================== 状态预设切换 ==================== */

function applyPreset(preset: string): void {
  modalState.open = false;
  deleteModalState.open = false;
  entryModalState.open = false;
  sidebarState.activeTab = 'exams';
  sidebarState.examSubView = 'bank';

  switch (preset) {
    case 'bank-imported-cta':
      sidebarState.examBank!.justImported = {
        count: 3,
        primaryPaperId: '202606-1',
        primaryPaperTitle: '2026 年 6 月六级真题 · 第 1 套',
        indexNotePath: vaultPaths.examIndexNote,
      };
      mainStage = 'index';
      workspaceState.mode = 'index';
      break;

    case 'batch-delete-confirm':
      sidebarState.examBank!.selectedPaperIds = ['202606-1', '202606-2'];
      openBatchDeleteConfirm(['202606-1', '202606-2']);
      return;

    case 'batch-delete-permanent':
      sidebarState.examBank!.selectedPaperIds = ['202606-1', '202606-2'];
      openBatchDeleteConfirm(['202606-1', '202606-2']);
      deleteModalState.options = {
        mode: 'permanent',
        updateIndexNote: true,
        deleteAssociatedMedia: true,
        deleteAssociatedMistakes: false,
        acknowledgePermanent: false,
      };
      break;

    case 'listen-selfcheck-graded':
      mainStage = 'listening';
      listeningState.activeSection = 'A';
      listeningState.activeGroupId = 'sec-a-conv-1';
      listeningState.transcriptMode = 'bilingual';
      if (listeningState.groups[0]?.questions[0]) {
        listeningState.groups[0].questions[0].selectedKey =
          listeningState.groups[0].questions[0].answerKey;
      }
      if (listeningState.groups[0]?.questions[1]) {
        listeningState.groups[0].questions[1].selectedKey =
          listeningState.groups[0].questions[1].answerKey === 'A' ? 'B' : 'A';
      }
      listeningState.selfCheck = {
        checkedGroupIds: ['sec-a-conv-1'],
        fullSubmitted: false,
      };
      break;

    case 'redrawn-dictionaries':
      sidebarState.activeTab = 'dictionaries';
      break;

    case 'redrawn-notes':
      sidebarState.activeTab = 'archive';
      break;

    case 'redrawn-entry-modal':
      sidebarState.activeTab = 'lookup';
      entryModalState.open = true;
      break;

    case 'bank-duplicate':
      sidebarState.examBank!.duplicateClickNotice = {
        paperId: '202606-1',
        title: '2026 年 6 月六级真题 · 第 1 套',
        notePath: `${vaultPaths.papersFolder}/2026 年 6 月六级真题 · 第 1 套.md`,
      };
      break;

    case 'paper-faithful':
      mainStage = 'paper';
      workspaceState.mode = 'paper';
      workspaceState.graded = false;
      workspaceState.answersExpanded = false;
      break;

    case 'paper-graded':
      mainStage = 'paper';
      workspaceState.mode = 'paper';
      workspaceState.graded = true;
      break;

    case 'listen-blind':
      mainStage = 'listening';
      listeningState.activeSection = 'A';
      listeningState.activeGroupId = 'sec-a-conv-1';
      listeningState.transcriptMode = 'blind';
      break;

    case 'listen-en-sentence':
      mainStage = 'listening';
      listeningState.activeSection = 'A';
      listeningState.activeGroupId = 'sec-a-conv-1';
      listeningState.transcriptMode = 'en';
      listeningState.activeSentenceId = 'sent-2a';
      break;

    case 'listen-bilingual':
      mainStage = 'listening';
      listeningState.activeSection = 'A';
      listeningState.activeGroupId = 'sec-a-conv-1';
      listeningState.transcriptMode = 'bilingual';
      listeningState.hideChineseInBilingual = false;
      break;

    case 'listen-missing-zh':
      mainStage = 'listening';
      listeningState.activeSection = 'B';
      listeningState.activeGroupId = 'sec-b-pass-1';
      listeningState.transcriptMode = 'bilingual';
      break;

    case 'listen-no-ts':
      mainStage = 'listening';
      listeningState.activeSection = 'C';
      listeningState.activeGroupId = 'sec-c-rec-1';
      listeningState.transcriptMode = 'bilingual';
      break;

    case 'sidebar-narrow-listen':
      sidebarState.activeTab = 'exams';
      sidebarState.examSubView = 'listening';
      listeningState.narrowPane = 'bilingual';
      listeningState.transcriptMode = 'bilingual';
      break;

    case 'mistakes-jump':
      mainStage = 'mistakes';
      sidebarState.examSubView = 'mistakes';
      break;
  }
  syncAll();
}

toolbar.querySelectorAll<HTMLButtonElement>('[data-theme]').forEach((btn) => {
  btn.addEventListener('click', () => {
    themeMode = btn.dataset.theme === 'dark' ? 'dark' : 'light';
    syncAll();
  });
});

toolbar.querySelectorAll<HTMLButtonElement>('[data-width]').forEach((btn) => {
  btn.addEventListener('click', () => {
    sidebarWidth = Number(btn.dataset.width);
    syncAll();
  });
});

toolbar.querySelectorAll<HTMLButtonElement>('[data-stage]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const st = btn.dataset.stage as MainStageMode;
    mainStage = st;
    if (st === 'index' || st === 'paper') workspaceState.mode = st;
    syncAll();
  });
});

document.getElementById('pv-glass-btn')?.addEventListener('click', () => {
  const next = !sidebarState.preferences.liquidGlass;
  sidebarState.preferences.liquidGlass = next;
  sidebarState.preferences.reducedTransparency = !next;
  syncAll();
});

const presetSelect = document.getElementById('pv-preset') as HTMLSelectElement;
presetSelect.addEventListener('change', () => {
  if (presetSelect.value) {
    applyPreset(presetSelect.value);
    presetSelect.value = '';
  }
});

function syncAll(): void {
  document.body.classList.toggle('theme-dark', themeMode === 'dark');
  document.body.classList.toggle('theme-light', themeMode === 'light');
  sidebarSlot.style.width = `${sidebarWidth}px`;

  toolbar.querySelectorAll<HTMLButtonElement>('[data-theme]').forEach((btn) => {
    btn.dataset.active = String(btn.dataset.theme === themeMode);
  });
  toolbar.querySelectorAll<HTMLButtonElement>('[data-width]').forEach((btn) => {
    btn.dataset.active = String(Number(btn.dataset.width) === sidebarWidth);
  });
  toolbar.querySelectorAll<HTMLButtonElement>('[data-stage]').forEach((btn) => {
    btn.dataset.active = String(btn.dataset.stage === mainStage);
  });

  const glassBtn = document.getElementById('pv-glass-btn');
  if (glassBtn) {
    glassBtn.dataset.active = String(sidebarState.preferences.liquidGlass);
    glassBtn.textContent = sidebarState.preferences.liquidGlass
      ? 'Liquid Glass：开'
      : 'Liquid Glass：关';
  }

  const mMap = buildMistakeMap();
  listeningState.mistakeByQuestion = mMap;
  workspaceState.mistakeByQuestion = mMap;
  sidebarState.examBank!.mistakeCount = mistakeState.items.length;

  applyGlassPreferences(mainLeaf, sidebarState.preferences);
  applyGlassPreferences(modalHandle.element, sidebarState.preferences);
  applyGlassPreferences(deleteModalHandle.element, sidebarState.preferences);
  applyGlassPreferences(entryModalHandle.element, sidebarState.preferences);
  applyGlassPreferences(vocabImportModalHandle.element, sidebarState.preferences);
  applyGlassPreferences(popoverHandle.element, {
    ...sidebarState.preferences,
    liquidGlass: false,
    reducedTransparency: true,
    edgeRefraction: false,
  });

  mainWorkspaceHandle.element.hidden = mainStage !== 'index' && mainStage !== 'paper';
  mainListeningHandle.element.hidden = mainStage !== 'listening';
  mainMistakesHandle.element.hidden = mainStage !== 'mistakes';

  workspaceState.mode = mainStage === 'index' ? 'index' : 'paper';
  mainWorkspaceHandle.update({ ...workspaceState });
  mainListeningHandle.update({ ...listeningState });
  mainMistakesHandle.update({ ...mistakeState });

  sidebarState.examBank = {
    ...sidebarState.examBank!,
    sessions: sessions.map((s) => ({ ...s, papers: s.papers.map((p) => ({ ...p })) })),
  };
  sidebarState.examWorkspace = { ...workspaceState };
  sidebarState.listening = { ...listeningState };
  sidebarState.mistakes = { ...mistakeState, items: [...mistakeState.items] };
  sidebarHandle.update({ ...sidebarState });

  modalHandle.update({ ...modalState });
  deleteModalHandle.update({ ...deleteModalState });
  entryModalHandle.update({ ...entryModalState });
  vocabImportModalHandle.update({ ...vocabImportState });

  popoverHandle.element.style.left = `${popoverPos.x}px`;
  popoverHandle.element.style.top = `${popoverPos.y}px`;
  popoverHandle.update({
    visible: popoverVisible,
    entry: popoverEntry,
    targetNotePath: workspaceState.activePaper!.notePath!,
    selectionLabel: '真题/精听划词翻译',
  });
}

const initPreset = params.get('preset');
if (initPreset) applyPreset(initPreset);

syncAll();
