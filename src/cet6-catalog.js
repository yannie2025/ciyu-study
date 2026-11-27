const CET6_ORIGIN = 'https://eol.nju.edu.cn/cet6/';
const CET6_WIDE_VIEW = 'ciyu-cet6-workspace';
const CET6_CATALOG = ['202606', '202512', '202506', '202412', '202406'].flatMap(date =>
  [1, 2, 3].map(set => {
    const id = date + '-' + set;
    const year = date.slice(0, 4);
    const monthNum = Number(date.slice(4));
    const session = year + ' 年 ' + monthNum + ' 月';
    return {
      id,
      sessionId: date,
      year,
      month: monthNum + ' 月',
      session,
      set,
      title: session + '六级真题 · 第 ' + set + ' 套',
      url: new URL('papers/' + id + '.html', CET6_ORIGIN).href,
    };
  }));
const CET6_INDEX_NAME = '真题索引';
const CET6_LEGACY_INDEX_NAME = '六级真题下载索引';
const CET6_INDEX_MARKER = '<!-- ciyu:cet6-index -->';
const CET6_INDEX_END = '<!-- /ciyu:cet6-index -->';

// 经实测音频静音波形校准的题组精确区间（修复 2026-06 第1/3套在线源错切与第2套缺失区间）
// 每项：[startSec, endSec, speechStartSec, speechEndSec]
const CET6_GROUP_CLIP_OVERRIDES = {
  '202606-1': [
    [33.6, 165.7, 35.5, 138.5],
    [165.7, 318.0, 167.7, 277.5],
    [318.0, 486.3, 356.4, 456.0],
    [486.3, 628.0, 488.3, 592.0],
    [628.0, 864.5, 665.0, 834.2],
    [864.5, 1049.9, 866.5, 1016.4],
    [1049.9, 1264.0, 1052.0, 1215.2],
  ],
  '202606-3': [
    [33.6, 165.7, 35.5, 138.5],
    [165.7, 318.0, 167.7, 277.5],
    [318.0, 486.3, 356.4, 456.0],
    [486.3, 628.0, 488.3, 592.0],
    [628.0, 864.5, 665.0, 834.2],
    [864.5, 1049.9, 866.5, 1016.4],
    [1049.9, 1264.0, 1052.0, 1215.2],
  ],
  '202606-2': [
    [0.0, 219.8, 36.0, 141.0],
    [219.8, 416.8, 222.5, 336.5],
    [416.8, 632.7, 441.0, 564.1],
    [632.7, 825.6, 635.5, 742.5],
    [825.6, 1076.7, 855.1, 1011.0],
    [1076.7, 1322.1, 1079.5, 1259.5],
    [1322.1, 1568.8, 1324.3, 1479.0],
  ],
};

function cet6VaultPaths(rootFolder = '词屿') {
  const root = clean(rootFolder, 120).replace(/\/+$/u, '') || '词屿';
  return {
    rootFolder: root,
    examIndexNote: `${root}/六级题库/${CET6_INDEX_NAME}.md`,
    papersFolder: `${root}/六级题库/历年真题`,
    transcriptsFolder: `${root}/六级题库/听力原文`,
    audioFolder: `${root}/六级题库/听力音频`,
    mistakeIndexNote: `${root}/错题本/六级错题索引.md`,
  };
}

