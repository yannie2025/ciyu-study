/**
 * 词屿 (Ciyu) Obsidian 插件 UI — 数据结构、Props 与事件回调契约
 * 供业务逻辑层（Codex）直接对接，不依赖预览环境。
 */

export type CiyuTabId = 'lookup' | 'vocabulary' | 'review' | 'archive' | 'dictionaries' | 'exams' | 'settings';

export type LookupStatus = 'empty' | 'loading' | 'miss' | 'error' | 'success';
export type LookupQueryKind = 'word' | 'phrase' | 'sentence';

export interface WordSense {
  partOfSpeech: string;
  meaningZh: string;
}

export interface WordDerivative {
  word: string;
  partOfSpeech: string;
  meaningZh?: string;
}

export interface WordCollocation {
  phrase: string;
  meaningZh: string;
}

export interface WordEtymology {
  morphemes: string[];
  explanation: string;
}

export interface BilingualExample {
  en: string;
  zh: string;
  highlight?: string;
}

export interface ArchiveMatchRef {
  date: string;
  notePath: string;
  term: string;
  blockId?: string;
  line?: number;
  isToday?: boolean;
}

export interface WordMorphemeModuleItem {
  id: string;
  kind: 'root' | 'derivative';
  label: string;
  meaningZh?: string;
  rawText: string;
  selected: boolean;
}

export interface WordMorphemeAssistState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  modelName?: string;
  errorMessage?: string;
  items: WordMorphemeModuleItem[];
}

export interface WordEntry {
  id: string;
  term: string;
  kind: LookupQueryKind;
  phonetic?: string;
  phoneticUs?: string;
  phoneticUk?: string;
  partsOfSpeech: string[];
  senses: WordSense[];
  derivatives: WordDerivative[];
  collocations: WordCollocation[];
  etymology?: WordEtymology;
  examples: BilingualExample[];
  sourceSentence?: string;
  sourceNotePath?: string;
  note?: string;
  lookupProvider?: string;
  forms?: string[];
  inVocabulary?: boolean;
  savedToday?: boolean;
  archivedMatch?: ArchiveMatchRef | null;
  morphemeAssist?: WordMorphemeAssistState | null;
}

export interface WordEntryEditPatch {
  meaningSummary: string;
  sourceSentence: string;
  note: string;
  roots?: string[];
  derivatives?: string[];
}

/* ==================== 结果卡（查词 & 划词复用） ==================== */

export interface ResultCardProps {
  entry: WordEntry;
  targetNotePath: string;
  detailsExpanded?: boolean;
  isSpeaking?: boolean;
  compact?: boolean;
}

export type NativeDictionary = 'youdao' | 'easydict' | 'apple';

export interface ResultCardCallbacks {
  onSpeak?: (entry: WordEntry) => void;
  onNativeLookup?: (term: string, provider: NativeDictionary) => void;
  onEnrich?: (entry: WordEntry) => void;
  onToggleDetails?: (expanded: boolean) => void;
  onEditAll?: (entry: WordEntry) => void;
  onEditEntry?: (entryId: string, patch: WordEntryEditPatch) => void;
  onInsertToNote?: (entry: WordEntry, targetNotePath: string) => void;
  onAddToVocabulary?: (entry: WordEntry) => void;
  onSaveToToday?: (entry: WordEntry) => void;
  onOpenArchiveMatch?: (match: ArchiveMatchRef) => void;
  onToggleMorphemeModule?: (entryId: string, itemId: string) => void;
  onToggleAllMorphemeModules?: (entryId: string, selected: boolean) => void;
  onRetryMorphemeAssist?: (entry: WordEntry) => void;
  onAddSelectedMorphemes?: (entry: WordEntry, target: 'note' | 'archive') => void;
  onOpenTargetNote?: (notePath: string) => void;
  onOpenSourceNote?: (notePath: string) => void;
}

/* ==================== 1. 查词侧栏 ==================== */

export interface LookupViewProps {
  query: string;
  status: LookupStatus;
  result?: WordEntry | null;
  errorMessage?: string;
  errorDetail?: string;
  checkingDictionary?: boolean;
  sentenceTranslation?: boolean;
  nativeError?: string;
  recentQueries: string[];
  targetNotePath: string;
  detailsExpanded?: boolean;
  isSpeaking?: boolean;
  activeModelName?: string;
}

export interface LookupViewCallbacks extends ResultCardCallbacks {
  onQueryChange?: (query: string) => void;
  onSearch?: (query: string) => void;
  onClearQuery?: () => void;
  onCancelSearch?: () => void;
  onRetrySearch?: (query: string) => void;
  onQuickTranslate?: (query: string) => void;
  onTranslateSentence?: (query: string) => void;
  onSpeakQuery?: (query: string) => void;
  onOpenSettings?: () => void;
  onManualEntry?: () => void;
}

/* ==================== 2. 划词浮窗 ==================== */

export interface SelectionPopoverProps extends ResultCardProps {
  visible: boolean;
  selectionLabel?: string;
}

export interface SelectionPopoverCallbacks extends ResultCardCallbacks {
  onClose?: () => void;
  onPinToSidebar?: (entry: WordEntry) => void;
  onDragMove?: (position: { x: number; y: number }) => void;
}

/* ==================== 3. 生词本列表 ==================== */

export interface VocabularyItem {
  id: string;
  word: string;
  phonetic?: string;
  partOfSpeech: string;
  meaningZh: string;
  sourceSentence?: string;
  sourceNotePath?: string;
  sourceNoteTitle?: string;
  searchableDetails?: string[];
  isSpeaking?: boolean;
  nextReviewLabel: string;
  dueToday: boolean;
  createdAt: string;
}

