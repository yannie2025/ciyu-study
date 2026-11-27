const assert = require('node:assert/strict');
const http = require('node:http');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { test } = require('node:test');

class TFile {
  constructor(path) {
    this.path = path;
    this.name = path.split('/').pop();
    this.basename = this.name.replace(/\.md$/, '');
    this.extension = 'md';
  }
}
class TFolder {
  constructor(path) {
    this.path = path;
    this.children = [];
  }
}

function loadPlugin(nativeOpen, platform = process.platform, options = {}) {
  const file = path.join(__dirname, '../dist/ciyu-study/main.js');
  const source = readFileSync(file, 'utf8');
  const obsidian = {
    Plugin: class {}, ItemView: class {}, Modal: class {}, PluginSettingTab: class {},
    FuzzySuggestModal: class {}, Notice: class {}, TFile, TFolder,
    normalizePath: path => path, ...options,
  };
  const localRequire = createRequire(file);
  const requireMock = name => {
    if (name === 'obsidian') return obsidian;
    if (name === 'child_process' && nativeOpen) return { execFile: nativeOpen };
    return localRequire(name);
  };
  const module = { exports: {} };
  return new Function('require', 'module', 'process', source + `
    return { Plugin: module.exports, entryFields, localDay, scheduleReview, clozeSentence,
      markdownEntry, mergeMarkdownWordEntry, parseVocabImportText, extractMarkdownVocabEntries, speechAudioCandidates, ankiTsv, initialData, modelInventory, pullModel, translateWithModel, LookupSession, ModelSettings, localPort, archiveEntries, displayWord, Dictionaries, discoverLocalModels, nativeQuery, examDestination, importExam, downloadExam, examMarkdown, Cet6StudyController, parseTranscriptMarkdownIntoSegments };
  `)(requireMock, module, { platform });
}

const runtime = loadPlugin();
const word = runtime.entryFields({
  term: 'curiosity', translation: '好奇心', partOfSpeech: '名词',
  derivatives: ['curious — 好奇的'], phrases: ['out of curiosity'], roots: ['curios-'],
  context: 'Her curiosity led to a discovery.',
  examples: ['Curiosity led her to ask. — 好奇心促使她提问。'],
});

async function memoryVault() {
  let saved;
  let failWrite = false;
  let opened;
  const files = new Map();
  const contents = new Map();
  const leaves = [];
  const app = {
    workspace: {
      getLeavesOfType: type => type === 'markdown' ? leaves : [],
      getLeaf: () => ({ openFile: async file => { opened = file; } }),
    },
    vault: {
      getAbstractFileByPath: path => files.get(path),
      createFolder: async path => {
        if (files.has(path)) throw new Error('already exists');
        files.set(path, new TFolder(path));
      },
      create: async (path, value) => {
        if (files.has(path)) throw new Error('already exists');
        const file = new TFile(path);
        files.set(path, file);
        contents.set(path, value);
        files.get(path.split('/').slice(0, -1).join('/'))?.children.push(file);
        return file;
      },
      process: async (file, callback) => {
        const value = callback(contents.get(file.path));
        contents.set(file.path, value);
      },
      read: async file => contents.get(file.path),
      rename: async (file, to) => {
        if (files.has(to)) throw new Error('already exists');
        const from = file.path;
        const body = contents.get(from);
        const parent = path => files.get(path.split('/').slice(0, -1).join('/'));
        parent(from)?.children.splice(parent(from).children.indexOf(file), 1);
        Object.assign(file, new TFile(to));
        parent(to)?.children.push(file);
        files.delete(from);
        contents.delete(from);
        files.set(to, file);
        contents.set(to, body);
      },
      delete: async file => {
        const parent = files.get(file.path.split('/').slice(0, -1).join('/'));
        parent?.children.splice(parent.children.indexOf(file), 1);
        files.delete(file.path);
        contents.delete(file.path);
      },
      adapter: { read: async path => readFileSync(path, 'utf8'), write: async (path, value) => { contents.set(path, value); } },
    },
    fileManager: { generateMarkdownLink: file => `[[${file.basename}]]` },
  };
  function instance() {
    const plugin = new runtime.Plugin();
    plugin.app = app;
    plugin.manifest = { dir: path.join(__dirname, '../dist/ciyu-study') };
    plugin.data = runtime.initialData(saved);
    plugin.pending = Promise.resolve();
    plugin.lifecycle = new AbortController();
    plugin.saveData = async data => {
      if (failWrite) {
        failWrite = false;
        throw new Error('磁盘保存失败');
      }
      saved = structuredClone(data);
    };
    return plugin;
  }
  return { app, instance, contents, leaves, opened: () => opened, failNextWrite: () => { failWrite = true; } };
}

test('two search saves racing for the same card preserve one card and persisted review history', async () => {
  const store = await memoryVault();
  const plugin = store.instance();
  const adds = await Promise.allSettled([plugin.addCard(word, '阅读.md'), plugin.addCard(word, '')]);
  assert.deepEqual(adds.map(item => item.status), ['fulfilled', 'rejected']);
  await plugin.addCard({ ...word, translation: '新奇事物' }, '');
  assert.equal(plugin.dueCards().length, 2);
  const original = plugin.cards[0];
  await plugin.editCard(original.id, { ...word, derivatives: ['curious'] });
  await plugin.rateCard(original.id, original.due, 'good');
  await assert.rejects(plugin.rateCard(original.id, original.due, 'good'), /状态已变化/);
  const restarted = store.instance();
  assert.equal(restarted.cards[0].reviews[0].grade, 'good');
  assert.equal(restarted.cards[0].source, '阅读.md');
  assert.equal(restarted.dueCards().length, 1);
  await restarted.removeCard(original.id);
  assert.equal(store.instance().cards.length, 1);
});

test('failed persistence leaves in-memory cards unchanged and permits retry', async () => {
  const store = await memoryVault();
  const plugin = store.instance();
  store.failNextWrite();
  await assert.rejects(plugin.addCard(word, ''), /磁盘/);
  assert.equal(plugin.cards.length, 0);
  await plugin.addCard(word, '');
  assert.equal(plugin.cards.length, 1);
});

