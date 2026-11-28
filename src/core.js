const FIELD_LABELS = {
  term: '原词', translation: '中文释义', pronunciation: '音标', partOfSpeech: '词性',
  otherMeanings: '其他常用义', derivatives: '派生词', phrases: '常用搭配',
  roots: '词根词缀', examples: '双语例句', forms: '词形变化', context: '来源句', note: '个人备注',
};
const LIST_FIELDS = new Set(['otherMeanings', 'derivatives', 'phrases', 'roots', 'examples', 'forms']);
const REVIEW_DAYS = [1, 2, 4, 7, 15, 30, 60, 120];
const DEFAULT_SETTINGS = {
  dictionaryPacks: ['common'], inference: null,
  model: 'qwen2.5:1.5b', port: 11434, archiveFolder: '词屿/每日词汇',
  examImportFolder: '词屿/六级题库/文字版', lastExamNote: '',
  cet6CatalogFolder: '词屿/六级题库/文字版/历年真题', lastCet6Index: '',
  speechEngine: 'human', speechAccent: 'us',
  colorTheme: 'system',
  customTheme: { accent: '#007aff', canvasBg: '#f4f6fb', surfaceBg: '#ffffff', textPrimary: '#1c1c1e' },
  useContext: true, reduceTransparency: false, liquidGlass: true, glassOpacity: 68, reducedMotion: false, edgeRefraction: true,
};

function speechAudioCandidates(term, accent = 'us') {
  const normalized = clean(term, 300).replace(/\s+/gu, ' ');
  if (!normalized || /[\p{Script=Han}]/u.test(normalized) || !/[A-Za-z]/u.test(normalized)) return [];
  const safeAccent = accent === 'uk' ? 'uk' : 'us';
  const words = normalized.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/gu) || [];
  const isWordOrShortPhrase = words.length >= 1 && words.length <= 3
    && normalized.length <= 40
    && !/[.!?;\n\r]/u.test(normalized);
  const encoded = encodeURIComponent(normalized);
  const baiduUrl = `https://fanyi.baidu.com/gettts?lan=${safeAccent === 'uk' ? 'uk' : 'en'}&text=${encoded}&spd=3&source=web`;
  if (isWordOrShortPhrase) {
    const youdaoUrl = `https://dict.youdao.com/dictvoice?audio=${encoded}&type=${safeAccent === 'uk' ? '1' : '2'}`;
    return [
      { provider: 'youdao', url: youdaoUrl },
      { provider: 'baidu', url: baiduUrl },
    ];
  }
  if (normalized.length <= 260) {
    return [{ provider: 'baidu', url: baiduUrl }];
  }
  return [];
}

function clean(value, limit = 2000) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function entryFields(raw = {}) {
  const result = {};
  for (const field of Object.keys(FIELD_LABELS)) {
    if (LIST_FIELDS.has(field)) {
      const values = Array.isArray(raw[field]) ? raw[field] : clean(raw[field]).split(/\r?\n/);
      result[field] = values.map(value => clean(value, 500)).filter(Boolean).slice(0, 12);
    } else {
      result[field] = clean(raw[field], field === 'term' ? 1000 : 2000);
    }
  }
  return result;
}