export interface VocabularyDraft {
  word: string;
  phonetic: string;
  partOfSpeech: string;
  meaningZh: string;
  sourceNotePath: string;
  sourceSentence: string;
}

export interface VocabularyViewProps {
  items: VocabularyItem[];
  searchQuery: string;
  dueTodayCount: number;
}

export interface VocabularyViewCallbacks {
  onSpeak?: (term: string) => void;
  onSearchChange?: (query: string) => void;
  onAddItem?: (draft: VocabularyDraft) => void | Promise<void>;
  onAutoFillDraft?: (word: string) => Promise<Partial<VocabularyDraft> | null>;
  onOpenQuickImport?: () => void;
  onEditItem?: (id: string, draft: VocabularyDraft) => void | Promise<void>;
  onEditItemDetails?: (id: string) => void;
  onDeleteItem?: (id: string) => void;
  onOpenSourceNote?: (notePath: string) => void;
  onStartReview?: () => void;
  onExportAnki?: () => void;
  onInspectWord?: (word: string, id: string) => void;
}

/* ---------- 生词本三合一快捷批量导入弹窗 ---------- */

export type VocabImportTab = 'paste_list' | 'import_file' | 'from_notes';

export interface VocabImportCandidate {
  id: string;
  selected: boolean;
  word: string;
  phonetic: string;
  partOfSpeech: string;
  meaningZh: string;
  sourceSentence?: string;
  sourceNotePath?: string;
  forms?: string[];
  derivatives?: string[];
  phrases?: string[];
  roots?: string[];
  examples?: string[];
  /** 'dict': 离线词库自动补全；'parsed': 文件/文本自带释义；'missing': 待补全释义；'duplicate': 已在生词本 */
  matchStatus: 'dict' | 'parsed' | 'missing' | 'duplicate';
  providerLabel?: string;
}

export interface VocabVaultNoteSource {
  path: string;
  title: string;
  category: 'archive' | 'study' | 'note';
  totalEntries: number;
  newEntries: number;
  selected: boolean;
}

export interface VocabQuickImportModalProps {
  open: boolean;
  activeTab: VocabImportTab;
  pasteText: string;
  uploadedFileName?: string;
  candidates: VocabImportCandidate[];
  noteSources: VocabVaultNoteSource[];
  busy?: boolean;
  aiAvailable?: boolean;
  statusMessage?: string;
  errorMessage?: string;
}

export interface VocabQuickImportModalCallbacks {
  onClose?: () => void;
  onTabChange?: (tab: VocabImportTab) => void;
  onPasteTextChange?: (text: string) => void;
  onParsePasteList?: (rawText: string) => void;
  onUploadFiles?: (files: FileList) => void;
  onToggleCandidate?: (id: string, selected: boolean) => void;
  onSelectAllValidCandidates?: (selected: boolean) => void;
  onUpdateCandidateMeaning?: (id: string, meaningZh: string) => void;
  onAiFillMissing?: () => void;
  onConfirmImportCandidates?: () => void;
  onToggleNoteSource?: (path: string, selected: boolean) => void;
  onSelectAllNoteSources?: (selected: boolean) => void;
  onRefreshNoteSources?: () => void;
  onConfirmImportFromNotes?: () => void;
}

/* ==================== 4. 今日复习 ==================== */

export type ReviewMode = 'word' | 'cloze';
export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';
export type ReviewSessionStatus = 'active' | 'empty' | 'completed';

export interface ReviewIntervalHints {
  again: string;
  hard: string;
  good: string;
  easy: string;
}

export interface ReviewCardItem {
  id: string;
  word: string;
  phonetic?: string;
  partOfSpeech: string;
  meaningZh: string;
  sourceSentence: string;
  maskedSentence?: string;
  sourceNotePath?: string;
  sourceNoteTitle?: string;
  intervals: ReviewIntervalHints;
}

export interface ReviewSessionSummary {
  totalReviewed: number;
  againCount: number;
  hardCount: number;
  goodCount: number;
  easyCount: number;
}

export interface ReviewViewProps {
  status: ReviewSessionStatus;
  mode: ReviewMode;
  revealed: boolean;
  currentIndex: number;
  totalCount: number;
  currentCard?: ReviewCardItem | null;
  summary?: ReviewSessionSummary;
  nextUpcomingHint?: string;
  isSpeaking?: boolean;
}

export interface ReviewViewCallbacks {
  onChangeMode?: (mode: ReviewMode) => void;
  onReveal?: () => void;
  onRate?: (cardId: string, rating: ReviewRating) => void;
  onSpeak?: (word: string) => void;
  onOpenSourceNote?: (notePath: string) => void;
  onRestartPractice?: () => void;
  onGoToVocabulary?: () => void;
}

/* ==================== 5. 每日归档 ==================== */

export interface DailyArchiveItem {
  id: string;
  term: string;
  meaningZh: string;
  phonetic?: string;
  partOfSpeech?: string;
  roots?: string[];
  derivatives?: string[];
  blockId?: string;
  line?: number;
  timeLabel: string;
}

export interface DailyArchiveGroup {
  date: string;
  displayLabel: string;
  notePath: string;
  entries: DailyArchiveItem[];
}

export interface ArchiveViewProps {
  groups: DailyArchiveGroup[];
}