test('archive first writes race safely, retains markdown edits and is independent of cards', async () => {
  const store = await memoryVault();
  const plugin = store.instance();
  await store.app.vault.create('阅读.md', '# Reading\n');
  const [archivePath, samePath] = await Promise.all([
    plugin.archive(word, '阅读.md'),
    plugin.archive({ ...word, term: 'question', translation: '问题' }, '阅读.md'),
  ]);
  assert.equal(archivePath, samePath);
  assert.equal(archivePath, `词屿/每日词汇/${runtime.localDay()}.md`);
  const archive = store.app.vault.getAbstractFileByPath(archivePath);
  await store.app.vault.process(archive, text => text + '\n我的手工笔记\n');
  await plugin.addCard(word, '阅读.md');
  await plugin.removeCard(plugin.cards[0].id);
  const markdown = store.contents.get(archivePath);
  assert.match(markdown, /## curiosity/);
  assert.match(markdown, /## question/);
  assert.match(markdown, /\[\[阅读\]\]/);
  assert.match(markdown, /我的手工笔记/);
  assert.equal(plugin.archiveFiles()[0], archive);
  await plugin.openSource('阅读.md');
  assert.equal(store.opened().path, '阅读.md');
});

test('insertion keeps selection text and rejects a modified editor snapshot', async () => {
  const store = await memoryVault();
  const plugin = store.instance();
  const file = await store.app.vault.create('阅读.md', 'curiosity');
  let value = 'curiosity';
  let transactionCount = 0;
  const editor = {
    getCursor: () => ({ line: 0, ch: 9 }),
    getValue: () => value,
    replaceRange: (text, position) => {
      value = value.slice(0, position.ch) + text + value.slice(position.ch);
      transactionCount++;
    },
    posToOffset: ({ ch }) => ch,
    offsetToPos: ch => ({ line: 0, ch }),
  };
  const view = { file, editor, getMode: () => 'source' };
  store.leaves.push({ view });
  const target = plugin.targetFor(view);
  await plugin.insert(word, target);
  assert.match(value, /^curiosity\n\n### curiosity/);
  assert.equal(transactionCount, 1);
  value += '手工编辑';
  await assert.rejects(plugin.insert(word, target), /笔记内容已变化/);
  assert.equal(transactionCount, 1);
  store.leaves.length = 0;
  await plugin.insert(word, { file });
  assert.match(store.contents.get('阅读.md'), /^curiosity\n\n### curiosity/);
});

test('review intervals use local dates and cloze matches whole words and punctuation', () => {
  const now = new Date(2026, 10, 27, 23, 58).getTime();
  const good = runtime.scheduleReview({ ...word }, 'good', now);
  assert.equal(good.due, new Date(2026, 10, 28).getTime());
  assert.equal(runtime.scheduleReview(good, 'good', good.due).due, new Date(2026, 10, 30).getTime());
  assert.equal(runtime.scheduleReview(good, 'again', now).due, now + 600_000);
  const mask = card => runtime.clozeSentence(card)?.masked || '';
  assert.equal(mask(word), 'Her _____ led to a discovery.');
  assert.equal(mask({ term: 'cat', examples: ['The cat sat near a catalog.'] }), 'The _____ sat near a catalog.');
  assert.equal(mask({ term: 'C++', context: 'I use C++ daily.' }), 'I use _____ daily.');
  assert.equal(mask({ term: 'other', context: 'another' }), '');
});

test('Anki export uses UTF-8 TSV, escapes HTML, and keeps a copy under the vault', async () => {
  const store = await memoryVault();
  const plugin = store.instance();
  await plugin.addCard({ ...word, term: '<term>', translation: '测试\n第二行 "abc"' }, '');
  const path = await plugin.exportAnki();
  const tsv = store.contents.get(path);
  assert.match(path, /^词屿\/导出\/.+\.tsv$/);
  assert.match(tsv, /^#separator:tab\n#html:true\n#columns:Front\tBack\n/);
  assert.match(tsv, /"&lt;term&gt;"\t"测试<br>第二行 &quot;abc&quot;/);
  assert.match(runtime.markdownEntry({ ...word, term: "<a>don't", translation: '[[wiki]]' }), /&lt;a&gt;don't/);
});

test('Ollama protocol handles model list, streamed pull, valid/malformed JSON and disconnected service', async (t) => {
  let malformed = false;
  let delayReply = false;
  const server = http.createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const payload = body ? JSON.parse(body) : {};
    if (request.url === '/api/tags') return response.end(JSON.stringify({ models: [{ name: 'fixture:1' }] }));
    if (request.url === '/api/pull') {
      assert.equal(payload.model, 'fixture:1');
      response.write('{"status":"pulling","total":100,');
      response.write('"completed":55}\n{"status":"verifying"}\n');
      return response.end('{"status":"success"}');
    }
    assert.equal(request.url, '/api/chat');
    assert.equal(payload.model, 'fixture:1');
    assert.equal(payload.format.properties.derivatives.type, 'array');
    assert.deepEqual(JSON.parse(payload.messages[1].content), { term: word.term, context: word.context });
    if (delayReply) return;
    response.end(JSON.stringify({ message: { content: malformed ? 'invalid JSON' : JSON.stringify(word) } }));
  });
  await new Promise((resolve, reject) => server.on('error', reject).listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const settings = { port: server.address().port, model: 'fixture:1' };
  assert.deepEqual(await runtime.modelInventory(settings), [{ id: 'fixture:1', size: 0 }]);
  const statuses = [];
  await runtime.pullModel(settings, update => statuses.push(update.status));
  assert.deepEqual(statuses, ['pulling', 'verifying', 'success']);
  assert.deepEqual(await runtime.translateWithModel(settings, word.term, word.context, undefined, true), word);
  malformed = true;
  await assert.rejects(runtime.translateWithModel(settings, word.term, word.context, undefined, true), /未返回可读取/);
  delayReply = true;
  const controller = new AbortController();
  const request = runtime.translateWithModel(settings, word.term, word.context, controller.signal, true);
  controller.abort();
  await assert.rejects(request, error => error.name === 'AbortError');
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await assert.rejects(runtime.modelInventory(settings), /无法连接本地 Ollama/);
});

test('sidebar search and prefilled selection feed real insertion, archive, and vocabulary actions', async (t) => {
  const inputs = [];
  const server = http.createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const { messages } = JSON.parse(body);
    inputs.push(JSON.parse(messages[1].content));
    response.end(JSON.stringify({ message: { content: JSON.stringify(word) } }));
  });
  await new Promise((resolve, reject) => server.on('error', reject).listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const store = await memoryVault();
  const plugin = store.instance();
  plugin.settings.port = server.address().port;
  const file = await store.app.vault.create('阅读.md', '# 原文\n\nHer curiosity.');
  const view = { file, getMode: () => 'preview' };
  plugin.noteView = () => view;

  const search = new runtime.LookupSession(plugin);
  await search.search('curiosity', false, true);
  assert.equal(search.props().status, 'success');
  await search.callbacks().onInsertToNote(search.props().result);
  await search.callbacks().onSaveToToday(search.props().result);
  assert.equal(search.props().result.savedToday, true);
  assert.match(store.contents.get(file.path), /^# 原文\n\nHer curiosity\.\n\n### curiosity/);
  assert.equal(plugin.archiveFiles().length, 1);
  assert.deepEqual(inputs[0], { term: 'curiosity', context: '' });

  const selection = new runtime.LookupSession(plugin, {
    term: word.term, context: word.context, view,
  });
  await selection.search(word.term, false, true);
  await selection.callbacks().onAddToVocabulary(selection.props().result);
  assert.equal(plugin.cards[0].source, file.path);
  assert.equal(plugin.cards[0].context, word.context);
  assert.deepEqual(inputs[1], { term: word.term, context: word.context });
  assert.equal(selection.props().result.inVocabulary, true);
  plugin.settings.useContext = false;
  await selection.search(word.term, false, true);
  assert.equal(inputs[2].context, '');
});

test('archive previews display existing Markdown and ignore code blocks', () => {
  const input = '# 日期\n\n' + runtime.markdownEntry({ ...word, term: 'one [two]', translation: '好 & 学' }, '', 2)
    + '\n~~~md\n## fenced\n\nDo not count\n~~~\n\n## manually added\n\n释义。';
  const result = runtime.archiveEntries(input, '2026-11-27.md');
  assert.deepEqual(result.map(({ term, meaningZh }) => [term, meaningZh]),
    [['one [two]', '好 & 学'], ['manually added', '释义。']]);
  assert.deepEqual(result[0].details.derivatives, word.derivatives);
  assert.equal(result[0].details.context, word.context);
});

test('old cards display their details without a data migration', () => {
  const { note, ...oldCard } = word;
  const data = runtime.initialData({ version: 1, cards: [oldCard],
    settings: { reduceTransparency: true } });
  const card = runtime.displayWord(data.cards[0], 'stable', 'old.md', {});
  assert.deepEqual(card.derivatives[0], { word: 'curious', meaningZh: '好奇的', partOfSpeech: '' });
  assert.equal(card.examples[0].zh, '好奇心促使她提问。');
  assert.equal(card.sourceNotePath, 'old.md');
  assert.equal(data.settings.reduceTransparency, true);
});

test('settings keep model traffic loopback and persist user appearance preferences', async () => {
  assert.equal(runtime.localPort('http://localhost:9876/'), 9876);
  assert.throws(() => runtime.localPort('https://127.0.0.1:9876'));
  assert.throws(() => runtime.localPort('http://127.0.0.1.example.com:9876'));
  const store = await memoryVault();
  const plugin = store.instance();
  const model = new runtime.ModelSettings(plugin);
  await model.setTransparency(true);
  await model.setGlass(true);
  await model.save('edgeRefraction', false);
  assert.equal(store.instance().settings.reduceTransparency, false);
  assert.equal(store.instance().settings.edgeRefraction, false);
});

test('offline word packs use actual ECDICT data, can be enabled and removed, and bypass model HTTP', async () => {
  const { instance } = await memoryVault();
  const plugin = instance();
  plugin.noteView = () => null;
  plugin.settings.port = 1;
  plugin.dictionaries = new runtime.Dictionaries(plugin);
  await plugin.dictionaries.change('cet4', 'primary');
  await plugin.dictionaries.change('cet6', 'add');
  const search = new runtime.LookupSession(plugin);
  await search.search('Curiosity!');
  assert.equal(search.props().status, 'success');
  assert.match(search.props().result.senses[0].meaningZh, /好奇/);
  assert.match(search.props().result.lookupProvider, /四级/);
  await plugin.dictionaries.change('cet4', 'remove');
  assert.deepEqual(plugin.settings.dictionaryPacks, ['common', 'cet6']);
  assert.equal(Object.keys(await plugin.dictionaries.load('cet4')).length, 3846);
  assert.equal(Object.keys(await plugin.dictionaries.load('cet6')).length, 5406);
});

test('note insertion and soft deletion can be undone without erasing unrelated edits', async () => {
  const store = await memoryVault();
  const plugin = store.instance();
  await plugin.createStudyNote('示例笔记');
  const file = plugin.studyFiles()[0];
  await plugin.insert(word, { file });
  assert.match(store.contents.get(file.path), /curiosity/);
  await plugin.undoNote();
  assert.equal(store.contents.get(file.path), '');
  await store.app.vault.process(file, () => '用户编辑');
  await assert.rejects(plugin.undoNote(), /之后又被编辑/);
  await plugin.removeStudyNote(file);
  assert.match(file.path, /^词屿\/回收站\//);
  await plugin.undoNote();
  assert.equal(file.path, '词屿/笔记/示例笔记.md');
  assert.equal(store.contents.get(file.path), '用户编辑');
});

test('local discovery and model deletion use the real HTTP protocol without deleting other models', async t => {
  let rejectDelete = true;
  let names = ['qwen2.5:1.5b', 'gemma3:1b'];
  const server = http.createServer(async (request, response) => {
    if (request.url === '/api/tags') {
      return response.end(JSON.stringify({ models: names.map(name => ({ name })) }));
    }
    if (request.url === '/api/delete') {
      assert.equal(request.method, 'DELETE');
      let body = '';
      for await (const chunk of request) body += chunk;
      assert.deepEqual(JSON.parse(body), { model: 'qwen2.5:1.5b' });
      if (rejectDelete) {
        response.statusCode = 500;
        return response.end(JSON.stringify({ error: '测试失败' }));
      }
      names = names.filter(name => name !== 'qwen2.5:1.5b');
      response.statusCode = 204;
      return response.end();
    }
    response.statusCode = 404;
    response.end();
  });
  await new Promise((resolve, reject) => server.on('error', reject).listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const port = server.address().port;
  const { instance } = await memoryVault();
  const plugin = instance();
  plugin.settings.port = port;
  const model = new runtime.ModelSettings(plugin);
  await model.check();
  assert.equal(model.props().models.filter(item => item.installed).length, 2);
  await assert.rejects(model.deleteModel('qwen2.5:1.5b', port), /测试失败/);
  assert.equal(plugin.settings.model, 'qwen2.5:1.5b');
  rejectDelete = false;
  await model.deleteModel('qwen2.5:1.5b', port);
  assert.equal(plugin.settings.model, 'gemma3:1b');
  assert.deepEqual(model.props().models.filter(item => item.installed).map(item => item.id), names);
  const discovered = await runtime.discoverLocalModels(plugin.settings);
  assert.ok(discovered.some(item => item.port === port && item.model === 'gemma3:1b'));
});

test('OpenAI-compatible local model uses its own port and compact translation payload', async t => {
  const server = http.createServer(async (request, response) => {
    assert.equal(request.url, '/v1/chat/completions');
    let body = '';
    for await (const chunk of request) body += chunk;
    const fields = JSON.parse(body);
    assert.equal(fields.model, 'locally-loaded');
    assert.ok(fields.max_tokens <= 180);
    assert.deepEqual(fields.response_format.json_schema.schema.required, ['translation', 'pronunciation', 'partOfSpeech']);
    response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ translation: '好奇心' }) } }] }));
  });
  await new Promise((resolve, reject) => server.on('error', reject).listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const route = { provider: 'openai', port: server.address().port, model: 'locally-loaded' };
  const found = await runtime.translateWithModel({ port: 1, model: 'other', inference: route }, 'curiosity', '');
  assert.equal(found.translation, '好奇心');
});


test('native dictionary actions transfer the term to app schemes and use stdin for the Youdao service', async () => {
  const calls = [];
  const stdin = [];
  const mac = loadPlugin((binary, args, options, done) => {
    calls.push({ binary, args });
    queueMicrotask(done);
    return { stdin: { end(value) { stdin.push(value); }, on() {} } };
  }, 'darwin');
  const plugin = { manifest: { dir: '.obsidian/plugins/ciyu-study' }, app: { vault: {
    adapter: { getFullPath: path => '/vault/' + path },
  } } };
  await mac.nativeQuery('term & other', 'easydict', plugin);
  assert.deepEqual(calls[0], { binary: '/usr/bin/open', args: ['easydict://query?text=term%20%26%20other'] });
  await mac.nativeQuery('curiosity', 'apple', plugin);
  assert.deepEqual(calls[1].args, ['-b', 'com.apple.Dictionary', 'dict://curiosity']);
  await mac.nativeQuery('term & other', 'youdao', plugin);
  assert.deepEqual(calls[2], { binary: '/vault/.obsidian/plugins/ciyu-study/native/youdao-service', args: [] });
  assert.deepEqual(stdin, ['term & other']);
  assert.throws(() => mac.nativeQuery('', 'easydict', plugin), /请先输入/);
});

test('offline misses return immediately and keep native lookup and AI explicit', async () => {
  const { instance } = await memoryVault();
  const plugin = instance();
  plugin.noteView = () => null;
  plugin.settings.port = 1;
  plugin.dictionaries = new runtime.Dictionaries(plugin);
  const search = new runtime.LookupSession(plugin);
  await search.search('zzzzunrecordedwordzzzz');
  assert.equal(search.props().status, 'miss');
  assert.equal(search.props().errorDetail, undefined);
  assert.equal(Object.keys(await plugin.dictionaries.load('common')).length, 27466);
});

test('whole sentences translate automatically with a translation-only response, while single misses stay offline', async t => {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    assert.equal(request.url, '/api/chat');
    let body = '';
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    assert.deepEqual(payload.format.required, ['translation']);
    const input = JSON.parse(payload.messages[1].content);
    requests.push(input);
    response.end(JSON.stringify({ message: { content: JSON.stringify({ translation: '她发现了一条新路。' }) } }));
  });
  await new Promise((resolve, reject) => server.on('error', reject).listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const { instance } = await memoryVault();
  const plugin = instance();
  plugin.noteView = () => null;
  plugin.settings.port = server.address().port;
  plugin.dictionaries = new runtime.Dictionaries(plugin);
  const session = new runtime.LookupSession(plugin);
  await session.search('zzzzunknownzzzz');
  assert.equal(session.props().status, 'miss');
  assert.equal(requests.length, 0);
  await session.search('She found a new route.');
  assert.equal(session.props().status, 'success');
  assert.equal(session.props().result.kind, 'sentence');
  assert.equal(session.props().result.senses[0].meaningZh, '她发现了一条新路。');
  assert.deepEqual(requests[0], { term: 'She found a new route.', context: '' });
  const source = new runtime.LookupSession(plugin, {
    term: 'Stop now!', context: 'The sign reads: Stop now!',
  });
  await source.search('Stop now!');
  assert.equal(source.props().result.kind, 'sentence');
  assert.deepEqual(requests[1], { term: 'Stop now!', context: 'The sign reads: Stop now!' });
  await session.callbacks().onTranslateSentence('Go now');
  assert.equal(session.props().result.kind, 'sentence');
});

