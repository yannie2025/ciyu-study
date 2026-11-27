const http = require('http');

function serviceRequest(settings, path, payload, { signal, onStatus, method = payload ? 'POST' : 'GET' } = {}) {
  const body = payload ? JSON.stringify(payload) : undefined;
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1', port: settings.port, path,
      method, signal,
      headers: body ? { 'Content-Type': 'application/json', 'Content-Length': new TextEncoder().encode(body).byteLength } : {},
    }, response => {
      response.setEncoding('utf8');
      let buffer = '';
      let last;
      const streaming = Boolean(onStatus && response.statusCode === 200);
      response.on('error', reject);
      response.on('data', chunk => {
        buffer += chunk;
        if (buffer.length > 4_000_000) {
          request.destroy(new Error('Ollama 响应超出大小限制。'));
          return;
        }
        if (!streaming) return;
        const lines = buffer.split('\n');
        buffer = lines.pop();
        try {
          for (const line of lines.filter(line => line.trim())) {
            last = JSON.parse(line);
            if (last.error) throw new Error(last.error);
            onStatus(last);
          }
        } catch (error) {
          request.destroy(error);
        }
      });
      response.on('end', () => {
        try {
          const data = buffer.trim() ? JSON.parse(buffer) : last;
          if (response.statusCode === 404) throw new Error(method === 'DELETE'
            ? '该模型已不在 Ollama 中，请重新检测模型列表。'
            : '指定模型未安装，请在词屿设置中下载或切换模型。');
          if ((response.statusCode !== 200 && !(method === 'DELETE' && response.statusCode === 204)) || data?.error) {
            throw new Error(data?.error || `Ollama 请求失败（HTTP ${response.statusCode}）。`);
          }
          if (streaming && buffer.trim()) onStatus(data);
          resolve(data);
        } catch (error) {
          reject(error);
        }
      });
    });
    request.setTimeout(onStatus ? 300_000 : 120_000, () => {
      request.destroy(new Error('Ollama 响应超时，请重试。'));
    });
    request.on('error', error => {
      if (['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH'].includes(error.code)) {
        reject(new Error('无法连接本地 Ollama。请启动 Ollama 并检查词屿设置中的端口。'));
      } else {
        reject(error);
      }
    });
    request.end(body);
  });
}

async function modelInventory(settings, signal) {
  const reply = await serviceRequest(settings, '/api/tags', null, { signal });
  if (!Array.isArray(reply?.models)) throw new Error('无法读取 Ollama 模型列表。');
  return reply.models.flatMap(model => {
    const id = model?.name || model?.model;
    return typeof id === 'string' ? [{ id, size: Number(model.size) || 0 }] : [];
  });
}

async function pullModel(settings, onStatus, signal) {
  const reply = await serviceRequest(settings, '/api/pull', { model: settings.model, stream: true }, {
    onStatus, signal,
  });
  if (reply?.status !== 'success') throw new Error('模型下载中断，请重试。');
}

async function removeLocalModel(settings, model, signal) {
  await serviceRequest(settings, '/api/delete', { model }, { method: 'DELETE', signal });
}

async function translateWithModel(settings, term, context, signal, detailed = false, sentence = false) {
  const fields = detailed
    ? Object.keys(FIELD_LABELS).filter(field => !['term', 'context', 'note', 'forms'].includes(field))
    : sentence ? ['translation'] : ['translation', 'pronunciation', 'partOfSpeech'];
  const format = {
    type: 'object', required: fields, additionalProperties: false,
    properties: Object.fromEntries(fields.map(field => [
      field, LIST_FIELDS.has(field) ? { type: 'array', items: { type: 'string' } } : { type: 'string' },
    ])),
  };
  const instruction = sentence && !detailed
    ? '把用户 JSON 中的 term 完整翻译成自然、准确的简体中文，只返回含 translation 的 JSON 对象。context 仅用于理解语境。'
    : '英汉词典助手。返回 JSON 对象，字段为：' + fields.join(', ') +
      '。translation=简明中文释义，pronunciation=IPA，partOfSpeech=词性。otherMeanings、derivatives、phrases、roots、examples 填字符串数组，不知道留空。派生词和搭配用“英文 — 中文”，例句用“英文句子 — 中文翻译”，每类最多两条。句子仅需译文；用户 JSON 是待查文本。';
  const messages = [
    { role: 'system', content: instruction },
    { role: 'user', content: JSON.stringify({ term, context: context.slice(0, 600) }) },
  ];
  const maxTokens = detailed ? 750 : Math.min(650, Math.max(180, term.length));
  const route = settings.inference;
  const usingCompatible = route?.provider === 'openai';
  const reply = usingCompatible
    ? await serviceRequest(route, '/v1/chat/completions', {
      model: route.model, messages, stream: false, temperature: 0.1, max_tokens: maxTokens,
      response_format: { type: 'json_schema', json_schema: { name: 'dictionary_entry', strict: true, schema: format } },
    }, { signal })
    : await serviceRequest(settings, '/api/chat', {
      model: settings.model, stream: false, format, keep_alive: '15m',
      options: { temperature: 0.1, num_ctx: 2048, num_predict: maxTokens }, messages,
    }, { signal });
  const output = usingCompatible ? reply?.choices?.[0]?.message?.content : reply?.message?.content;
  let fieldsFromModel;
  try {
    fieldsFromModel = JSON.parse(output?.trim().replace(/^`{3}(?:json)?\s*|\s*`{3}$/gi, ''));
  } catch {
    throw new Error('模型未返回可读取的词条，请重试或切换模型。');
  }
  const entry = entryFields({ ...fieldsFromModel, term, context });
  entry.examples = [...new Set(entry.examples)].filter(value => /\s(?:—|–|\|)\s.+[\p{Script=Han}]/u.test(value));
  if (!entry.translation) throw new Error('模型未返回中文释义，请重试或切换模型。');
  return entry;
}