export interface ArchiveViewCallbacks {
  onOpenArchiveNote?: (date: string, notePath: string) => void;
  onSelectEntry?: (term: string, notePath: string, entryId: string) => void;
  onJumpToEntryBlock?: (item: DailyArchiveItem, notePath: string) => void;
  onUpdateEntryMeta?: (
    notePath: string,
    term: string,
    patch: { roots: string[]; derivatives: string[] }
  ) => Promise<void> | void;
}

/* ==================== 6. 模型设置 ==================== */

export type OllamaConnectionStatus = 'connected' | 'checking' | 'disconnected' | 'error';

export interface OllamaModelOption {
  id: string;
  name: string;
  sizeLabel: string;
  recommendation: string;
  installed: boolean;
}

export interface ModelDownloadState {
  status: 'idle' | 'downloading' | 'completed' | 'error';
  modelId?: string;
  progressPercent: number;
  downloadedLabel?: string;
  speedLabel?: string;
  errorMessage?: string;
}

export interface TranslationTestState {
  status: 'idle' | 'running' | 'success' | 'error';
  sampleText: string;
  outputText?: string;
  latencyMs?: number;
  errorMessage?: string;
}

export type CiyuColorThemeId =
  | 'system'
  | 'catppuccin-latte'
  | 'catppuccin-mocha'
  | 'nord'
  | 'rose-pine-dawn'
  | 'rose-pine'
  | 'everforest-light'
  | 'everforest-dark'
  | 'solarized-light'
  | 'custom';

export interface CiyuCustomThemeColors {
  accent: string;
  canvasBg: string;
  surfaceBg: string;
  textPrimary: string;
}

export interface CiyuUiPreferences {
  liquidGlass: boolean;
  reducedTransparency: boolean;
  reducedMotion: boolean;
  edgeRefraction: boolean;
  /** Liquid Glass 不透明度百分比（20–100，默认 68） */
  glassOpacity?: number;
  colorTheme?: CiyuColorThemeId;
  customTheme?: CiyuCustomThemeColors;
}

export interface DiscoveredModel {
  provider: 'ollama' | 'openai';
  port: number;
  model: string;
  label: string;
}

export type SpeechEngineMode = 'human' | 'system';
export type SpeechAccent = 'us' | 'uk';

export interface SettingsViewProps {
  nativeDictionaries?: boolean;
  discovery?: { status: 'idle' | 'finding' | 'ready'; models: DiscoveredModel[] };
  inference?: Pick<DiscoveredModel, 'provider' | 'port' | 'model'> | null;
  endpoint: string;
  archiveFolder?: string;
  useContext?: boolean;
  speechEngine?: SpeechEngineMode;
  speechAccent?: SpeechAccent;
  connectionStatus: OllamaConnectionStatus;
  connectionDetail?: string;
  models: OllamaModelOption[];
  selectedModelId: string;
  download: ModelDownloadState;
  deletingModelId?: string;
  translationTest: TranslationTestState;
  preferences: CiyuUiPreferences;
}

export interface SettingsViewCallbacks {
  onCustomModel?: (name: string) => void;
  onArchiveFolderChange?: (path: string) => void;
  onContextChange?: (enabled: boolean) => void;
  onSpeechEngineChange?: (engine: SpeechEngineMode) => void;
  onSpeechAccentChange?: (accent: SpeechAccent) => void;
  onPreviewSpeech?: (sample: string) => void;
  onEndpointChange?: (endpoint: string) => void;
  onCheckConnection?: () => void;
  onSelectModel?: (modelId: string) => void;
  onStartDownload?: (modelId: string) => void;
  onCancelDownload?: () => void;
  onDeleteModel?: (modelId: string) => void;
  onDiscoverModels?: () => void;
  onUseDiscovered?: (model: DiscoveredModel) => void;
  onRetryDownload?: (modelId: string) => void;
  onRunTranslationTest?: () => void;
  onRetryTranslationTest?: () => void;
  onToggleLiquidGlass?: (enabled: boolean) => void;
  onToggleReducedTransparency?: (enabled: boolean) => void;
  onToggleReducedMotion?: (enabled: boolean) => void;
  onToggleEdgeRefraction?: (enabled: boolean) => void;
  onGlassOpacityChange?: (opacityPercent: number) => void;
  onSelectColorTheme?: (themeId: CiyuColorThemeId) => void;
  onCustomThemeChange?: (colors: CiyuCustomThemeColors) => void;
}

/* ==================== 7. 六级闭环学习（题库一键下载 / 忠实原卷 / 听力三模对照精听 / 错题双向块跳转） ==================== */

export type Cet6OverallStatus =
  | 'not_downloaded'
  | 'downloading'
  | 'partial'
  | 'downloaded'
  | 'error';

export type Cet6PaperStatus =
  | 'not_downloaded'
  | 'downloading'
  | 'downloaded'
  | 'error';

export type Cet6AudioAvailability =
  | 'local_ready'
  | 'link_only'
  | 'unverified_transcript'
  | 'no_audio'
  | 'audio_error';

export interface Cet6VaultPaths {
  rootFolder: string;
  examIndexNote: string;
  papersFolder: string;
  transcriptsFolder: string;
  audioFolder: string;
  mistakeIndexNote: string;
}

export interface Cet6PaperSummary {
  id: string;
  year: string;
  month: string;
  session: string;
  setNumber: 1 | 2 | 3;
  title: string;
  status: Cet6PaperStatus;
  audioStatus: Cet6AudioAvailability;
  notePath?: string;
  transcriptNotePath?: string;
  audioFilePath?: string;
  sharedListeningWithId?: string;
  sourceUrl?: string;
  errorMessage?: string;
}