function cet6Text(value) {
  return (value || '').trim().replace(/\s+/gu, ' ').replace(/[&<]/g, char => char === '&' ? '&amp;' : '&lt;')
    .replace(/[\\`*_\[\]]/g, '\\$&');
}

function cet6PlainText(node) {
  return (node?.textContent || '').trim().replace(/\s+/gu, ' ');
}

function cet6Link(raw, base, extension) {
  try {
    const url = new URL(raw, base);
    if (url.origin === new URL(CET6_ORIGIN).origin && url.pathname.startsWith('/cet6/papers/') &&
      url.pathname.toLowerCase().endsWith(extension)) return url.href;
  } catch {}
  return '';
}

function cet6Prose(node, { chinese = false, blanks = false, paragraphs = false, raw = false } = {}) {
  const lines = (node?.textContent || '').trim().split(/\r?\n/u).map(line => line.trim());
  const blocks = [];
  let block = [];
  for (const line of lines) {
    if (!line) {
      if (block.length) blocks.push(block.join(chinese ? '' : ' '));
      block = [];
      continue;
    }
    block.push(line);
    if (paragraphs && line.length < 66 && /[.!?。！？]["”’）)]?$/u.test(line)) {
      blocks.push(block.join(chinese ? '' : ' '));
      block = [];
    }
  }
  if (block.length) blocks.push(block.join(chinese ? '' : ' '));
  return blocks.map(body => {
    if (raw) {
      if (!blanks) return body;
      return body.replace(/\[\s*(2[6-9]|3[0-5])\s*\]|\b(2[6-9]|3[0-5])\b/gu,
        (_, bracketed, bare) => '〔' + (bracketed || bare) + '〕');
    }
    if (!blanks) return cet6Text(body);
    const numbered = body.replace(/\[\s*(2[6-9]|3[0-5])\s*\]|\b(2[6-9]|3[0-5])\b/gu,
      (_, bracketed, bare) => '〔' + (bracketed || bare) + '〕');
    return cet6Text(numbered).replace(/〔(\d+)〕/g, '**〔$1〕**');
  }).join('\n\n');
}

function cet6Callout(title, markdown) {
  return '> [!check]- ' + title + '\n' + markdown.split('\n').map(line => line ? '> ' + line : '>').join('\n');
}

function parseCet6HtmlDom(html) {
  if (typeof document !== 'undefined' && document.createElement) {
    const template = document.createElement('template');
    template.innerHTML = html;
    return template.content;
  }
  throw new Error('当前运行环境缺少 HTML 解析器。');
}

function parseCet6PaperStructured(paper, html) {
  const root = parseCet6HtmlDom(html);
  const sections = ['writing', 'listening', 'banked', 'matching', 'careful', 'translation']
    .map(id => root.querySelector('section#' + id));
  if (sections.some(section => !section)) throw new Error('来源页面缺少试卷分节。');
  const [writing, listening, banked, matching, careful, translation] = sections;
  const assets = [...root.querySelectorAll('.topbar a[download]')].map(link => link.getAttribute('href'));
  const pdfs = assets.map(href => cet6Link(href, paper.url, '.pdf')).filter(Boolean);
  const audio = assets.map(href => cet6Link(href, paper.url, '.mp3')).find(Boolean) || '';

  const answers = new Map();
  const explanations = new Map();
  const sectionDirections = new Map();

  const record = (node, min, max, letters) => {
    const n = Number(node.dataset.no);
    const answer = node.dataset.ans?.trim() || '';
    if (!Number.isInteger(n) || n < min || n > max || answers.has(n) || (answer && (answer.length !== 1 || !letters.includes(answer)))) {
      throw new Error('来源的题号或答案无法校验。');
    }
    answers.set(n, answer || 'A');
    const expPlain = cet6PlainText(node.querySelector('.explain'));
    if (expPlain) explanations.set(n, expPlain);
    return n;
  };

  const parseChoiceQuestion = (node, min, max) => {
    const n = record(node, min, max, 'ABCD');
    const options = [];
    for (const label of node.querySelectorAll('label.opt')) {
      const key = label.dataset.key;
      let body = cet6PlainText(label.querySelector('.otext'));
      const followingDirections = min === 1 && body.match(/\s+Section ([ABC]) Directions:\s+(.+)$/u);
      if (followingDirections) {
        sectionDirections.set(followingDirections[1], followingDirections[2]);
        body = body.slice(0, followingDirections.index).trim();
      }
      if (key && body) options.push({ key, text: body });
    }
    if (options.length !== 4 || [...'ABCD'].some(letter => !options.some(o => o.key === letter))) {
      throw new Error('第 ' + n + ' 题缺少选项。');
    }
    const stem = cet6PlainText(node.querySelector('.stem'));
    if (min === 46 && !stem) throw new Error('第 ' + n + ' 题缺少题干。');
    return {
      number: n,
      blockId: `cet6-${paper.id}-q${n}`,
      stem,
      options: ['A', 'B', 'C', 'D'].map(k => options.find(o => o.key === k)),
      answerKey: answers.get(n) || 'A',
      explanation: explanations.get(n) || undefined,
    };
  };

  const writingPrompt = cet6Prose(writing.querySelector('.passage'), { raw: true, paragraphs: true });
  const sourceZh = cet6Prose(translation.querySelector('.passage'), { chinese: true, raw: true, paragraphs: true });
  if (!writingPrompt) throw new Error('来源缺少写作题。');
  if (!sourceZh) throw new Error('来源缺少翻译题。');

  const sectionTitles = { A: '长对话', B: '短文理解', C: '讲座或讲话' };
  const formatClipClock = sec => {
    if (!Number.isFinite(sec) || sec < 0) return '';
    const total = Math.floor(sec);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };
  const listeningGroups = [];
  let currentGroup = null;
  for (const child of listening.children) {
    if (child.matches('h3.grp')) {
      const segBtn = child.querySelector('button.segplay[data-start][data-end], [data-start][data-end]');
      const parsedStart = segBtn ? Number(segBtn.getAttribute('data-start')) : NaN;
      const parsedEnd = segBtn ? Number(segBtn.getAttribute('data-end')) : NaN;
      const hasClipRange = Number.isFinite(parsedStart) && Number.isFinite(parsedEnd) && parsedEnd > parsedStart;
      const startSec = hasClipRange ? parsedStart : undefined;
      const endSec = hasClipRange ? parsedEnd : undefined;
      const timeRangeLabel = hasClipRange ? `${formatClipClock(parsedStart)}–${formatClipClock(parsedEnd)}` : undefined;
      const heading = child.cloneNode(true);
      heading.querySelectorAll('button').forEach(btn => btn.remove());
      const rawName = cet6PlainText(heading);
      const secMatch = rawName.match(/^Section ([ABC])\b/u);
      const sec = secMatch?.[1] || 'A';
      const shortTitle = rawName.replace(/^Section [ABC]\s*·\s*[^·]+·\s*/u, '').trim() || rawName;
      currentGroup = {
        id: `${paper.id}-grp-${listeningGroups.length + 1}`,
        section: sec,
        sectionLabel: `Section ${sec} · ${sectionTitles[sec] || '听力'}`,
        title: shortTitle,
        questionRange: '',
        startSec,
        endSec,
        timeRangeLabel,
        directions: undefined,
        timestampLevel: hasClipRange ? 'paragraph' : 'none',
        hasTimestamps: hasClipRange,
        segments: [],
        questions: [],
      };
      listeningGroups.push(currentGroup);
    } else if (child.matches('.q')) {
      const q = parseChoiceQuestion(child, 1, 25);
      if (!currentGroup) {
        currentGroup = {
          id: `${paper.id}-grp-1`,
          section: 'A',
          sectionLabel: 'Section A · 长对话',
          title: 'Questions 1 to 4',
          questionRange: '1–4 题',
          timestampLevel: 'none',
          hasTimestamps: false,
          segments: [],
          questions: [],
        };
        listeningGroups.push(currentGroup);
      }
      currentGroup.questions.push(q);
    }
  }
  const clipOverrides = CET6_GROUP_CLIP_OVERRIDES[paper.id];
  listeningGroups.forEach((grp, idx) => {
    if (clipOverrides && Array.isArray(clipOverrides[idx])) {
      const [ovStart, ovEnd, ovSpStart, ovSpEnd] = clipOverrides[idx];
      grp.startSec = ovStart;
      grp.endSec = ovEnd;
      grp.speechStartSec = ovSpStart;
      grp.speechEndSec = ovSpEnd;
      grp.questionsAudioStartSec = ovSpEnd;
      grp.timeRangeLabel = `${formatClipClock(ovStart)}–${formatClipClock(ovEnd)}`;
      grp.timestampLevel = 'paragraph';
      grp.hasTimestamps = true;
    }
    if (grp.questions.length) {
      const firstNo = grp.questions[0].number;
      const lastNo = grp.questions[grp.questions.length - 1].number;
      grp.questionRange = `${firstNo}–${lastNo} 题`;
    }
    if (sectionDirections.has(grp.section) && !listeningGroups.some(g => g.section === grp.section && g.directions)) {
      grp.directions = sectionDirections.get(grp.section);
    }
  });

  // 选词填空
  const bankedPassage = cet6Prose(banked.querySelector('.passage'), { blanks: true, paragraphs: true, raw: true });
  if (!bankedPassage) throw new Error('来源缺少选词填空文章。');
  const wordBank = [...banked.querySelectorAll('.wbitem')].map(item => {
    const key = item.querySelector('b')?.textContent.trim() || '';
    const word = item.textContent.slice(key.length).trim();
    return { key, word };
  });
  if (wordBank.length !== 15 || wordBank.map(w => w.key).join('') !== 'ABCDEFGHIJKLMNO') {
    throw new Error('来源缺少完整的选词列表。');
  }
  const bankedQuestions = [];
  for (const blank of banked.querySelectorAll('.blank')) {
    const n = record(blank, 26, 35, 'ABCDEFGHIJKLMNO');
    const ansKey = answers.get(n) || 'A';
    bankedQuestions.push({
      number: n,
      blockId: `cet6-${paper.id}-q${n}`,
      answerKey: ansKey,
      answerWord: wordBank.find(w => w.key === ansKey)?.word || ansKey,
      explanation: explanations.get(n),
    });
  }

  // 段落匹配
  const matchingParagraphs = [...matching.querySelectorAll('.para')].map(para => {
    const letter = para.querySelector('.pkey')?.textContent.trim() || para.dataset.key || '';
    const text = cet6PlainText(para).slice(letter.length).trim();
    if (!/^[A-Z]$/.test(letter) || !text) throw new Error('来源有段落编号缺失。');
    return { letter, text };
  });
  if (!matchingParagraphs.length) throw new Error('来源缺少匹配段落。');
  const matchingQuestions = [...matching.querySelectorAll('.mstmt')].map(node => {
    const n = record(node, 36, 45, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    const head = node.querySelector('.qhead')?.cloneNode(true);
    head?.querySelector('.qno')?.remove();
    const statement = cet6PlainText(head);
    if (!statement) throw new Error('来源缺少匹配题干。');
    return {
      number: n,
      blockId: `cet6-${paper.id}-q${n}`,
      statement,
      answerKey: answers.get(n) || 'A',
      explanation: explanations.get(n),
    };
  });

  // 仔细阅读
  const carefulPassagesNodes = [...careful.querySelectorAll('.careful-passage')];
  if (carefulPassagesNodes.length !== 2) throw new Error('来源缺少仔细阅读文章。');
  const carefulPassages = carefulPassagesNodes.map((passageNode, idx) => {
    const pTitle = cet6PlainText(passageNode.querySelector('h3')) || `Passage ${idx + 1}`;
    const pBody = cet6Prose(passageNode.querySelector('.passage'), { paragraphs: true, raw: true });
    if (!pBody) throw new Error('来源缺少仔细阅读文章。');
    const qs = [...passageNode.querySelectorAll('.q')].map(qNode => parseChoiceQuestion(qNode, 46, 55));
    return {
      id: `${paper.id}-passage-${idx + 1}`,
      title: pTitle,
      paragraphs: pBody.split('\n\n').filter(Boolean),
      questions: qs,
    };
  });

  if (answers.size !== 55) {
    throw new Error(`来源只提供了 ${answers.size} 道可核验的客观题，已保留下载入口。`);
  }

  const writingRef = writing.querySelector('pre.rubrictxt')?.textContent.trim() || undefined;
  const translationRef = translation.querySelector('pre.rubrictxt')?.textContent.trim() || undefined;

  const answerRanges = [
    [1, 25, '听力'],
    [26, 35, '选词填空'],
    [36, 45, '段落匹配'],
    [46, 55, '仔细阅读'],
  ];
  const answerSummaryRows = answerRanges.map(([start, end, sectionLabel]) => {
    const items = [];
    for (let i = start; i <= end; i++) items.push(`${i}.${answers.get(i)}`);
    return {
      sectionLabel,
      rangeLabel: `${start}–${end}`,
      answersText: items.join('  '),
    };
  });

  return {
    paperId: paper.id,
    title: paper.title,
    session: paper.session,
    setLabel: `第 ${paper.set} 套`,
    sourceLabel: '南京大学六级历年真题自测库',
    sourceUrl: paper.url,
    pdfs,
    audioUrl: audio,
    audioStatus: audio ? 'link_only' : 'no_audio',
    writing: {
      directions: 'Directions: For this part, you are allowed 30 minutes to write an essay.',
      prompt: writingPrompt,
      blockId: `cet6-${paper.id}-writing`,
      sampleEssay: writingRef,
    },
    listening: {
      directions: 'Directions: In this section, you will hear long conversations, passages, and lectures or talks.',
      summary: audio ? '支持在线直接播放或下载离线音频，提供盲听自查与错题复盘。' : '当前套卷未附独立在线音频链接。',
      groups: listeningGroups,
    },
    bankedCloze: {
      directions: 'Directions: Fill in the blanks in the following passage by selecting suitable words from the word bank.',
      paragraphsWithBlanks: bankedPassage.split('\n\n').filter(Boolean),
      wordBank,
      questions: bankedQuestions,
    },
    matching: {
      directions: 'Directions: Match each statement with the paragraph from which the information is derived.',
      paragraphs: matchingParagraphs,
      questions: matchingQuestions,
    },
    carefulReading: {
      directions: 'Directions: Read the passages carefully and choose the best answer to each question.',
      passages: carefulPassages,
    },
    translation: {
      directions: 'Directions: For this part, you are allowed 30 minutes to translate a passage from Chinese into English.',
      blockId: `cet6-${paper.id}-translation`,
      sourceZh,
      referenceEn: translationRef,
    },
    answers,
    explanations,
    answerSummaryRows,
  };
}

function formatCet6Paper(paper, html) {
  const doc = parseCet6PaperStructured(paper, html);
  const links = [
    `[在线自测](<${paper.url}>)`,
    doc.pdfs[0] && `[试卷 PDF](<${doc.pdfs[0]}>)`,
    doc.pdfs[1] && `[答案解析 PDF](<${doc.pdfs[1]}>)`,
    doc.audioUrl && `[听力 MP3](<${doc.audioUrl}>)`,
  ].filter(Boolean);

  const out = [
    `# ${paper.title}`,
    '资料来自南京大学「大学英语六级 · 历年真题自测」，供学习使用。',
    links.join(' · '),
    '**试题**　[[#Part I · 写作|写作]] · [[#Part II · 听力|听力]] · [[#Part III · 阅读|阅读]] · [[#Part IV · 翻译|翻译]]\n\n' +
      '**对照**　[[#听力材料]] · [[#参考答案]]',
    '## Part I · 写作',
    '> ' + doc.writing.prompt.split('\n').map(cet6Text).join('\n> ') + ` ^${doc.writing.blockId}`,
    '## Part II · 听力',
  ];

  let lastSec = '';
  for (const grp of doc.listening.groups) {
    if (grp.section !== lastSec) {
      out.push(`### ${grp.sectionLabel}`);
      if (grp.directions) out.push('> **Directions**\n>\n> ' + cet6Text(grp.directions));
      lastSec = grp.section;
    }
    out.push(`#### ${cet6Text(grp.title)}（${grp.questionRange}）`);
    for (const q of grp.questions) {
      out.push(
        `**${q.number}.**${q.stem ? ' ' + cet6Text(q.stem) : ''} ^${q.blockId}`,
        q.options.map(o => `- **${o.key})** ${cet6Text(o.text)}`).join('\n')
      );
    }
  }

  out.push(
    '## Part III · 阅读',
    '### Section A · 选词填空（26–35）',
    doc.bankedCloze.paragraphsWithBlanks
      .map(p => cet6Text(p).replace(/〔(\d+)〕/g, '**〔$1〕**'))
      .join('\n\n'),
    '#### 备选词'
  );
  const wb = doc.bankedCloze.wordBank;
  out.push([
    '| A–E | F–J | K–O |',
    '| --- | --- | --- |',
    ...[0, 1, 2, 3, 4].map(idx =>
      '| ' + [idx, idx + 5, idx + 10].map(i => `**${wb[i].key})** ${cet6Text(wb[i].word).replace(/\|/g, '\\|')}`).join(' | ') + ' |'
    ),
  ].join('\n'));
  out.push(
    doc.bankedCloze.questions
      .map(q => `- **〔${q.number}〕** 作答区 ^${q.blockId}`)
      .join('\n')
  );

  out.push('### Section B · 段落匹配（36–45）');
  for (const para of doc.matching.paragraphs) {
    out.push(`**${para.letter})** ${cet6Text(para.text)}`);
  }
  for (const mq of doc.matching.questions) {
    out.push(`**${mq.number}.** ${cet6Text(mq.statement)} ^${mq.blockId}`);
  }

  out.push('### Section C · 仔细阅读（46–55）');
  for (const p of doc.carefulReading.passages) {
    out.push(`#### ${cet6Text(p.title)}`, p.paragraphs.map(cet6Text).join('\n\n'));
    for (const q of p.questions) {
      out.push(
        `**${q.number}.** ${cet6Text(q.stem)} ^${q.blockId}`,
        q.options.map(o => `- **${o.key})** ${cet6Text(o.text)}`).join('\n')
      );
    }
  }

  out.push(
    '## Part IV · 翻译',
    '### 中文原文',
    cet6Text(doc.translation.sourceZh) + ` ^${doc.translation.blockId}`,
    '## 听力材料',
    doc.audioUrl ? `[播放或下载来源听力 MP3](<${doc.audioUrl}>)` : '来源未附独立听力音频链接。',
    '可在词屿扩展的「题库 → 听力自查」中直接在线播放音频、盲听自查或粘贴补充双语原文。',
    '## 参考答案'
  );

  const ranges = [[1, 25, '听力'], [26, 35, '选词填空'], [36, 45, '段落匹配'], [46, 55, '仔细阅读']];
  for (const [start, end, label] of ranges) {
    const lines = ['| 题号 | 答案 |', '| --- | --- |'];
    for (let n = start; n <= end; n += 5) {
      const rowEnd = Math.min(n + 4, end);
      const row = [];
      for (let current = n; current <= rowEnd; current++) row.push(`${current}. ${doc.answers.get(current)}`);
      lines.push(`| ${n}–${rowEnd} | ${row.join(' · ')} |`);
    }
    out.push(`### ${label}答案（${start}–${end}）`, cet6Callout('展开' + label + '答案', lines.join('\n')));
  }

  if (doc.explanations.size) {
    const expEntries = [...doc.explanations.entries()].sort((a, b) => a[0] - b[0]);
    out.push(
      cet6Callout(
        '展开客观题解析',
        expEntries.map(([num, body]) => `**${num}.** ${cet6Text(body)}`).join('\n\n')
      )
    );
  }
  if (doc.writing.sampleEssay) {
    out.push(
      '### 写作参考',
      cet6Callout(
        '展开写作参考',
        doc.writing.sampleEssay.split(/\n\s*\n/u).map(b => b.split('\n').map(cet6Text).join('  \n')).join('\n\n')
      )
    );
  }
  if (doc.translation.referenceEn) {
    out.push(
      '### 翻译参考',
      cet6Callout(
        '展开翻译参考',
        doc.translation.referenceEn.split(/\n\s*\n/u).map(b => b.split('\n').map(cet6Text).join('  \n')).join('\n\n')
      )
    );
  }

  return out.join('\n\n') + '\n';
}

function detectTranscriptGroupIndex(headingLine) {
  const h = String(headingLine || '').replace(/^#+\s*/u, '').trim();
  if (!h) return -1;
  if (/Questions?\s*1\s*[-–—to]+\s*4\b|Conversation\s*(?:1|One)\b|长对话\s*[一1]/iu.test(h)) return 0;
  if (/Questions?\s*5\s*[-–—to]+\s*8\b|Conversation\s*(?:2|Two)\b|长对话\s*[二2]/iu.test(h)) return 1;
  if (/Questions?\s*9\s*[-–—to]+\s*11\b|Passage\s*(?:1|One)\b|短文\s*[一1]/iu.test(h)) return 2;
  if (/Questions?\s*12\s*[-–—to]+\s*15\b|Passage\s*(?:2|Two)\b|短文\s*[二2]/iu.test(h)) return 3;
  if (/Questions?\s*16\s*[-–—to]+\s*18\b|Recording\s*(?:1|One)\b|Lecture\s*(?:1|One)\b|讲座\s*[一1]/iu.test(h)) return 4;
  if (/Questions?\s*19\s*[-–—to]+\s*21\b|Recording\s*(?:2|Two)\b|Lecture\s*(?:2|Two)\b|讲座\s*[二2]/iu.test(h)) return 5;
  if (/Questions?\s*22\s*[-–—to]+\s*25\b|Recording\s*(?:3|Three)\b|Lecture\s*(?:3|Three)\b|讲座\s*[三3]/iu.test(h)) return 6;
  return -1;
}

function parseTranscriptMarkdownIntoSegments(rawMarkdown, paperId, questionRangeNums = []) {
  const cleaned = (rawMarkdown || '')
    .replace(/^---[\s\S]*?---\n*/u, '')
    .replace(/^#\s+.+$/gmu, '')
    .trim();
  if (!cleaned) return { segments: [], groupedSegments: null, timestampLevel: 'none' };

  const blocks = cleaned.split(/\n\s*\n+/u).map(b => b.trim()).filter(Boolean);
  const segments = [];
  const groupedSegments = new Map();
  let currentGroupIdx = -1;
  let hasExplicitGroups = false;
  let hasParagraphTs = false;
  let segSeq = 0;
  let groupSegSeq = 0;

  blocks.forEach(block => {
    if (
      block.startsWith('> [!info]') ||
      block.startsWith('| ') ||
      /^-{3,}$/u.test(block) ||
      /^(?:\[\[#[^\]]+\]\](?:\s*[·•|]\s*)?)+$/u.test(block) ||
      /^\*\*对应试卷\*\*/u.test(block)
    ) return;
    const rawLines = block.split(/\r?\n/u).map(l => l.trim()).filter(Boolean);
    if (!rawLines.length) return;

    // 若该段以 ## / ### 题组标题开头，切换到对应听力题组（0..6 对应 Q1-4 .. Q22-25）
    if (/^#{2,4}\s+/u.test(rawLines[0])) {
      const detected = detectTranscriptGroupIndex(rawLines[0]);
      if (detected >= 0) {
        currentGroupIdx = detected;
        groupSegSeq = 0;
        hasExplicitGroups = true;
        if (!groupedSegments.has(currentGroupIdx)) groupedSegments.set(currentGroupIdx, []);
      }
      rawLines.shift();
      if (!rawLines.length) return;
    }

    let first = rawLines[0];
    let startSec;
    let timeLabel;
    const tsMatch = first.match(/^\[?(\d{1,2}):(\d{2})\]?\s*(.*)$/u);
    if (tsMatch) {
      startSec = Number(tsMatch[1]) * 60 + Number(tsMatch[2]);
      timeLabel = `${tsMatch[1].padStart(2, '0')}:${tsMatch[2]}`;
      first = tsMatch[3];
      hasParagraphTs = true;
    }

    const nextGroupIdx = groupSegSeq + 1;
    let speaker =
      currentGroupIdx === 2 || currentGroupIdx === 3
        ? `独白 · 第 ${nextGroupIdx} 段`
        : currentGroupIdx >= 4
          ? `讲座 · 第 ${nextGroupIdx} 段`
          : `第 ${nextGroupIdx} 段`;
    let speakerRole = 'narrator';
    const genderMatch = first.match(
      /^(?:\*\*|__)?\s*(?:([♂♀])\s*)?(Woman|Man|Female|Male|W|M|女士(?:\s*[（(]W[）)])?|男士(?:\s*[（(]M[）)])?|女人(?:\s*[（(]W[）)])?|男人(?:\s*[（(]M[）)])?|女(?:\s*[（(]W[）)])?|男(?:\s*[（(]M[）)])?)\s*(?:\*\*|__)?\s*[:：]\s*(?:\*\*|__)?\s*(.+)$/iu
    );
    if (genderMatch) {
      const sym = genderMatch[1] || '';
      const rawTag = genderMatch[2].toUpperCase();
      const isFemale = sym === '♀' || rawTag.startsWith('W') || rawTag.startsWith('F') || rawTag.includes('女');
      speaker = isFemale ? '♀ 女士 (W)' : '♂ 男士 (M)';
      speakerRole = isFemale ? 'a' : 'b';
      first = genderMatch[3].trim();
    } else {
      const narratorMatch = first.match(
        /^(?:\*\*|__)?\s*(Speaker\s*\d+|Narrator|Question\s*\d*|Q\d*|(?:独白|短文|讲座|旁白|段落)(?:\s*[·•\-]\s*第?\s*\d+\s*段?)?|第\s*\d+\s*段)\s*(?:\*\*|__)?\s*[:：]\s*(?:\*\*|__)?\s*(.+)$/iu
      );
      if (narratorMatch) {
        speaker = narratorMatch[1].trim();
        speakerRole = 'narrator';
        first = narratorMatch[2].trim();
      }
    }

    const enLines = [first];
    const zhLines = [];
    for (let i = 1; i < rawLines.length; i++) {
      const line = rawLines[i].replace(/^>\s*/u, '').trim();
      if (!line) continue;
      const hanCount = (line.match(/[\p{Script=Han}]/gu) || []).length;
      if (/^(?:译文?|中文)[:：]/u.test(line) || hanCount >= 3) {
        zhLines.push(line.replace(/^(?:译文?|中文)[:：]\s*/u, '').trim());
      } else {
        enLines.push(line);
      }
    }
    const textEn = enLines.join(' ').trim();
    if (!textEn) return;
    segSeq++;
    groupSegSeq++;
    const segObj = {
      id: `${paperId}-seg-${segSeq}`,
      speaker,
      speakerRole,
      startSec,
      timeLabel,
      textEn,
      translationZh: zhLines.length ? zhLines.join(' ') : undefined,
      questionNumbers: questionRangeNums.length ? questionRangeNums.slice(0, 2) : undefined,
    };
    segments.push(segObj);
    if (currentGroupIdx >= 0) {
      if (!groupedSegments.has(currentGroupIdx)) groupedSegments.set(currentGroupIdx, []);
      groupedSegments.get(currentGroupIdx).push(segObj);
    }
  });

  return {
    segments,
    groupedSegments: hasExplicitGroups ? groupedSegments : null,
    timestampLevel: hasParagraphTs ? 'paragraph' : 'none',
  };
}

function estimateSegmentTimingsForGroup(grp, groupIndex = -1) {
  if (!grp || !Array.isArray(grp.segments) || grp.segments.length === 0) return;
  if (typeof grp.startSec !== 'number' || typeof grp.endSec !== 'number' || grp.endSec <= grp.startSec) return;
  if (grp.segments.some(seg => typeof seg.startSec === 'number')) return;

  const formatClock = sec => {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  };

  const span = grp.endSec - grp.startSec;
  const count = grp.segments.length;
  const qCount = grp.questions?.length || (groupIndex === 2 || groupIndex === 4 || groupIndex === 5 ? 3 : 4);

  // 剔除片头 Directions 与片尾原声读题+作答停顿，只把原文段落精准分布在真实正文播读区间
  let speechStart = grp.speechStartSec;
  if (typeof speechStart !== 'number') {
    let dirPad = 2.5;
    if (groupIndex === 0 && grp.startSec < 10) dirPad = 36;
    else if (groupIndex === 2) dirPad = 24;
    else if (groupIndex === 4) dirPad = 28;
    speechStart = Math.min(grp.endSec - 15, grp.startSec + dirPad);
  }

  let speechEnd = grp.speechEndSec;
  if (typeof speechEnd !== 'number') {
    // 标准 26 分钟音频每题含约 13.4s 作答停顿 + 5s 读题（约 18.5s/题）；压缩停顿版约 7.5s/题
    const qTailSec = span > 175 ? (qCount * 18.5 + 8) : (qCount * 7.5 + 6);
    speechEnd = Math.max(speechStart + 20, grp.endSec - qTailSec);
  }
  grp.questionsAudioStartSec = Math.min(grp.endSec, Math.max(speechStart, speechEnd));

  const usable = Math.max(1, speechEnd - speechStart);
  const weights = grp.segments.map(seg => {
    const words = (String(seg.textEn || '').match(/[A-Za-z0-9']+/g) || []).length;
    return Math.max(3, words + 2.5);
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;

  let cum = 0;
  for (let i = 0; i < count; i++) {
    const seg = grp.segments[i];
    const startSec = Math.round((speechStart + (cum / totalWeight) * usable) * 2) / 2;
    seg.startSec = Math.min(speechEnd, Math.max(grp.startSec, startSec));
    seg.timeLabel = `~${formatClock(seg.startSec - grp.startSec)}`;
    cum += weights[i];
  }
  for (let i = 0; i < count; i++) {
    grp.segments[i].endSec = i < count - 1 ? grp.segments[i + 1].startSec : speechEnd;
  }
}

function cet6IndexBody(plugin, files) {
  const { vault } = plugin.app;
  const examRows = CET6_CATALOG.map(paper => {
    const file = files.get(paper.id);
    const local = file instanceof TFile && vault.getAbstractFileByPath(file.path) === file
      ? `[[${file.path.slice(0, -3)}\\|打开试卷]]` : '待导入';
    return `| ${paper.session} | 第 ${paper.set} 套 | ${local} | [在线自测与音频](<${paper.url}>) |`;
  });
  const official = '词屿/六级题库/文字版/' + CET6_SAMPLE.basename;
  const reference = vault.getAbstractFileByPath(official + '.md') instanceof TFile
    ? '\n\n' + `[[${official}|官方六级笔试样卷（文字版）]]` : '';
  return [CET6_INDEX_MARKER, '', `当前库已导入 **${files.size} / ${CET6_CATALOG.length}** 套六级真题。可在词屿侧栏「题库」一键下载、批量管理或直接启动听力自查。`, '',
    '| 考次 | 套卷 | 本地文字版 | 在线题源与音频 |', '| --- | --- | --- | --- |', ...examRows, reference.trim(), '',
    CET6_INDEX_END].filter((line, index, lines) => line || lines[index - 1] !== '').join('\n');
}

async function downloadCet6Paper(plugin, folder, paper) {
  const response = await requestUrl({ url: paper.url, throw: false });
  if (response.status !== 200 || !response.text || response.text.length > 2_000_000) {
    throw new Error(`来源暂不可读（HTTP ${response.status}）。`);
  }
  const doc = parseCet6PaperStructured(paper, response.text);
  plugin.cet6Controller?.cacheDocument(paper.id, doc);
  const markdown = formatCet6Paper(paper, response.text);
  return writeExamNote(plugin, folder, paper.title, markdown);
}

async function savedCet6Papers(plugin, primaryFolder) {
  const files = new Map();
  const { vault } = plugin.app;
  const candidateFolders = [...new Set([
    primaryFolder,
    plugin.settings.cet6CatalogFolder,
    cet6VaultPaths(plugin.cet6RootFolder || '词屿').papersFolder,
    '词屿/六级题库/文字版/历年真题',
  ].filter(f => typeof f === 'string'))];

  for (const folder of candidateFolders) {
    const directory = folder ? vault.getAbstractFileByPath(folder) : vault.getRoot?.();
    if (!(directory instanceof TFolder)) continue;
    for (const file of directory.children) {
      if (!(file instanceof TFile) || file.extension !== 'md') continue;
      const paper = CET6_CATALOG.find(item => file.basename === item.title || file.basename.startsWith(item.title + ' ('));
      if (!paper || files.has(paper.id)) continue;
      try {
        const text = await vault.cachedRead ? await vault.cachedRead(file) : await vault.read(file);
        if (text.includes(paper.url) || text.includes(`# ${paper.title}`)) {
          files.set(paper.id, file);
        }
      } catch {}
    }
  }
  return files;
}

async function saveCet6Index(plugin, indexFilePath, files) {
  const { vault } = plugin.app;
  const folder = indexFilePath.includes('/') ? indexFilePath.split('/').slice(0, -1).join('/') : '';
  const basename = indexFilePath.split('/').pop().replace(/\.md$/iu, '');
  const body = cet6IndexBody(plugin, files);
  const candidates = new Set([
    vault.getAbstractFileByPath(indexFilePath),
    plugin.settings.lastCet6Index ? vault.getAbstractFileByPath(plugin.settings.lastCet6Index) : null,
  ]);

  for (const file of candidates) {
    if (!(file instanceof TFile)) continue;
    const region = new RegExp(CET6_INDEX_MARKER + '[\\s\\S]*?' + CET6_INDEX_END);
    if (!region.test(await vault.read(file))) continue;
    let updated = false;
    await vault.process(file, content => {
      updated = region.test(content);
      return updated ? content.replace(region, () => body) : content;
    });
    if (updated) return file;
  }
  return writeExamNote(plugin, folder, basename, `# 六级真题索引\n\n${body}\n`);
}

/**
 * 六级闭环学习控制器（题库下载 / 批量删除与回收站撤销 / 扩展内听力自查与播放器 / 忠实原卷做题 / 错题双向块跳转）
 */
class Cet6StudyController {
  constructor(plugin) {
    this.plugin = plugin;
    this.subView = 'bank';
    this.workspaceMode = 'index';
    this.indexFilter = 'all';
    this.indexQuery = '';
    this.selectedPaperIds = ['202606-1', '202606-2', '202606-3'];
    this.savedFiles = new Map();
    this.failedByPaper = new Map();
    this.docCache = new Map();
    this.userAnswersByPaper = new Map();
    this.gradedPapers = new Set();
    this.selfCheckByPaper = new Map();

    this.activePaperId = '202606-1';
    this.activePaperSection = 'writing';
    this.paperAnswersExpanded = false;

    this.listeningSection = 'A';
    this.listeningGroupId = '';
    this.transcriptMode = 'blind';
    this.hideChineseInBilingual = false;
    this.narrowPane = 'questions';
    this.listeningAnswersExpanded = false;
    this.loadingListeningPaper = false;
    this.listeningLoadError = '';
    this.transcriptSaving = false;
    this.audioDownloading = false;
    this.audioDownloadPercent = 0;

    this.audio = null;
    this.audioPaperId = '';
    this.audioPlaying = false;
    this.audioCurrentTime = 0;
    this.audioDuration = 1500;
    this.audioRate = 1;
    this.audioError = '';
    this.clipMode = 'group';
    this.loopSegmentId = null;
    this.activeSegmentId = null;
    this.activeSentenceId = null;
    this._lastTimeNotify = -1;
    this._audioPlaySeq = 0;
    this._seekGraceUntil = 0;

    this.highlightedQuestionBlockId = null;
    this.highlightedMistakeBlockId = null;
    this.mistakeSessionFilter = 'all';
    this.mistakeTypeFilter = 'all';
    this.mistakeStatusFilter = 'all';

    this.overallStatus = 'not_downloaded';
    this.progressText = '';
    this.progressPercent = undefined;
    this.errorMessage = '';
    this.justImported = null;
    this.duplicateClickNotice = null;
    this.justDeleted = null;
    this.lastDeleteBatch = null;

    this.modalHandle = null;
    this.modalState = null;
    this.deleteModalHandle = null;
    this.localImportRawFiles = new Map();
  }

  paths() {
    const customFolder = clean(this.plugin.settings.cet6CatalogFolder || '', 200);
    if (customFolder && !customFolder.startsWith('词屿/六级题库')) {
      return {
        rootFolder: customFolder,
        examIndexNote: `${customFolder}/${CET6_INDEX_NAME}.md`,
        papersFolder: customFolder,
        transcriptsFolder: `${customFolder}/听力原文`,
        audioFolder: `${customFolder}/听力音频`,
        mistakeIndexNote: `词屿/错题本/六级错题索引.md`,
      };
    }
    return cet6VaultPaths('词屿');
  }

  cacheDocument(paperId, doc) {
    this.docCache.set(paperId, doc);
  }

  notify() {
    if (this.plugin.lifecycle?.signal.aborted) return;
    this.plugin.refresh(['exams']);
    this.plugin.refreshWideCet6Views?.();
    if (this.modalHandle && this.modalState?.open) {
      this.modalHandle.update(this.buildExamModalProps());
    }
  }

  destroy() {
    this.stopAudio();
    this.modalHandle?.destroy();
    this.modalHandle = null;
    this.deleteModalHandle?.destroy();
    this.deleteModalHandle = null;
  }

  async syncVaultFiles() {
    const p = this.paths();
    this.savedFiles = await savedCet6Papers(this.plugin, p.papersFolder);
    if (this.overallStatus !== 'downloading') {
      const count = this.savedFiles.size;
      if (this.failedByPaper.size > 0 && count > 0) this.overallStatus = 'partial';
      else if (this.failedByPaper.size > 0 && count === 0) this.overallStatus = 'error';
      else if (count >= CET6_CATALOG.length) this.overallStatus = 'downloaded';
      else if (count > 0) this.overallStatus = 'partial';
      else this.overallStatus = 'not_downloaded';
    }
    this.notify();
  }

  transcriptCandidateFolders() {
    const p = this.paths();
    const customFolder = clean(this.plugin.settings.cet6CatalogFolder || '', 200).replace(/\/+$/u, '');
    return [...new Set([
      customFolder ? `${customFolder}/听力原文` : '',
      p.transcriptsFolder,
      '词屿/六级题库/文字版/历年真题/听力原文',
      `${p.papersFolder}/听力原文`,
    ].filter(Boolean))];
  }

  resolveTranscriptFile(paper, allowSibling = true) {
    if (!paper) return null;
    const { vault } = this.plugin.app;
    const candidates = [paper];
    if (allowSibling && paper.set === 3) {
      const set1 = CET6_CATALOG.find(item => item.sessionId === paper.sessionId && item.set === 1);
      if (set1) candidates.push(set1);
    }
    for (const target of candidates) {
      const filename = `${target.title} · 听力原文.md`;
      for (const folder of this.transcriptCandidateFolders()) {
        const file = vault.getAbstractFileByPath(`${folder}/${filename}`);
        if (file instanceof TFile) return file;
      }
    }
    return null;
  }

  transcriptPathFor(paper) {
    const existing = this.resolveTranscriptFile(paper, false);
    if (existing) return existing.path;
    const customFolder = clean(this.plugin.settings.cet6CatalogFolder || '', 200).replace(/\/+$/u, '');
    if (customFolder) return `${customFolder}/听力原文/${paper.title} · 听力原文.md`;
    return `${this.paths().transcriptsFolder}/${paper.title} · 听力原文.md`;
  }

  audioPathFor(paper) {
    return `${this.paths().audioFolder}/${paper.id}.mp3`;
  }

  hasOfflineAudio(paper) {
    return Boolean(this.plugin.app.vault.getAbstractFileByPath(this.audioPathFor(paper)));
  }

  hasSavedTranscript(paper) {
    return this.resolveTranscriptFile(paper, true) instanceof TFile;
  }

  sessionsProps() {
    const grouped = new Map();
    for (const paper of CET6_CATALOG) {
      if (!grouped.has(paper.sessionId)) {
        grouped.set(paper.sessionId, {
          sessionId: paper.sessionId,
          year: paper.year,
          month: paper.month,
          sessionLabel: paper.session,
          papers: [],
        });
      }
      const savedFile = this.savedFiles.get(paper.id);
      const err = this.failedByPaper.get(paper.id);
      const offlineAudio = this.hasOfflineAudio(paper);
      const savedTranscript = this.hasSavedTranscript(paper);
      grouped.get(paper.sessionId).papers.push({
        id: paper.id,
        year: paper.year,
        month: paper.month,
        session: paper.session,
        setNumber: paper.set,
        title: paper.title,
        status: this.downloadingIds?.has(paper.id)
          ? 'downloading'
          : err
          ? 'error'
          : savedFile
          ? 'downloaded'
          : 'not_downloaded',
        audioStatus: offlineAudio ? 'local_ready' : 'link_only',
        notePath: savedFile?.path,
        transcriptNotePath: savedTranscript ? this.transcriptPathFor(paper) : undefined,
        audioFilePath: offlineAudio ? this.audioPathFor(paper) : undefined,
        sharedListeningWithId: paper.set === 3 ? `${paper.sessionId}-2` : undefined,
        sourceUrl: paper.url,
        errorMessage: err,
      });
    }
    return [...grouped.values()];
  }

  userAnswers(paperId) {
    if (!this.userAnswersByPaper.has(paperId)) {
      this.userAnswersByPaper.set(paperId, new Map());
    }
    return this.userAnswersByPaper.get(paperId);
  }

  selfCheckState(paperId) {
    if (!this.selfCheckByPaper.has(paperId)) {
      this.selfCheckByPaper.set(paperId, { checkedGroupIds: [], fullSubmitted: false });
    }
    return this.selfCheckByPaper.get(paperId);
  }

  mistakes() {
    return Array.isArray(this.plugin.data.mistakes) ? this.plugin.data.mistakes : [];
  }

  mistakeMapForPaper(paperId) {
    const out = {};
    for (const item of this.mistakes()) {
      if (item.paperId === paperId) {
        out[item.questionNumber] = {
          mistakeId: item.id,
          mistakeBlockId: item.mistakeBlockId,
          mistakeWikiLink: item.viewMistakeWikiLink,
        };
      }
    }
    return out;
  }

  async ensurePaperLoaded(paperId) {
    const paper = CET6_CATALOG.find(item => item.id === paperId) || CET6_CATALOG[0];
    if (!paper) return null;

    let doc = this.docCache.get(paper.id);
    if (!doc) {
      this.loadingListeningPaper = true;
      this.listeningLoadError = '';
      this.notify();
      try {
        const response = await requestUrl({ url: paper.url, throw: false });
        if (response.status !== 200 || !response.text) {
          throw new Error(`无法连接在线题源（HTTP ${response.status || '网络未就绪'}），请检查网络连接后重试。`);
        }
        doc = parseCet6PaperStructured(paper, response.text);
        this.docCache.set(paper.id, doc);
      } catch (err) {
        this.listeningLoadError = err?.message || '加载听力题组失败。';
        this.loadingListeningPaper = false;
        this.notify();
        return null;
      }
      this.loadingListeningPaper = false;
    }

    // 读取用户已保存的独立听力原文（自动兼容默认目录与 词屿/六级题库/文字版/历年真题/听力原文；第 3 套无独立原文时自动复用第 1 套）
    const transcriptFile = this.resolveTranscriptFile(paper, true);
    if (transcriptFile instanceof TFile) {
      try {
        const rawText = await this.plugin.app.vault.read(transcriptFile);
        const parsed = parseTranscriptMarkdownIntoSegments(rawText, paper.id);
        if (parsed.segments.length > 0 && doc.listening.groups.length > 0) {
          if (parsed.groupedSegments && parsed.groupedSegments.size > 0) {
            doc.listening.groups.forEach((grp, idx) => {
              const matchedSegs = parsed.groupedSegments.get(idx) || [];
              grp.segments = matchedSegs;
              estimateSegmentTimingsForGroup(grp, idx);
              grp.timestampLevel = parsed.timestampLevel !== 'none'
                ? parsed.timestampLevel
                : (grp.timeRangeLabel ? 'paragraph' : 'none');
              grp.hasTimestamps = grp.timestampLevel !== 'none' || Boolean(grp.timeRangeLabel);
            });
          } else {
            const perGroup = Math.max(1, Math.ceil(parsed.segments.length / doc.listening.groups.length));
            doc.listening.groups.forEach((grp, idx) => {
              const slice = parsed.segments.slice(idx * perGroup, (idx + 1) * perGroup);
              grp.segments = slice.length ? slice : idx === 0 ? parsed.segments : [];
              estimateSegmentTimingsForGroup(grp, idx);
              grp.timestampLevel = parsed.timestampLevel !== 'none'
                ? parsed.timestampLevel
                : (grp.timeRangeLabel ? 'paragraph' : 'none');
              grp.hasTimestamps = grp.timestampLevel !== 'none' || Boolean(grp.timeRangeLabel);
            });
          }
        }
      } catch {}
    }

    if (!this.listeningGroupId || !doc.listening.groups.some(g => g.id === this.listeningGroupId)) {
      const firstInSec = doc.listening.groups.find(g => g.section === this.listeningSection) || doc.listening.groups[0];
      if (firstInSec) {
        this.listeningSection = firstInSec.section;
        this.listeningGroupId = firstInSec.id;
      }
    }
    this.prepareAudioForPaper(paper, doc);
    this.notify();
    return doc;
  }

  activeListeningGroup(paperId = this.activePaperId) {
    const doc = this.docCache.get(paperId);
    if (!doc?.listening?.groups?.length) return null;
    const inSec = doc.listening.groups.filter(g => g.section === this.listeningSection);
    return inSec.find(g => g.id === this.listeningGroupId) || inSec[0] || doc.listening.groups[0];
  }

  activeClipRange(paperId = this.activePaperId) {
    if (this.clipMode !== 'group') return null;
    const grp = this.activeListeningGroup(paperId);
    if (grp && typeof grp.startSec === 'number' && typeof grp.endSec === 'number' && grp.endSec > grp.startSec) {
      return { id: grp.id, startSec: grp.startSec, endSec: grp.endSec };
    }
    return null;
  }

  safePlayAudio(targetSec = null) {
    const paper = CET6_CATALOG.find(item => item.id === this.activePaperId);
    const doc = this.docCache.get(this.activePaperId);
    if (!this.audio && paper && doc) this.prepareAudioForPaper(paper, doc);
    const audio = this.audio;
    if (!audio) return;
    this.audioError = '';
    const seq = ++this._audioPlaySeq;

    if (typeof targetSec === 'number') {
      this._seekGraceUntil = Date.now() + 1200;
      this.audioCurrentTime = targetSec;
      this._lastTimeNotify = targetSec;
      const applySeek = () => {
        if (this.audio !== audio || this._audioPlaySeq !== seq) return;
        try { audio.currentTime = targetSec; } catch {}
      };
      if (audio.readyState >= 1) applySeek();
      else audio.addEventListener('loadedmetadata', applySeek, { once: true });
    }

    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(err => {
        if (this.audio !== audio || this._audioPlaySeq !== seq) return;
        const msg = String(err?.message || '');
        // 切换题组、拖动或快速暂停导致的前序 play() 中断属于正常行为，不能当作音频错误锁死播放器
        if (err?.name === 'AbortError' || /interrupted by a call to pause|interrupted by a new load/iu.test(msg)) {
          this.audioPlaying = !audio.paused;
          this.notify();
          return;
        }
        this.audioPlaying = false;
        this.audioError = msg || '音频播放未能启动，请重试。';
        this.notify();
      });
    }
  }

  syncAudioToActiveGroup(autoPlay = false) {
    this.audioError = '';
    const clip = this.activeClipRange();
    if (!clip) {
      if (autoPlay) this.safePlayAudio(null);
      return;
    }
    this._seekGraceUntil = Date.now() + 1200;
    this.audioCurrentTime = clip.startSec;
    this._lastTimeNotify = clip.startSec;
    if (autoPlay) {
      this.safePlayAudio(clip.startSec);
      return;
    }
    if (this.audio) {
      const audio = this.audio;
      const applySeek = () => {
        if (this.audio !== audio) return;
        try { audio.currentTime = clip.startSec; } catch {}
      };
      if (audio.readyState >= 1) applySeek();
      else audio.addEventListener('loadedmetadata', applySeek, { once: true });
    }
  }

  prepareAudioForPaper(paper, doc) {
    if (typeof Audio === 'undefined') return;
    const offlinePath = this.audioPathFor(paper);
    const offlineFile = this.plugin.app.vault.getAbstractFileByPath(offlinePath);
    let src = '';
    if (offlineFile && this.plugin.app.vault.adapter.getResourcePath) {
      src = this.plugin.app.vault.adapter.getResourcePath(offlinePath);
    } else if (doc?.audioUrl) {
      src = doc.audioUrl;
    }
    if (!src) return;
    if (this.audio && this.audioPaperId === paper.id && this.audio.src === src) return;

    this.stopAudio();
    const audio = new Audio(src);
    audio.preload = 'auto';
    audio.playbackRate = this.audioRate;
    this.audio = audio;
    this.audioPaperId = paper.id;
    this.audioError = '';
    const initClip = this.activeClipRange(paper.id);
    this.audioCurrentTime = initClip ? initClip.startSec : 0;
    this._lastTimeNotify = this.audioCurrentTime;

    audio.addEventListener('loadedmetadata', () => {
      if (this.audio !== audio) return;
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        this.audioDuration = audio.duration;
      }
      const clip = this.activeClipRange(paper.id);
      if (clip && (audio.currentTime < clip.startSec - 0.5 || audio.currentTime >= clip.endSec)) {
        this._seekGraceUntil = Date.now() + 1000;
        try { audio.currentTime = clip.startSec; } catch {}
        this.audioCurrentTime = clip.startSec;
      }
      this.notify();
    });
    audio.addEventListener('timeupdate', () => {
      if (this.audio !== audio) return;
      if (audio.seeking) return;
      const inGrace = Date.now() < (this._seekGraceUntil || 0);
      if (!inGrace && !audio.paused) {
        if (this.loopSegmentId) {
          const currentDoc = this.docCache.get(this.activePaperId);
          const seg = currentDoc?.listening.groups
            .flatMap(g => g.segments)
            .find(s => s.id === this.loopSegmentId);
          if (seg && typeof seg.startSec === 'number' && typeof seg.endSec === 'number' && audio.currentTime >= seg.endSec) {
            this._seekGraceUntil = Date.now() + 600;
            audio.currentTime = seg.startSec;
            this.audioCurrentTime = seg.startSec;
            this._lastTimeNotify = seg.startSec;
            this.notify();
            return;
          }
        }
        const clip = this.activeClipRange(this.activePaperId);
        if (clip && audio.currentTime >= clip.endSec) {
          if (this.loopSegmentId === clip.id) {
            this._seekGraceUntil = Date.now() + 600;
            audio.currentTime = clip.startSec;
            this.audioCurrentTime = clip.startSec;
            this._lastTimeNotify = clip.startSec;
            this.notify();
            return;
          }
          this._audioPlaySeq++;
          this._seekGraceUntil = Date.now() + 800;
          audio.pause();
          try { audio.currentTime = clip.startSec; } catch {}
          this.audioCurrentTime = clip.startSec;
          this._lastTimeNotify = clip.startSec;
          this.audioPlaying = false;
          this.notify();
          return;
        }
      }
      this.audioCurrentTime = audio.currentTime;
      if (Math.abs(audio.currentTime - this._lastTimeNotify) >= 0.25) {
        this._lastTimeNotify = audio.currentTime;
        this.notify();
      }
    });
    audio.addEventListener('play', () => {
      if (this.audio !== audio) return;
      this.audioError = '';
      this.audioPlaying = true;
      this.notify();
    });
    audio.addEventListener('pause', () => {
      if (this.audio !== audio) return;
      this.audioPlaying = false;
      this.notify();
    });
    audio.addEventListener('ended', () => {
      if (this.audio !== audio) return;
      this.audioPlaying = false;
      this.notify();
    });
    audio.addEventListener('error', () => {
      if (this.audio !== audio) return;
      this.audioPlaying = false;
      this.audioError = '在线听力音频暂无法加载，请点击重试或下载离线音频后播放。';
      this.notify();
    });
  }

  stopAudio() {
    this._audioPlaySeq++;
    const old = this.audio;
    this.audio = null;
    this.audioPlaying = false;
    if (!old) return;
    try {
      old.pause();
      old.removeAttribute?.('src');
      old.src = '';
    } catch {}
  }

  toggleAudioPlay() {
    const paper = CET6_CATALOG.find(item => item.id === this.activePaperId);
    const doc = this.docCache.get(this.activePaperId);
    if (!this.audio && paper && doc) this.prepareAudioForPaper(paper, doc);
    if (!this.audio) return;
    if (this.audio.paused) {
      const clip = this.activeClipRange();
      const desired = Number.isFinite(this.audioCurrentTime) ? this.audioCurrentTime : this.audio.currentTime;
      let targetSec = null;
      if (clip && (desired < clip.startSec - 0.3 || desired >= clip.endSec - 0.25)) {
        targetSec = clip.startSec;
      } else if (Math.abs((this.audio.currentTime || 0) - desired) > 0.35) {
        targetSec = desired;
      }
      this.safePlayAudio(targetSec);
    } else {
      this._audioPlaySeq++;
      this.audio.pause();
    }
  }

  seekAudio(sec) {
    const paper = CET6_CATALOG.find(item => item.id === this.activePaperId);
    const doc = this.docCache.get(this.activePaperId);
    if (!this.audio && paper && doc) this.prepareAudioForPaper(paper, doc);
    const clip = this.activeClipRange();
    const minSec = clip ? clip.startSec : 0;
    const maxSec = clip ? clip.endSec : (this.audioDuration || 1800);
    const clamped = Math.max(minSec, Math.min(maxSec, sec));
    this._seekGraceUntil = Date.now() + 900;
    this.audioCurrentTime = clamped;
    this._lastTimeNotify = clamped;
    if (this.audio) {
      const audio = this.audio;
      if (audio.readyState >= 1) {
        try { audio.currentTime = clamped; } catch {}
      } else {
        audio.addEventListener('loadedmetadata', () => {
          if (this.audio !== audio) return;
          try { audio.currentTime = this.audioCurrentTime; } catch {}
        }, { once: true });
      }
    }
    this.notify();
  }

  selectSegment(segId, autoPlay = false) {
    this.activeSegmentId = segId;
    const doc = this.docCache.get(this.activePaperId);
    let targetSeg = null;
    if (doc?.listening?.groups) {
      for (const grp of doc.listening.groups) {
        const found = grp.segments?.find(s => s.id === segId);
        if (found) {
          if (typeof found.startSec !== 'number') estimateSegmentTimingsForGroup(grp);
          targetSeg = found;
          break;
        }
      }
    }
    if (targetSeg && typeof targetSeg.startSec === 'number') {
      // 无论当前正在播放还是暂停，都自动跳转音频进度到该段位置；原本暂停则保持暂停
      this.seekAudio(targetSeg.startSec);
    } else {
      this.notify();
    }
    if (autoPlay && this.audio?.paused) {
      this.toggleAudioPlay();
    }
  }

  async downloadPapersBatch(paperIds, customRootFolder) {
    if (this.plugin.cet6ImportRunning) {
      new Notice('已有真题下载正在进行中。');
      return;
    }
    const targetPapers = CET6_CATALOG.filter(p => paperIds.includes(p.id));
    if (!targetPapers.length) {
      new Notice('请先勾选至少一套真题。');
      return;
    }

    const p = customRootFolder !== undefined
      ? (customRootFolder
          ? {
              rootFolder: customRootFolder,
              examIndexNote: `${customRootFolder}/${CET6_INDEX_NAME}.md`,
              papersFolder: `${customRootFolder}/历年真题`,
              transcriptsFolder: `${customRootFolder}/听力原文`,
              audioFolder: `${customRootFolder}/听力音频`,
              mistakeIndexNote: `词屿/错题本/六级错题索引.md`,
            }
          : cet6VaultPaths('词屿'))
      : this.paths();

    this.plugin.cet6ImportRunning = true;
    this.overallStatus = 'downloading';
    this.justImported = null;
    this.justDeleted = null;
    this.duplicateClickNotice = null;
    this.downloadingIds = new Set(targetPapers.map(item => item.id));
    this.progressPercent = 5;
    this.progressText = '正在初始化「词屿」题库与错题目录…';
    if (this.modalState) {
      this.modalState.busy = true;
      this.modalState.progressStatus = 'running';
      this.modalState.progressPercent = 5;
      this.modalState.progressLabel = this.progressText;
      this.modalState.failedPapers = [];
    }
    this.notify();

    try {
      for (const dir of [p.papersFolder, p.transcriptsFolder, p.audioFolder, '词屿/错题本']) {
        if (dir) await this.plugin.ensureFolder(dir);
      }

      const files = await savedCet6Papers(this.plugin, p.papersFolder);
      let newlyImportedCount = 0;
      let primaryImported = null;
      const failedList = [];

      for (const [idx, paper] of targetPapers.entries()) {
        const pct = Math.round(((idx + 1) * 90) / targetPapers.length);
        this.progressPercent = pct;
        this.progressText = `正在下载并排版 (${idx + 1}/${targetPapers.length})：${paper.title}`;
        if (this.modalState) {
          this.modalState.progressPercent = pct;
          this.modalState.progressLabel = this.progressText;
        }
        this.notify();

        if (files.has(paper.id)) {
          this.downloadingIds.delete(paper.id);
          if (!primaryImported) primaryImported = paper;
          continue;
        }

        try {
          const created = await downloadCet6Paper(this.plugin, p.papersFolder, paper);
          files.set(paper.id, created);
          this.failedByPaper.delete(paper.id);
          newlyImportedCount++;
          if (!primaryImported) primaryImported = paper;
        } catch (err) {
          const reason = err?.message || '下载失败';
          this.failedByPaper.set(paper.id, reason);
          failedList.push({ paperId: paper.id, title: paper.title, reason });
        } finally {
          this.downloadingIds.delete(paper.id);
        }
      }

      this.savedFiles = files;
      const indexFile = await saveCet6Index(this.plugin, p.examIndexNote, files);
      await this.ensureMistakeIndexExists();

      await this.plugin.commit(draft => {
        draft.settings.cet6CatalogFolder = p.papersFolder === '词屿/六级题库/历年真题'
          ? '词屿/六级题库/历年真题'
          : p.rootFolder;
        draft.settings.lastCet6Index = indexFile.path;
        if (primaryImported && files.get(primaryImported.id)) {
          draft.settings.lastExamNote = files.get(primaryImported.id).path;
        }
      }, ['exams']);

      this.progressPercent = 100;
      if (primaryImported) {
        this.activePaperId = primaryImported.id;
        this.justImported = {
          count: newlyImportedCount || targetPapers.length,
          primaryPaperId: primaryImported.id,
          primaryPaperTitle: primaryImported.title,
          indexNotePath: indexFile.path,
        };
      }

      if (this.modalState) {
        this.modalState.busy = false;
        this.modalState.failedPapers = failedList;
        this.modalState.progressPercent = 100;
        if (failedList.length === 0) {
          this.modalState.progressStatus = 'completed';
          this.modalState.open = false;
        } else {
          this.modalState.progressStatus = files.size > 0 ? 'partial_error' : 'error';
          this.modalState.progressLabel = `已完成 ${targetPapers.length - failedList.length} 套，${failedList.length} 套需重试。`;
        }
      }

      new Notice(
        failedList.length
          ? `已导入 ${files.size} 套真题，${failedList.length} 套失败可重试。`
          : `成功导入六级真题并更新索引（共收录 ${files.size} 套）。`
      );
    } finally {
      this.plugin.cet6ImportRunning = false;
      this.downloadingIds = new Set();
      if (this.modalState) this.modalState.busy = false;
      await this.syncVaultFiles();
    }
  }

  async handleSinglePaperDownload(paperId) {
    await this.syncVaultFiles();
    const existing = this.savedFiles.get(paperId);
    const paper = CET6_CATALOG.find(item => item.id === paperId);
    if (!paper) return;
    if (existing instanceof TFile) {
      this.duplicateClickNotice = {
        paperId: paper.id,
        title: paper.title,
        notePath: existing.path,
      };
      this.notify();
      return;
    }
    await this.downloadPapersBatch([paperId]);
  }

  openDeleteConfirmModal(paperIds) {
    const validIds = paperIds.filter(id => this.savedFiles.has(id));
    if (!validIds.length) {
      new Notice('当前所选套卷尚未导入本地库，无需删除。');
      return;
    }

    const targets = validIds.map(id => {
      const paper = CET6_CATALOG.find(item => item.id === id);
      const file = this.savedFiles.get(id);
      const mCount = this.mistakes().filter(m => m.paperId === id).length;
      return {
        paperId: id,
        title: paper?.title || id,
        session: paper?.session || '',
        notePath: file?.path || '',
        hasTranscript: paper ? this.hasSavedTranscript(paper) : false,
        hasOfflineAudio: paper ? this.hasOfflineAudio(paper) : false,
        mistakeCount: mCount,
      };
    });

    let modalProps = {
      open: true,
      targets,
      busy: false,
      trashFolderLabel: STUDY_TRASH,
      options: {
        mode: 'trash',
        updateIndexNote: true,
        deleteAssociatedMedia: false,
        deleteAssociatedMistakes: false,
        acknowledgePermanent: false,
      },
    };

    this.deleteModalHandle?.destroy();
    this.deleteModalHandle = CiyuUI.createExamDeleteConfirmModal(modalProps, {
      onClose: () => {
        modalProps = { ...modalProps, open: false };
        this.deleteModalHandle?.update(modalProps);
        this.deleteModalHandle?.destroy();
        this.deleteModalHandle = null;
      },
      onOptionsChange: nextOptions => {
        modalProps = { ...modalProps, options: nextOptions, errorMessage: undefined };
      },
      onConfirmDelete: async (ids, options) => {
        modalProps = { ...modalProps, busy: true, errorMessage: undefined };
        this.deleteModalHandle?.update(modalProps);
        try {
          await this.executeBatchDelete(ids, options);
          modalProps = { ...modalProps, open: false, busy: false };
          this.deleteModalHandle?.update(modalProps);
          this.deleteModalHandle?.destroy();
          this.deleteModalHandle = null;
        } catch (err) {
          modalProps = {
            ...modalProps,
            busy: false,
            errorMessage: err?.message || '删除失败，请重试。',
          };
          this.deleteModalHandle?.update(modalProps);
        }
      },
    });

    CiyuUI.applyGlassPreferences(this.deleteModalHandle.element, appearance(this.plugin.settings));
    document.body.appendChild(this.deleteModalHandle.element);
  }

  async removeOrTrashVaultFile(file, mode, restoreRecords) {
    if (!file) return;
    if (mode === 'trash') {
      await this.plugin.ensureFolder(STUDY_TRASH);
      const originalPath = file.path;
      const targetPath = `${STUDY_TRASH}/${randomUUID().slice(0, 8)} ${file.name}`;
      await this.plugin.app.vault.rename(file, targetPath);
      restoreRecords.push({ file, originalPath });
    } else {
      if (this.plugin.app.vault.delete) {
        await this.plugin.app.vault.delete(file, true);
      } else if (this.plugin.app.fileManager?.trashFile) {
        await this.plugin.app.fileManager.trashFile(file);
      }
    }
  }

  async executeBatchDelete(paperIds, options) {
    if (options.mode === 'permanent' && !options.acknowledgePermanent) {
      throw new Error('请先勾选永久删除确认选项。');
    }

    await this.syncVaultFiles();
    const restoreRecords = [];
    const deletingSet = new Set(paperIds);
    let deletedCount = 0;

    for (const id of paperIds) {
      const file = this.savedFiles.get(id);
      if (!(file instanceof TFile)) continue;
      if (this.audioPaperId === id) this.stopAudio();
      await this.removeOrTrashVaultFile(file, options.mode, restoreRecords);
      this.savedFiles.delete(id);
      deletedCount++;

      if (options.deleteAssociatedMedia) {
        const paper = CET6_CATALOG.find(item => item.id === id);
        if (paper) {
          // 若同考次其他仍保留的套卷共用听力，保护共用资源不误删
          const siblingStillImported = CET6_CATALOG.some(
            other =>
              other.sessionId === paper.sessionId &&
              !deletingSet.has(other.id) &&
              this.savedFiles.has(other.id)
          );
          if (!siblingStillImported) {
            const trFile = this.plugin.app.vault.getAbstractFileByPath(this.transcriptPathFor(paper));
            if (trFile) await this.removeOrTrashVaultFile(trFile, options.mode, restoreRecords);
            const auFile = this.plugin.app.vault.getAbstractFileByPath(this.audioPathFor(paper));
            if (auFile) await this.removeOrTrashVaultFile(auFile, options.mode, restoreRecords);
          }
        }
      }
    }

    if (options.deleteAssociatedMistakes) {
      await this.plugin.commit(draft => {
        draft.mistakes = (draft.mistakes || []).filter(m => !deletingSet.has(m.paperId));
      }, ['exams']);
      await this.saveMistakeIndex();
    }

    if (options.updateIndexNote) {
      const p = this.paths();
      const idxFile = this.plugin.app.vault.getAbstractFileByPath(p.examIndexNote);
      if (idxFile instanceof TFile || this.savedFiles.size > 0) {
        await saveCet6Index(this.plugin, p.examIndexNote, this.savedFiles);
      }
    }

    this.selectedPaperIds = this.selectedPaperIds.filter(id => !deletingSet.has(id));
    this.justImported = null;
    this.lastDeleteBatch = options.mode === 'trash' && restoreRecords.length ? restoreRecords : null;
    this.justDeleted = {
      count: deletedCount,
      mode: options.mode,
      canUndo: Boolean(this.lastDeleteBatch),
    };

    await this.syncVaultFiles();
    new Notice(
      options.mode === 'trash'
        ? `已将 ${deletedCount} 套真题移入「${STUDY_TRASH}」，可随时撤销恢复。`
        : `已彻底删除 ${deletedCount} 套真题。`
    );
  }

  async undoLastBatchDelete() {
    if (!this.lastDeleteBatch?.length) return;
    const records = this.lastDeleteBatch;
    this.lastDeleteBatch = null;
    let restored = 0;
    for (const { file, originalPath } of records) {
      if (this.plugin.app.vault.getAbstractFileByPath(file.path) !== file) continue;
      if (this.plugin.app.vault.getAbstractFileByPath(originalPath)) continue;
      const parentDir = originalPath.split('/').slice(0, -1).join('/');
      if (parentDir) await this.plugin.ensureFolder(parentDir);
      await this.plugin.app.vault.rename(file, originalPath);
      restored++;
    }
    this.justDeleted = null;
    await this.syncVaultFiles();
    const p = this.paths();
    if (this.plugin.app.vault.getAbstractFileByPath(p.examIndexNote) instanceof TFile) {
      await saveCet6Index(this.plugin, p.examIndexNote, this.savedFiles);
    }
    new Notice(`已从回收站恢复 ${restored} 个真题文件。`);
  }

  async downloadTranscriptMarkdown(paperId) {
    const paper = CET6_CATALOG.find(item => item.id === paperId);
    if (!paper || this.transcriptSaving) return;
    const existingTranscript = this.resolveTranscriptFile(paper, false);
    if (existingTranscript instanceof TFile) {
      new Notice(`库内已有完整听力原文「${existingTranscript.path}」`);
      await this.plugin.app.workspace.openLinkText(existingTranscript.path, '', false);
      return;
    }
    const doc = await this.ensurePaperLoaded(paper.id);
    if (!doc) return;

    this.transcriptSaving = true;
    this.notify();
    try {
      const fullPath = this.transcriptPathFor(paper);
      const targetFolder = fullPath.includes('/') ? fullPath.slice(0, fullPath.lastIndexOf('/')) : this.paths().transcriptsFolder;
      await this.plugin.ensureFolder(targetFolder);
      const out = [
        `# ${paper.title} · 听力原文与自查对照`,
        `> [!info]- 来源说明\n> 题源：[${paper.title}](<${paper.url}>)${doc.audioUrl ? ` · [听力音频 MP3](<${doc.audioUrl}>)` : ''}`,
      ];
      for (const grp of doc.listening.groups) {
        out.push(`## ${grp.sectionLabel} · ${grp.title}（${grp.questionRange}）`);
        if (grp.segments.length > 0) {
          for (const seg of grp.segments) {
            out.push(`**${seg.speaker}**${seg.timeLabel ? ` \`[${seg.timeLabel}]\`` : ''}\n${seg.textEn}`);
            if (seg.translationZh) out.push(`> ${seg.translationZh}`);
          }
        } else {
          out.push('_（当前在线题源未内置独立听力文字稿，你可以在此文件中补充英文/双语原文，词屿会自动识别并用于精听对照。）_');
        }
        out.push(
          '### 对应自查题目',
          ...grp.questions.map(
            q =>
              `**${q.number}.** ${q.stem || ''}\n` +
              q.options.map(o => `- **${o.key})** ${o.text}`).join('\n') +
              `\n> [!check]- 答案与解析\n> **正确答案：${q.answerKey}**${q.explanation ? ` — ${q.explanation}` : ''}`
          )
        );
      }

      const fullPath2 = this.transcriptPathFor(paper);
      const existing = this.plugin.app.vault.getAbstractFileByPath(fullPath2);
      const markdown = out.join('\n\n') + '\n';
      if (existing instanceof TFile) {
        await this.plugin.app.vault.process(existing, () => markdown);
      } else {
        await this.plugin.app.vault.create(fullPath2, markdown);
      }

      // 在已导入的原卷笔记中补入可跳转双链
      const paperFile = this.savedFiles.get(paper.id);
      if (paperFile instanceof TFile) {
        const linkLine = `[[${fullPath2.slice(0, -3)}|打开配套听力原文与自查对照笔记]]`;
        await this.plugin.app.vault.process(paperFile, text =>
          text.includes(linkLine) ? text : text.replace('## 听力材料\n\n', `## 听力材料\n\n${linkLine}\n\n`)
        );
      }

      new Notice(`已保存听力全文至「${fullPath2}」`);
    } finally {
      this.transcriptSaving = false;
      this.notify();
    }
  }

  async savePastedTranscript(paperId, rawText) {
    const paper = CET6_CATALOG.find(item => item.id === paperId);
    if (!paper || !rawText.trim()) return;
    const fullPath = this.transcriptPathFor(paper);
    const targetFolder = fullPath.includes('/') ? fullPath.slice(0, fullPath.lastIndexOf('/')) : this.paths().transcriptsFolder;
    await this.plugin.ensureFolder(targetFolder);
    const content = `# ${paper.title} · 听力原文\n\n${rawText.trim()}\n`;
    const existing = this.plugin.app.vault.getAbstractFileByPath(fullPath);
    if (existing instanceof TFile) {
      await this.plugin.app.vault.process(existing, () => content);
    } else {
      await this.plugin.app.vault.create(fullPath, content);
    }
    await this.ensurePaperLoaded(paperId);
    if (this.transcriptMode === 'blind') this.transcriptMode = 'en';
    this.notify();
    new Notice('已保存并启用本套听力原文对照！');
  }

  async downloadAudioOffline(paperId) {
    const paper = CET6_CATALOG.find(item => item.id === paperId);
    if (!paper || this.audioDownloading) return;
    const doc = await this.ensurePaperLoaded(paper.id);
    if (!doc?.audioUrl) {
      new Notice('当前套卷没有可下载的在线音频链接。');
      return;
    }
    if (this.hasOfflineAudio(paper)) {
      new Notice('离线音频已保存在库内，可直接离线播放。');
      return;
    }

    this.audioDownloading = true;
    this.audioDownloadPercent = 25;
    this.notify();
    try {
      const p = this.paths();
      await this.plugin.ensureFolder(p.audioFolder);
      const response = await requestUrl({ url: doc.audioUrl, throw: false });
      if (response.status !== 200 || !response.arrayBuffer?.byteLength) {
        throw new Error(`音频下载失败（HTTP ${response.status}）。`);
      }
      this.audioDownloadPercent = 85;
      this.notify();
      const targetPath = this.audioPathFor(paper);
      if (this.plugin.app.vault.createBinary) {
        await this.plugin.app.vault.createBinary(targetPath, response.arrayBuffer);
      } else if (this.plugin.app.vault.adapter.writeBinary) {
        await this.plugin.app.vault.adapter.writeBinary(targetPath, response.arrayBuffer);
      }
      this.prepareAudioForPaper(paper, doc);
      new Notice(`离线听力音频已保存至「${targetPath}」`);
    } catch (err) {
      reportError(err);
    } finally {
      this.audioDownloading = false;
      this.audioDownloadPercent = 0;
      this.notify();
    }
  }

  async ensureMistakeIndexExists() {
    const path = this.paths().mistakeIndexNote;
    if (this.plugin.app.vault.getAbstractFileByPath(path) instanceof TFile) return;
    await this.saveMistakeIndex();
  }

  async saveMistakeIndex() {
    const p = this.paths();
    const dir = p.mistakeIndexNote.split('/').slice(0, -1).join('/');
    if (dir) await this.plugin.ensureFolder(dir);
    const list = this.mistakes();
    const lines = [
      '# 六级错题索引',
      '',
      `共收录 **${list.length}** 道错题（待复习 ${list.filter(m => m.status === 'reviewing').length} 道 · 已掌握 ${list.filter(m => m.status === 'mastered').length} 道）。`,
      '',
    ];
    for (const item of list) {
      lines.push(
        `## ${item.paperTitle} · 第 ${item.questionNumber} 题（${item.questionTypeLabel}）`,
        `- **状态**：${item.status === 'mastered' ? '已掌握' : '待复习'} · **我的答案**：\`${item.myAnswer || '未作答'}\` · **正确答案**：\`${item.correctAnswer}\``,
        item.stemPreview ? `- **题干摘要**：${cet6Text(item.stemPreview)}` : '',
        item.note ? `- **复盘备注**：${cet6Text(item.note)}` : '',
        `- **定位跳转**：${item.backToQuestionWikiLink} ^${item.mistakeBlockId}`,
        ''
      );
    }
    const markdown = lines.filter((l, i, arr) => l !== '' || arr[i - 1] !== '').join('\n') + '\n';
    const existing = this.plugin.app.vault.getAbstractFileByPath(p.mistakeIndexNote);
    if (existing instanceof TFile) {
      await this.plugin.app.vault.process(existing, () => markdown);
    } else {
      await this.plugin.app.vault.create(p.mistakeIndexNote, markdown);
    }
  }

  async addMistakeEntry(payload) {
    const paper = CET6_CATALOG.find(item => item.id === payload.paperId);
    const savedNote = this.savedFiles.get(payload.paperId);
    const noteLinkTarget = savedNote ? savedNote.path.slice(0, -3) : (paper?.title || payload.paperId);
    const questionBlockId = payload.blockId || `cet6-${payload.paperId}-q${payload.questionNumber}`;
    const mistakeBlockId = `mistake-${payload.paperId}-q${payload.questionNumber}`;
    const typeLabels = {
      listening: '听力',
      banked_cloze: '选词填空',
      matching: '段落匹配',
      careful_reading: '仔细阅读',
      writing_translation: '写作/翻译',
    };
    const entry = {
      id: `${payload.paperId}-q${payload.questionNumber}`,
      mistakeBlockId,
      questionBlockId,
      paperId: payload.paperId,
      paperTitle: paper?.title || payload.paperId,
      paperNotePath: savedNote?.path || `${this.paths().papersFolder}/${paper?.title || payload.paperId}.md`,
      session: paper?.session || '',
      setLabel: paper ? `第 ${paper.set} 套` : '',
      questionNumber: payload.questionNumber,
      questionType: payload.questionType,
      questionTypeLabel: typeLabels[payload.questionType] || '客观题',
      stemPreview: payload.stemPreview || '',
      myAnswer: payload.myAnswer || '未作答',
      correctAnswer: payload.correctAnswer,
      note: '',
      status: 'reviewing',
      backToQuestionWikiLink: `[[${noteLinkTarget}#^${questionBlockId}|回到原题]]`,
      viewMistakeWikiLink: `[[${this.paths().mistakeIndexNote.slice(0, -3)}#^${mistakeBlockId}|查看错题记录]]`,
      createdAt: localDay(),
    };

    await this.plugin.commit(draft => {
      draft.mistakes ??= [];
      const idx = draft.mistakes.findIndex(m => m.id === entry.id);
      if (idx >= 0) draft.mistakes[idx] = { ...draft.mistakes[idx], myAnswer: entry.myAnswer };
      else draft.mistakes.unshift(entry);
    }, ['exams']);
    await this.saveMistakeIndex();
  }

  async jumpToOriginalQuestion(item) {
    this.activePaperId = item.paperId;
    this.highlightedQuestionBlockId = item.questionBlockId;

    // 若原卷 Markdown 已在库内，也在 Obsidian 主窗口打开并定位到对应 #^blockId
    const savedFile = this.savedFiles.get(item.paperId) ||
      this.plugin.app.vault.getAbstractFileByPath(item.paperNotePath);
    if (savedFile instanceof TFile && this.plugin.app.workspace.openLinkText) {
      await this.plugin.app.workspace.openLinkText(
        `${savedFile.path.slice(0, -3)}#^${item.questionBlockId}`,
        this.paths().mistakeIndexNote,
        false
      );
    }

    if (item.questionType === 'listening') {
      await this.openListeningSelfCheck(item.paperId, item.questionNumber);
    } else {
      await this.openPaperReader(item.paperId);
    }
  }

  async openPaperReader(paperId) {
    this.activePaperId = paperId;
    this.subView = 'paper';
    this.workspaceMode = 'paper';
    await this.ensurePaperLoaded(paperId);
    this.notify();
  }

  async openListeningSelfCheck(paperId, focusQuestionNo) {
    const targetId = paperId || this.activePaperId || '202606-1';
    this.activePaperId = targetId;
    this.subView = 'listening';
    const doc = await this.ensurePaperLoaded(targetId);
    if (doc && focusQuestionNo) {
      const grp = doc.listening.groups.find(g => g.questions.some(q => q.number === focusQuestionNo));
      if (grp) {
        this.listeningSection = grp.section;
        this.listeningGroupId = grp.id;
      }
    }
    this.syncAudioToActiveGroup(false);
    this.notify();
  }

  openExamModal(activeTab = 'batch_download') {
    this.modalState = {
      open: true,
      activeTab,
      targetFolder: this.paths().rootFolder,
      folderError: '',
      busy: Boolean(this.plugin.cet6ImportRunning),
      progressStatus: 'idle',
      progressLabel: '',
      progressPercent: undefined,
      failedPapers: [],
      directUrl: '',
      directUrlError: '',
      selectedLocalFiles: [],
      importError: '',
    };
    this.localImportRawFiles.clear();

    if (!this.modalHandle) {
      this.modalHandle = CiyuUI.createExamDownloadImportModal(
        this.buildExamModalProps(),
        this.examModalCallbacks()
      );
      document.body.appendChild(this.modalHandle.element);
    } else {
      this.modalHandle.update(this.buildExamModalProps());
    }
    CiyuUI.applyGlassPreferences(this.modalHandle.element, appearance(this.plugin.settings));
  }

  buildExamModalProps() {
    const s = this.modalState || { open: false, activeTab: 'batch_download', targetFolder: '词屿' };
    const officialPath = '词屿/六级题库/文字版/' + CET6_SAMPLE.basename + '.md';
    return {
      open: Boolean(s.open),
      activeTab: s.activeTab,
      vaultName: this.plugin.app.vault.getName?.() || '当前库',
      targetFolder: s.targetFolder,
      folderError: s.folderError,
      sessions: this.sessionsProps(),
      selectedPaperIds: this.selectedPaperIds,
      busy: Boolean(s.busy),
      progressStatus: s.progressStatus,
      progressLabel: s.progressLabel,
      progressPercent: s.progressPercent,
      failedPapers: s.failedPapers || [],
      officialSample: {
        installed: this.plugin.app.vault.getAbstractFileByPath(officialPath) instanceof TFile,
        ocrSupported: process.platform === 'darwin',
      },
      directUrl: s.directUrl || '',
      directUrlError: s.directUrlError,
      selectedLocalFiles: s.selectedLocalFiles || [],
      importError: s.importError,
    };
  }

  examModalCallbacks() {
    return {
      onClose: () => {
        if (!this.modalState || this.modalState.busy) return;
        this.modalState.open = false;
        this.modalHandle?.update(this.buildExamModalProps());
      },
      onTabChange: tab => {
        if (!this.modalState) return;
        this.modalState.activeTab = tab;
        this.modalState.importError = '';
        this.modalHandle?.update(this.buildExamModalProps());
      },
      onTargetFolderChange: val => {
        if (!this.modalState) return;
        this.modalState.targetFolder = val;
        this.modalState.folderError = '';
      },
      onPickTargetFolder: () => {
        new ExamFolderPicker(this.plugin.app, path => {
          if (this.modalState) {
            this.modalState.targetFolder = path || '词屿';
            this.modalHandle?.update(this.buildExamModalProps());
          }
        }).open();
      },
      onTogglePaper: (paperId, checked) => {
        const set = new Set(this.selectedPaperIds);
        if (checked) set.add(paperId);
        else set.delete(paperId);
        this.selectedPaperIds = [...set];
        this.notify();
      },
      onToggleSession: (sessionId, checked) => {
        const set = new Set(this.selectedPaperIds);
        for (const p of CET6_CATALOG.filter(item => item.sessionId === sessionId)) {
          if (checked) set.add(p.id);
          else set.delete(p.id);
        }
        this.selectedPaperIds = [...set];
        this.notify();
      },
      onSelectAllPapers: () => {
        this.selectedPaperIds = CET6_CATALOG.map(p => p.id);
        this.notify();
      },
      onSelectImportedPapers: () => {
        this.selectedPaperIds = [...this.savedFiles.keys()];
        this.notify();
      },
      onClearAllPapers: () => {
        this.selectedPaperIds = [];
        this.notify();
      },
      onStartBatchDownload: async (paperIds, rawFolder) => {
        try {
          const folder = examDestination(rawFolder);
          await this.downloadPapersBatch(paperIds, folder);
        } catch (err) {
          if (this.modalState) {
            this.modalState.folderError = err?.message || '目录路径无效。';
            this.modalHandle?.update(this.buildExamModalProps());
          }
        }
      },
      onRequestBatchDeletePapers: paperIds => {
        if (this.modalState) {
          this.modalState.open = false;
          this.modalHandle?.update(this.buildExamModalProps());
        }
        this.openDeleteConfirmModal(paperIds);
      },
      onRetryFailedPapers: (paperIds, rawFolder) => {
        const folder = examDestination(rawFolder);
        void this.downloadPapersBatch(paperIds, folder);
      },
      onImportOfficialSample: rawFolder => this.runModalImport(rawFolder, [async progress => {
        const local = this.plugin.app.vault.getAbstractFileByPath(CET6_SAMPLE.path);
        let bytes;
        if (local instanceof TFile) {
          bytes = examBytes(await this.plugin.app.vault.readBinary(local));
        } else {
          progress('正在下载官方六级笔试样卷…');
          ({ bytes } = await downloadExam(CET6_SAMPLE.url));
        }
        return { bytes, name: CET6_SAMPLE.basename, official: true };
      }]),
      onDirectUrlChange: url => {
        if (this.modalState) {
          this.modalState.directUrl = url;
          this.modalState.directUrlError = '';
        }
      },
      onImportFromUrl: (url, rawFolder) => this.runModalImport(rawFolder, [progress => {
        progress('正在下载试卷直链文件…');
        return downloadExam(url);
      }]),
      onChooseLocalFiles: fileList => {
        if (!this.modalState) return;
        for (const file of Array.from(fileList)) {
          const id = randomUUID();
          this.localImportRawFiles.set(id, file);
          this.modalState.selectedLocalFiles.push({
            id,
            name: file.name,
            sizeBytes: file.size,
            sizeLabel: formatBytes(file.size),
            tooLarge: file.size > EXAM_FILE_LIMIT,
            invalidExt: !/\.(pdf|txt|md)$/iu.test(file.name),
          });
        }
        this.modalHandle?.update(this.buildExamModalProps());
      },
      onRemoveLocalFile: fileId => {
        if (!this.modalState) return;
        this.localImportRawFiles.delete(fileId);
        this.modalState.selectedLocalFiles = this.modalState.selectedLocalFiles.filter(f => f.id !== fileId);
        this.modalHandle?.update(this.buildExamModalProps());
      },
      onImportLocalFiles: rawFolder => {
        const valid = (this.modalState?.selectedLocalFiles || []).filter(f => !f.tooLarge && !f.invalidExt);
        const sources = valid.map(item => async () => {
          const rawFile = this.localImportRawFiles.get(item.id);
          return { bytes: examBytes(await rawFile.arrayBuffer()), name: rawFile.name };
        });
        return this.runModalImport(rawFolder, sources);
      },
    };
  }

  async runModalImport(rawFolder, sources) {
    if (!this.modalState || this.modalState.busy) return;
    this.modalState.busy = true;
    this.modalState.importError = '';
    this.modalState.progressLabel = '准备导入试卷…';
    this.modalHandle?.update(this.buildExamModalProps());
    try {
      const baseFolder = examDestination(rawFolder);
      const targetFolder = baseFolder ? `${baseFolder}/文字版` : '词屿/六级题库/文字版';
      const imported = [];
      const errors = [];
      for (const [idx, source] of sources.entries()) {
        const progress = msg => {
          if (!this.modalState) return;
          this.modalState.progressLabel = sources.length > 1 ? `${idx + 1}/${sources.length} · ${msg}` : msg;
          this.modalHandle?.update(this.buildExamModalProps());
        };
        try {
          const input = await source(progress);
          imported.push(await importExam(this.plugin, targetFolder, input, progress));
        } catch (err) {
          errors.push(err?.message || '导入失败');
        }
      }
      if (imported.length) {
        const last = imported[imported.length - 1];
        await this.plugin.commit(draft => {
          draft.settings.examImportFolder = targetFolder;
          draft.settings.lastExamNote = last.path;
        }, ['exams']);
        await this.plugin.openSource(last.path);
        new Notice(`已导入 ${imported.length} 份试卷文字版。`);
        if (!errors.length) this.modalState.open = false;
      }
      if (errors.length) this.modalState.importError = errors.join('；');
    } catch (err) {
      this.modalState.importError = err?.message || '导入失败。';
    } finally {
      if (this.modalState) {
        this.modalState.busy = false;
        this.modalState.progressLabel = '';
        this.modalHandle?.update(this.buildExamModalProps());
      }
    }
  }

  examBankProps() {
    const p = this.paths();
    const indexExists = this.plugin.app.vault.getAbstractFileByPath(p.examIndexNote) instanceof TFile ||
      (this.plugin.settings.lastCet6Index && this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.lastCet6Index) instanceof TFile);
    return {
      vaultName: this.plugin.app.vault.getName?.() || '当前库',
      targetFolder: p.papersFolder,
      vaultPaths: p,
      overallStatus: this.overallStatus,
      sessions: this.sessionsProps(),
      selectedPaperIds: this.selectedPaperIds,
      downloadedCount: this.savedFiles.size,
      totalCount: CET6_CATALOG.length,
      indexNotePath: p.examIndexNote,
      indexAvailable: Boolean(indexExists),
      lastImportedPaperId: this.justImported?.primaryPaperId || this.activePaperId,
      justImported: this.justImported,
      duplicateClickNotice: this.duplicateClickNotice,
      justDeleted: this.justDeleted,
      progressText: this.progressText,
      progressPercent: this.progressPercent,
      errorMessage: this.errorMessage,
      mistakeCount: this.mistakes().length,
    };
  }

  examBankCallbacks() {
    return {
      onTogglePaperSelect: (paperId, selected) => {
        const set = new Set(this.selectedPaperIds);
        if (selected) set.add(paperId);
        else set.delete(paperId);
        this.selectedPaperIds = [...set];
        this.notify();
      },
      onToggleSessionSelect: (sessionId, selected) => {
        const set = new Set(this.selectedPaperIds);
        for (const p of CET6_CATALOG.filter(item => item.sessionId === sessionId)) {
          if (selected) set.add(p.id);
          else set.delete(p.id);
        }
        this.selectedPaperIds = [...set];
        this.notify();
      },
      onSelectAllPapers: () => {
        this.selectedPaperIds = CET6_CATALOG.map(p => p.id);
        this.notify();
      },
      onSelectImportedPapers: () => {
        this.selectedPaperIds = [...this.savedFiles.keys()];
        this.notify();
      },
      onClearSelection: () => {
        this.selectedPaperIds = [];
        this.notify();
      },
      onDownloadAndImportSelected: ids => void this.downloadPapersBatch(ids),
      onDownloadAllPapers: () => {
        const allIds = CET6_CATALOG.map(p => p.id);
        this.selectedPaperIds = allIds;
        void this.downloadPapersBatch(allIds);
      },
      onDownloadSinglePaper: id => void this.handleSinglePaperDownload(id),
      onRequestBatchDeletePapers: ids => this.openDeleteConfirmModal(ids),
      onRequestDeleteSinglePaper: id => this.openDeleteConfirmModal([id]),
      onUndoLastDelete: () => void this.undoLastBatchDelete(),
      onDismissDeleteNotice: () => {
        this.justDeleted = null;
        this.notify();
      },
      onDismissDuplicateNotice: () => {
        this.duplicateClickNotice = null;
        this.notify();
      },
      onRetryFailedPapers: ids => void this.downloadPapersBatch(ids),
      onPickTargetFolder: () => {
        new ExamFolderPicker(this.plugin.app, async path => {
          await this.plugin.commit(draft => {
            draft.settings.cet6CatalogFolder = path || '词屿/六级题库/历年真题';
          }, ['exams']);
          await this.syncVaultFiles();
        }).open();
      },
      onOpenBatchDownloadModal: () => this.openExamModal('batch_download'),
      onOpenImportModal: () => this.openExamModal('import_exam'),
      onOpenCet6Index: () => {
        this.subView = 'index';
        this.workspaceMode = 'index';
        this.notify();
      },
      onOpenPaperReader: id => void this.openPaperReader(id),
      onOpenPaperListening: id => void this.openListeningSelfCheck(id),
      onOpenPaperNote: (_, notePath) => safeUi(() => this.plugin.openSource(notePath)),
      onOpenMistakeBook: () => {
        this.subView = 'mistakes';
        this.notify();
      },
    };
  }

  decoratedPaperDoc(paperId) {
    const raw = this.docCache.get(paperId);
    if (!raw) return null;
    const paper = CET6_CATALOG.find(item => item.id === paperId);
    const saved = this.savedFiles.get(paperId);
    const ansMap = this.userAnswers(paperId);

    const decorateChoice = q => ({
      ...q,
      selectedKey: ansMap.get(q.number),
    });

    return {
      ...raw,
      notePath: saved?.path,
      transcriptNotePath: paper && this.hasSavedTranscript(paper) ? this.transcriptPathFor(paper) : undefined,
      audioFilePath: paper && this.hasOfflineAudio(paper) ? this.audioPathFor(paper) : undefined,
      listening: {
        ...raw.listening,
        playing: this.audioPaperId === paperId && this.audioPlaying,
        currentTimeSec: this.audioPaperId === paperId ? this.audioCurrentTime : 0,
        durationSec: this.audioPaperId === paperId ? this.audioDuration : 1500,
        playbackRate: this.audioRate,
        transcriptSaved: paper ? this.hasSavedTranscript(paper) : false,
        audioSaved: paper ? this.hasOfflineAudio(paper) : false,
        groups: raw.listening.groups.map(grp => ({
          ...grp,
          questions: grp.questions.map(decorateChoice),
        })),
      },
      bankedCloze: {
        ...raw.bankedCloze,
        questions: raw.bankedCloze.questions.map(q => ({
          ...q,
          selectedKey: ansMap.get(q.number),
        })),
      },
      matching: {
        ...raw.matching,
        questions: raw.matching.questions.map(q => ({
          ...q,
          selectedKey: ansMap.get(q.number),
        })),
      },
      carefulReading: {
        ...raw.carefulReading,
        passages: raw.carefulReading.passages.map(psg => ({
          ...psg,
          questions: psg.questions.map(decorateChoice),
        })),
      },
    };
  }

  examWorkspaceProps() {
    const p = this.paths();
    return {
      mode: this.workspaceMode,
      vaultName: this.plugin.app.vault.getName?.() || '当前库',
      targetFolder: p.papersFolder,
      indexNotePath: p.examIndexNote,
      filter: this.indexFilter,
      searchQuery: this.indexQuery,
      sessions: this.sessionsProps(),
      activePaper: this.decoratedPaperDoc(this.activePaperId),
      activeSection: this.activePaperSection,
      answersExpanded: this.paperAnswersExpanded,
      graded: this.gradedPapers.has(this.activePaperId),
      mistakeByQuestion: this.mistakeMapForPaper(this.activePaperId),
      highlightedQuestionBlockId: this.highlightedQuestionBlockId,
    };
  }

  examWorkspaceCallbacks() {
    return {
      onBackToBank: () => {
        this.subView = 'bank';
        this.notify();
      },
      onChangeMode: mode => {
        this.workspaceMode = mode;
        this.subView = mode === 'paper' ? 'paper' : 'index';
        this.notify();
      },
      onFilterChange: filter => {
        this.indexFilter = filter;
        this.notify();
      },
      onSearchChange: query => {
        this.indexQuery = query;
        this.notify();
      },
      onOpenBatchDownloadModal: () => this.openExamModal('batch_download'),
      onOpenImportModal: () => this.openExamModal('import_exam'),
      onOpenIndexNote: path => safeUi(async () => {
        const file = this.plugin.app.vault.getAbstractFileByPath(path) ||
          await saveCet6Index(this.plugin, this.paths().examIndexNote, this.savedFiles);
        await this.plugin.openSource(file.path);
      }),
      onOpenMistakeBook: () => {
        this.subView = 'mistakes';
        this.notify();
      },
      onSelectPaper: paperId => void this.openPaperReader(paperId),
      onOpenPaperListening: (paperId, groupId) => {
        if (groupId) this.listeningGroupId = groupId;
        void this.openListeningSelfCheck(paperId);
      },
      onOpenLocalNote: path => safeUi(() => this.plugin.openSource(path)),
      onJumpSection: sec => {
        this.activePaperSection = sec;
        this.notify();
      },
      onToggleEmbeddedPlay: () => this.toggleAudioPlay(),
      onStepEmbeddedAudio: delta => this.seekAudio(this.audioCurrentTime + delta),
      onDownloadTranscriptMarkdown: id => void this.downloadTranscriptMarkdown(id),
      onDownloadAudioOffline: id => void this.downloadAudioOffline(id),
      onAnswerObjective: (qNo, key) => {
        this.userAnswers(this.activePaperId).set(qNo, key);
        this.notify();
      },
      onSubmitGrading: () => {
        this.gradedPapers.add(this.activePaperId);
        this.notify();
      },
      onAddAllWrongToMistakes: () => safeUi(async () => {
        const doc = this.decoratedPaperDoc(this.activePaperId);
        if (!doc) return;
        const collect = [];
        doc.listening.groups.forEach(g => g.questions.forEach(q => {
          if (q.selectedKey !== q.answerKey) collect.push({ q, type: 'listening', stem: q.stem });
        }));
        doc.bankedCloze.questions.forEach(q => {
          if (q.selectedKey !== q.answerKey) collect.push({ q, type: 'banked_cloze', stem: `选词填空 〔${q.number}〕` });
        });
        doc.matching.questions.forEach(q => {
          if (q.selectedKey !== q.answerKey) collect.push({ q, type: 'matching', stem: q.statement });
        });
        doc.carefulReading.passages.forEach(p => p.questions.forEach(q => {
          if (q.selectedKey !== q.answerKey) collect.push({ q, type: 'careful_reading', stem: q.stem });
        }));
        for (const item of collect) {
          await this.addMistakeEntry({
            paperId: this.activePaperId,
            questionNumber: item.q.number,
            blockId: item.q.blockId,
            questionType: item.type,
            stemPreview: item.stem,
            myAnswer: item.q.selectedKey || '未作答',
            correctAnswer: item.q.answerKey,
          });
        }
        new Notice(`已将 ${collect.length} 道错题加入六级错题本。`);
      }),
      onAddQuestionToMistakes: payload => safeUi(async () => {
        await this.addMistakeEntry(payload);
        new Notice(`第 ${payload.questionNumber} 题已加入错题本。`);
      }),
      onViewMistakeRecord: ref => {
        this.highlightedMistakeBlockId = ref.mistakeBlockId;
        this.subView = 'mistakes';
        this.notify();
      },
      onToggleAnswers: exp => {
        this.paperAnswersExpanded = exp;
        this.notify();
      },
      onLookupSelection: (term, contextSentence, rect) => {
        this.plugin.showSelectionPillForProse?.(term, contextSentence, rect);
      },
    };
  }

  listeningProps(inWideLeaf = false) {
    const paper = CET6_CATALOG.find(item => item.id === this.activePaperId) || CET6_CATALOG[0];
    const doc = this.decoratedPaperDoc(paper.id);
    const groups = doc?.listening.groups || [];
    const offlineAudio = this.hasOfflineAudio(paper);
    const savedTranscript = this.hasSavedTranscript(paper);

    // 同考次共用听力原文检测
    let sharedTranscriptInfo = null;
    if (!savedTranscript) {
      const siblingWithTranscript = CET6_CATALOG.find(
        other => other.sessionId === paper.sessionId && other.id !== paper.id && this.hasSavedTranscript(other)
      );
      if (siblingWithTranscript) {
        sharedTranscriptInfo = {
          sourcePaperTitle: siblingWithTranscript.title,
          notePath: this.transcriptPathFor(siblingWithTranscript),
        };
      }
    }

    const hasWideLeaf = Boolean(this.plugin.app?.workspace?.getLeavesOfType?.(CET6_WIDE_VIEW)?.length);
    const hasSidebarLeaf = Boolean(this.plugin.app?.workspace?.getLeavesOfType?.(VIEW)?.length);
    const isWideOpen = Boolean(inWideLeaf || hasWideLeaf);
    const companionRole = isWideOpen
      ? (inWideLeaf ? (hasSidebarLeaf ? 'questions-only' : 'full') : 'transcript-only')
      : 'full';
    return {
      paperId: paper.id,
      paperTitle: paper.title,
      isWideOpen,
      companionRole,
      notePath: this.savedFiles.get(paper.id)?.path,
      availablePapers: CET6_CATALOG.map(item => ({
        id: item.id,
        title: item.title,
        session: item.session,
        imported: this.savedFiles.has(item.id),
        hasAudio: true,
      })),
      loadingPaper: this.loadingListeningPaper,
      loadError: this.listeningLoadError || undefined,
      activeSection: this.listeningSection,
      activeGroupId: this.listeningGroupId,
      groups,
      selfCheck: this.selfCheckState(paper.id),
      transcriptMode: this.transcriptMode,
      hideChineseInBilingual: this.hideChineseInBilingual,
      narrowPane: this.narrowPane,
      audioState: this.audioError
        ? 'audio_error'
        : doc && !doc.audioUrl && !offlineAudio
        ? 'no_audio'
        : 'ready',
      audioErrorDetail: this.audioError || undefined,
      sourceAudioUrl: doc?.audioUrl,
      transcriptDownloadStatus: this.transcriptSaving
        ? 'saving'
        : savedTranscript
        ? 'saved'
        : 'idle',
      transcriptSavedPath: savedTranscript ? this.transcriptPathFor(paper) : undefined,
      sharedTranscriptInfo,
      audioDownloadStatus: this.audioDownloading
        ? 'downloading'
        : offlineAudio
        ? 'saved'
        : 'idle',
      audioDownloadPercent: this.audioDownloadPercent || undefined,
      audioSavedPath: offlineAudio ? this.audioPathFor(paper) : undefined,
      transcriptSourceLabel: savedTranscript
        ? '库内听力原文 Markdown'
        : '南京大学六级历年真题自测库',
      transcriptSourceUrl: paper.url,
      transcriptVerified: true,
      playing: this.audioPaperId === paper.id && this.audioPlaying,
      currentTimeSec: this.audioPaperId === paper.id ? this.audioCurrentTime : (this.activeClipRange(paper.id)?.startSec ?? 0),
      durationSec: this.audioPaperId === paper.id ? this.audioDuration : 1500,
      playbackRate: this.audioRate,
      clipMode: this.clipMode,
      loopSegmentId: this.loopSegmentId,
      activeSegmentId: this.activeSegmentId,
      activeSentenceId: this.activeSentenceId,
      highlightedQuestionBlockId: this.highlightedQuestionBlockId,
      mistakeByQuestion: this.mistakeMapForPaper(paper.id),
      answersExpanded: this.listeningAnswersExpanded,
      _inWideLeaf: inWideLeaf,
    };
  }

  listeningCallbacks(inWideLeaf = false) {
    return {
      onBackToBank: () => {
        this.subView = 'bank';
        this.notify();
      },
      onSelectPaper: paperId => void this.openListeningSelfCheck(paperId),
      onRetryLoadPaper: paperId => {
        this.docCache.delete(paperId);
        void this.openListeningSelfCheck(paperId);
      },
      onOpenInWideWorkspace: paperId => safeUi(() => {
        const hasWide = Boolean(this.plugin.app.workspace.getLeavesOfType(CET6_WIDE_VIEW)?.length);
        if (inWideLeaf || hasWide) {
          return this.plugin.closeWideCet6Workspace();
        }
        if (this.transcriptMode === 'blind') {
          this.transcriptMode = 'bilingual';
        }
        return this.plugin.openWideCet6Workspace('listening', paperId);
      }),
      onOpenReader: paperId => void this.openPaperReader(paperId),
      onOpenLocalNote: path => safeUi(() => this.plugin.openSource(path)),
      onChangeSection: sec => {
        this.listeningSection = sec;
        const doc = this.docCache.get(this.activePaperId);
        const first = doc?.listening.groups.find(g => g.section === sec);
        if (first) this.listeningGroupId = first.id;
        this._audioPlaySeq++;
        this.audioError = '';
        this.audioPlaying = false;
        try { this.audio?.pause(); } catch {}
        this.loopSegmentId = null;
        this.syncAudioToActiveGroup(false);
        this.notify();
      },
      onSelectGroup: groupId => {
        this.listeningGroupId = groupId;
        this._audioPlaySeq++;
        this.audioError = '';
        this.audioPlaying = false;
        try { this.audio?.pause(); } catch {}
        this.loopSegmentId = null;
        this.syncAudioToActiveGroup(false);
        this.notify();
      },
      onToggleClipMode: mode => {
        this.clipMode = mode;
        if (mode === 'group') {
          const clip = this.activeClipRange();
          if (clip && (this.audioCurrentTime < clip.startSec || this.audioCurrentTime > clip.endSec)) {
            this.syncAudioToActiveGroup(false);
          }
        }
        this.notify();
      },
      onPlayGroupClip: groupId => {
        const doc = this.docCache.get(this.activePaperId);
        const grp = doc?.listening.groups.find(g => g.id === groupId);
        if (grp) {
          this.listeningSection = grp.section;
          this.listeningGroupId = grp.id;
        }
        this.syncAudioToActiveGroup(true);
        this.notify();
      },
      onChangeTranscriptMode: mode => {
        this.transcriptMode = mode;
        this.notify();
      },
      onToggleHideChinese: hide => {
        this.hideChineseInBilingual = hide;
        this.notify();
      },
      onChangeNarrowPane: pane => {
        this.narrowPane = pane;
        this.notify();
      },
      onTogglePlay: () => this.toggleAudioPlay(),
      onStepSkip: delta => this.seekAudio(this.audioCurrentTime + delta),
      onSeek: sec => this.seekAudio(sec),
      onChangeRate: rate => {
        this.audioRate = rate;
        if (this.audio) this.audio.playbackRate = rate;
        this.notify();
      },
      onSelectSegment: (segId, autoPlay) => {
        this.selectSegment(segId, Boolean(autoPlay));
      },
      onSelectSentence: (segId, sentId, startSec) => {
        this.activeSegmentId = segId;
        this.activeSentenceId = sentId;
        if (typeof startSec === 'number') this.seekAudio(startSec);
        if (this.audio?.paused) this.toggleAudioPlay();
      },
      onReplaySegment: segId => {
        const doc = this.docCache.get(this.activePaperId);
        const grpMatch = doc?.listening.groups.find(g => g.id === segId);
        if (grpMatch && typeof grpMatch.startSec === 'number') {
          this.listeningSection = grpMatch.section;
          this.listeningGroupId = grpMatch.id;
          this.syncAudioToActiveGroup(true);
          this.notify();
          return;
        }
        const seg = doc?.listening.groups.flatMap(g => g.segments).find(s => s.id === segId);
        if (seg && typeof seg.startSec === 'number') this.seekAudio(seg.startSec);
        if (this.audio?.paused) this.toggleAudioPlay();
      },
      onToggleLoopSegment: segId => {
        this.loopSegmentId = this.loopSegmentId === segId ? null : segId;
        this.notify();
      },
      onDownloadTranscriptMarkdown: id => void this.downloadTranscriptMarkdown(id),
      onOpenSavedTranscriptNote: path => safeUi(() => this.plugin.openSource(path)),
      onDownloadAudioOffline: id => void this.downloadAudioOffline(id),
      onRetryLoadAudio: () => {
        const paper = CET6_CATALOG.find(item => item.id === this.activePaperId);
        const doc = this.docCache.get(this.activePaperId);
        this.audioError = '';
        this.notify();
        if (paper && doc) {
          this.stopAudio();
          this.prepareAudioForPaper(paper, doc);
          this.toggleAudioPlay();
        }
      },
      onOpenSourceAudioLink: url => window.open(url, '_blank', 'noopener'),
      onSelectOption: (qNo, key) => {
        this.userAnswers(this.activePaperId).set(qNo, key);
        this.notify();
      },
      onSubmitGroupSelfCheck: groupId => {
        const state = this.selfCheckState(this.activePaperId);
        if (!state.checkedGroupIds.includes(groupId)) {
          state.checkedGroupIds = [...state.checkedGroupIds, groupId];
        }
        this.notify();
      },
      onResetGroupSelfCheck: groupId => {
        const state = this.selfCheckState(this.activePaperId);
        state.checkedGroupIds = state.checkedGroupIds.filter(id => id !== groupId);
        state.fullSubmitted = false;
        const doc = this.docCache.get(this.activePaperId);
        const grp = doc?.listening.groups.find(g => g.id === groupId);
        const ans = this.userAnswers(this.activePaperId);
        grp?.questions.forEach(q => ans.delete(q.number));
        this.notify();
      },
      onSubmitFullSelfCheck: () => {
        const state = this.selfCheckState(this.activePaperId);
        state.fullSubmitted = true;
        this.notify();
      },
      onResetFullSelfCheck: () => {
        this.selfCheckByPaper.set(this.activePaperId, { checkedGroupIds: [], fullSubmitted: false });
        const ans = this.userAnswers(this.activePaperId);
        for (let n = 1; n <= 25; n++) ans.delete(n);
        this.notify();
      },
      onAddWrongListeningToMistakes: questions => safeUi(async () => {
        for (const q of questions) {
          await this.addMistakeEntry({
            paperId: this.activePaperId,
            questionNumber: q.number,
            blockId: q.blockId,
            questionType: 'listening',
            stemPreview: q.stem || q.options.map(o => `${o.key}) ${o.text}`).join(' / '),
            myAnswer: q.selectedKey || '未作答',
            correctAnswer: q.answerKey,
          });
        }
        new Notice(`已将 ${questions.length} 道听力错题加入六级错题本。`);
      }),
      onPasteTranscript: (paperId, rawText) => safeUi(() => this.savePastedTranscript(paperId, rawText)),
      onJumpToQuestion: (_, blockId) => {
        this.highlightedQuestionBlockId = blockId;
        this.narrowPane = 'questions';
        this.notify();
      },
      onJumpToSegment: segId => {
        this.activeSegmentId = segId;
        if (this.transcriptMode === 'blind') this.transcriptMode = 'en';
        this.narrowPane = 'en';
        this.notify();
      },
      onAddMistake: (q, type) => safeUi(async () => {
        await this.addMistakeEntry({
          paperId: this.activePaperId,
          questionNumber: q.number,
          blockId: q.blockId,
          questionType: type,
          stemPreview: q.stem || q.options.map(o => `${o.key}) ${o.text}`).join(' / '),
          myAnswer: q.selectedKey || '未作答',
          correctAnswer: q.answerKey,
        });
        new Notice(`第 ${q.number} 题已加入错题本。`);
      }),
      onViewMistakeRecord: ref => {
        this.highlightedMistakeBlockId = ref.mistakeBlockId;
        this.subView = 'mistakes';
        this.notify();
      },
      onToggleAnswers: exp => {
        this.listeningAnswersExpanded = exp;
        this.notify();
      },
      onLookupSelection: (term, contextSentence, rect) => {
        this.plugin.showSelectionPillForProse?.(term, contextSentence, rect);
      },
    };
  }

  mistakesProps() {
    const list = this.mistakes();
    const sessions = [...new Set(list.map(m => m.session).filter(Boolean))];
    return {
      indexNotePath: this.paths().mistakeIndexNote,
      items: list,
      sessionFilter: this.mistakeSessionFilter,
      typeFilter: this.mistakeTypeFilter,
      statusFilter: this.mistakeStatusFilter,
      availableSessions: sessions,
      highlightedMistakeBlockId: this.highlightedMistakeBlockId,
    };
  }

  mistakesCallbacks() {
    return {
      onBackToBank: () => {
        this.subView = 'bank';
        this.notify();
      },
      onOpenMistakeIndexNote: () => safeUi(async () => {
        await this.saveMistakeIndex();
        await this.plugin.openSource(this.paths().mistakeIndexNote);
      }),
      onSessionFilterChange: s => {
        this.mistakeSessionFilter = s;
        this.notify();
      },
      onTypeFilterChange: t => {
        this.mistakeTypeFilter = t;
        this.notify();
      },
      onStatusFilterChange: st => {
        this.mistakeStatusFilter = st;
        this.notify();
      },
      onJumpToOriginalQuestion: item => safeUi(() => this.jumpToOriginalQuestion(item)),
      onToggleMistakeStatus: (id, nextStatus) => safeUi(async () => {
        await this.plugin.commit(draft => {
          const target = (draft.mistakes || []).find(m => m.id === id);
          if (target) target.status = nextStatus;
        }, ['exams']);
        await this.saveMistakeIndex();
      }),
      onUpdateMistakeNote: (id, note) => safeUi(async () => {
        await this.plugin.commit(draft => {
          const target = (draft.mistakes || []).find(m => m.id === id);
          if (target) target.note = clean(note, 1000);
        }, ['exams']);
        await this.saveMistakeIndex();
      }),
      onRemoveMistake: id => safeUi(async () => {
        await this.plugin.commit(draft => {
          draft.mistakes = (draft.mistakes || []).filter(m => m.id !== id);
        }, ['exams']);
        await this.saveMistakeIndex();
      }),
    };
  }
}

class CiyuCet6WorkspaceView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return CET6_WIDE_VIEW; }
  getDisplayText() { return '词屿 · 六级听力自查与真题'; }
  getIcon() { return 'headphones'; }

  async onOpen() {
    this.contentEl.addClass('ciyu-view-host');
    this.shell = this.contentEl.createDiv({ cls: 'ciyu-ui ciyu-wide-study-shell' });
    this.header = this.shell.createDiv({ cls: 'ciyu-wide-study-header' });
    this.body = this.shell.createDiv({ cls: 'ciyu-wide-study-body' });
    await this.plugin.cet6Controller.syncVaultFiles();
    if (this.plugin.cet6Controller.subView === 'listening' || this.plugin.cet6Controller.subView === 'paper') {
      void this.plugin.cet6Controller.ensurePaperLoaded(this.plugin.cet6Controller.activePaperId);
    }
    this.render();
  }

  async onClose() {
    this.destroyHandles();
    setTimeout(() => {
      this.plugin.cet6Controller?.notify();
      this.plugin.refresh?.(['exams']);
    }, 50);
  }

  destroyHandles() {
    this.bankHandle?.destroy();
    this.workspaceHandle?.destroy();
    this.listeningHandle?.destroy();
    this.mistakesHandle?.destroy();
    this.bankHandle = null;
    this.workspaceHandle = null;
    this.listeningHandle = null;
    this.mistakesHandle = null;
  }

  render() {
    if (!this.shell) return;
    const ctrl = this.plugin.cet6Controller;
    CiyuUI.applyGlassPreferences(this.shell, appearance(this.plugin.settings));

    this.header.empty();
    const brand = this.header.createDiv({ cls: 'ciyu-brand' });
    const mark = brand.createSpan({ cls: 'ciyu-brand-mark' });
    if (typeof CiyuUI !== 'undefined' && CiyuUI?.createBrandLogo) {
      mark.appendChild(CiyuUI.createBrandLogo());
    } else {
      mark.setText('屿');
    }
    brand.createSpan({ cls: 'ciyu-brand-title', text: '词屿 · 六级闭环与听力自查' });

    const nav = this.header.createDiv({ cls: 'ciyu-toolbar-actions' });
    const mistakeCount = ctrl.mistakes().length;
    const tabs = [
      ['bank', '题库选卷'],
      ['index', '真题索引'],
      ['paper', '原卷做题'],
      ['listening', '听力自查'],
      ['mistakes', mistakeCount ? `错题本 (${mistakeCount})` : '错题本'],
    ];
    for (const [id, label] of tabs) {
      const btn = nav.createEl('button', {
        cls: ctrl.subView === id ? 'ciyu-mini-btn ciyu-mini-btn--accent' : 'ciyu-mini-btn',
        text: label,
        attr: { type: 'button', 'aria-current': String(ctrl.subView === id) },
      });
      btn.addEventListener('click', () => {
        ctrl.subView = id;
        if (id === 'index') ctrl.workspaceMode = 'index';
        if (id === 'paper') {
          ctrl.workspaceMode = 'paper';
          void ctrl.ensurePaperLoaded(ctrl.activePaperId);
        }
        if (id === 'listening') void ctrl.ensurePaperLoaded(ctrl.activePaperId);
        ctrl.notify();
      });
    }

    const ver = this.plugin.manifest?.version || CiyuUI.CIYU_VERSION;
    const verBadge = nav.createSpan({
      cls: 'ciyu-version-pill',
      attr: { title: `当前版本 v${ver}` },
    });
    verBadge.createSpan({ cls: 'ciyu-version-text', text: `v${ver}` });

    if (!this.bankHandle) {
      this.bankHandle = CiyuUI.createExamBankView(ctrl.examBankProps(), ctrl.examBankCallbacks());
      this.workspaceHandle = CiyuUI.createExamWorkspaceView(ctrl.examWorkspaceProps(), ctrl.examWorkspaceCallbacks());
      this.listeningHandle = CiyuUI.createListeningIntensiveView(ctrl.listeningProps(true), ctrl.listeningCallbacks(true));
      this.mistakesHandle = CiyuUI.createMistakeBookView(ctrl.mistakesProps(), ctrl.mistakesCallbacks());
      this.body.append(
        this.bankHandle.element,
        this.workspaceHandle.element,
        this.listeningHandle.element,
        this.mistakesHandle.element
      );
    } else {
      this.bankHandle.update(ctrl.examBankProps());
      this.workspaceHandle.update(ctrl.examWorkspaceProps());
      this.listeningHandle.update(ctrl.listeningProps(true));
      this.mistakesHandle.update(ctrl.mistakesProps());
    }

    this.bankHandle.element.hidden = ctrl.subView !== 'bank';
    this.workspaceHandle.element.hidden = ctrl.subView !== 'index' && ctrl.subView !== 'paper';
    this.listeningHandle.element.hidden = ctrl.subView !== 'listening';
    this.mistakesHandle.element.hidden = ctrl.subView !== 'mistakes';
  }
}
