/**
 * 词屿 v0.5 六级闭环学习本地预览示例数据（自写短文本 · 零版权风险）
 */

import type {
  Cet6SessionGroup,
  Cet6VaultPaths,
  DailyArchiveGroup,
  ExamPaperDocument,
  ListeningQuestionGroup,
  MistakeEntryItem,
  OllamaModelOption,
  ReviewCardItem,
  VocabularyItem,
  WordEntry,
} from '../src/ciyu-ui/types';

export function buildVaultPaths(rootFolder = '词屿'): Cet6VaultPaths {
  return {
    rootFolder,
    examIndexNote: `${rootFolder}/六级题库/真题索引.md`,
    papersFolder: `${rootFolder}/六级题库/历年真题`,
    transcriptsFolder: `${rootFolder}/六级题库/听力原文`,
    audioFolder: `${rootFolder}/六级题库/听力音频`,
    mistakeIndexNote: `${rootFolder}/错题本/六级错题索引.md`,
  };
}

export function buildInitialCet6Sessions(rootFolder = '词屿'): Cet6SessionGroup[] {
  const specs: Array<{ id: string; year: string; month: string }> = [
    { id: '202606', year: '2026', month: '6 月' },
    { id: '202512', year: '2025', month: '12 月' },
    { id: '202506', year: '2025', month: '6 月' },
    { id: '202412', year: '2024', month: '12 月' },
    { id: '202406', year: '2024', month: '6 月' },
  ];

  return specs.map((s, sIdx) => {
    const sessionLabel = `${s.year} 年 ${s.month}`;
    return {
      sessionId: s.id,
      year: s.year,
      month: s.month,
      sessionLabel,
      papers: ([1, 2, 3] as const).map((setNum) => {
        const id = `${s.id}-${setNum}`;
        const title = `${sessionLabel}六级真题 · 第 ${setNum} 套`;
        const downloaded = sIdx === 0 || (sIdx === 1 && setNum <= 2);
        const isError = s.id === '202512' && setNum === 3;
        return {
          id,
          year: s.year,
          month: s.month,
          session: sessionLabel,
          setNumber: setNum,
          title,
          status: isError ? 'error' : downloaded ? 'downloaded' : 'not_downloaded',
          audioStatus:
            s.id === '202606' && setNum === 1
              ? 'local_ready'
              : s.id === '202606' && setNum === 2
              ? 'link_only'
              : downloaded
              ? 'local_ready'
              : 'no_audio',
          notePath: downloaded
            ? `${rootFolder}/六级题库/历年真题/${title}.md`
            : undefined,
          sharedListeningWithId: setNum === 2 ? `${s.id}-1` : undefined,
          sourceUrl: `https://example.edu.cn/cet6/mock/${id}.html`,
          errorMessage: isError ? '下载超时（HTTP 504），可重试导入' : undefined,
        };
      }),
    };
  });
}