export interface Cet6SessionGroup {
  sessionId: string;
  year: string;
  month: string;
  sessionLabel: string;
  papers: Cet6PaperSummary[];
}

export interface ExamBankViewProps {
  vaultName: string;
  targetFolder: string;
  vaultPaths: Cet6VaultPaths;
  overallStatus: Cet6OverallStatus;
  sessions: Cet6SessionGroup[];
  selectedPaperIds: string[];
  downloadedCount: number;
  totalCount: number;
  indexNotePath?: string;
  indexAvailable: boolean;
  officialSampleAvailable?: boolean;
  officialSamplePath?: string;
  lastImportedPaperId?: string;
  lastImportedPath?: string;
  /** 刚刚完成导入时高亮展示「打开试卷」与「打开索引」 */
  justImported?: {
    count: number;
    primaryPaperId: string;
    primaryPaperTitle: string;
    indexNotePath: string;
  } | null;
  /** 重复点击已导入试卷时的防覆盖提示 */
  duplicateClickNotice?: {
    paperId: string;
    title: string;
    notePath: string;
  } | null;
  /** 最近一次批量/单套删除后的反馈与回收站撤销提示 */
  justDeleted?: {
    count: number;
    mode: 'trash' | 'permanent';
    canUndo?: boolean;
  } | null;
  progressText?: string;
  progressPercent?: number;
  errorMessage?: string;
  mistakeCount?: number;
}

export interface ExamBankViewCallbacks {
  onTogglePaperSelect?: (paperId: string, selected: boolean) => void;
  onToggleSessionSelect?: (sessionId: string, selected: boolean) => void;
  onSelectAllPapers?: () => void;
  onSelectImportedPapers?: () => void;
  onClearSelection?: () => void;
  /** 主按钮：下载并导入文字版（自动建目录并生成索引） */
  onDownloadAndImportSelected?: (paperIds: string[]) => void;
  /** 一键下载全部 15 套 */
  onDownloadAllPapers?: () => void;
  /** 单套下载（若已导入则触发防覆盖提示并提供打开入口） */
  onDownloadSinglePaper?: (paperId: string) => void;
  /** 批量删除所选已导入真题（打开确认删除选项弹窗） */
  onRequestBatchDeletePapers?: (paperIds: string[]) => void;
  /** 单套删除已导入真题（打开确认删除选项弹窗） */
  onRequestDeleteSinglePaper?: (paperId: string) => void;
  /** 撤销移入回收站的操作 */
  onUndoLastDelete?: () => void;
  onDismissDeleteNotice?: () => void;
  onDismissDuplicateNotice?: () => void;
  onRetryFailedPapers?: (paperIds: string[]) => void;
  onPickTargetFolder?: () => void;
  onOpenBatchDownloadModal?: () => void;
  onOpenImportModal?: () => void;
  onOpenCet6Index?: () => void;
  onOpenPaperReader?: (paperId: string) => void;
  onOpenPaperListening?: (paperId: string) => void;
  onOpenPaperNote?: (paperId: string, notePath: string) => void;
  onOpenMistakeBook?: () => void;
  onOpenOfficialSample?: () => void;
  onOpenLastImported?: () => void;
  /** 在 Obsidian 主阅读区独立宽窗口中打开听力自查或试卷 */
  onOpenInWideWorkspace?: (target: 'listening' | 'paper' | 'index' | 'mistakes', paperId?: string) => void;
}

/* ---------- 批量删除真题与确定删除选项弹窗 ---------- */

export type ExamDeleteMode = 'trash' | 'permanent';

export interface ExamDeleteOptions {
  /** 'trash': 移入「词屿/回收站」安全可恢复；'permanent': 彻底从库中移除 */
  mode: ExamDeleteMode;
  /** 同步更新 真题索引.md（将对应套卷恢复为「待导入」） */
  updateIndexNote: boolean;
  /** 同时删除关联的独立听力原文与离线音频（自动保护仍被共用引用的听力） */
  deleteAssociatedMedia: boolean;
  /** 同时清理所选套卷在错题本中的记录 */
  deleteAssociatedMistakes: boolean;
  /** 彻底删除模式下的不可恢复确认勾选 */
  acknowledgePermanent: boolean;
}

export interface ExamDeleteTargetItem {
  paperId: string;
  title: string;
  session: string;
  notePath: string;
  hasTranscript?: boolean;
  hasOfflineAudio?: boolean;
  mistakeCount?: number;
}

export interface ExamDeleteConfirmModalProps {
  open: boolean;
  targets: ExamDeleteTargetItem[];
  options: ExamDeleteOptions;
  busy?: boolean;
  trashFolderLabel?: string;
  errorMessage?: string;
}

export interface ExamDeleteConfirmModalCallbacks {
  onClose?: () => void;
  onOptionsChange?: (nextOptions: ExamDeleteOptions) => void;
  onConfirmDelete?: (paperIds: string[], options: ExamDeleteOptions) => void;
}

/* ---------- 下载与高级导入弹窗 ---------- */

export type ExamModalTab = 'batch_download' | 'import_exam';

export interface LocalImportFileItem {
  id: string;
  name: string;
  sizeBytes: number;
  sizeLabel: string;
  tooLarge?: boolean;
  invalidExt?: boolean;
}

export interface FailedPaperRecord {
  paperId: string;
  title: string;
  reason: string;
}

