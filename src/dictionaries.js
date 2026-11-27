const WORD_PACKS = [
  { id: 'common', label: '常用英汉词库', count: 27466 },
  { id: 'cet4', label: '大学英语四级 CET-4', count: 3846 },
  { id: 'cet6', label: '大学英语六级 CET-6', count: 5406 },
];
const FORM_LABELS = {
  p: '过去式', d: '过去分词', i: '现在分词', 3: '第三人称',
  r: '比较级', t: '最高级', s: '复数', 0: '原形',
};

function dictionaryKey(value) {
  return value.normalize('NFKC').toLowerCase().trim()
    .replace(/[‘’]/gu, "'").replace(/^[("'“]+|[.!?,;:)"'”]+$/gu, '').replace(/\s+/gu, ' ');
}

const WORD_PREFIX_RULES = [
  ['counter', 'counter-（前缀：反、对抗）'],
  ['inter', 'inter-（前缀：在……之间、相互）'],
  ['trans', 'trans-（前缀：跨越、转变）'],
  ['super', 'super-（前缀：超级、在……之上）'],
  ['under', 'under-（前缀：在……之下、不足）'],
  ['multi', 'multi-（前缀：多、多种）'],
  ['over', 'over-（前缀：过度、在……之上）'],
  ['anti', 'anti-（前缀：反、抗）'],
  ['auto', 'auto-（前缀：自动、自身）'],
  ['semi', 'semi-（前缀：半、部分）'],
  ['post', 'post-（前缀：在……之后）'],
  ['fore', 'fore-（前缀：预先、在前）'],
  ['pre', 'pre-（前缀：预先、在……之前）'],
  ['dis', 'dis-（前缀：否定、分离）'],
  ['mis', 'mis-（前缀：错误、不当）'],
  ['non', 'non-（前缀：非、不）'],
  ['out', 'out-（前缀：超过、向外）'],
  ['sub', 'sub-（前缀：次、在……之下）'],
  ['un', 'un-（前缀：不、否定、反向）'],
  ['in', 'in-（前缀：不、无；向内）'],
  ['im', 'im-（前缀：不、无；向内）'],
  ['re', 're-（前缀：再、重新、回）'],
  ['de', 'de-（前缀：去除、向下、反向）'],
  ['co', 'co-（前缀：共同、一起）'],
];

const WORD_SUFFIX_RULES = [
  ['osity', '-osity（名词后缀，表性质、状态）', s => [s + 'ous', s + 'ose', s]],
  ['bility', '-bility（名词后缀，表能力、可能性）', s => [s + 'ble', s]],
  ['icity', '-icity（名词后缀，表性质、状态）', s => [s + 'ic', s + 'ical', s + 'e', s]],
  ['ation', '-ation（名词后缀，表行为、过程或结果）', s => [s + 'ate', s + 'e', s]],
  ['ition', '-ition（名词后缀，表行为、状态）', s => [s + 'ite', s + 'e', s]],
  ['ously', '-ously（副词后缀，表……地）', s => [s + 'ous', s + 'osity', s]],
  ['tion', '-tion（名词后缀，表行为、状态或结果）', s => [s + 'te', s + 't', s + 'ce', s + 'e', s]],
  ['sion', '-sion（名词后缀，表行为、状态）', s => [s + 'de', s + 'd', s + 'se', s + 's', s + 't', s]],
  ['ence', '-ence（名词后缀，表性质、状态）', s => [s + 'ent', s + 'e', s]],
  ['ance', '-ance（名词后缀，表性质、行为）', s => [s + 'ant', s + 'e', s]],
  ['ency', '-ency（名词后缀，表性质、状态）', s => [s + 'ent', s + 'ence', s]],
  ['ancy', '-ancy（名词后缀，表性质、状态）', s => [s + 'ant', s + 'ance', s]],
  ['ment', '-ment（名词后缀，表行为、结果）', s => [s, s + 'e']],
  ['ness', '-ness（名词后缀，表性质、状态）', s => (s.endsWith('i') ? [s.slice(0, -1) + 'y', s] : [s, s + 'e'])],
  ['ally', '-ally（副词后缀，表……地）', s => [s + 'al', s + 'ic', s]],
  ['ical', '-ical（形容词后缀，表……的）', s => [s + 'ic', s + 'y', s]],
  ['able', '-able（形容词后缀，表可……的、能够……的）', s => [s, s + 'e']],
  ['ible', '-ible（形容词后缀，表可……的）', s => [s, s + 'e']],
  ['tive', '-tive（形容词后缀，表有……倾向的）', s => [s + 'te', s + 't', s + 'ce', s]],
  ['sive', '-sive（形容词后缀，表有……性质的）', s => [s + 'de', s + 'se', s + 's', s]],
  ['ious', '-ious（形容词后缀，表充满……的）', s => [s + 'y', s + 'e', s + 'ion', s]],
  ['eous', '-eous（形容词后缀，表具有……性质的）', s => [s + 'e', s]],
  ['less', '-less（形容词后缀，表无……的）', s => (s.endsWith('i') ? [s.slice(0, -1) + 'y', s] : [s])],
  ['ship', '-ship（名词后缀，表身份、关系、技能）', s => [s]],
  ['hood', '-hood（名词后缀，表时期、身份、状态）', s => [s]],
  ['ily', '-ily（副词后缀，表……地）', s => [s + 'y', s]],
  ['ity', '-ity（名词后缀，表性质、状态）', s => [s, s + 'e', s + 'ous', s + 'al']],
  ['ous', '-ous（形容词后缀，表充满……的、具有……性质的）', s => [s, s + 'e', s + 'y', s + 'osity']],
  ['ful', '-ful（形容词后缀，表充满……的）', s => (s.endsWith('i') ? [s.slice(0, -1) + 'y', s] : [s])],
  ['ive', '-ive（形容词后缀，表有……倾向的）', s => [s, s + 'e']],
  ['ize', '-ize（动词后缀，表使……化）', s => [s, s + 'e', s + 'y']],
  ['ise', '-ise（动词后缀，表使……化）', s => [s, s + 'e', s + 'y']],
  ['ify', '-ify（动词后缀，表使成为……）', s => [s, s + 'e', s + 'y']],
  ['ate', '-ate（动词/形容词后缀，表使……、具有……的）', s => [s, s + 'e']],
  ['ism', '-ism（名词后缀，表主义、学说、现象）', s => [s, s + 'e']],
  ['ist', '-ist（名词后缀，表从事……的人）', s => [s, s + 'e', s + 'y']],
  ['ent', '-ent（形容词/名词后缀，表……的/人）', s => [s + 'ence', s + 'ency', s]],
  ['ant', '-ant（形容词/名词后缀，表……的/人）', s => [s + 'ance', s + 'ancy', s]],
  ['ic', '-ic（形容词后缀，表……的）', s => [s, s + 'y', s + 'e']],
  ['al', '-al（形容词/名词后缀，表……的）', s => [s, s + 'e', s + 'y']],
  ['ly', '-ly（副词/形容词后缀，表……地）', s => [s, s + 'le', s + 'e']],
  ['er', '-er（名词后缀，表人/物）', s => [s, s + 'e']],
  ['or', '-or（名词后缀，表人/物）', s => [s, s + 'e']],
];

function compactDictGloss(rawTranslation) {
  const firstLine = String(rawTranslation || '').split(/\r?\n/u)[0].trim();
  const normalized = firstLine
    .replace(/^a\.\s+/u, 'adj. ')
    .replace(/^ad\.\s+/u, 'adv. ')
    .replace(/\s+/gu, ' ')
    .trim();
  return normalized.length > 42 ? normalized.slice(0, 41).trimEnd() + '…' : normalized;
}

function expandFamilyCandidates(stem) {
  const out = new Set();
  if (!stem || stem.length < 3) return out;
  const noE = stem.endsWith('e') && stem.length > 3 ? stem.slice(0, -1) : stem;
  const yToI = stem.endsWith('y') && stem.length > 3 ? stem.slice(0, -1) + 'i' : '';
  const add = w => { if (w && w.length >= 3) out.add(w); };

  add(stem);
  const directSuffixes = [
    'ly', 'ness', 'ment', 'ful', 'less', 'able', 'ible', 'al', 'ic', 'ical',
    'ous', 'ious', 'ive', 'er', 'or', 'ist', 'ism', 'ity', 'ty', 'ship',
    'ize', 'ise', 'ify', 'ate', 'tion', 'ation', 'sion', 'ence', 'ance', 'ent', 'ant',
  ];
  for (const sf of directSuffixes) {
    add(stem + sf);
    if (noE !== stem) add(noE + sf);
  }
  if (yToI) {
    for (const sf of ['ly', 'ness', 'ful', 'less', 'ous', 'al', 'cation', 'fy', 'ty']) add(yToI + sf);
  }
  if (stem.endsWith('ous') && stem.length > 5) {
    const core = stem.slice(0, -3);
    add(core + 'osity');
    add(core + 'ously');
    add(core + 'ousness');
  }
  if (stem.endsWith('ble') && stem.length > 4) {
    const core = stem.slice(0, -3);
    add(core + 'bility');
    add(core + 'bly');
  }
  if ((stem.endsWith('ent') || stem.endsWith('ant')) && stem.length > 4) {
    const core = stem.slice(0, -1);
    add(core + 'ce');
    add(core + 'cy');
    add(stem + 'ly');
  }
  if (stem.endsWith('ce') && stem.length > 4) {
    const core = stem.slice(0, -2);
    add(core + 'ct');
    add(core + 'ction');
    add(core + 'ctive');
    add(core + 'ctivity');
  }
  if (stem.endsWith('ct') && stem.length > 4) {
    add(stem + 'ion');
    add(stem + 'ive');
    add(stem + 'ively');
    add(stem + 'ivity');
    add(stem.slice(0, -2) + 'ce');
  }
  if (stem.endsWith('ate') && stem.length > 4) {
    const core = stem.slice(0, -1);
    add(core + 'ion');
    add(core + 'ional');
    add(core + 'ive');
    add(core + 'or');
    add(core + 'ed');
  }
  for (const pf of ['un', 'in', 'im', 'dis', 're', 'non']) {
    add(pf + stem);
  }
  return out;
}

class Dictionaries {
  constructor(plugin) {
    this.plugin = plugin;
    this.loaded = new Map();
    this.aliases = new Map();
  }

  load(id) {
    if (this.loaded.has(id)) return this.loaded.get(id);
    const root = pluginDirectory(this.plugin);
    const loading = this.plugin.app.vault.adapter.read(root + '/dictionaries/' + id + '.json')
      .then(text => JSON.parse(text))
      .catch(error => {
        if (this.loaded.get(id) === loading) this.loaded.delete(id);
        throw error;
      });
    this.loaded.set(id, loading);
    return loading;
  }

  async find(term, context) {
    const key = dictionaryKey(term);
    if (!/^[a-z][a-z '-]{0,64}$/u.test(key)) return null;
    const packs = [];
    for (const id of this.plugin.settings.dictionaryPacks || []) {
      const pack = WORD_PACKS.find(item => item.id === id);
      if (!pack) continue;
      try {
        const entries = await this.load(id);
        if (Object.hasOwn(entries, key)) return this.lookupResult(pack, entries[key], term, context);
        packs.push({ pack, entries });
      } catch {
        // A missing pack should not disable the other dictionaries.
      }
    }
    for (const { pack, entries } of packs) {
      const base = /^[a-z'-]+$/u.test(key) && this.formAliases(pack.id, entries).get(key);
      if (base) return this.lookupResult(pack, entries[base], term, context, base);
    }
    return null;
  }

  lookupResult(pack, record, term, context, base) {
    const [pronunciation, translation, forms] = record;
    const posMatch = /^(?:([a-z]{1,6}\.)\s+)/iu.exec((translation || '').trim());
    const variants = Object.entries(forms).map(([label, form]) => FORM_LABELS[label] + '：' + form);
    return {
      entry: entryFields({
        term,
        pronunciation: base ? '' : pronunciation,
        partOfSpeech: posMatch ? posMatch[1] : '',
        translation,
        context,
        forms: base ? ['原形：' + base, ...variants] : variants,
      }),
      source: pack.label,
    };
  }

  async findAnyPack(term, context = '') {
    const direct = await this.find(term, context);
    if (direct) return direct;
    const key = dictionaryKey(term);
    if (!/^[a-z][a-z '-]{0,64}$/u.test(key)) return null;
    const enabled = new Set(this.plugin.settings.dictionaryPacks || []);
    const fallbackPacks = [];
    for (const pack of WORD_PACKS) {
      if (enabled.has(pack.id)) continue;
      try {
        const entries = await this.load(pack.id);
        if (Object.hasOwn(entries, key)) return this.lookupResult(pack, entries[key], term, context);
        fallbackPacks.push({ pack, entries });
      } catch {}
    }
    for (const { pack, entries } of fallbackPacks) {
      const base = /^[a-z'-]+$/u.test(key) && this.formAliases(pack.id, entries).get(key);
      if (base) return this.lookupResult(pack, entries[base], term, context, base);
    }
    return null;
  }

  formAliases(id, entries) {
    if (this.aliases.has(id)) return this.aliases.get(id);
    const aliases = new Map();
    for (const [base, [, , forms]] of Object.entries(entries)) {
      for (const [label, inflection] of Object.entries(forms)) {
        if (label === '0' || Object.hasOwn(entries, inflection)) continue;
        if (!aliases.has(inflection)) aliases.set(inflection, base);
        else if (aliases.get(inflection) !== base) aliases.set(inflection, null);
      }
    }
    this.aliases.set(id, aliases);
    return aliases;
  }

  async analyzeWordFamily(term) {
    const key = dictionaryKey(term);
    if (!/^[a-z]{3,40}$/u.test(key)) return { roots: [], derivatives: [] };

    const loadedPacks = [];
    for (const pack of WORD_PACKS) {
      try {
        const entries = await this.load(pack.id);
        if (entries && typeof entries === 'object') loadedPacks.push(entries);
      } catch {}
    }
    if (!loadedPacks.length) return { roots: [], derivatives: [] };

    const lookupDict = word => {
      for (const entries of loadedPacks) {
        if (Object.hasOwn(entries, word)) return entries[word];
      }
      return null;
    };

    const roots = [];
    const stems = new Set([key]);

    // 1. 检测前缀（仅当去前缀后的词干存在于词库中或长度>=4且有派生命中时记录）
    for (const [pf, label] of WORD_PREFIX_RULES) {
      if (key.startsWith(pf) && key.length - pf.length >= 4) {
        const rest = key.slice(pf.length);
        if (lookupDict(rest)) {
          roots.push(label);
          stems.add(rest);
          break;
        }
      }
    }

    // 2. 检测后缀并还原基础词干（例如 curiosity -> curious, resilience -> resilient, education -> educate）
    for (const [sf, label, recover] of WORD_SUFFIX_RULES) {
      if (key.endsWith(sf) && key.length - sf.length >= 3) {
        const rawStem = key.slice(0, -sf.length);
        const recovered = recover(rawStem).filter(s => s && s.length >= 3);
        const hasRealHit = recovered.some(s => Boolean(lookupDict(s)));
        if (hasRealHit || sf.length >= 4 || rawStem.length >= 4) {
          roots.push(label);
          for (const s of recovered) {
            if (lookupDict(s) || s.length >= 4) stems.add(s);
          }
          break;
        }
      }
    }

    // 3. 从所有候选词干展开标准构词派生形式，并严格用内置 ECDICT 词库校验真实词条与词性释义
    const candidateWords = new Set();
    for (const stem of stems) {
      for (const c of expandFamilyCandidates(stem)) {
        if (c !== key) candidateWords.add(c);
      }
    }

    const hits = [];
    const seenWords = new Set([key]);
    for (const cand of candidateWords) {
      if (seenWords.has(cand)) continue;
      const rec = lookupDict(cand);
      if (!rec || !rec[1]) continue;
      seenWords.add(cand);
      const gloss = compactDictGloss(rec[1]);
      if (!gloss) continue;
      // 优先展示核心词性（adj. / adv. / v. / n.），避免无意义偏门词排在前面
      const posRank = /^(?:adj\.|adv\.|vt?\.|vi?\.|n\.)/u.test(gloss) ? 0 : 1;
      const lenDiff = Math.abs(cand.length - key.length);
      hits.push({ word: cand, text: `${cand} — ${gloss}`, score: posRank * 20 + lenDiff });
    }

    hits.sort((a, b) => a.score - b.score || a.word.localeCompare(b.word));
    const derivatives = hits.slice(0, 6).map(h => h.text);

    return {
      roots: roots.slice(0, 4),
      derivatives,
    };
  }

  async change(id, operation) {
    if (!WORD_PACKS.some(pack => pack.id === id)) return;
    if (operation !== 'remove') await this.load(id);
    await this.plugin.commit(draft => {
      const current = draft.settings.dictionaryPacks;
      const others = current.filter(value => value !== id);
      draft.settings.dictionaryPacks = operation === 'remove' ? others
        : operation === 'primary' ? [id, ...others] : [...others, id];
    }, ['dictionaries', 'lookup']);
    if (operation === 'remove') {
      this.loaded.delete(id);
      this.aliases.delete(id);
    }
  }
}