test('exam imports preserve Markdown and never overwrite an existing note', async () => {
  const { instance, contents } = await memoryVault();
  const plugin = instance();
  const folder = runtime.examDestination('学习/六级/');
  assert.equal(folder, '学习/六级');
  assert.equal(runtime.examDestination('/'), '');
  assert.throws(() => runtime.examDestination('../超出库'), /相对文件夹/);
  assert.throws(() => runtime.examDestination('.obsidian/plugins'), /相对文件夹/);
  const run = text => runtime.importExam(plugin, folder,
    { bytes: new TextEncoder().encode(text), name: '真题.md' }, () => {});
  const first = await run('# 真题\n\nRead this passage.');
  assert.equal(first.path, '学习/六级/真题.md');
  assert.equal(await run('# 真题\n\nRead this passage.'), first);
  const next = await run('# 另一套试卷');
  assert.equal(next.path, '学习/六级/真题 (2).md');
  assert.equal(contents.get(first.path), '# 真题\n\nRead this passage.');
});

test('exam file links reject webpages and PDF imports identify textless pages', async () => {
  let requested;
  let destroyed = false;
  const bytes = new TextEncoder().encode('%PDF-1.4');
  const feature = loadPlugin(undefined, process.platform, {
    requestUrl: async ({ url }) => {
      requested = url;
      const html = url.endsWith('.html');
      return {
        status: 200,
        headers: { 'content-type': html ? 'text/html; charset=utf-8' : 'application/pdf' },
        arrayBuffer: bytes.buffer,
      };
    },
    loadPdfJs: async () => ({ getDocument: () => ({
      promise: Promise.resolve({
        numPages: 2,
        getPage: async number => ({
          getTextContent: async () => ({
            items: number === 1 ? [{ str: '1. Read this first.', hasEOL: true }, { str: 'A) Yes.' }] : [],
          }),
          cleanup: () => {},
        }),
      }),
      destroy: async () => { destroyed = true; },
    }) }),
  });
  const { instance, contents } = await memoryVault();
  const input = await feature.downloadExam('https://example.com/%E5%85%AD%E7%BA%A7.pdf');
  const note = await feature.importExam(instance(), '', input, () => {});
  assert.equal(requested, 'https://example.com/%E5%85%AD%E7%BA%A7.pdf');
  assert.equal(note.path, '六级.md');
  assert.match(contents.get(note.path), /以下页面未提取到文字：2/);
  assert.ok(contents.get(note.path).includes('1\\. Read this first.  \nA) Yes.'));
  assert.ok(destroyed);
  await assert.rejects(feature.downloadExam('https://example.com/index.html'), /返回了网页/);
  await assert.rejects(feature.downloadExam('file:///tmp/secret'), /https/);
  assert.throws(() => feature.examMarkdown([''], '空白页', false), /未提取到文字/);
});