export const SYNTHETIC_LISTENING_GROUPS: ListeningQuestionGroup[] = [
  {
    id: 'sec-a-conv-1',
    section: 'A',
    title: 'Conversation 1',
    questionRange: '第 1–2 题',
    directions:
      'Directions: In this section, you will hear two long conversations. At the end of each conversation, you will hear several questions.',
    timestampLevel: 'sentence',
    hasTimestamps: true,
    segments: [
      {
        id: 'seg-1',
        speaker: 'Woman',
        speakerRole: 'a',
        startSec: 0,
        endSec: 15,
        timeLabel: '00:00',
        questionNumbers: [1],
        textEn:
          'Have you reviewed the updated library schedule for the summer research seminar yet? The archive reading room now stays open later on weekdays.',
        translationZh:
          '你看过暑期研究研讨会更新后的图书馆时间表了吗？档案阅览室现在工作日晚上开放得更晚了。',
        sentences: [
          {
            id: 'sent-1a',
            startSec: 0,
            endSec: 8,
            timeLabel: '00:00',
            en: 'Have you reviewed the updated library schedule for the summer research seminar yet?',
            zh: '你看过暑期研究研讨会更新后的图书馆开放时间表了吗？',
          },
          {
            id: 'sent-1b',
            startSec: 8,
            endSec: 15,
            timeLabel: '00:08',
            en: 'The archive reading room now stays open later on weekdays.',
            zh: '档案阅览室现在工作日晚间开放时间延长了。',
          },
        ],
      },
      {
        id: 'seg-2',
        speaker: 'Man',
        speakerRole: 'b',
        startSec: 15,
        endSec: 32,
        timeLabel: '00:15',
        questionNumbers: [1],
        textEn:
          'Yes, it stays open until nine thirty. That makes evening synthesis much more sustainable for our team.',
        translationZh: '看过了，一直开放到九点半。这让我们小组晚间整理资料变得可持续得多。',
        sentences: [
          {
            id: 'sent-2a',
            startSec: 15,
            endSec: 22,
            timeLabel: '00:15',
            en: 'Yes, it stays open until nine thirty.',
            zh: '看过了，一直开到晚上九点半。',
          },
          {
            id: 'sent-2b',
            startSec: 22,
            endSec: 32,
            timeLabel: '00:22',
            en: 'That makes evening synthesis much more sustainable for our team.',
            zh: '这让我们团队晚间的文献综述整理变得可持续得多。',
          },
        ],
      },
      {
        id: 'seg-3',
        speaker: 'Woman',
        speakerRole: 'a',
        startSec: 32,
        endSec: 48,
        timeLabel: '00:32',
        questionNumbers: [2],
        textEn:
          'Let us reserve a quiet study booth right now so we can verify the primary citations before Friday.',
        translationZh: '那我们现在就预约一间安静研习间，赶在周五前把原始引文核对完。',
        sentences: [
          {
            id: 'sent-3a',
            startSec: 32,
            endSec: 48,
            timeLabel: '00:32',
            en: 'Let us reserve a quiet study booth right now so we can verify the primary citations before Friday.',
            zh: '那我们现在就预约一间安静研习间，赶在周五前把原始引文核对完。',
          },
        ],
      },
    ],
    questions: [
      {
        number: 1,
        blockId: 'cet6-202606-1-q1',
        segmentId: 'seg-2',
        stem: 'What change in the archive reading room schedule do the speakers mention?',
        options: [
          { key: 'A', text: 'It extends weekday evening hours until nine thirty.' },
          { key: 'B', text: 'It closes earlier on Friday afternoons.' },
          { key: 'C', text: 'It requires faculty approval for undergraduate entry.' },
          { key: 'D', text: 'It moves microform readers to the basement.' },
        ],
        selectedKey: 'B',
        answerKey: 'A',
        explanation: '男士在 00:15 明确回答开放至晚上九点半（until nine thirty）。',
      },
      {
        number: 2,
        blockId: 'cet6-202606-1-q2',
        segmentId: 'seg-3',
        stem: 'What do the speakers decide to do immediately?',
        options: [
          { key: 'A', text: 'Print extra handouts for the seminar.' },
          { key: 'B', text: 'Reserve a quiet study booth to verify primary citations.' },
          { key: 'C', text: 'Email the librarian about missing journals.' },
          { key: 'D', text: 'Postpone their Friday presentation.' },
        ],
        answerKey: 'B',
        explanation: '女士在 00:32 提议立即预约研习间以核对原始引文。',
      },
    ],
  },
  {
    id: 'sec-b-pass-1',
    section: 'B',
    title: 'Passage 1（段落级时间戳 & 部分缺译文示例）',
    questionRange: '第 9–10 题',
    timestampLevel: 'paragraph',
    hasTimestamps: true,
    segments: [
      {
        id: 'seg-b1',
        speaker: 'Narrator',
        speakerRole: 'narrator',
        startSec: 0,
        endSec: 24,
        timeLabel: '00:00',
        questionNumbers: [9],
        textEn:
          'Consistent spaced review strengthens long-term retention far better than marathon cramming sessions before exams.',
        translationZh: '规律的间隔重复比考前突击更能巩固长期记忆。',
      },
      {
        id: 'seg-b2',
        speaker: 'Narrator',
        speakerRole: 'narrator',
        startSec: 24,
        endSec: 46,
        timeLabel: '00:24',
        questionNumbers: [10],
        textEn:
          'Pairing active listening with concise contextual notes helps learners recognize recurring academic collocations.',
        // 故意留空译文以演示「来源缺少译文时标明，保留完整英文」
      },
    ],
    questions: [
      {
        number: 9,
        blockId: 'cet6-202606-1-q9',
        segmentId: 'seg-b1',
        stem: 'What study strategy does the passage recommend?',
        options: [
          { key: 'A', text: 'Overnight memorization of isolated word lists.' },
          { key: 'B', text: 'Consistent spaced review over time.' },
          { key: 'C', text: 'Reading translations without listening first.' },
          { key: 'D', text: 'Avoiding difficult academic lectures.' },
        ],
        answerKey: 'B',
      },
    ],
  },
  {
    id: 'sec-c-rec-1',
    section: 'C',
    title: 'Recording 1（无时间戳整轨示例）',
    questionRange: '第 16 题',
    timestampLevel: 'none',
    hasTimestamps: false,
    segments: [
      {
        id: 'seg-c1',
        speaker: 'Lecturer',
        speakerRole: 'a',
        questionNumbers: [16],
        textEn:
          'Urban pocket parks moderate neighborhood microclimates during summer heatwaves while offering restorative green corners for pedestrians.',
        translationZh: '城市口袋公园能在夏季热浪中调节街区微气候，并为行人提供舒缓身心的绿意角落。',
      },
    ],
    questions: [
      {
        number: 16,
        blockId: 'cet6-202606-1-q16',
        segmentId: 'seg-c1',
        stem: 'What benefit of urban pocket parks is discussed by the lecturer?',
        options: [
          { key: 'A', text: 'Moderating local microclimates during heatwaves.' },
          { key: 'B', text: 'Expanding downtown highway capacity.' },
          { key: 'C', text: 'Replacing municipal botanical gardens.' },
          { key: 'D', text: 'Lowering commercial property taxes.' },
        ],
        answerKey: 'A',
      },
    ],
  },
];