export interface ExamModalProps {
  open: boolean;
  activeTab: ExamModalTab;
  vaultName: string;
  targetFolder: string;
  folderError?: string;
  sessions: Cet6SessionGroup[];
  selectedPaperIds: string[];
  busy: boolean;
  progressStatus?: 'idle' | 'running' | 'partial_error' | 'error' | 'completed';
  progressLabel?: string;
  progressPercent?: number;
  failedPapers: FailedPaperRecord[];
  officialSample: {
    installed: boolean;
    ocrSupported: boolean;
    statusText?: string;
  };
  directUrl: string;
  directUrlError?: string;
  selectedLocalFiles: LocalImportFileItem[];
  importError?: string;
}

export interface ExamModalCallbacks {
  onClose?: () => void;
  onTabChange?: (tab: ExamModalTab) => void;
  onTargetFolderChange?: (folder: string) => void;
  onPickTargetFolder?: () => void;
  onTogglePaper?: (paperId: string, checked: boolean) => void;
  onToggleSession?: (sessionId: string, checked: boolean) => void;
  onSelectAllPapers?: () => void;
  onSelectImportedPapers?: () => void;
  onClearAllPapers?: () => void;
  onStartBatchDownload?: (paperIds: string[], targetFolder: string) => void;
  onRequestBatchDeletePapers?: (paperIds: string[]) => void;
  onRetryFailedPapers?: (paperIds: string[], targetFolder: string) => void;
  onImportOfficialSample?: (targetFolder: string) => void;
  onDirectUrlChange?: (url: string) => void;
  onImportFromUrl?: (url: string, targetFolder: string) => void;
  onChooseLocalFiles?: (files: FileList) => void;
  onRemoveLocalFile?: (fileId: string) => void;
  onImportLocalFiles?: (targetFolder: string) => void;
}

/* ---------- 听力播放与三模对照逐段精听 ---------- */

export type ListeningSectionId = 'A' | 'B' | 'C';
export type ListeningPlaybackRate = 0.75 | 1 | 1.25 | 1.5;
export type ListeningAudioState =
  | 'ready'
  | 'audio_error'
  | 'link_only'
  | 'no_audio'
  | 'unverified_transcript';

/** 听力原文对照三模式：盲听 / 英文对照 / 中英对照 */
export type ListeningTranscriptMode = 'blind' | 'en' | 'bilingual';
/** 窄侧栏三视图切换：题目 / 原文 / 中英（切换保留播放进度与当前段落） */
export type ListeningNarrowPane = 'questions' | 'en' | 'bilingual';
/** 时间戳粒度：句级 / 段落级 / 无时间戳 */
export type ListeningTimestampLevel = 'sentence' | 'paragraph' | 'none';

export interface ListeningSentenceUnit {
  id: string;
  startSec?: number;
  endSec?: number;
  timeLabel?: string;
  en: string;
  zh?: string;
}

export interface ListeningTranscriptSegment {
  id: string;
  speaker: string;
  speakerRole?: 'a' | 'b' | 'narrator';
  startSec?: number;
  endSec?: number;
  timeLabel?: string;
  textEn: string;
  translationZh?: string;
  /** 句级时间戳精细拆句（可选：无句级时间戳时按整段渲染） */
  sentences?: ListeningSentenceUnit[];
  /** 关联题号（用于原文跳到对应题组） */
  questionNumbers?: number[];
}

export interface ExamChoiceQuestion {
  number: number;
  /** 稳定的 Obsidian 原题块 ID，例如 cet6-202606-1-q1 */
  blockId: string;
  stem: string;
  options: ReadonlyArray<{ key: 'A' | 'B' | 'C' | 'D'; text: string }>;
  selectedKey?: 'A' | 'B' | 'C' | 'D';
  answerKey: 'A' | 'B' | 'C' | 'D';
  explanation?: string;
  /** 关联听力精听段落 ID（用于从题目定位回听力原文段落） */
  segmentId?: string;
}

export type ListeningQuestionItem = ExamChoiceQuestion;

export interface ListeningQuestionGroup {
  id: string;
  section: ListeningSectionId;
  title: string;
  questionRange: string;
  directions?: string;
  /** 本题组在整轨听力 MP3 中的起止秒数（如 Section A Questions 1-4: 33.6s – 165.7s） */
  startSec?: number;
  endSec?: number;
  /** 本题组正文对白/短文/讲座的起止秒数（剔除 Directions 与末尾读题） */
  speechStartSec?: number;
  speechEndSec?: number;
  /** 本题组末尾原声读题起始秒数（Questions X to Y are based on...） */
  questionsAudioStartSec?: number;
  timeRangeLabel?: string;
  timestampLevel: ListeningTimestampLevel;
  hasTimestamps: boolean;
  segments: ListeningTranscriptSegment[];
  questions: ExamChoiceQuestion[];
}

export interface MistakeLinkRef {
  mistakeId: string;
  mistakeBlockId: string;
  mistakeWikiLink: string;
}

export interface ListeningPaperChoice {
  id: string;
  title: string;
  session: string;
  imported: boolean;
  hasAudio: boolean;
}

export interface ListeningSelfCheckState {
  /** 已经提交判分自查的题组 ID 列表 */
  checkedGroupIds: string[];
  /** 是否已提交整套听力（1–25 题）自查 */
  fullSubmitted: boolean;
}