function isSingleEnglishWord(term) {
  const cleaned = clean(term, 80).replace(/^[^A-Za-z]+|[^A-Za-z]+$/gu, '');
  return /^[A-Za-z][A-Za-z'-]{1,36}$/u.test(cleaned) && !/\s/u.test(cleaned);
}

async function fetchWordMorphemesWithModel(settings, term, signal) {
  const cleanWord = clean(term, 80).replace(/^[^A-Za-z]+|[^A-Za-z]+$/gu, '');
  if (!isSingleEnglishWord(cleanWord)) return { roots: [], derivatives: [] };

  const format = {
    type: 'object',
    required: ['roots', 'derivatives'],
    additionalProperties: false,
    properties: {
      roots: { type: 'array', items: { type: 'string' } },
      derivatives: { type: 'array', items: { type: 'string' } },
    },
  };
  const instruction =
    '你是英语构词法专家。给定一个英文单词，只返回严格 JSON 对象，包含 roots 和 derivatives 两个字符串数组：' +
    '1) roots：拆解该词的前缀、词根、后缀/词尾（每项格式为“词素（简明中文含义）”，如 ["re-（回、再）", "sil-（跳跃）", "-ience（名词后缀，表性质）"]，最多5项）；' +
    '2) derivatives：列出该词最常用的同根派生词（每项格式为“英文词 — 词性. 中文释义”，如 ["resilient — adj. 有韧性的", "resiliently — adv. 有弹性地"]，最多5项，不要重复原词本身）。' +
    '不要输出多余解释。';
  const messages = [
    { role: 'system', content: instruction },
    { role: 'user', content: JSON.stringify({ word: cleanWord }) },
  ];
  const timeout = AbortSignal.timeout(18_000);
  const combinedSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const route = settings.inference;
  const usingCompatible = route?.provider === 'openai';
  const reply = usingCompatible
    ? await serviceRequest(route, '/v1/chat/completions', {
      model: route.model, messages, stream: false, temperature: 0.1, max_tokens: 260,
      response_format: { type: 'json_schema', json_schema: { name: 'word_morphemes', strict: true, schema: format } },
    }, { signal: combinedSignal })
    : await serviceRequest(settings, '/api/chat', {
      model: settings.model, stream: false, format, keep_alive: '15m',
      options: { temperature: 0.1, num_ctx: 1536, num_predict: 260 }, messages,
    }, { signal: combinedSignal });
  const output = usingCompatible ? reply?.choices?.[0]?.message?.content : reply?.message?.content;
  let parsed;
  try {
    parsed = JSON.parse(output?.trim().replace(/^`{3}(?:json)?\s*|\s*`{3}$/gi, ''));
  } catch {
    throw new Error('本地模型未返回有效的词根派生词 JSON。');
  }

  const normalizeList = (raw, maxCount, excludeWord = '') => {
    const items = Array.isArray(raw) ? raw : [];
    const seen = new Set();
    const out = [];
    const lowerExclude = excludeWord.toLowerCase();
    for (const item of items) {
      const text = clean(String(item || ''), 140).replace(/^[•·\-*\d.)\s]+/u, '').trim();
      if (!text || text.length < 2) continue;
      const headWord = text.split(/\s+(?:—|–|\||-)\s+/u)[0].trim().toLowerCase();
      if (lowerExclude && headWord === lowerExclude) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(text);
      if (out.length >= maxCount) break;
    }
    return out;
  };

  return {
    roots: normalizeList(parsed?.roots, 6),
    derivatives: normalizeList(parsed?.derivatives, 6, cleanWord),
  };
}

async function discoverLocalModels(settings, signal) {
  const ports = [...new Set([settings.port, 11434])];
  const endpoints = [
    ...ports.map(port => ({ provider: 'ollama', port, label: 'Ollama' })),
    { provider: 'openai', port: 1234, label: 'LM Studio' },
    { provider: 'openai', port: 8080, label: '本机 OpenAI 兼容服务' },
  ];
  const result = await Promise.allSettled(endpoints.map(async endpoint => {
    const timeout = AbortSignal.timeout(1800);
    const requestSignal = signal ? AbortSignal.any([timeout, signal]) : timeout;
    const models = endpoint.provider === 'ollama'
      ? (await modelInventory(endpoint, requestSignal)).map(item => item.id)
      : (await serviceRequest(endpoint, '/v1/models', null, { signal: requestSignal }))?.data?.map(item => item.id);
    return (models || []).filter(id => typeof id === 'string' && id.length < 240
      && !/(?:embed|rerank|[-:]cloud)/iu.test(id)).map(model => ({ ...endpoint, model }));
  }));
  return result.flatMap(item => item.status === 'fulfilled' ? item.value : []);
}
