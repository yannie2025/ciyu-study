const CET6_SAMPLE = {
  basename: '官方六级笔试样卷（文字版）',
  path: '词屿/六级题库/全国大学英语四、六级考试大纲（含官方样卷）.pdf',
  url: 'https://cet.neea.edu.cn/res/Home/1704/55b02330ac17274664f06d9d3db8249d.pdf',
  first: 172,
  last: 191,
};
const EXAM_FILE_LIMIT = 32 * 1024 * 1024;

function examDestination(value) {
  const path = value.trim().replace(/\/+$/u, '');
  if (value.trim() === '/' || !path) return '';
  if (path.startsWith('/') || path.split('/').some(part =>
    !part.trim() || part.startsWith('.') || /[\\:*?"<>|\p{Cc}]/u.test(part))) {
    throw new Error('请输入当前库内的相对文件夹路径，例如「学习/英语/六级」。');
  }
  return normalizePath(path);
}

function examBytes(buffer) {
  if (!buffer?.byteLength) throw new Error('文件没有内容。');
  if (buffer.byteLength > EXAM_FILE_LIMIT) throw new Error('请选择 32 MB 以内的试卷文件。');
  return new Uint8Array(buffer);
}

async function downloadExam(rawUrl) {
  let url;
  try { url = new URL(rawUrl.trim()); } catch {}
  if (url?.protocol !== 'https:' || url.username || url.password) {
    throw new Error('请粘贴以 https:// 开头的试卷文件直链。');
  }
  const response = await requestUrl({ url: url.href, throw: false });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`下载失败，服务器返回 ${response.status}。`);
  }
  const type = response.headers['content-type'] || '';
  if (/\bhtml\b/i.test(type)) throw new Error('链接返回了网页。请使用试卷文件直链或先下载再从本地导入。');
  const disposition = response.headers['content-disposition'] || '';
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || url.pathname.split('/').pop();
  let name = filename;
  try { name = decodeURIComponent(encoded || filename); } catch {}
  if (/^text\/plain\b/i.test(type) && !/\.(md|txt|pdf)$/i.test(name)) name = (name || '六级试卷') + '.txt';
  if (/^text\/markdown\b/i.test(type) && !/\.md$/i.test(name)) name = (name || '六级试卷') + '.md';
  return { bytes: examBytes(response.arrayBuffer), name: name || '六级试卷' };
}

function readOfficialSample(plugin, bytes) {
  const helper = plugin.app.vault.adapter.getFullPath?.(pluginDirectory(plugin) + '/native/exam-ocr');
  if (process.platform !== 'darwin' || !helper) {
    throw new Error('官方样卷的排版需要 macOS 文字识别。可在本机导入其他带文字层的 PDF、TXT 或 Markdown。');
  }
  const { execFile } = require('child_process');
  return new Promise((resolve, reject) => {
    const child = execFile(helper, [String(CET6_SAMPLE.first), String(CET6_SAMPLE.last)],
      { timeout: 180000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || '官方样卷文字识别失败，请重试。'));
          return;
        }
        try { resolve(JSON.parse(stdout).map(lines => lines.join('\n'))); }
        catch { reject(new Error('无法读取官方样卷的文字识别结果。')); }
      });
    child.stdin.on('error', () => {});
    child.stdin.end(bytes);
  });
}