export interface ListeningIntensiveProps {
  paperId: string;
  paperTitle: string;
  notePath?: string;
  /** 可直接切换进入听力自查的历年套卷列表 */
  availablePapers?: ListeningPaperChoice[];
  /** 正在拉取在线/本地试卷听力题目时的加载状态 */
  loadingPaper?: boolean;
  loadError?: string;
  activeSection: ListeningSectionId;
  activeGroupId: string;
  groups: ListeningQuestionGroup[];
  /** 听力自查判分状态（支持按题组即做即查或整套提交核对） */
  selfCheck?: ListeningSelfCheckState;
  /** 核心三模式：blind（盲听） / en（英文对照） / bilingual（中英对照） */
  transcriptMode: ListeningTranscriptMode;
  /** 中英对照模式下允许单独隐藏中文译文 */
  hideChineseInBilingual: boolean;
  /** 窄侧栏当前页签：题目 / 原文 / 中英 */
  narrowPane: ListeningNarrowPane;
  audioState: ListeningAudioState;
  audioErrorDetail?: string;
  sourceAudioUrl?: string;
  /** 独立下载状态 1：下载全文为 Markdown */
  transcriptDownloadStatus: 'idle' | 'saving' | 'saved';
  transcriptSavedPath?: string;
  /** 共用听力的套卷可链接到同一份原文 */
  sharedTranscriptInfo?: {
    sourcePaperTitle: string;
    notePath: string;
  } | null;
  /** 独立下载状态 2：下载音频供离线播放 */
  audioDownloadStatus: 'idle' | 'downloading' | 'saved';
  audioDownloadPercent?: number;
  audioSavedPath?: string;
  transcriptSourceLabel: string;
  transcriptSourceUrl?: string;
  transcriptVerified: boolean;
  playing: boolean;
  currentTimeSec: number;
  durationSec: number;
  /** 'group': 仅截取播放当前题组片段（如 Section A 1-4 题）；'full': 播放整套音频 */
  clipMode?: 'group' | 'full';
  playbackRate: ListeningPlaybackRate;
  loopSegmentId?: string | null;
  activeSegmentId?: string | null;
  activeSentenceId?: string | null;
  highlightedQuestionBlockId?: string | null;
  mistakeByQuestion: Record<number, MistakeLinkRef>;
  answersExpanded: boolean;
}

export interface ListeningIntensiveCallbacks {
  onBackToBank?: () => void;
  onSelectPaper?: (paperId: string) => void;
  onRetryLoadPaper?: (paperId: string) => void;
  onOpenInWideWorkspace?: (paperId: string) => void;
  onOpenReader?: (paperId: string) => void;
  onOpenLocalNote?: (notePath: string) => void;
  onChangeSection?: (section: ListeningSectionId) => void;
  onSelectGroup?: (groupId: string) => void;
  onChangeTranscriptMode?: (mode: ListeningTranscriptMode) => void;
  onToggleHideChinese?: (hide: boolean) => void;
  onChangeNarrowPane?: (pane: ListeningNarrowPane) => void;
  onTogglePlay?: () => void;
  onStepSkip?: (deltaSec: number) => void;
  onSeek?: (timeSec: number) => void;
  onToggleClipMode?: (mode: 'group' | 'full') => void;
  onPlayGroupClip?: (groupId: string) => void;
  onChangeRate?: (rate: ListeningPlaybackRate) => void;
  onSelectSegment?: (segmentId: string, autoPlay?: boolean) => void;
  onSelectSentence?: (segmentId: string, sentenceId: string, startSec?: number) => void;
  onReplaySegment?: (segmentId: string) => void;
  onToggleLoopSegment?: (segmentId: string) => void;
  /** 独立操作 1：把完整英文、对照译文、题组范围与来源保存为 Markdown 并链接到试卷 */
  onDownloadTranscriptMarkdown?: (paperId: string) => void;
  onOpenSavedTranscriptNote?: (notePath: string) => void;
  /** 独立操作 2：保存离线听力音频 */
  onDownloadAudioOffline?: (paperId: string) => void;
  onRetryLoadAudio?: () => void;
  onOpenSourceAudioLink?: (url: string) => void;
  onAttachLocalAudio?: (paperId: string) => void;
  onSelectOption?: (questionNumber: number, key: 'A' | 'B' | 'C' | 'D') => void;
  /** 听力自查：核对当前题组答案并展示得分与错题入口 */
  onSubmitGroupSelfCheck?: (groupId: string) => void;
  /** 听力自查：清空并重做当前题组 */
  onResetGroupSelfCheck?: (groupId: string) => void;
  /** 听力自查：提交整套听力（全部题组）判分 */
  onSubmitFullSelfCheck?: () => void;
  /** 听力自查：重置整套听力自查作答 */
  onResetFullSelfCheck?: () => void;
  /** 一键将当前已查出的听力错题批量加入错题本 */
  onAddWrongListeningToMistakes?: (questions: ExamChoiceQuestion[]) => void;
  /** 当来源未附带独立原文时，支持粘贴或导入英文/双语听力原文 */
  onPasteTranscript?: (paperId: string, rawTranscript: string) => void;
  onJumpToQuestion?: (questionNumber: number, blockId: string) => void;
  onJumpToSegment?: (segmentId: string) => void;
  onAddMistake?: (question: ExamChoiceQuestion, questionType: MistakeQuestionType) => void;
  onViewMistakeRecord?: (mistakeRef: MistakeLinkRef) => void;
  onToggleAnswers?: (expanded: boolean) => void;
  onLookupSelection?: (term: string, contextSentence: string, rect?: DOMRect) => void;
}

/* ---------- 忠实原卷单卷阅读与真题索引 ---------- */

export type ExamWorkspaceMode = 'index' | 'paper';
export type ExamPaperSectionId =
  | 'writing'
  | 'listening'
  | 'banked'
  | 'matching'
  | 'careful'
  | 'translation'
  | 'answers';
export type ExamIndexFilter = 'all' | 'downloaded' | 'with_audio' | 'pending';