function isSentenceQuery(term) {
  const words = term.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) || [];
  if (words.length >= 4) return true;
  if (words.length >= 2 && /[!?]$|[\n\r]/u.test(term)) return true;
  if (words.length >= 3 && /\.$/u.test(term) && !/^(?:[A-Za-z]\.)+$/u.test(term)) return true;
  return words.length >= 2 && /^(?:go|stop|keep|please|come|look|take|give|let|do|try|wait|turn|stay|be|don['’]t)\b/iu.test(term);
}

function initialData(raw) {
  const data = raw && typeof raw === 'object' ? raw : {};
  if (Number(data.version) > 1) throw new Error('生词本来自更新版本，请先更新词屿。');
  const settings = { ...DEFAULT_SETTINGS, ...data.settings };
  settings.customTheme = { ...DEFAULT_SETTINGS.customTheme, ...(data.settings?.customTheme || {}) };
  if (!Array.isArray(settings.dictionaryPacks)) settings.dictionaryPacks = ['common'];
  return {
    version: 1,
    settings,
    cards: Array.isArray(data.cards) ? data.cards : [],
    mistakes: Array.isArray(data.mistakes) ? data.mistakes : [],
  };
}

function duplicateKey(card) {
  const normalize = text => text.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
  return JSON.stringify([normalize(card.term), normalize(card.translation)]);
}

function localDay(date = new Date()) {
  const two = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

function scheduleReview(card, grade, now = Date.now()) {
  const step = Math.max(-1, Math.min(REVIEW_DAYS.length - 1, Number(card.step ?? -1)));
  let nextStep = step;
  let due;
  switch (grade) {
    case 'again':
      nextStep = -1;
      due = now + 10 * 60_000;
      break;
    case 'hard':
      nextStep = Math.max(0, step - 1);
      due = addLocalDays(now, Math.max(1, Math.floor(REVIEW_DAYS[nextStep] / 2)));
      break;
    case 'good':
    case 'easy':
      nextStep = Math.min(REVIEW_DAYS.length - 1, step + (grade === 'easy' ? 2 : 1));
      due = addLocalDays(now, REVIEW_DAYS[nextStep]);
      break;
    default:
      throw new Error('请选择一个复习评分。');
  }
  return {
    ...card, step: nextStep, due,
    reviews: [...(card.reviews || []), { at: now, grade, due }],
  };
}

function addLocalDays(now, days) {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function reviewDelay(now, due) {
  if (due - now < 86_400_000 && localDay(new Date(now)) === localDay(new Date(due))) return '10 分钟';
  const start = new Date(now);
  const end = new Date(due);
  const days = (Date.UTC(end.getFullYear(), end.getMonth(), end.getDate())
    - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86_400_000;
  return `${Math.max(1, days)} 天`;
}

function clozeSentence(card) {
  const term = clean(card.term);
  if (!term) return null;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/gu, '\\s+');
  const left = /^[\p{Script=Latin}\d]/u.test(term) ? '(?<![\\p{Script=Latin}\\d])' : '';
  const right = /[\p{Script=Latin}\d]$/u.test(term) ? '(?![\\p{Script=Latin}\\d])' : '';
  const pattern = new RegExp(left + escaped + right, 'giu');
  for (const line of [card.context, ...(card.examples || [])]) {
    const sentence = clean(line).split(/\s+(?:—|–|\|)\s+|\n/u)[0];
    const masked = sentence.replace(pattern, '_____');
    if (masked !== sentence) return { sentence, masked };
  }
  return null;
}

function escapeHtml(text) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return text.replace(/[&<>"']/g, char => entities[char]);
}

function markdownInline(text) {
  return text.replace(/\s+/gu, ' ').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\\*`_~\[\]{}#|^$!=:@]/g, '\\$&');
}

function wordBlockId(term) {
  const base = normalizeWordHeadingKey(term)
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 42);
  if (base) return `ciyu-${base}`;
  let hash = 0;
  for (const ch of String(term || '')) hash = ((hash << 5) - hash + ch.codePointAt(0)) | 0;
  return `ciyu-w${Math.abs(hash).toString(36)}`;
}

function formatDerivativeBullet(rawItem) {
  const cleaned = String(rawItem || '').trim().replace(/^\*\*([^*]+)\*\*/u, '$1');
  const match = /^([A-Za-z][A-Za-z\s'-]*?)\s*(?:[—–-]{1,2}|[:：])\s*(.+)$/u.exec(cleaned);
  if (match) {
    return `  - **${markdownInline(match[1].trim())}** — ${markdownInline(match[2].trim())}`;
  }
  return `  - ${markdownInline(cleaned)}`;
}

function markdownEntry(entry, sourceLink = '', heading = 3, options = {}) {
  const archiveBlock = Boolean(options.archiveBlock);
  const blockIndex = typeof options.blockIndex === 'number' && options.blockIndex > 0
    ? Math.floor(options.blockIndex)
    : 0;
  const lines = [];
  if (archiveBlock) lines.push('---', '');
  const headingTitle = blockIndex > 0
    ? `${blockIndex}. ${markdownInline(entry.term)}`
    : markdownInline(entry.term);
  lines.push(`${'#'.repeat(heading)} ${headingTitle}`, '', markdownInline(entry.translation), '');
  const alwaysShow = archiveBlock ? new Set(['roots', 'derivatives']) : new Set();
  for (const [field, label] of Object.entries(FIELD_LABELS)) {
    if (field === 'term' || field === 'translation') continue;
    const value = entry[field];
    if (field === 'derivatives') {
      const items = (Array.isArray(value) ? value : String(value || '').split(/\s*；\s*/u))
        .map(s => String(s || '').trim())
        .filter(Boolean);
      if (items.length > 0) {
        lines.push(`- **${label}**：`);
        for (const item of items) lines.push(formatDerivativeBullet(item));
      } else if (alwaysShow.has(field)) {
        lines.push(`- **${label}**：`);
      }
      continue;
    }
    const text = Array.isArray(value)
      ? value.map(markdownInline).filter(Boolean).join('；')
      : markdownInline(value || '');
    if (text || alwaysShow.has(field)) {
      lines.push(`- **${label}**：${text}`);
    }
  }
  if (sourceLink) lines.push(`- **来源笔记**：${sourceLink}`);
  if (archiveBlock) lines.push('', `^${wordBlockId(entry.term)}`);
  return lines.join('\n').trimEnd() + '\n';
}

function unescapeMarkdownInline(text) {
  return (text || '')
    .replace(/\\([\\*`_~\[\]{}#|^$!=:@])/gu, '$1')
    .replace(/&(lt|gt|amp);/gu, (_, entity) => ({ lt: '<', gt: '>', amp: '&' })[entity]);
}

function normalizeWordHeadingKey(text) {
  return unescapeMarkdownInline(text)
    .replace(/^\d+\.\s+/u, '')
    .replace(/\s+\^[A-Za-z0-9-]+$/u, '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/gu, ' ')
    .trim();
}

function mergeDelimitedValues(existingRaw, incomingRaw) {
  const splitItems = raw =>
    (Array.isArray(raw) ? raw : String(raw || '').split(/\s*；\s*/u))
      .map(item => item.trim())
      .filter(Boolean);
  const out = [];
  const seen = new Set();
  for (const item of [...splitItems(existingRaw), ...splitItems(incomingRaw)]) {
    const key = normalizeWordHeadingKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.join('；');
}

function offsetToLineCh(text, offset) {
  const clamped = Math.max(0, Math.min(text.length, offset));
  const head = text.slice(0, clamped).split('\n');
  return { line: head.length - 1, ch: head[head.length - 1].length };
}

/**
 * 在已有 Markdown 文本中查找同一原词的词条区块（忽略代码块），若存在则归类合并释义、搭配、例句、词根词缀与派生词，避免重复插入同名标题。
 */
function mergeMarkdownWordEntry(content, entry, sourceLink = '', defaultHeading = 3, options = {}) {
  const targetKey = normalizeWordHeadingKey(markdownInline(entry.term));
  if (!targetKey || !content) return { matched: false };
  const archiveBlock = Boolean(options.archiveBlock);
  const replaceFields = new Set(options.replaceFields || []);

  const lineRecords = [];
  let cursor = 0;
  for (const rawLine of content.split('\n')) {
    const start = cursor;
    const end = cursor + rawLine.length;
    lineRecords.push({ raw: rawLine.replace(/\r$/u, ''), start, end });
    cursor = end + 1;
  }

  let fence = null;
  let matchIndex = -1;
  let matchHashes = '#'.repeat(defaultHeading);
  let headingText = markdownInline(entry.term);

  for (let i = 0; i < lineRecords.length; i++) {
    const trimmed = lineRecords[i].raw.trim();
    const marker = /^(~{3,}|\x60{3,})(.*)$/u.exec(trimmed);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      continue;
    }
    if (fence) continue;

    const headingMatch = /^(#{2,6})\s+(.+)$/u.exec(trimmed);
    if (headingMatch && normalizeWordHeadingKey(headingMatch[2]) === targetKey) {
      matchIndex = i;
      matchHashes = headingMatch[1];
      headingText = headingMatch[2].trim();
      break;
    }
  }

  if (matchIndex < 0) return { matched: false };

  // 查找该词条小节的结束行（下一个任意级别 Markdown 标题或块分隔线 --- 之前，忽略代码块）
  fence = null;
  let endLineIndex = lineRecords.length - 1;
  for (let i = matchIndex + 1; i < lineRecords.length; i++) {
    const trimmed = lineRecords[i].raw.trim();
    const marker = /^(~{3,}|\x60{3,})(.*)$/u.exec(trimmed);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      continue;
    }
    if (fence) continue;
    if (/^#{1,6}\s+/u.test(trimmed) || /^-{3,}$/u.test(trimmed)) {
      endLineIndex = i - 1;
      break;
    }
  }
  while (endLineIndex > matchIndex && !lineRecords[endLineIndex].raw.trim()) {
    endLineIndex--;
  }

  const blockStart = lineRecords[matchIndex].start;
  const blockEnd = lineRecords[endLineIndex].end;
  const headingLine = lineRecords[matchIndex].raw;

  const knownLabels = new Set([...Object.values(FIELD_LABELS), '来源笔记']);
  const existingFields = new Map();
  const meaningParts = [];
  const customLines = [];
  let existingBlockId = '';
  let lastMetaLabel = '';

  for (let i = matchIndex + 1; i <= endLineIndex; i++) {
    const raw = lineRecords[i].raw;
    const trimmed = raw.trim();
    if (!trimmed) {
      lastMetaLabel = '';
      continue;
    }
    const blockIdMatch = /^\^([A-Za-z0-9-]+)$/u.exec(trimmed);
    if (blockIdMatch) {
      existingBlockId = blockIdMatch[1];
      lastMetaLabel = '';
      continue;
    }
    const subBullet = /^\s{2,}-\s+(.+)$/u.exec(raw);
    if (subBullet && lastMetaLabel) {
      const cleanedSub = subBullet[1].trim().replace(/^\*\*([^*]+)\*\*/u, '$1');
      if (cleanedSub) {
        const prev = existingFields.get(lastMetaLabel);
        existingFields.set(lastMetaLabel, prev ? mergeDelimitedValues(prev, cleanedSub) : cleanedSub);
      }
      continue;
    }
    const meta = /^-\s+\*\*([^*]+)\*\*[:：]\s*(.*)$/u.exec(trimmed);
    if (meta && knownLabels.has(meta[1])) {
      lastMetaLabel = meta[1];
      const val = meta[2].trim();
      if (val) {
        const prev = existingFields.get(meta[1]);
        existingFields.set(meta[1], prev ? mergeDelimitedValues(prev, val) : val);
      } else if (!existingFields.has(meta[1])) {
        existingFields.set(meta[1], '');
      }
    } else if (!existingFields.size && customLines.length === 0 && !/^[-*>#]/u.test(trimmed)) {
      lastMetaLabel = '';
      meaningParts.push(trimmed);
    } else {
      lastMetaLabel = '';
      customLines.push(raw);
    }
  }

  const incomingTranslation = markdownInline(entry.translation || '');
  const mergedMeaning = incomingTranslation
    ? mergeDelimitedValues(meaningParts.join('；'), incomingTranslation)
    : meaningParts.join('；');

  for (const [field, label] of Object.entries(FIELD_LABELS)) {
    if (field === 'term' || field === 'translation') continue;
    const value = entry[field];
    const hasIncoming = value !== undefined;
    const incomingText = Array.isArray(value)
      ? value.map(markdownInline).filter(Boolean).join('；')
      : markdownInline(value || '');
    if (replaceFields.has(field) && hasIncoming) {
      existingFields.set(label, incomingText);
      continue;
    }
    if (!incomingText) continue;
    const prev = existingFields.get(label);
    if (!prev) {
      existingFields.set(label, incomingText);
    } else if (field === 'pronunciation') {
      continue;
    } else {
      existingFields.set(label, mergeDelimitedValues(prev, incomingText));
    }
  }

  if (sourceLink) {
    const prevLink = existingFields.get('来源笔记');
    existingFields.set('来源笔记', prevLink ? mergeDelimitedValues(prevLink, sourceLink) : sourceLink);
  }

  const rebuilt = [headingLine || `${matchHashes} ${markdownInline(entry.term)}`];
  if (mergedMeaning) rebuilt.push('', mergedMeaning);

  const alwaysShowLabels = archiveBlock ? new Set([FIELD_LABELS.roots, FIELD_LABELS.derivatives]) : new Set();
  const orderedLabels = [...Object.entries(FIELD_LABELS).filter(([k]) => k !== 'term' && k !== 'translation').map(([, l]) => l), '来源笔记'];
  const metaLines = [];
  for (const label of orderedLabels) {
    const val = existingFields.get(label);
    if (label === FIELD_LABELS.derivatives) {
      const items = String(val || '').split(/\s*；\s*/u).map(s => unescapeMarkdownInline(s).trim()).filter(Boolean);
      if (items.length > 0) {
        metaLines.push(`- **${label}**：`);
        for (const item of items) metaLines.push(formatDerivativeBullet(item));
      } else if (alwaysShowLabels.has(label) && (val !== undefined || archiveBlock)) {
        metaLines.push(`- **${label}**：`);
      }
      continue;
    }
    if (val || (alwaysShowLabels.has(label) && (val !== undefined || archiveBlock))) {
      metaLines.push(`- **${label}**：${val || ''}`);
    }
  }
  if (metaLines.length) rebuilt.push('', ...metaLines);
  if (customLines.length) rebuilt.push('', ...customLines);
  const finalBlockId = existingBlockId || (archiveBlock ? wordBlockId(entry.term) : '');
  if (finalBlockId) rebuilt.push('', `^${finalBlockId}`);

  const replacementBlock = rebuilt.join('\n').trimEnd();
  const existingBlock = content.slice(blockStart, blockEnd);
  const changed = replacementBlock !== existingBlock;
  const nextContent = changed
    ? content.slice(0, blockStart) + replacementBlock + content.slice(blockEnd)
    : content;

  return {
    matched: true,
    changed,
    content: nextContent,
    blockStart,
    blockEnd,
    replacementBlock,
    headingText,
    blockId: finalBlockId,
    line: matchIndex,
  };
}

function ankiTsv(cards) {
  const column = value => '"' + value.replaceAll('"', '""') + '"';
  const html = value => escapeHtml(value).replace(/\r?\n/g, '<br>');
  const rows = cards.map(card => {
    const details = [html(card.translation)];
    for (const [field, label] of Object.entries(FIELD_LABELS)) {
      if (field === 'term' || field === 'translation') continue;
      const value = card[field];
      if (!value?.length) continue;
      details.push(`<b>${label}</b>：${(Array.isArray(value) ? value : [value]).map(html).join('；')}`);
    }
    return [column(html(card.term)), column(details.join('<br>'))].join('\t');
  });
  return ['#separator:tab', '#html:true', '#columns:Front\tBack', ...rows, ''].join('\n');
}

function unescapeHtmlEntities(text) {
  return String(text || '')
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<\/p>/giu, '\n')
    .replace(/<[^>]+>/gu, '')
    .replace(/&(quot|amp|lt|gt|#39|nbsp);/giu, (_, ent) => {
      const map = { quot: '"', amp: '&', lt: '<', gt: '>', '#39': "'", nbsp: ' ' };
      return map[ent.toLowerCase()] ?? '';
    });
}

function splitDelimitedRow(line, delimiter) {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      cells.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

function splitPhysicalRecords(rawText) {
  const rows = [];
  let cur = '';
  let inQuotes = false;
  const normalized = String(rawText || '').replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n');
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch === '"') {
      if (inQuotes && normalized[i + 1] === '"') {
        cur += '""';
        i++;
      } else {
        inQuotes = !inQuotes;
        cur += ch;
      }
    } else if (ch === '\n' && !inQuotes) {
      rows.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur) rows.push(cur);
  return rows;
}

function parseAnkiBackDetails(rawBack) {
  const rawLines = String(rawBack || '')
    .replace(/<br\s*\/?>/giu, '\n')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  const labelToField = Object.fromEntries(Object.entries(FIELD_LABELS).map(([k, v]) => [v, k]));
  const extra = {};
  const meaningLines = [];

  for (const line of rawLines) {
    const boldMeta = /^<b>([^<]+)<\/b>[:：]\s*(.+)$/iu.exec(line);
    const plain = unescapeHtmlEntities(boldMeta ? boldMeta[2] : line).trim();
    if (boldMeta && Object.hasOwn(labelToField, boldMeta[1].trim())) {
      const f = labelToField[boldMeta[1].trim()];
      extra[f] = LIST_FIELDS.has(f) ? plain.split(/\s*；\s*/u).filter(Boolean) : plain;
    } else if (plain) {
      meaningLines.push(plain);
    }
  }
  return {
    meaningZh: meaningLines.join('；'),
    ...extra,
  };
}

function parseSingleVocabLine(rawLine) {
  let line = rawLine.trim().replace(/^(?:\d+[.)、]\s*|\(\d+\)\s*|[-*•]\s+)/u, '').trim();
  if (!line) return [];

  // 若单行是用逗号或分号分隔的多个纯英文单词（如 sustainable, resilience, alleviate）
  if (!/[\p{Script=Han}\t]/u.test(line) && /[,;，；]/u.test(line)) {
    const parts = line.split(/[,;，；]+/u).map(s => s.trim()).filter(Boolean);
    if (parts.length > 1 && parts.every(p => /^[A-Za-z][A-Za-z0-9' -]{0,48}$/u.test(p))) {
      return parts.map(word => ({ word, phonetic: '', partOfSpeech: '', meaningZh: '' }));
    }
  }

  let phonetic = '';
  const phoMatch = line.match(/\s+(\/[^/\n]{1,40}\/|\[[^\]\n]{1,40}\])\s*/u);
  if (phoMatch) {
    phonetic = phoMatch[1];
    line = (line.slice(0, phoMatch.index) + ' ' + line.slice(phoMatch.index + phoMatch[0].length)).trim();
  }

  // 显式分隔符：Tab、破折号、竖线、冒号
  const sepMatch = /^(.*?)(?:\t+|\s+(?:—|–|--|\|)\s+|\s*[:：]\s+)(.+)$/u.exec(line);
  if (sepMatch && sepMatch[1].trim()) {
    const word = sepMatch[1].trim();
    let rest = sepMatch[2].trim();
    let partOfSpeech = '';
    const pos = /^([a-z]{1,6}\.)\s+(.+)$/iu.exec(rest);
    if (pos) {
      partOfSpeech = pos[1];
      rest = pos[2].trim();
    }
    return [{ word, phonetic, partOfSpeech, meaningZh: rest }];
  }

  // 英文词组后跟词性或中文释义（如 "resilience n. 韧性；恢复力" 或 "resilience 韧性"）
  const enZhMatch = /^([A-Za-z][A-Za-z0-9' -]{0,56}?)\s+((?:[a-z]{1,6}\.\s*)?[\p{Script=Han}].*)$/u.exec(line);
  if (enZhMatch) {
    const word = enZhMatch[1].trim();
    let rest = enZhMatch[2].trim();
    let partOfSpeech = '';
    const pos = /^([a-z]{1,6}\.)\s*(.+)$/iu.exec(rest);
    if (pos) {
      partOfSpeech = pos[1];
      rest = pos[2].trim();
    }
    return [{ word, phonetic, partOfSpeech, meaningZh: rest }];
  }

  // 纯英文单词或短语（留待离线词库自动补全）
  return [{ word: line, phonetic, partOfSpeech: '', meaningZh: '' }];
}

/**
 * 解析批量粘贴文本或 TXT / CSV / TSV / Anki 词表文件内容为标准待导入词条数组
 */
function parseVocabImportText(rawText, filename = '') {
  const records = splitPhysicalRecords(rawText);
  if (!records.length) return [];

  const isAnkiHeader = records.some(r => /^#(separator|html|columns):/iu.test(r.trim()));
  const ext = filename.toLowerCase();
  const nonComment = records.filter(r => r.trim() && !r.trim().startsWith('#'));
  if (!nonComment.length) return [];

  const tabLines = nonComment.filter(r => r.includes('\t')).length;
  const isTsv = isAnkiHeader || ext.endsWith('.tsv') || (tabLines >= Math.ceil(nonComment.length * 0.6) && tabLines >= 1);
  const isCsv = !isTsv && (ext.endsWith('.csv') || (nonComment.length >= 2 && nonComment.every(r => r.includes(',')) && /["\p{Script=Han}]/u.test(rawText)));

  if (isTsv || isCsv) {
    const delimiter = isTsv ? '\t' : ',';
    const parsedRows = nonComment.map(r => splitDelimitedRow(r, delimiter));
    let wordCol = 0;
    let meaningCol = 1;
    let phoneticCol = -1;
    let posCol = -1;
    let contextCol = -1;
    let startRow = 0;

    const firstLower = parsedRows[0].map(c => unescapeHtmlEntities(c).toLowerCase().trim());
    const headerKeywords = ['word', 'term', 'front', 'vocabulary', '单词', '原词', '生词', '英文'];
    if (firstLower.some(c => headerKeywords.includes(c))) {
      startRow = 1;
      wordCol = Math.max(0, firstLower.findIndex(c => headerKeywords.includes(c)));
      meaningCol = firstLower.findIndex(c => ['meaning', 'translation', 'back', 'definition', '释义', '中文', '中文释义', '翻译'].includes(c));
      if (meaningCol < 0) meaningCol = wordCol === 0 ? 1 : 0;
      phoneticCol = firstLower.findIndex(c => ['phonetic', 'pronunciation', '音标'].includes(c));
      posCol = firstLower.findIndex(c => ['pos', 'partofspeech', '词性'].includes(c));
      contextCol = firstLower.findIndex(c => ['context', 'sentence', 'example', '例句', '来源句'].includes(c));
    }

    const out = [];
    for (let i = startRow; i < parsedRows.length; i++) {
      const cols = parsedRows[i];
      const rawWord = unescapeHtmlEntities(cols[wordCol] || '').trim();
      if (!rawWord) continue;
      if (isAnkiHeader || /<br|<b>/iu.test(cols[meaningCol] || '')) {
        const details = parseAnkiBackDetails(cols[meaningCol] || '');
        out.push({
          word: rawWord,
          phonetic: details.pronunciation || (phoneticCol >= 0 ? unescapeHtmlEntities(cols[phoneticCol]) : ''),
          partOfSpeech: details.partOfSpeech || (posCol >= 0 ? unescapeHtmlEntities(cols[posCol]) : ''),
          meaningZh: details.meaningZh,
          sourceSentence: details.context || (contextCol >= 0 ? unescapeHtmlEntities(cols[contextCol]) : ''),
          derivatives: details.derivatives,
          phrases: details.phrases,
          roots: details.roots,
          examples: details.examples,
          forms: details.forms,
        });
      } else {
        out.push({
          word: rawWord,
          phonetic: phoneticCol >= 0 ? unescapeHtmlEntities(cols[phoneticCol] || '').trim() : '',
          partOfSpeech: posCol >= 0 ? unescapeHtmlEntities(cols[posCol] || '').trim() : '',
          meaningZh: meaningCol >= 0 ? unescapeHtmlEntities(cols[meaningCol] || '').trim() : '',
          sourceSentence: contextCol >= 0 ? unescapeHtmlEntities(cols[contextCol] || '').trim() : '',
        });
      }
    }
    return out;
  }

  const results = [];
  for (const line of nonComment) {
    results.push(...parseSingleVocabLine(line));
  }
  return results;
}

const NON_VOCAB_HEADING_RE = /^(?:Part\s+[IVX]+|Section\s+[A-Z]|Passage\s+\d+|Questions?\s+\d+|PDF\s*第\s*\d+\s*页|参考答案|听力材料|备选词|中文原文|写作参考|翻译参考|对应自查题目)/iu;

/**
 * 从库内 Markdown 笔记（每日归档、词屿笔记、真题阅读笔记）提取词条区块
 */
function extractMarkdownVocabEntries(content, filePath = '') {
  const lines = String(content || '').split(/\r?\n/u);
  const fields = Object.fromEntries(Object.entries(FIELD_LABELS).map(([field, label]) => [label, field]));
  let fence = null;
  let current = null;
  const rawCandidates = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const marker = /^(~{3,}|\x60{3,})(.*)$/u.exec(trimmed);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      continue;
    }
    if (fence) continue;

    const h = /^(#{2,3})\s+(.+)$/u.exec(trimmed);
    if (h) {
      const term = unescapeMarkdownInline(h[2]).replace(/^\d+\.\s+/u, '').replace(/\s+\^[A-Za-z0-9-]+$/u, '').trim();
      if (
        term &&
        term.length <= 120 &&
        /[A-Za-z]/u.test(term) &&
        !NON_VOCAB_HEADING_RE.test(term) &&
        !term.includes('·')
      ) {
        current = { term, meaningZh: '', details: {}, hasMeta: false };
        rawCandidates.push(current);
      } else {
        current = null;
      }
      continue;
    }
    if (/^#\s+/u.test(trimmed) || /^#{4,6}\s+/u.test(trimmed)) {
      current = null;
      continue;
    }
    if (!current || !trimmed) continue;

    const subBullet = /^\s{2,}-\s+(.+)$/u.exec(lines[i]);
    if (subBullet && current.lastListField) {
      const val = unescapeMarkdownInline(subBullet[1].trim().replace(/^\*\*([^*]+)\*\*/u, '$1'));
      if (val) {
        current.details[current.lastListField] = [...(current.details[current.lastListField] || []), val];
        current.hasMeta = true;
      }
      continue;
    }
    const meta = /^-\s+\*\*([^*]+)\*\*[:：]\s*(.*)$/u.exec(trimmed);
    if (meta && Object.hasOwn(fields, meta[1])) {
      const f = fields[meta[1]];
      const val = unescapeMarkdownInline(meta[2]).trim();
      current.lastListField = LIST_FIELDS.has(f) ? f : '';
      if (val) {
        current.details[f] = LIST_FIELDS.has(f) ? val.split(/\s*；\s*/u).filter(Boolean) : val;
        current.hasMeta = true;
      }
    } else if (!current.meaningZh && !/^[-*>#|]/u.test(trimmed) && trimmed.length <= 300) {
      current.lastListField = '';
      current.meaningZh = unescapeMarkdownInline(trimmed);
    } else {
      current.lastListField = '';
    }
  }

  const isDedicatedVocabNote =
    filePath.includes('每日词汇/') || filePath.startsWith('词屿/笔记/');

  return rawCandidates
    .filter(item => item.meaningZh && (isDedicatedVocabNote || item.hasMeta))
    .map(item => entryFields({
      ...item.details,
      term: item.term,
      translation: item.meaningZh,
    }));
}