export const SYNTHETIC_FULL_PAPER: ExamPaperDocument = {
  paperId: '202606-1',
  title: '2026 年 6 月六级真题 · 第 1 套',
  session: '2026 年 6 月',
  setLabel: '第 1 套',
  notePath: '词屿/六级题库/历年真题/2026 年 6 月六级真题 · 第 1 套.md',
  sharedListeningNotePath: '词屿/六级题库/听力原文/2026 年 6 月六级听力原文（第 1、2 套共用）.md',
  sourceLabel: '自写结构化模拟样卷（严格对齐六级原卷分节、空号、段落字母与块 ID）',
  audioStatus: 'local_ready',
  writing: {
    blockId: 'cet6-202606-1-writing',
    directions:
      'Directions: For this part, you are allowed 30 minutes to write an essay on balancing digital convenience with deep reading habits. You should write at least 150 words but no more than 200 words.',
    prompt:
      'Suppose you are writing for the campus newspaper: discuss why maintaining uninterrupted reading habits matters in an era of instant notifications.',
    sampleEssay:
      'Digital devices grant us instant access to vast libraries, yet constant alerts often fragment analytical thought. Cultivating quiet, uninterrupted reading blocks allows learners to follow complex arguments from premise to conclusion.',
  },
  listening: {
    directions:
      'Directions: In this section, you will hear long conversations, passages, and lectures. Choose the best answer from A), B), C) and D).',
    summary: '支持试卷内直接在线播放，或点击进入「逐段精听与三模原文对照」。',
    playing: false,
    currentTimeSec: 18,
    durationSec: 48,
    playbackRate: 1,
    transcriptSaved: false,
    audioSaved: false,
    groups: [
      {
        id: 'sec-a-conv-1',
        sectionLabel: 'Section A · Long Conversation',
        title: 'Conversation 1',
        questionRange: 'Questions 1 to 2',
        questions: SYNTHETIC_LISTENING_GROUPS[0].questions.map((q) => ({ ...q })),
      },
    ],
  },
  bankedCloze: {
    directions:
      'Directions: Fill in the blanks in the following passage by selecting suitable words from the word bank. Each word may be used only once.',
    paragraphsWithBlanks: [
      'Thoughtful note-taking systems transform passive reading into 〔26〕 inquiry. When students connect new vocabulary directly to original 〔27〕 sentences, recall becomes far more reliable.',
    ],
    wordBank: [
      { key: 'A', word: 'active' },
      { key: 'B', word: 'contextual' },
      { key: 'C', word: 'fragile' },
      { key: 'D', word: 'obscure' },
      { key: 'E', word: 'reluctant' },
      { key: 'F', word: 'sustain' },
    ],
    questions: [
      {
        number: 26,
        blockId: 'cet6-202606-1-q26',
        selectedKey: 'A',
        answerKey: 'A',
        answerWord: 'active',
      },
      {
        number: 27,
        blockId: 'cet6-202606-1-q27',
        selectedKey: 'C',
        answerKey: 'B',
        answerWord: 'contextual',
      },
    ],
  },
  matching: {
    directions:
      'Directions: Identify the paragraph from which the information in each statement is derived.',
    paragraphs: [
      {
        letter: 'A',
        text: 'University archives increasingly digitize rare manuscripts while preserving quiet reading rooms for close textual comparison.',
      },
      {
        letter: 'B',
        text: 'Small study groups benefit when each member verifies primary citations before drafting shared conclusions.',
      },
      {
        letter: 'C',
        text: 'Spaced repetition schedules distribute review sessions across days and weeks to prevent rapid forgetting.',
      },
    ],
    questions: [
      {
        number: 36,
        blockId: 'cet6-202606-1-q36',
        statement:
          ' Distributing review sessions over longer intervals helps learners counter rapid forgetting.',
        selectedKey: 'C',
        answerKey: 'C',
      },
    ],
  },
  carefulReading: {
    directions:
      'Directions: Read the following passages carefully and choose the best answer to each question directly following the passage.',
    passages: [
      {
        id: 'passage-1',
        title: 'Passage One · Questions 46 to 47 are based on the following passage.',
        paragraphs: [
          'Well-designed academic interfaces balance quiet visual hierarchy with immediate reference tools. When readers encounter an unfamiliar expression such as sustainable synthesis or primary citations, low-interference popovers preserve reading momentum.',
          'Cognitive studies suggest that stable typography and clear structural anchors lower visual fatigue across long analytical essays, helping students focus on argument logic rather than decorative chrome.',
        ],
        questions: [
          {
            number: 46,
            blockId: 'cet6-202606-1-q46',
            stem: 'How do low-interference reference popovers assist academic readers?',
            options: [
              { key: 'A', text: 'They maintain reading momentum while clarifying unfamiliar terms.' },
              { key: 'B', text: 'They replace the need for critical thinking.' },
              { key: 'C', text: 'They shorten complex analytical essays automatically.' },
              { key: 'D', text: 'They remove specialized terminology from textbooks.' },
            ],
            selectedKey: 'C',
            answerKey: 'A',
            explanation: '首段末句指出轻量浮窗在查词同时保持阅读连贯势头（preserve reading momentum）。',
          },
          {
            number: 47,
            blockId: 'cet6-202606-1-q47',
            stem: 'What does stable typography help students focus on according to Paragraph 2?',
            options: [
              { key: 'A', text: 'Interface animations and borders.' },
              { key: 'B', text: 'The underlying argument logic of the essay.' },
              { key: 'C', text: 'Counting words per paragraph.' },
              { key: 'D', text: 'Skipping unfamiliar vocabulary.' },
            ],
            selectedKey: 'B',
            answerKey: 'B',
            explanation: '第二段指出清晰排版帮助读者专注于文章论证逻辑（argument logic）。',
          },
        ],
      },
    ],
  },
  translation: {
    blockId: 'cet6-202606-1-translation',
    directions:
      'Directions: For this part, you are allowed 30 minutes to translate a passage from Chinese into English.',
    sourceZh:
      '近年来，越来越多的高校图书馆将传统馆藏与安静的数字研习空间相结合，既方便学生便捷检索文献，也保留了沉浸式阅读与学术讨论的氛围。',
    referenceEn:
      'In recent years, more and more university libraries have integrated traditional collections with quiet digital study spaces, making it convenient for students to retrieve literature while preserving an atmosphere conducive to immersive reading and academic discussion.',
  },
  answerSummaryRows: [
    { sectionLabel: 'Part II · 听力', rangeLabel: '1–2', answersText: '1. A · 2. B' },
    { sectionLabel: 'Part III · 选词填空', rangeLabel: '26–27', answersText: '26. A (active) · 27. B (contextual)' },
    { sectionLabel: 'Part III · 段落匹配', rangeLabel: '36', answersText: '36. C' },
    { sectionLabel: 'Part III · 仔细阅读', rangeLabel: '46–47', answersText: '46. A · 47. B' },
  ],
};