export interface BankedClozeQuestion {
  number: number;
  blockId: string;
  selectedKey?: string;
  answerKey: string;
  answerWord: string;
  explanation?: string;
}

export interface MatchingQuestion {
  number: number;
  blockId: string;
  statement: string;
  selectedKey?: string;
  answerKey: string;
  explanation?: string;
}

export interface ExamPaperDocument {
  paperId: string;
  title: string;
  session: string;
  setLabel: string;
  notePath?: string;
  transcriptNotePath?: string;
  audioFilePath?: string;
  sharedListeningNotePath?: string;
  sourceLabel: string;
  sourceUrl?: string;
  audioStatus: Cet6AudioAvailability;
  writing: {
    directions: string;
    prompt: string;
    blockId: string;
    sampleEssay?: string;
  };
  listening: {
    directions: string;
    summary: string;
    playing?: boolean;
    currentTimeSec?: number;
    durationSec?: number;
    playbackRate?: ListeningPlaybackRate;
    transcriptSaved?: boolean;
    audioSaved?: boolean;
    groups: Array<{
      id: string;
      sectionLabel: string;
      title: string;
      questionRange: string;
      directions?: string;
      questions: ExamChoiceQuestion[];
    }>;
  };
  bankedCloze: {
    directions: string;
    paragraphsWithBlanks: string[];
    wordBank: ReadonlyArray<{ key: string; word: string }>;
    questions: BankedClozeQuestion[];
  };
  matching: {
    directions: string;
    paragraphs: ReadonlyArray<{ letter: string; text: string }>;
    questions: MatchingQuestion[];
  };
  carefulReading: {
    directions: string;
    passages: Array<{
      id: string;
      title: string;
      paragraphs: string[];
      questions: ExamChoiceQuestion[];
    }>;
  };
  translation: {
    directions: string;
    blockId: string;
    sourceZh: string;
    referenceEn?: string;
  };
  answerSummaryRows: Array<{
    sectionLabel: string;
    rangeLabel: string;
    answersText: string;
  }>;
}

export interface ExamWorkspaceProps {
  mode: ExamWorkspaceMode;
  vaultName: string;
  targetFolder: string;
  indexNotePath?: string;
  filter: ExamIndexFilter;
  searchQuery: string;
  sessions: Cet6SessionGroup[];
  officialSample?: {
    id: string;
    title: string;
    status: Cet6PaperStatus;
    notePath?: string;
    audioStatus: Cet6AudioAvailability;
  };
  activePaper?: ExamPaperDocument | null;
  activeSection: ExamPaperSectionId;
  answersExpanded: boolean;
  /** 交卷自动判分状态 */
  graded: boolean;
  /** 原题题号 -> 已加入的错题记录引用（用于渲染「查看错题记录」） */
  mistakeByQuestion: Record<number, MistakeLinkRef>;
  /** 从错题本点击「回到原题」跳回时高亮定位的原题块 ID */
  highlightedQuestionBlockId?: string | null;
}

export interface ExamWorkspaceCallbacks {
  onBackToBank?: () => void;
  onChangeMode?: (mode: ExamWorkspaceMode) => void;
  onFilterChange?: (filter: ExamIndexFilter) => void;
  onSearchChange?: (query: string) => void;
  onOpenBatchDownloadModal?: () => void;
  onOpenImportModal?: () => void;
  onOpenIndexNote?: (notePath: string) => void;
  onOpenMistakeBook?: () => void;
  onSelectPaper?: (paperId: string) => void;
  onOpenPaperListening?: (paperId: string, groupId?: string) => void;
  onOpenLocalNote?: (notePath: string) => void;
  onJumpSection?: (section: ExamPaperSectionId) => void;
  onToggleEmbeddedPlay?: () => void;
  onStepEmbeddedAudio?: (deltaSec: number) => void;
  onDownloadTranscriptMarkdown?: (paperId: string) => void;
  onDownloadAudioOffline?: (paperId: string) => void;
  onAnswerObjective?: (questionNumber: number, answerKey: string) => void;
  onSubmitGrading?: () => void;
  onAddAllWrongToMistakes?: () => void;
  onAddQuestionToMistakes?: (payload: {
    paperId: string;
    questionNumber: number;
    blockId: string;
    questionType: MistakeQuestionType;
    stemPreview: string;
    myAnswer: string;
    correctAnswer: string;
  }) => void;
  onViewMistakeRecord?: (mistakeRef: MistakeLinkRef) => void;
  onToggleAnswers?: (expanded: boolean) => void;
  onLookupSelection?: (term: string, contextSentence: string, rect?: DOMRect) => void;
}

/* ---------- 错题本与双向 Obsidian 块跳转 ---------- */

export type MistakeQuestionType =
  | 'listening'
  | 'banked_cloze'
  | 'matching'
  | 'careful_reading'
  | 'writing_translation';

export type MistakeReviewStatus = 'reviewing' | 'mastered';

export interface MistakeEntryItem {
  id: string;
  /** 稳定的错题条目块 ID，如 mistake-202606-1-q46 */
  mistakeBlockId: string;
  /** 稳定的原题段落块 ID，如 cet6-202606-1-q46 */
  questionBlockId: string;
  paperId: string;
  paperTitle: string;
  paperNotePath: string;
  session: string;
  setLabel: string;
  questionNumber: number;
  questionType: MistakeQuestionType;
  questionTypeLabel: string;
  stemPreview: string;
  myAnswer: string;
  correctAnswer: string;
  note: string;
  status: MistakeReviewStatus;
  /** 精确指向原题段落的 Obsidian 双链，如 [[2026 年 6 月六级真题 · 第 1 套#^cet6-202606-1-q46|回到原题]] */
  backToQuestionWikiLink: string;
  /** 原题指向本错题条目的双链，如 [[六级错题索引#^mistake-202606-1-q46|查看错题记录]] */
  viewMistakeWikiLink: string;
  createdAt: string;
}