async function readPdfExam(bytes, progress) {
  const engine = await loadPdfJs();
  const task = engine.getDocument({ data: bytes, isEvalSupported: false });
  try {
    const document = await task.promise;
    const pages = [];
    for (let number = 1; number <= document.numPages; number++) {
      progress(`正在读取 PDF 第 ${number} / ${document.numPages} 页…`);
      const page = await document.getPage(number);
      const { items } = await page.getTextContent();
      pages.push(items.filter(item => typeof item.str === 'string')
        .map(item => item.str + (item.hasEOL ? '\n' : '')).join(''));
      page.cleanup();
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

function examMarkdown(pages, basename, official) {
  const first = official ? CET6_SAMPLE.first : 1;
  const missing = [];
  const sections = [];
  for (const [index, raw] of pages.entries()) {
    const page = first + index;
    const body = raw.replace(/\u0000/g, '').trim();
    if (!body) {
      missing.push(page);
      continue;
    }
    const sourceLines = body.split(/\r?\n/).map(line => line.trim());
    if (official && sourceLines.at(-1) === String(page - 5)) sourceLines.pop();
    if (official) {
      // The sample prints some multiple-choice answers in two columns.
      for (let cursor = 0; cursor + 3 < sourceLines.length; cursor++) {
        if (!/^\d+[.)]\s*A[)）]/.test(sourceLines[cursor])) continue;
        const options = sourceLines.slice(cursor + 1, cursor + 4);
        const letters = options.map(line => line.match(/^([BCD])[)）]/)?.[1]);
        if (letters.every(Boolean) && new Set(letters).size === 3) {
          sourceLines.splice(cursor + 1, 3, ...options.sort((left, right) => left.localeCompare(right)));
        }
      }
    }
    const lines = sourceLines.map(line => line
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/^(\d+)([.)])(?=\s)/u, '$1\\$2')
      .replace(/^(?=[>*#-]\s)/u, '\\'));
    sections.push(`## PDF 第 ${page} 页\n\n${lines.join('  \n')}`);
  }
  if (!sections.length) throw new Error('PDF 未提取到文字。请先做文字识别，或导入 TXT / Markdown 版本。');
  const context = official ? [
    '来源为全国大学英语四、六级考试大纲的官方笔试样卷，包含试题、听力文字稿和参考答案。',
    '本笔记由本机 OCR 转写。标点和个别字符可能需要与 [官方 PDF](<' + CET6_SAMPLE.url + '#page=172>) 核对。',
  ] : [];
  if (missing.length) context.push(`以下页面未提取到文字：${missing.join('、')}。`);
  return [`# ${basename}`, ...context, ...sections].join('\n\n') + '\n';
}

async function writeExamNote(plugin, folder, basename, markdown) {
  const { vault } = plugin.app;
  if (folder) await plugin.ensureFolder(folder);
  const prefix = folder ? folder + '/' : '';
  for (let suffix = 1; ; suffix++) {
    const path = prefix + basename + (suffix === 1 ? '' : ` (${suffix})`) + '.md';
    const existing = vault.getAbstractFileByPath(path);
    if (existing instanceof TFile && await vault.read(existing) === markdown) return existing;
    if (existing) continue;
    try {
      return await vault.create(path, markdown);
    } catch (error) {
      if (!vault.getAbstractFileByPath(path)) throw error;
    }
  }
}

async function importExam(plugin, folder, input, progress) {
  const { bytes, name } = input;
  const official = Boolean(input.official);
  const basename = official ? CET6_SAMPLE.basename : (name.replace(/\.(md|txt|pdf)$/i, '')
    .replace(/[\\/:*?"<>|[\]#^\p{Cc}]/gu, ' ').trim().replace(/^\.+|\.+$/g, '').trim().slice(0, 120) || '六级试卷');
  const signature = new TextDecoder().decode(bytes.subarray(0, 1024));
  let markdown;
  if (official || signature.includes('%PDF-')) {
    progress(official ? '正在本机识别 20 页官方笔试样卷…' : '正在读取 PDF 文字层…');
    const pages = await (official ? readOfficialSample(plugin, bytes) : readPdfExam(bytes, progress));
    markdown = examMarkdown(pages, basename, official);
  } else {
    if (!/\.(md|txt)$/i.test(name)) throw new Error('请导入有效的 PDF、TXT 或 Markdown 文件。');
    const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le'
      : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
    let body;
    try {
      body = new TextDecoder(encoding, { fatal: true }).decode(bytes);
    } catch {
      throw new Error('无法识别文本编码，请将文件保存成 UTF-8 后再导入。');
    }
    if (!body.trim() || body.includes('\0')) throw new Error('文件没有可导入的文本。');
    if (/^\s*<(?:!doctype html|html[\s>])/iu.test(body)) throw new Error('该文件是网页，请导入试卷原文件。');
    markdown = /\.md$/i.test(name) ? body : body.replace(/\r\n?/g, '\n');
  }
  return writeExamNote(plugin, folder, basename, markdown);
}

class ExamFolderPicker extends FuzzySuggestModal {
  constructor(app, onChoose) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder('搜索当前库中的文件夹');
  }
  getItems() { return this.app.vault.getAllFolders(true); }
  getItemText(folder) { return folder.isRoot() ? '库根目录' : folder.path; }
  onChooseItem(folder) { this.onChoose(folder.isRoot() ? '' : folder.path); }
}

class ExamImportModal extends CiyuModal {
  constructor(plugin) {
    super(plugin.app);
    this.plugin = plugin;
  }

  onOpen() {
    super.onOpen();
    this.heading('导入六级题库文字版');
    const form = this.contentEl.createDiv({ cls: 'ciyu-entry-form ciyu-exam-import' });
    const field = (label, attributes) => {
      const container = form.createEl('label', { cls: 'ciyu-field' });
      container.createSpan({ text: label });
      return container.createEl('input', { attr: attributes });
    };
    const destination = field(`目标文件夹 · ${this.app.vault.getName()}`,
      { type: 'text', placeholder: '留空导入库根目录' });
    destination.value = typeof this.plugin.settings.examImportFolder === 'string'
      ? this.plugin.settings.examImportFolder : DEFAULT_SETTINGS.examImportFolder;
    const folderButton = action(form, '选择库内文件夹', () => {
      new ExamFolderPicker(this.app, path => { destination.value = path; }).open();
    });
    const officialArea = form.createDiv({ cls: 'ciyu-exam-import-section' });
    officialArea.createEl('p', { text: '官方笔试样卷含试题、听力文字稿和参考答案。文字识别在本机完成。' });
    const officialButton = action(officialArea, '下载并导入官方六级样卷', () => run([async progress => {
      const local = this.app.vault.getAbstractFileByPath(CET6_SAMPLE.path);
      let bytes;
      if (local instanceof TFile) {
        bytes = examBytes(await this.app.vault.readBinary(local));
      } else {
        progress('正在下载官方样卷…');
        ({ bytes } = await downloadExam(CET6_SAMPLE.url));
      }
      return { bytes, name: CET6_SAMPLE.basename, official: true };
    }]), { primary: true });
    const url = field('试卷文件直链', { type: 'url', placeholder: 'https://…/试卷.pdf' });
    const downloadButton = action(form, '下载并导入链接', () => run([progress => {
      progress('正在下载试卷…');
      return downloadExam(url.value);
    }]));
    const files = field('本地试卷（可多选）',
      { type: 'file', accept: '.pdf,.md,.txt', multiple: '' });
    const localButton = action(form, '导入所选文件', () => run(Array.from(files.files, file => async () => {
      if (file.size > EXAM_FILE_LIMIT) throw new Error(`${file.name} 超过 32 MB。`);
      return { bytes: examBytes(await file.arrayBuffer()), name: file.name };
    })));
    const status = statusRegion(form);
    const controls = [destination, folderButton, officialButton, url, downloadButton, files, localButton];
    const run = async sources => {
      if (this.importing) return;
      this.importing = true;
      for (const control of controls) control.disabled = true;
      this.modalEl.setAttribute('aria-busy', 'true');
      const errors = [];
      const imported = [];
      try {
        const folder = examDestination(destination.value);
        if (!sources.length) throw new Error('请先选择试卷文件。');
        for (const [index, source] of sources.entries()) {
          const progress = message => status.setText(sources.length > 1
            ? `${index + 1} / ${sources.length} · ${message}` : message);
          try {
            progress('正在读取试卷…');
            const input = await source(progress);
            imported.push(await importExam(this.plugin, folder, input, progress));
          } catch (error) {
            errors.push(sources.length > 1 ? `第 ${index + 1} 个文件：${error.message}` : error.message);
          }
        }
        if (imported.length) {
          const last = imported[imported.length - 1];
          await this.plugin.commit(draft => {
            draft.settings.examImportFolder = folder;
            draft.settings.lastExamNote = last.path;
          }, ['exams', 'notes']);
          await this.plugin.openSource(last.path);
          new Notice(`已导入 ${imported.length} 份试卷文字版。`);
          if (!errors.length) this.close();
        }
        status.setText(errors.join(' '));
      } catch (error) {
        status.setText(error.message || '导入失败。');
      } finally {
        this.importing = false;
        this.modalEl.removeAttribute('aria-busy');
        for (const control of controls) control.disabled = false;
      }
    };
  }
}