export const INITIAL_MISTAKE_ITEMS: MistakeEntryItem[] = [
  {
    id: 'm-q46',
    mistakeBlockId: 'mistake-202606-1-q46',
    questionBlockId: 'cet6-202606-1-q46',
    paperId: '202606-1',
    paperTitle: '2026 年 6 月六级真题 · 第 1 套',
    paperNotePath: '词屿/六级题库/历年真题/2026 年 6 月六级真题 · 第 1 套.md',
    session: '2026 年 6 月',
    setLabel: '第 1 套',
    questionNumber: 46,
    questionType: 'careful_reading',
    questionTypeLabel: '仔细阅读',
    stemPreview: '46. How do low-interference reference popovers assist academic readers?',
    myAnswer: 'C',
    correctAnswer: 'A',
    note: '误把「保持阅读连贯势头（preserve momentum）」看成了缩短文章篇幅。',
    status: 'reviewing',
    backToQuestionWikiLink: '[[2026 年 6 月六级真题 · 第 1 套#^cet6-202606-1-q46|回到原题]]',
    viewMistakeWikiLink: '[[六级错题索引#^mistake-202606-1-q46|查看错题记录]]',
    createdAt: '2026-11-27',
  },
];

export const SYNTHETIC_WORD_BANK: Record<string, WordEntry> = {
  sustainable: {
    id: 'w-sustainable',
    term: 'sustainable',
    kind: 'word',
    phoneticUs: '/səˈsteɪ.nə.bəl/',
    partsOfSpeech: ['adj.'],
    lookupProvider: '离线六级词库',
    senses: [{ partOfSpeech: 'adj.', meaningZh: '可持续的；能长期维持的' }],
    derivatives: [
      { word: 'sustain', partOfSpeech: 'v.', meaningZh: '维持；支撑' },
      { word: 'sustainability', partOfSpeech: 'n.', meaningZh: '可持续性' },
    ],
    collocations: [{ phrase: 'sustainable synthesis', meaningZh: '可持续的文献整理节奏' }],
    examples: [
      {
        en: 'Evening synthesis becomes much more sustainable for our team.',
        zh: '这让我们团队晚间的文献整理变得可持续得多。',
        highlight: 'sustainable',
      },
    ],
    sourceSentence: 'That makes evening synthesis much more sustainable for our team.',
    sourceNotePath: '词屿/六级题库/历年真题/2026 年 6 月六级真题 · 第 1 套.md',
    inVocabulary: true,
    savedToday: false,
  },
};