export interface MistakeBookProps {
  indexNotePath: string;
  items: MistakeEntryItem[];
  sessionFilter: string;
  typeFilter: 'all' | MistakeQuestionType;
  statusFilter: 'all' | MistakeReviewStatus;
  availableSessions: string[];
  highlightedMistakeBlockId?: string | null;
}

export interface MistakeBookCallbacks {
  onBackToBank?: () => void;
  onOpenMistakeIndexNote?: (notePath: string) => void;
  onSessionFilterChange?: (session: string) => void;
  onTypeFilterChange?: (type: 'all' | MistakeQuestionType) => void;
  onStatusFilterChange?: (status: 'all' | MistakeReviewStatus) => void;
  /** 点击「回到原题」直接定位到对应试卷的 #^questionBlockId 段落 */
  onJumpToOriginalQuestion?: (item: MistakeEntryItem) => void;
  onToggleMistakeStatus?: (id: string, nextStatus: MistakeReviewStatus) => void;
  onUpdateMistakeNote?: (id: string, note: string) => void;
  onRemoveMistake?: (id: string) => void;
}

/* ==================== 8. 统一重绘组件（离线词库 / 词屿笔记管理 / 词条编辑与确认弹窗） ==================== */

export interface DictionaryPackItem {
  id: string;
  label: string;
  count: number;
  sourceLabel?: string;
  enabled: boolean;
  isPrimary: boolean;
}

export interface DictionaryPacksViewProps {
  packs: DictionaryPackItem[];
}

export interface DictionaryPacksViewCallbacks {
  onSetPrimary?: (packId: string) => void;
  onAddPack?: (packId: string) => void;
  onRemovePack?: (packId: string) => void;
}

export interface StudyNoteFileItem {
  path: string;
  basename: string;
  group: 'study' | 'archive' | 'cet6';
  subtitle?: string;
}

export interface StudyNotesManagerProps {
  notes: StudyNoteFileItem[];
  canUndo: boolean;
  undoHint?: string;
}

export interface StudyNotesManagerCallbacks {
  onCreateNote?: (title: string) => Promise<void> | void;
  onUndoLastAction?: () => void;
  onOpenNote?: (path: string) => void;
  onTrashNote?: (item: StudyNoteFileItem) => void;
}

export interface EntryEditorFieldValues {
  term: string;
  translation: string;
  pronunciation: string;
  partOfSpeech: string;
  otherMeanings: string;
  derivatives: string;
  phrases: string;
  roots: string;
  examples: string;
  forms: string;
  context: string;
  note: string;
}

export interface EntryEditorModalProps {
  open: boolean;
  title: string;
  values: EntryEditorFieldValues;
  busy?: boolean;
  errorMessage?: string;
}

export interface EntryEditorModalCallbacks {
  onClose?: () => void;
  onSave?: (values: EntryEditorFieldValues) => Promise<void> | void;
}

/* ==================== 侧栏总装配 ==================== */

export type ExamSubViewId = 'bank' | 'index' | 'paper' | 'listening' | 'mistakes';

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  highlights: string[];
}

export interface CiyuSidebarProps {
  activeTab: CiyuTabId;
  appVersion?: string;
  changelog?: ReadonlyArray<ChangelogEntry>;
  notesKey?: string;
  examsAvailable?: boolean;
  lastExamAvailable?: boolean;
  cet6IndexAvailable?: boolean;
  dictionaryKey?: string;
  dueTodayCount: number;
  connectionStatus: OllamaConnectionStatus;
  activeModelName: string;
  preferences: CiyuUiPreferences;
  lookup: LookupViewProps;
  vocabulary: VocabularyViewProps;
  review: ReviewViewProps;
  archive: ArchiveViewProps;
  settings: SettingsViewProps;
  /** v0.5 六级闭环学习扩展（可选：未传入时自动回退到兼容按钮卡片） */
  examSubView?: ExamSubViewId;
  examBank?: ExamBankViewProps;
  examWorkspace?: ExamWorkspaceProps;
  listening?: ListeningIntensiveProps;
  mistakes?: MistakeBookProps;
}

export interface CiyuSidebarCallbacks {
  onTabChange?: (tab: CiyuTabId) => void;
  renderDictionaries?: (root: HTMLElement) => void;
  renderNotes?: (root: HTMLElement) => void;
  onOpenExamBank?: () => void;
  onDownloadCet6?: () => void;
  onOpenCet6Index?: () => void;
  onImportExams?: () => void;
  onOpenLastExam?: () => void;
  onToggleLiquidGlass?: (enabled: boolean) => void;
  lookup: LookupViewCallbacks;
  vocabulary: VocabularyViewCallbacks;
  review: ReviewViewCallbacks;
  archive: ArchiveViewCallbacks;
  settings: SettingsViewCallbacks;
  /** v0.5 六级闭环学习回调 */
  onExamSubViewChange?: (subView: ExamSubViewId) => void;
  examBank?: ExamBankViewCallbacks;
  examWorkspace?: ExamWorkspaceCallbacks;
  listening?: ListeningIntensiveCallbacks;
  mistakes?: MistakeBookCallbacks;
}

export interface UIComponentHandle<P> {
  readonly element: HTMLElement;
  update(nextProps: P): void;
  destroy(): void;
}