test('CET-6 batch delete supports safe trash with undo, permanent delete guard, mistake sync, and listening self-check', async () => {
  const store = await memoryVault();
  const plugin = store.instance();
  plugin.cet6Controller = new runtime.Cet6StudyController(plugin);
  const ctrl = plugin.cet6Controller;

  await plugin.ensureFolder('词屿/六级题库/历年真题');
  const p1 = '词屿/六级题库/历年真题/2026 年 6 月六级真题 · 第 1 套.md';
  const p2 = '词屿/六级题库/历年真题/2026 年 6 月六级真题 · 第 2 套.md';
  await store.app.vault.create(p1, '# 2026 年 6 月六级真题 · 第 1 套\n[在线自测](<https://eol.nju.edu.cn/cet6/papers/202606-1.html>)\n');
  await store.app.vault.create(p2, '# 2026 年 6 月六级真题 · 第 2 套\n[在线自测](<https://eol.nju.edu.cn/cet6/papers/202606-2.html>)\n');
  await ctrl.syncVaultFiles();
  assert.equal(ctrl.savedFiles.size, 2);

  // Add a listening self-check mistake with stable block IDs
  await ctrl.addMistakeEntry({
    paperId: '202606-1',
    questionNumber: 3,
    blockId: 'cet6-202606-1-q3',
    questionType: 'listening',
    stemPreview: 'What does the woman suggest?',
    myAnswer: 'B',
    correctAnswer: 'C',
  });
  assert.equal(ctrl.mistakes().length, 1);
  assert.match(ctrl.mistakes()[0].backToQuestionWikiLink, /#\^cet6-202606-1-q3\|回到原题\]\]$/);
  assert.match(store.contents.get('词屿/错题本/六级错题索引.md'), /\^mistake-202606-1-q3/);

  // 1. Safe batch delete to Ciyu Trash + undo restoration
  await ctrl.executeBatchDelete(['202606-1'], {
    mode: 'trash',
    updateIndexNote: true,
    deleteAssociatedMedia: false,
    deleteAssociatedMistakes: false,
    acknowledgePermanent: false,
  });
  assert.equal(ctrl.savedFiles.size, 1);
  assert.equal(ctrl.mistakes().length, 1); // preserved because deleteAssociatedMistakes=false
  await ctrl.undoLastBatchDelete();
  assert.equal(ctrl.savedFiles.size, 2);

  // 2. Permanent delete requires acknowledgment checkbox, then removes file and associated mistakes when requested
  await assert.rejects(
    ctrl.executeBatchDelete(['202606-1', '202606-2'], {
      mode: 'permanent',
      updateIndexNote: true,
      deleteAssociatedMedia: true,
      deleteAssociatedMistakes: true,
      acknowledgePermanent: false,
    }),
    /确认选项/
  );
  await ctrl.executeBatchDelete(['202606-1', '202606-2'], {
    mode: 'permanent',
    updateIndexNote: true,
    deleteAssociatedMedia: true,
    deleteAssociatedMistakes: true,
    acknowledgePermanent: true,
  });
  assert.equal(ctrl.savedFiles.size, 0);
  assert.equal(ctrl.mistakes().length, 0);

  // 3. Transcript timestamp & speaker parser for in-plugin listening self-check
  const parsed = runtime.parseTranscriptMarkdownIntoSegments(
    '[00:12] W: Welcome to the campus library.\n欢迎来到校园图书馆。\n\n[00:24] M: Could I renew these journals?\n我可以续借这些期刊吗？',
    '202606-1',
    [1, 2]
  );
  assert.equal(parsed.timestampLevel, 'paragraph');
  assert.equal(parsed.segments.length, 2);
  assert.equal(parsed.segments[0].startSec, 12);
  assert.equal(parsed.segments[0].translationZh, '欢迎来到校园图书馆。');
});

test('repeated insertion of the same word deduplicates and groups new meanings/contexts into the existing block (including after pinning to sidebar)', async () => {
  const store = await memoryVault();
  const plugin = store.instance();
  const file = await store.app.vault.create('真题精读.md', '# 阅读笔记\n\nHer curiosity led to a discovery.');

  // Simulate multi-line CodeMirror editor supporting (text, from, to)
  let value = store.contents.get(file.path);
  const posToOffset = ({ line, ch }) => {
    const lines = value.split('\n');
    let off = 0;
    for (let i = 0; i < line; i++) off += lines[i].length + 1;
    return off + ch;
  };
  const offsetToPos = offset => {
    const head = value.slice(0, offset).split('\n');
    return { line: head.length - 1, ch: head[head.length - 1].length };
  };
  const editor = {
    getCursor: () => offsetToPos(value.length),
    getValue: () => value,
    lastLine: () => value.split('\n').length - 1,
    getLine: n => value.split('\n')[n] || '',
    posToOffset,
    offsetToPos,
    replaceRange: (text, from, to = from) => {
      const start = posToOffset(from);
      const end = posToOffset(to);
      value = value.slice(0, start) + text + value.slice(end);
    },
  };
  const view = { file, editor, getMode: () => 'source' };
  store.leaves.push({ view });

  const target = plugin.targetFor(view);
  target.pinned = true; // Simulate pinned to right sidebar

  // 1st insert -> creates ### curiosity
  assert.equal(await plugin.insert(word, target), 'inserted');
  assert.equal((value.match(/^### curiosity$/gmu) || []).length, 1);

  // 2nd identical insert -> unchanged, zero duplication
  assert.equal(await plugin.insert(word, target), 'unchanged');
  assert.equal((value.match(/^### curiosity$/gmu) || []).length, 1);

  // User edits another part of the note while card is pinned in right sidebar, then inserts enriched/new-context entry for same word (case-insensitive)
  value = '# 阅读笔记（已批注）\n\n' + value.slice('# 阅读笔记\n\n'.length);
  const enriched = runtime.entryFields({
    ...word,
    term: 'Curiosity',
    translation: '新奇事物',
    phrases: ['out of curiosity', 'arouse curiosity — 激起好奇心'],
    context: 'Idle curiosity is not enough.',
  });
  assert.equal(await plugin.insert(enriched, target), 'merged');
  assert.equal((value.match(/^### [Cc]uriosity$/gmu) || []).length, 1);
  assert.match(value, /好奇心；新奇事物/);
  assert.match(value, /\*\*常用搭配\*\*：out of curiosity；arouse curiosity — 激起好奇心/);
  assert.match(value, /\*\*来源句\*\*：Her curiosity led to a discovery\.；Idle curiosity is not enough\./);

  // Vault background / reading mode also merges into single heading instead of duplicating
  store.leaves.length = 0;
  await store.app.vault.process(file, () => value);
  assert.equal(await plugin.insert(enriched, { file }), 'unchanged');
  const withNote = runtime.entryFields({ ...enriched, note: '常考名词辨析' });
  assert.equal(await plugin.insert(withNote, { file }), 'merged');
  const finalMd = store.contents.get(file.path);
  assert.equal((finalMd.match(/^### [Cc]uriosity$/gmu) || []).length, 1);
  assert.match(finalMd, /\*\*个人备注\*\*：常考名词辨析/);
});

test('vocabulary fast import covers plain word lists with offline dictionary auto-fill, CSV/Anki TSV, Markdown extraction, and 1-click selection add', async () => {
  const store = await memoryVault();
  const plugin = store.instance();
  plugin.dictionaries = new runtime.Dictionaries(plugin);

  // 1. Plain word list + mixed bilingual lines -> parse + offline ECDICT auto-fill across all packs + batch commit
  const pasted = runtime.parseVocabImportText('1. curiosity\n2. sustainable, resilience\nalleviate — 缓解；减轻');
  assert.deepEqual(pasted.map(i => i.word), ['curiosity', 'sustainable', 'resilience', 'alleviate']);
  assert.equal(pasted[3].meaningZh, '缓解；减轻');

  const hydrated = [];
  for (const item of pasted) {
    const hit = !item.meaningZh ? await plugin.dictionaries.findAnyPack(item.word) : null;
    hydrated.push({
      entry: {
        term: item.word,
        pronunciation: item.phonetic || hit?.entry.pronunciation || '',
        partOfSpeech: item.partOfSpeech || hit?.entry.partOfSpeech || '',
        translation: item.meaningZh || hit?.entry.translation || '',
      },
      source: '批量词单',
    });
  }
  assert.ok(hydrated.every(h => h.entry.translation.length > 0));
  const batchRes = await plugin.addCardsBatch([...hydrated, hydrated[0]]);
  assert.deepEqual(batchRes, { added: 4, skipped: 1 });
  assert.equal(plugin.cards.length, 4);

  // 2. Anki TSV round-trip parsing & CSV header detection
  const exportedTsv = runtime.ankiTsv([plugin.cards[0]]);
  const fromAnki = runtime.parseVocabImportText(exportedTsv, 'anki.tsv');
  assert.equal(fromAnki.length, 1);
  assert.equal(fromAnki[0].word, 'curiosity');
  assert.ok(fromAnki[0].meaningZh.includes('好奇'));

  const fromCsv = runtime.parseVocabImportText('单词,中文释义,音标,例句\n"serendipity","意外发现珍宝的运气","/ˌserənˈdɪpəti/","Pure serendipity."', 'words.csv');
  assert.equal(fromCsv.length, 1);
  assert.equal(fromCsv[0].word, 'serendipity');
  assert.equal(fromCsv[0].meaningZh, '意外发现珍宝的运气');
  assert.equal(fromCsv[0].sourceSentence, 'Pure serendipity.');

  // 3. Extract vocabulary entries from vault Markdown notes while ignoring CET-6 paper headings
  const examMdWithVocab = [
    '# 2026 年 6 月六级真题 · 第 1 套',
    '## Part II · 听力',
    '### Section A · 长对话',
    'Some listening question.',
    '### unprecedented',
    '',
    '空前的；前所未有的',
    '',
    '- **音标**：/ʌnˈpresɪdentɪd/',
    '- **来源句**：An unprecedented breakthrough occurred.',
  ].join('\n');
  const extracted = runtime.extractMarkdownVocabEntries(examMdWithVocab, '词屿/六级题库/历年真题/test.md');
  assert.equal(extracted.length, 1);
  assert.equal(extracted[0].term, 'unprecedented');
  assert.equal(extracted[0].context, 'An unprecedented breakthrough occurred.');

  // 4. 1-click quickAddSelection adds word + context + source note directly to vocabulary
  const noteFile = await store.app.vault.create('阅读.md', 'She showed remarkable perseverance in research.');
  const quickRes = await plugin.quickAddSelection({
    term: 'perseverance',
    context: 'She showed remarkable perseverance in research.',
    view: { file: noteFile },
  });
  assert.equal(quickRes, 'added');
  const addedCard = plugin.cards.find(c => c.term === 'perseverance');
  assert.ok(addedCard);
  assert.equal(addedCard.source, '阅读.md');
  assert.equal(addedCard.context, 'She showed remarkable perseverance in research.');
  assert.equal(await plugin.quickAddSelection({ term: 'perseverance', view: { file: noteFile } }), 'duplicate');
});

test('selectionIn falls back to DOM selection in Live Preview and listening controller clips playback to active group range', async () => {
  const store = await memoryVault();
  const plugin = store.instance();

  // 1. Live Preview DOM fallback when CodeMirror editor selection is empty (e.g., inside Callout/table)
  const noteFile = await store.app.vault.create('真题笔记.md', '> [!check]- 原文\n> remarkable resilience');
  const fakeAnchor = {
    nodeType: 3,
    parentElement: {
      closest: () => ({ textContent: 'remarkable resilience in action' }),
    },
  };
  const fakeView = {
    file: noteFile,
    getMode: () => 'source',
    editor: { getSelection: () => '' },
    containerEl: {
      contains: node => node === fakeAnchor,
      ownerDocument: {
        getSelection: () => ({
          isCollapsed: false,
          anchorNode: fakeAnchor,
          focusNode: fakeAnchor,
          toString: () => 'resilience',
        }),
      },
    },
  };
  const sel = plugin.selectionIn(fakeView);
  assert.equal(sel?.term, 'resilience');
  assert.equal(sel?.context, 'remarkable resilience in action');

  // 2. Listening segment clipping clamps seek & switches cleanly between Section A groups and full track
  const ctrl = new runtime.Cet6StudyController(plugin);
  ctrl.activePaperId = '202606-1';
  ctrl.listeningSection = 'A';
  ctrl.listeningGroupId = '202606-1-grp-1';
  ctrl.audioPaperId = '202606-1';
  ctrl.audioDuration = 1264;
  ctrl.cacheDocument('202606-1', {
    paperId: '202606-1',
    title: '2026 年 6 月六级真题 · 第 1 套',
    audioUrl: 'https://eol.nju.edu.cn/cet6/papers/202606-1.mp3',
    listening: {
      directions: '',
      groups: [
        {
          id: '202606-1-grp-1',
          section: 'A',
          sectionLabel: 'Section A · 长对话',
          title: 'Questions 1-4',
          questionRange: '1–4 题',
          startSec: 33.6,
          endSec: 165.7,
          timeRangeLabel: '00:33–02:45',
          timestampLevel: 'paragraph',
          hasTimestamps: true,
          segments: [],
          questions: [],
        },
        {
          id: '202606-1-grp-2',
          section: 'A',
          sectionLabel: 'Section A · 长对话',
          title: 'Questions 5-8',
          questionRange: '5–8 题',
          startSec: 165.7,
          endSec: 356.4,
          timeRangeLabel: '02:45–05:56',
          timestampLevel: 'paragraph',
          hasTimestamps: true,
          segments: [],
          questions: [],
        },
      ],
    },
    bankedCloze: { questions: [] },
    matching: { questions: [] },
    carefulReading: { passages: [] },
  });

  assert.equal(ctrl.listeningProps().clipMode, 'group');
  ctrl.seekAudio(5);
  assert.equal(ctrl.audioCurrentTime, 33.6);
  ctrl.seekAudio(999);
  assert.equal(ctrl.audioCurrentTime, 165.7);

  // Switching to Group 2 repositions playhead to Group 2 startSec
  ctrl.listeningCallbacks().onSelectGroup('202606-1-grp-2');
  assert.equal(ctrl.listeningGroupId, '202606-1-grp-2');
  assert.equal(ctrl.audioCurrentTime, 165.7);

  // Switching to full track removes group clamp
  ctrl.listeningCallbacks().onToggleClipMode('full');
  assert.equal(ctrl.listeningProps().clipMode, 'full');
  ctrl.seekAudio(10);
  assert.equal(ctrl.audioCurrentTime, 10);

  // 3. Interrupted play() AbortError (e.g., switching group while buffering) must NOT trigger audioError
  let rejectPlay;
  const mockAudio = {
    paused: true,
    readyState: 2,
    currentTime: 33.6,
    pause() { this.paused = true; },
    play() {
      this.paused = false;
      return new Promise((_, reject) => { rejectPlay = reject; });
    },
    addEventListener() {},
  };
  ctrl.audio = mockAudio;
  ctrl.listeningCallbacks().onToggleClipMode('group');
  ctrl.toggleAudioPlay();
  ctrl.listeningCallbacks().onSelectGroup('202606-1-grp-2');
  const abortErr = new Error('The play() request was interrupted by a call to pause(). https://goo.gl/LdLk22');
  abortErr.name = 'AbortError';
  rejectPlay(abortErr);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(ctrl.audioError, '');
  assert.equal(ctrl.listeningProps().audioState, 'ready');
});

test('human English pronunciation routes words to Youdao US/UK studio audio, sentences to natural TTS, and picks enhanced macOS voices offline', async () => {
  const usWord = runtime.speechAudioCandidates('resilience', 'us');
  assert.equal(usWord[0].provider, 'youdao');
  assert.match(usWord[0].url, /dict\.youdao\.com\/dictvoice\?audio=resilience&type=2/);
  assert.equal(usWord[1].provider, 'baidu');
  assert.match(usWord[1].url, /lan=en/);

  const ukPhrase = runtime.speechAudioCandidates('take advantage of', 'uk');
  assert.equal(ukPhrase[0].provider, 'youdao');
  assert.match(ukPhrase[0].url, /type=1/);
  assert.match(ukPhrase[1].url, /lan=uk/);

  const sentence = runtime.speechAudioCandidates('They have helped boost the local economy.', 'us');
  assert.equal(sentence.length, 1);
  assert.equal(sentence[0].provider, 'baidu');
  assert.match(sentence[0].url, /lan=en/);

  assert.deepEqual(runtime.speechAudioCandidates('你好世界', 'us'), []);

  const store = await memoryVault();
  const plugin = store.instance();
  plugin.macVoices = ['Samantha', 'Zoe (Premium)', 'Daniel', 'Jamie (Premium)', 'Tingting'];
  assert.equal(plugin.pickMacVoice('resilience', 'us'), 'Zoe (Premium)');
  assert.equal(plugin.pickMacVoice('resilience', 'uk'), 'Jamie (Premium)');
  assert.equal(plugin.pickMacVoice('你好', 'us'), 'Tingting');
});

test('daily archive isolates each word into a distinct block with roots/derivatives editing, duplicate detection across days, and block jump', async () => {
  const store = await memoryVault();
  const plugin = store.instance();
  let jumpedLink = '';
  store.app.workspace.openLinkText = async link => { jumpedLink = link; };

  // 1. Create an earlier day's archive note containing "resilience"
  await plugin.ensureFolder('词屿/每日词汇');
  const prevPath = '词屿/每日词汇/2026-11-20.md';
  await store.app.vault.create(
    prevPath,
    '# 2026-11-20 词汇\n\n---\n\n## resilience\n\n韧性；复原力\n\n- **词根词缀**：\n- **派生词**：\n\n^ciyu-resilience\n'
  );

  // 2. Duplicate check detects the word from an earlier day
  const foundPrev = await plugin.findArchivedWord('Resilience');
  assert.ok(foundPrev);
  assert.equal(foundPrev.date, '2026-11-20');
  assert.equal(foundPrev.notePath, prevPath);
  assert.equal(foundPrev.blockId, 'ciyu-resilience');
  assert.equal(foundPrev.isToday, false);

  // 3. Jump opens exact block anchor
  await plugin.openArchiveEntry(foundPrev.notePath, foundPrev.term, foundPrev.blockId, foundPrev.line);
  assert.equal(jumpedLink, '词屿/每日词汇/2026-11-20#^ciyu-resilience');

  // 4. Archive two new words today -> each word is its own separated block with ---, roots/derivatives slots, and ^ciyu-*
  const todayPath = await plugin.archive({ ...word, term: 'eloquent', translation: '雄辩的', roots: [], derivatives: [] }, '');
  await plugin.archive({ ...word, term: 'ubiquitous', translation: '无处不在的', roots: [], derivatives: [] }, '');
  const todayMd = store.contents.get(todayPath);
  assert.equal((todayMd.match(/^---$/gmu) || []).length, 2);
  assert.match(todayMd, /## eloquent[\s\S]*- \*\*派生词\*\*：[\s\S]*- \*\*词根词缀\*\*：[\s\S]*\^ciyu-eloquent/);
  assert.match(todayMd, /## ubiquitous[\s\S]*\^ciyu-ubiquitous/);

  // 5. User adds custom roots/affixes & derivatives to "eloquent" block -> writes back to archive md AND syncs vocab card
  await plugin.addCard({ ...word, term: 'eloquent', translation: '雄辩的', roots: [], derivatives: [] }, '');
  await plugin.updateArchiveWordMeta(todayPath, 'eloquent', {
    roots: ['e-（出）+ loqu-（说）+ -ent（形容词后缀）'],
    derivatives: ['eloquence — 雄辩', 'eloquently — 雄辩地'],
  });
  const updatedMd = store.contents.get(todayPath);
  assert.match(updatedMd, /- \*\*词根词缀\*\*：e-（出）\+ loqu-（说）\+ -ent（形容词后缀）/);
  assert.match(updatedMd, /- \*\*派生词\*\*：eloquence — 雄辩；eloquently — 雄辩地/);
  assert.match(updatedMd, /## ubiquitous[\s\S]*\^ciyu-ubiquitous/);
  const entries = runtime.archiveEntries(updatedMd, todayPath);
  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0].roots, ['e-（出）+ loqu-（说）+ -ent（形容词后缀）']);
  assert.deepEqual(entries[0].derivatives, ['eloquence — 雄辩', 'eloquently — 雄辩地']);
  assert.equal(entries[0].blockId, 'ciyu-eloquent');
  const syncedCard = plugin.cards.find(c => c.term === 'eloquent');
  assert.deepEqual(syncedCard.roots, ['e-（出）+ loqu-（说）+ -ent（形容词后缀）']);
  assert.deepEqual(syncedCard.derivatives, ['eloquence — 雄辩', 'eloquently — 雄辩地']);
});

test('parseTranscriptMarkdownIntoSegments maps explicit Section A/B/C group headings 1-to-1 and handles mixed-language Chinese translations', () => {
  const sampleMd = [
    '# 2026 年 6 月六级真题 · 第 1 套 · 听力原文',
    '',
    '## Section A · Questions 1-4',
    '',
    'M: Welcome to "Business Matters".',
    '欢迎来到《Business Matters》节目。',
    '',
    'W: One mistake people make is to limit communication only to their bosses.',
    '人们常犯的一个错误是只和上司沟通。',
    '',
    '## Section A · Questions 5-8',
    '',
    'W: Let us review the presentation slides.',
    '我们来核对一下演示文稿。',
    '',
    '## Section B · Questions 9-11',
    '',
    'Researchers found that clothing alters perceptions.',
    '研究人员发现着装会改变他人对佩戴者的看法。',
  ].join('\n');

  const parsed = runtime.parseTranscriptMarkdownIntoSegments(sampleMd, '202606-1');
  assert.ok(parsed.groupedSegments instanceof Map);
  assert.equal(parsed.groupedSegments.get(0).length, 2);
  assert.equal(parsed.groupedSegments.get(0)[0].speaker, '♂ 男士 (M)');
  assert.equal(parsed.groupedSegments.get(0)[0].translationZh, '欢迎来到《Business Matters》节目。');
  assert.equal(parsed.groupedSegments.get(1).length, 1);
  assert.equal(parsed.groupedSegments.get(2).length, 1);
});

test('word lookup automatically calls local model for roots/suffixes/derivatives modules and inserts only user-selected modules into notes and archive', async t => {
  const server = http.createServer(async (request, response) => {
    assert.equal(request.url, '/api/chat');
    let body = '';
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    assert.deepEqual(payload.format.required, ['roots', 'derivatives']);
    response.end(JSON.stringify({
      message: {
        content: JSON.stringify({
          roots: ['re-（回、再）', 'sil-（跳跃）', '-ience（名词后缀）'],
          derivatives: ['resilient — adj. 有韧性的', 'resiliently — adv. 有弹性地'],
        }),
      },
    }));
  });
  await new Promise((resolve, reject) => server.on('error', reject).listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });

  const store = await memoryVault();
  const plugin = store.instance();
  const noteFile = await store.app.vault.create('学习笔记.md', '# 词汇笔记\n');
  plugin.noteView = () => ({ file: noteFile, getMode: () => 'preview' });
  plugin.settings.port = server.address().port;
  plugin.dictionaries = new runtime.Dictionaries(plugin);

  const session = new runtime.LookupSession(plugin);
  await session.search('resilience');
  assert.equal(session.props().status, 'success');

  // Wait for background local model morpheme assist to finish
  for (let i = 0; i < 40 && session.props().result?.morphemeAssist?.status !== 'ready'; i++) {
    await new Promise(resolve => setTimeout(resolve, 15));
  }
  const assist = session.props().result.morphemeAssist;
  assert.equal(assist.status, 'ready');
  assert.equal(assist.items.length, 5);
  assert.ok(assist.items.every(i => i.selected === false));

  // User clicks to select 1 root/suffix and 1 derivative module
  const cb = session.callbacks();
  const displayed = session.props().result;
  cb.onToggleMorphemeModule(displayed.id, assist.items[0].id);
  cb.onToggleMorphemeModule(displayed.id, assist.items[3].id);

  const afterPick = session.props().result.morphemeAssist.items.filter(i => i.selected);
  assert.equal(afterPick.length, 2);

  // Add selected modules into target note
  await cb.onAddSelectedMorphemes(session.props().result, 'note');
  const noteMd = store.contents.get('学习笔记.md');
  assert.match(noteMd, /### resilience/);
  assert.match(noteMd, /re-（回、再）/);
  assert.match(noteMd, /resilient — adj\. 有韧性的/);
  assert.doesNotMatch(noteMd, /resiliently/);

  // Add selected modules into today's daily archive block
  await cb.onAddSelectedMorphemes(session.props().result, 'archive');
  const archiveMd = store.contents.get(`词屿/每日词汇/${runtime.localDay()}.md`);
  assert.match(archiveMd, /## resilience/);
  assert.match(archiveMd, /re-（回、再）/);
  assert.match(archiveMd, /resilient — adj\. 有韧性的/);
  assert.match(archiveMd, /\^ciyu-resilience/);
});

test('parseTranscriptMarkdownIntoSegments parses bold Man/Woman labels, blockquote translations, and per-group numbering', () => {
  const md = [
    '---',
    'paper_id: "202606-1"',
    '---',
    '',
    '# 2026 年 6 月六级真题 · 第 1 套 · 听力原文',
    '',
    '> [!info] 说明',
    '',
    '[[#Section A · 长对话 1 · Questions 1-4|长对话 1]] · [[#Section B · 短文 1 · Questions 9-11|短文 1]]',
    '',
    '## Section A · 长对话 1 · Questions 1-4',
    '',
    '**♂ 男士（M）：** Welcome to Business Matters.',
    '> 译文：欢迎收听《职场纵横》。',
    '',
    '**♀ 女士（W）：** Thank you for having me.',
    '> 译文：感谢邀请。',
    '',
    '**M:** Another turn.',
    '译文：又一句。',
    '',
    '女人：Plain Chinese tag.',
    '> 译文：中文女标签。',
    '',
    '---',
    '',
    '## Section B · 短文 1 · Questions 9-11',
    '',
    '**独白 · 第 1 段：** Makeup can alter perceptions.',
    '> 译文：化妆可以改变他人看法。',
    '',
    'Second paragraph without explicit prefix.',
    '> 译文：没有显式前缀的第二段。',
    '',
    '## Section C · 讲座 1 · Questions 16-18',
    '',
    '**讲座 · 第 1 段：** Good afternoon everyone.',
    '> 译文：各位下午好。',
  ].join('\n');

  const parsed = runtime.parseTranscriptMarkdownIntoSegments(md, '202606-1');
  assert.equal(parsed.segments.length, 7);
  assert.ok(parsed.groupedSegments);
  const g0 = parsed.groupedSegments.get(0);
  const g2 = parsed.groupedSegments.get(2);
  const g4 = parsed.groupedSegments.get(4);
  assert.equal(g0.length, 4);
  assert.equal(g0[0].speaker, '♂ 男士 (M)');
  assert.equal(g0[0].speakerRole, 'b');
  assert.equal(g0[0].textEn, 'Welcome to Business Matters.');
  assert.equal(g0[0].translationZh, '欢迎收听《职场纵横》。');
  assert.equal(g0[1].speaker, '♀ 女士 (W)');
  assert.equal(g0[1].speakerRole, 'a');
  assert.equal(g0[1].translationZh, '感谢邀请。');
  assert.equal(g0[2].speaker, '♂ 男士 (M)');
  assert.equal(g0[2].speakerRole, 'b');
  assert.equal(g0[3].speaker, '♀ 女士 (W)');
  assert.equal(g0[3].speakerRole, 'a');

  assert.equal(g2.length, 2);
  assert.equal(g2[0].speaker, '独白 · 第 1 段');
  assert.equal(g2[0].speakerRole, 'narrator');
  assert.equal(g2[1].speaker, '独白 · 第 2 段');
  assert.equal(g2[1].translationZh, '没有显式前缀的第二段。');

  assert.equal(g4.length, 1);
  assert.equal(g4[0].speaker, '讲座 · 第 1 段');
  assert.equal(g4[0].translationZh, '各位下午好。');
});

test('Cet6StudyController resolves transcripts under 词屿/六级题库/文字版/历年真题/听力原文 when cet6CatalogFolder starts with 词屿/六级题库', async () => {
  const store = await memoryVault();
  const plugin = store.instance();
  plugin.settings.cet6CatalogFolder = '词屿/六级题库/文字版/历年真题';
  const trPath = '词屿/六级题库/文字版/历年真题/听力原文/2026 年 6 月六级真题 · 第 1 套 · 听力原文.md';
  await store.app.vault.create(
    trPath,
    '## Section A · 长对话 1 · Questions 1-4\n\n**♂ 男士（M）：** Hello.\n> 译文：你好。\n\n**♀ 女士（W）：** Hi there.\n> 译文：嗨。\n'
  );
  const ctrl = new runtime.Cet6StudyController(plugin);
  const paper1 = { id: '202606-1', sessionId: '202606', set: 1, title: '2026 年 6 月六级真题 · 第 1 套', url: 'https://eol.nju.edu.cn/cet6/papers/202606-1.html' };
  const paper3 = { id: '202606-3', sessionId: '202606', set: 3, title: '2026 年 6 月六级真题 · 第 3 套', url: 'https://eol.nju.edu.cn/cet6/papers/202606-3.html' };

  assert.equal(ctrl.hasSavedTranscript(paper1), true);
  assert.equal(ctrl.transcriptPathFor(paper1), trPath);
  assert.equal(ctrl.hasSavedTranscript(paper3), true);

  // Seed docCache and verify ensurePaperLoaded populates segments with ♂/♀ roles
  ctrl.cacheDocument('202606-1', {
    paperId: '202606-1',
    listening: {
      groups: [{ id: 'g1', section: 'A', segments: [] }],
    },
  });
  const doc = await ctrl.ensurePaperLoaded('202606-1');
  assert.equal(doc.listening.groups[0].segments.length, 2);
  assert.equal(doc.listening.groups[0].segments[0].speaker, '♂ 男士 (M)');
  assert.equal(doc.listening.groups[0].segments[0].speakerRole, 'b');
  assert.equal(doc.listening.groups[0].segments[1].speaker, '♀ 女士 (W)');
  assert.equal(doc.listening.groups[0].segments[1].speakerRole, 'a');
});

test('selecting a listening segment automatically seeks audio while preserving paused or playing state', async () => {
  const store = await memoryVault();
  const plugin = store.instance();
  plugin.settings.cet6CatalogFolder = '词屿/六级题库/文字版/历年真题';
  const trPath = '词屿/六级题库/文字版/历年真题/听力原文/2026 年 6 月六级真题 · 第 1 套 · 听力原文.md';
  await store.app.vault.create(
    trPath,
    [
      '## Section A · 长对话 1 · Questions 1-4',
      '',
      '**♂ 男士（M）：** Welcome to Business Matters. Today we have invited a career consultant to talk about getting ahead.',
      '> 译文：欢迎收听。',
      '',
      '**♀ 女士（W）：** One mistake people make is to limit communication only to their bosses.',
      '> 译文：人们常犯的一个错误。',
      '',
      '**♂ 男士（M）：** But some of our co-workers are less senior to us. Is it really necessary to connect with them?',
      '> 译文：真的有必要吗？',
    ].join('\n')
  );

  const ctrl = new runtime.Cet6StudyController(plugin);
  ctrl.activePaperId = '202606-1';
  ctrl.listeningGroupId = 'g1';
  ctrl.cacheDocument('202606-1', {
    paperId: '202606-1',
    audioUrl: 'https://example.com/test.mp3',
    listening: {
      groups: [{ id: 'g1', section: 'A', startSec: 33, endSec: 165, timeRangeLabel: '00:33–02:45', segments: [] }],
    },
  });

  // Mock a paused audio element
  let playCalls = 0;
  ctrl.audio = {
    paused: true,
    readyState: 2,
    currentTime: 33,
    playbackRate: 1,
    play() { playCalls++; this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; },
    addEventListener() {},
  };
  ctrl.audioPaperId = '202606-1';

  const doc = await ctrl.ensurePaperLoaded('202606-1');
  const segs = doc.listening.groups[0].segments;
  assert.equal(segs.length, 3);
  assert.ok(segs[0].startSec >= 33 && segs[0].startSec < segs[1].startSec);
  assert.ok(segs[1].startSec < segs[2].startSec);
  assert.ok(segs[2].startSec < doc.listening.groups[0].questionsAudioStartSec);
  assert.ok(doc.listening.groups[0].questionsAudioStartSec < 165);

  const cb = ctrl.listeningCallbacks(true);

  // Select segment 2 while paused -> jumps audio & scrubber, stays paused
  cb.onSelectSegment(segs[1].id, false);
  assert.equal(ctrl.activeSegmentId, segs[1].id);
  assert.equal(ctrl.audioCurrentTime, segs[1].startSec);
  assert.equal(ctrl.audio.currentTime, segs[1].startSec);
  assert.equal(ctrl.audio.paused, true);
  assert.equal(playCalls, 0);

  // Clicking play afterwards starts from the jumped segment position, not 33
  ctrl.toggleAudioPlay();
  assert.equal(playCalls, 1);
  assert.equal(ctrl.audio.paused, false);
  assert.equal(ctrl.audio.currentTime, segs[1].startSec);

  // Select segment 3 while playing -> jumps audio and keeps playing
  cb.onSelectSegment(segs[2].id, false);
  assert.equal(ctrl.audioCurrentTime, segs[2].startSec);
  assert.equal(ctrl.audio.currentTime, segs[2].startSec);
  assert.equal(ctrl.audio.paused, false);
});

test('color theme presets and custom 4-color theme persist cleanly in ModelSettings and initialData', async () => {
  const store = await memoryVault();
  const plugin = store.instance();
  const settingsUi = new runtime.ModelSettings(plugin);
  const cb = settingsUi.callbacks();

  assert.equal(settingsUi.props().preferences.colorTheme, 'system');

  await cb.onSelectColorTheme('catppuccin-mocha');
  assert.equal(plugin.settings.colorTheme, 'catppuccin-mocha');
  assert.equal(settingsUi.props().preferences.colorTheme, 'catppuccin-mocha');

  const custom = {
    accent: '#ff5588',
    canvasBg: '#10141f',
    surfaceBg: '#1b2233',
    textPrimary: '#f1f5f9',
  };
  await cb.onCustomThemeChange(custom);
  assert.equal(plugin.settings.colorTheme, 'custom');
  assert.deepEqual(plugin.settings.customTheme, custom);

  const reloaded = runtime.initialData({ version: 1, settings: plugin.settings, cards: [] });
  assert.equal(reloaded.settings.colorTheme, 'custom');
  assert.deepEqual(reloaded.settings.customTheme, custom);

  await cb.onGlassOpacityChange(36);
  assert.equal(plugin.settings.glassOpacity, 36);
  await cb.onGlassOpacityChange(5);
  assert.equal(plugin.settings.glassOpacity, 20);
  await cb.onGlassOpacityChange(150);
  assert.equal(plugin.settings.glassOpacity, 100);
});

test('offline ECDICT word-family analyzer finds curious/curiously for curiosity even when local model is unavailable', async () => {
  const store = await memoryVault();
  const plugin = store.instance();
  plugin.noteView = () => null;
  plugin.settings.port = 1; // unreachable local model port
  plugin.dictionaries = new runtime.Dictionaries(plugin);

  const family = await plugin.dictionaries.analyzeWordFamily('curiosity');
  assert.ok(family.roots.some(r => r.includes('-osity')), 'should detect -osity suffix');
  assert.ok(family.derivatives.some(d => /^curious\s+—\s+adj\./.test(d)), 'should find curious (adj.)');
  assert.ok(family.derivatives.some(d => /^curiously\s+—\s+adv\./.test(d)), 'should find curiously (adv.)');

  const session = new runtime.LookupSession(plugin);
  await session.search('curiosity');
  for (let i = 0; i < 40 && session.props().result?.morphemeAssist?.status !== 'ready'; i++) {
    await new Promise(resolve => setTimeout(resolve, 15));
  }
  const assist = session.props().result.morphemeAssist;
  assert.equal(assist.status, 'ready');
  assert.ok(assist.items.some(i => i.kind === 'derivative' && i.label === 'curious'));
  assert.ok(assist.items.some(i => i.kind === 'derivative' && i.label === 'curiously'));
});