export const INITIAL_PREVIEW_VOCAB: VocabularyItem[] = [
  {
    id: 'pv-1',
    word: 'sustainable',
    phonetic: '/səˈsteɪ.nə.bəl/',
    partOfSpeech: 'adj.',
    meaningZh: '可持续的；能长期维持的',
    sourceSentence: 'That makes evening synthesis much more sustainable.',
    sourceNotePath: '词屿/六级题库/历年真题/2026 年 6 月六级真题 · 第 1 套.md',
    sourceNoteTitle: '2026 年 6 月六级真题 · 第 1 套.md',
    nextReviewLabel: '今日待复习',
    dueToday: true,
    createdAt: '2026-11-27',
  },
];

export const INITIAL_PREVIEW_REVIEW: ReviewCardItem[] = [
  {
    id: 'pr-1',
    word: 'sustainable',
    phonetic: '/səˈsteɪ.nə.bəl/',
    partOfSpeech: 'adj.',
    meaningZh: '可持续的；能长期维持的',
    sourceSentence: 'That makes evening synthesis much more sustainable.',
    sourceNotePath: '词屿/六级题库/历年真题/2026 年 6 月六级真题 · 第 1 套.md',
    sourceNoteTitle: '2026 年 6 月六级真题 · 第 1 套.md',
    intervals: { again: '10 分钟', hard: '1 天后', good: '3 天后', easy: '7 天后' },
  },
];

export const INITIAL_PREVIEW_ARCHIVE: DailyArchiveGroup[] = [
  {
    date: '2026-11-27',
    displayLabel: '今天 · 2026-11-27',
    notePath: '词屿/每日词汇/2026-11-27.md',
    entries: [{ id: 'pa-1', term: 'sustainable', meaningZh: '可持续的', timeLabel: '13:05' }],
  },
];

export const INITIAL_PREVIEW_MODELS: OllamaModelOption[] = [
  {
    id: 'qwen2.5:3b',
    name: 'qwen2.5:3b',
    sizeLabel: '1.9 GB',
    recommendation: '轻量快速 · 六级查词与整句翻译',
    installed: true,
  },
];
