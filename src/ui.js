function splitBilingual(text) {
  const separator = /\s+(?:—|–|\|)\s+/u.exec(text);
  return !separator ? [text, ''] : [text.slice(0, separator.index), text.slice(separator.index + separator[0].length)];
}

function displayWord(entry, id, source, state) {
  const senses = entry.translation.split(/\r?\n/u).filter(Boolean);
  return {
    id, term: entry.term,
    kind: isSentenceQuery(entry.term)
      ? 'sentence' : /\s/u.test(entry.term) ? 'phrase' : 'word',
    phonetic: entry.pronunciation,
    partsOfSpeech: entry.partOfSpeech ? [entry.partOfSpeech] : [],
    senses: [...senses, ...(entry.otherMeanings || [])].map((meaningZh, index) => ({
      meaningZh, partOfSpeech: index === 0 ? entry.partOfSpeech : '',
    })),
    derivatives: (entry.derivatives || []).map(text => {
      const [word, meaningZh] = splitBilingual(text);
      return { word, partOfSpeech: '', meaningZh };
    }),
    collocations: (entry.phrases || []).map(text => {
      const [phrase, meaningZh] = splitBilingual(text);
      return { phrase, meaningZh };
    }),
    etymology: entry.roots?.length ? { morphemes: [], explanation: entry.roots.join('；') } : undefined,
    examples: (entry.examples || []).map(text => {
      const [en, zh] = splitBilingual(text);
      return { en, zh };
    }),
    forms: entry.forms || [], sourceSentence: entry.context, sourceNotePath: source || undefined, note: entry.note,
    ...state,
  };
}

function fileTarget(plugin, file) {
  const note = plugin.noteView();
  if (note?.file === file) return plugin.targetFor(note);
  const open = plugin.app.workspace.getLeavesOfType('markdown').map(leaf => leaf.view)
    .find(view => view.file === file && view.getMode() === 'source');
  return open ? plugin.targetFor(open) : { file };
}

class LookupSession {
  constructor(plugin, options = {}) {
    this.plugin = plugin;
    this.initialTerm = options.term || '';
    this.query = this.initialTerm;
    this.initialTarget = plugin.targetFor(options.view);
    this.target = this.initialTarget;
    this.source = this.initialTarget?.source || '';
    this.context = clean(options.context, 1200);
    this.status = 'empty';
    this.expanded = true;
    this.runningActions = new Set();
  }

  update() {
    this.onUpdate?.();
  }

  setQuery(query) {
    if (this.query === query) return;
    if (this.status === 'success' && this.entry && query.trim() === this.query.trim()) {
      this.query = query;
      return;
    }
    this.request?.abort();
    this.morphemeRequest?.abort();
    this.query = query;
    this.status = 'empty';
    this.entry = null;
    this.enrichment = null;
    this.morphemeAssist = null;
    this.archivedMatch = null;
    this.nativeError = '';
    this.error = '';
    this.update();
  }

  cancel() {
    this.request?.abort();
    if (this.status !== 'loading') return;
    if (this.enrichment) {
      const { previous, provider } = this.enrichment;
      this.enrichment = null;
      this.resultProvider = provider;
      this.setEntry(previous);
      return;
    }
    this.status = 'empty';
    this.update();
  }

  async search(value, detailed = false, forceModel = false, forceSentence = false) {
    const term = clean(value, MAX_SELECTION);
    if (!term) return;
    this.request?.abort();
    const request = new AbortController();
    this.request = request;
    this.query = term;
    this.status = 'loading';
    const sentence = forceSentence || isSentenceQuery(term);
    this.sentenceTranslation = sentence && !detailed;
    this.checkingDictionary = !detailed && !forceModel && !forceSentence;
    this.nativeError = '';
    const previous = detailed ? this.entry : null;
    const previousProvider = detailed ? this.resultProvider : undefined;
    this.enrichment = previous ? { previous, provider: previousProvider } : null;
    this.entry = null;
    this.resultProvider = undefined;
    this.expanded = true;
    if (!detailed || !this.target) {
      this.target = this.initialTarget || this.plugin.targetFor(this.plugin.noteView());
      this.source = this.target?.source || '';
    }
    const context = term === this.initialTerm && this.plugin.settings.useContext ? this.context : '';
    this.update();
    try {
      const match = this.checkingDictionary ? await this.plugin.dictionaries?.find(term, context) : null;
      if (request.signal.aborted || this.plugin.lifecycle.signal.aborted) return;
      if (match) {
        this.resultProvider = match.source;
        this.setEntry(match.entry);
      } else if (this.checkingDictionary && !sentence) {
        this.status = 'miss';
        this.update();
        return;
      } else {
        if (this.checkingDictionary) {
          this.checkingDictionary = false;
          this.update();
        }
        const settings = this.plugin.settings;
        const sentenceOnly = sentence && !detailed;
        const key = JSON.stringify([settings.port, settings.model, settings.inference, term, context, detailed, sentenceOnly]);
        const cache = this.plugin.modelCache;
        const entry = cache?.get(key) || await translateWithModel(settings, term, context, request.signal, detailed, sentenceOnly);
        if (request.signal.aborted || this.plugin.lifecycle.signal.aborted) return;
        cache?.set(key, entry);
        if (cache?.size > 64) cache.delete(cache.keys().next().value);
        this.resultProvider = detailed ? '本地 AI' : sentenceOnly ? '本地整句翻译' : '本地快速翻译';
        this.setEntry(previous ? { ...entry, forms: previous.forms, pronunciation: previous.pronunciation || entry.pronunciation } : entry);
      }
      this.plugin.recentQueries = [term, ...(this.plugin.recentQueries || []).filter(value => value !== term)].slice(0, 10);
      this.plugin.refresh(['lookup']);
    } catch (error) {
      if (request.signal.aborted || this.plugin.lifecycle.signal.aborted) return;
      this.enrichment = null;
      if (previous) {
        this.resultProvider = previousProvider;
        this.setEntry(previous);
        reportError(error);
        return;
      }
      this.status = 'error';
      this.error = error.message || '查询未完成。';
      this.update();
    }
  }

  setEntry(entry, source = this.source, options = {}) {
    this.enrichment = null;
    this.entry = entryFields(entry);
    this.id = randomUUID();
    this.source = source;
    this.status = 'success';
    this.archivedMatch = null;
    if (!options.keepMorphemeAssist) {
      this.morphemeRequest?.abort();
      this.morphemeAssist = null;
    }
    this.update();
    void this.checkArchiveMatch(this.entry.term, this.id);
    if (!options.keepMorphemeAssist && isSingleEnglishWord(this.entry.term)) {
      void this.loadMorphemeAssist(this.entry.term, this.id, false);
    }
  }

  buildMorphemeItems(roots = [], derivatives = []) {
    const items = [];
    const existingRoots = new Set((this.entry?.roots || []).map(v => normalizeWordHeadingKey(v)));
    const existingDerivs = new Set((this.entry?.derivatives || []).map(v => normalizeWordHeadingKey(v)));

    roots.forEach((raw, idx) => {
      const m = /^([^（(]+?)\s*[（(](.+)[）)]$/u.exec(raw);
      items.push({
        id: `root-${idx}-${raw}`,
        kind: 'root',
        label: m ? m[1].trim() : raw,
        meaningZh: m ? m[2].trim() : undefined,
        rawText: raw,
        selected: existingRoots.has(normalizeWordHeadingKey(raw)),
      });
    });

    derivatives.forEach((raw, idx) => {
      const [word, zh] = splitBilingual(raw);
      items.push({
        id: `deriv-${idx}-${raw}`,
        kind: 'derivative',
        label: word.trim() || raw,
        meaningZh: zh.trim() || undefined,
        rawText: raw,
        selected: existingDerivs.has(normalizeWordHeadingKey(raw)),
      });
    });

    return items;
  }

  async loadMorphemeAssist(term, entryId, forceRefresh = false) {
    if (!isSingleEnglishWord(term)) return;
    this.morphemeRequest?.abort();
    const req = new AbortController();
    this.morphemeRequest = req;

    const settings = this.plugin.settings;
    const modelName = settings.inference?.model || settings.model || '本地模型';
    if (!forceRefresh && this.entry?.roots?.length > 0 && this.entry?.derivatives?.length > 0) {
      this.morphemeAssist = {
        status: 'ready',
        modelName,
        items: this.buildMorphemeItems(this.entry.roots, this.entry.derivatives),
      };
      this.update();
      return;
    }
    const cacheKey = JSON.stringify([settings.port, settings.model, settings.inference, term.toLowerCase()]);
    this.plugin.morphemeCache ??= new Map();

    if (!forceRefresh && this.plugin.morphemeCache.has(cacheKey)) {
      const cached = this.plugin.morphemeCache.get(cacheKey);
      if (this.id !== entryId || req.signal.aborted) return;
      this.morphemeAssist = {
        status: 'ready',
        modelName,
        items: this.buildMorphemeItems(cached.roots, cached.derivatives),
      };
      this.update();
      return;
    }

    this.morphemeAssist = {
      status: 'loading',
      modelName,
      items: [],
    };
    this.update();

    const offline = await this.plugin.dictionaries?.analyzeWordFamily?.(term).catch(() => ({ roots: [], derivatives: [] }))
      || { roots: [], derivatives: [] };
    if (this.id !== entryId || req.signal.aborted || this.plugin.lifecycle?.signal.aborted) return;

    const mergeUnique = (primary = [], fallback = [], maxCount = 6) => {
      const seen = new Set();
      const out = [];
      for (const raw of [...primary, ...fallback]) {
        const text = String(raw || '').trim();
        if (!text) continue;
        const head = text.split(/\s+(?:—|–|\||-)\s+|[（(]/u)[0].trim().toLowerCase();
        const k = head || text.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(text);
        if (out.length >= maxCount) break;
      }
      return out;
    };

    try {
      const data = await fetchWordMorphemesWithModel(settings, term, req.signal);
      if (this.id !== entryId || req.signal.aborted || this.plugin.lifecycle?.signal.aborted) return;
      const merged = {
        roots: data.roots.length > 0 ? data.roots : offline.roots,
        derivatives: data.derivatives.length > 0
          ? (data.derivatives.length < 2 && offline.derivatives.length > 0
            ? mergeUnique(data.derivatives, offline.derivatives, 6)
            : data.derivatives)
          : offline.derivatives,
      };
      this.plugin.morphemeCache.set(cacheKey, merged);
      if (this.plugin.morphemeCache.size > 128) {
        this.plugin.morphemeCache.delete(this.plugin.morphemeCache.keys().next().value);
      }
      this.morphemeAssist = {
        status: 'ready',
        modelName: data.roots.length === 0 && data.derivatives.length === 0 && (offline.roots.length > 0 || offline.derivatives.length > 0)
          ? '离线词库构词分析'
          : modelName,
        items: this.buildMorphemeItems(merged.roots, merged.derivatives),
      };
      this.update();
    } catch (err) {
      if (this.id !== entryId || req.signal.aborted || this.plugin.lifecycle?.signal.aborted) return;
      if (offline.roots.length > 0 || offline.derivatives.length > 0) {
        this.morphemeAssist = {
          status: 'ready',
          modelName: '离线词库构词分析',
          items: this.buildMorphemeItems(offline.roots, offline.derivatives),
        };
        this.update();
        return;
      }
      this.morphemeAssist = {
        status: 'error',
        modelName,
        errorMessage: err?.message || '本地模型暂未连接，启动 Ollama 后可点击「重析」。',
        items: [],
      };
      this.update();
    }
  }

  entryWithSelectedMorphemes(baseEntry) {
    const items = this.morphemeAssist?.items || [];
    const pickedRoots = items.filter(i => i.selected && i.kind === 'root').map(i => i.rawText);
    const pickedDerivs = items.filter(i => i.selected && i.kind === 'derivative').map(i => i.rawText);
    if (!pickedRoots.length && !pickedDerivs.length) return baseEntry;
    const dedup = list => {
      const out = [];
      const seen = new Set();
      for (const item of list) {
        const k = normalizeWordHeadingKey(item);
        if (!k || seen.has(k)) continue;
        seen.add(k);
        out.push(item);
      }
      return out;
    };
    return {
      ...baseEntry,
      roots: dedup([...(baseEntry.roots || []), ...pickedRoots]),
      derivatives: dedup([...(baseEntry.derivatives || []), ...pickedDerivs]),
    };
  }

  async checkArchiveMatch(term, entryId) {
    if (!this.plugin.findArchivedWord || !term) return;
    try {
      const hit = await this.plugin.findArchivedWord(term);
      if (this.id !== entryId || this.plugin.lifecycle?.signal.aborted) return;
      this.archivedMatch = hit
        ? {
            date: hit.date,
            notePath: hit.notePath,
            term: hit.term,
            blockId: hit.blockId,
            line: hit.line,
            isToday: hit.isToday,
          }
        : null;
      this.update();
    } catch {}
  }

  props() {
    const key = this.entry ? duplicateKey(this.entry) : '';
    return {
      query: this.query, status: this.status, errorDetail: this.error, nativeError: this.nativeError, checkingDictionary: this.checkingDictionary, sentenceTranslation: this.sentenceTranslation,
      detailsExpanded: this.expanded,
      recentQueries: this.plugin.recentQueries || [],
      activeModelName: this.plugin.settings.inference?.model || this.plugin.settings.model,
      targetNotePath: this.target?.file.path || '',
      isSpeaking: this.plugin.spokenTerm === (this.entry?.term || this.query) && Boolean(this.plugin.spokenTerm),
      result: this.entry && displayWord(this.entry, this.id, this.source, {
        lookupProvider: this.resultProvider,
        ...(this.resultProvider === '本地整句翻译' ? { kind: 'sentence' } : {}),
        inVocabulary: this.plugin.cards.some(card => duplicateKey(card) === key),
        savedToday: (this.saved?.id === this.id && this.saved?.date === localDay()
          && this.saved?.folder === this.plugin.settings.archiveFolder)
          || Boolean(this.archivedMatch?.isToday),
        archivedMatch: this.archivedMatch || null,
        morphemeAssist: this.morphemeAssist || null,
      }),
    };
  }

  chooseTarget() {
    this.plugin.chooseFile(file => {
      this.target = fileTarget(this.plugin, file);
      this.update();
    });
  }

  async runAction(name, displayedEntry, execute) {
    if (displayedEntry.id !== this.id || this.runningActions.has(name)) return;
    this.runningActions.add(name);
    try { await execute(this.entry, displayedEntry.id); }
    catch (error) { reportError(error); }
    finally { this.runningActions.delete(name); }
  }

  async openNative(term, provider) {
    if (this.nativePending) return;
    this.nativePending = true;
    if (this.nativeError) {
      this.nativeError = '';
      this.update();
    }
    try {
      await nativeQuery(term, provider, this.plugin);
    } catch (error) {
      if (term === this.query || term === this.entry?.term) {
        this.nativeError = error.message;
        this.update();
      }
      reportError(error);
    } finally {
      this.nativePending = false;
    }
  }

  callbacks(openSettings) {
    return {
      onQueryChange: query => this.setQuery(query),
      onClearQuery: () => this.setQuery(''),
      onRemoveRecentQuery: query => {
        this.plugin.recentQueries = (this.plugin.recentQueries || []).filter(value => value !== query);
        this.plugin.refresh(['lookup']);
        this.update();
      },
      onClearRecentQueries: () => {
        this.plugin.recentQueries = [];
        this.plugin.refresh(['lookup']);
        this.update();
        new Notice('已清空全部搜索记录');
      },
      onSearch: query => this.search(query),
      onCancelSearch: () => this.cancel(),
      onRetrySearch: query => this.search(query, false, true),
      onQuickTranslate: query => this.search(query, false, true),
      onTranslateSentence: query => this.search(query, false, true, true),
      onOpenSettings: openSettings,
      onManualEntry: () => {
        const context = this.query === this.initialTerm && this.plugin.settings.useContext ? this.context : '';
        this.plugin.editEntry(entryFields({ term: this.query, context }), entry => this.setEntry(entry));
      },
      onNativeLookup: process.platform === 'darwin'
        ? (term, provider) => this.openNative(term, provider) : undefined,
      onSpeakQuery: term => safeUi(() => this.plugin.speak(term)),
      onEnrich: displayed => {
        if (displayed.id === this.id) void this.search(this.entry.term, true);
      },
      onSpeak: entry => safeUi(() => this.plugin.speak(entry.term)),
      onToggleDetails: expanded => { this.expanded = expanded; this.update(); },
      onEditEntry: (id, patch) => {
        if (id !== this.id) return;
        const [translation, ...otherMeanings] = patch.meaningSummary.split(/\r?\n/u).map(value => value.trim()).filter(Boolean);
        if (!translation) return;
        this.setEntry({
          ...this.entry,
          translation,
          otherMeanings,
          context: patch.sourceSentence,
          note: patch.note,
          ...(Array.isArray(patch.roots) ? { roots: patch.roots } : {}),
          ...(Array.isArray(patch.derivatives) ? { derivatives: patch.derivatives } : {}),
        });
      },
      onEditAll: displayed => {
        if (displayed.id === this.id) this.plugin.editEntry(this.entry, entry => this.setEntry(entry));
      },
      onOpenTargetNote: () => this.chooseTarget(),
      onOpenSourceNote: path => safeUi(() => this.plugin.openSource(path)),
      onOpenArchiveMatch: match => safeUi(() =>
        this.plugin.openArchiveEntry(match.notePath, match.term, match.blockId, match.line)
      ),
      onToggleMorphemeModule: (entryId, itemId) => {
        if (entryId !== this.id || !this.morphemeAssist) return;
        this.morphemeAssist = {
          ...this.morphemeAssist,
          items: this.morphemeAssist.items.map(item =>
            item.id === itemId ? { ...item, selected: !item.selected } : item
          ),
        };
        this.update();
      },
      onToggleAllMorphemeModules: (entryId, selected) => {
        if (entryId !== this.id || !this.morphemeAssist) return;
        this.morphemeAssist = {
          ...this.morphemeAssist,
          items: this.morphemeAssist.items.map(item => ({ ...item, selected })),
        };
        this.update();
      },
      onRetryMorphemeAssist: displayed => {
        if (displayed.id === this.id && this.entry) {
          void this.loadMorphemeAssist(this.entry.term, this.id, true);
        }
      },
      onAddSelectedMorphemes: (displayed, targetKind) => this.runAction('morpheme-' + targetKind, displayed, async (entry, id) => {
        const pickedCount = (this.morphemeAssist?.items || []).filter(i => i.selected).length;
        if (!pickedCount) {
          new Notice('请先点击勾选要添加的词根词尾或派生词模块。');
          return;
        }
        const enriched = this.entryWithSelectedMorphemes(entry);
        this.entry = entryFields(enriched);
        if (targetKind === 'archive') {
          const date = localDay();
          const folder = this.plugin.settings.archiveFolder;
          const existingBefore = await this.plugin.findArchivedWord?.(enriched.term);
          await this.plugin.archive(enriched, this.source);
          const currentHit = await this.plugin.findArchivedWord?.(enriched.term);
          this.saved = { id, date, folder };
          if (currentHit) {
            this.archivedMatch = {
              date: currentHit.date,
              notePath: currentHit.notePath,
              term: currentHit.term,
              blockId: currentHit.blockId,
              line: currentHit.line,
              isToday: currentHit.isToday,
            };
          }
          this.update();
          this.plugin.notifyArchiveWithJump(
            existingBefore
              ? `已将选中的 ${pickedCount} 个词根/派生词模块归类写入「${enriched.term}」词块。`
              : `已保存「${enriched.term}」及选中的 ${pickedCount} 个模块到今日归档。`,
            currentHit || existingBefore
          );
          return;
        }
        if (!this.target) {
          this.chooseTarget();
          return;
        }
        const target = this.target;
        const outcome = await this.plugin.insert(enriched, target);
        this.update();
        if (outcome === 'unchanged') {
          new Notice(`选中的模块已存在于 ${target.file.name} 的「${enriched.term}」词条中`);
        } else if (outcome === 'merged') {
          new Notice(`已将选中的 ${pickedCount} 个词根/派生词模块合并至 ${target.file.name} 的「${enriched.term}」词条`);
        } else {
          new Notice(`已将「${enriched.term}」及选中的 ${pickedCount} 个模块插入 ${target.file.name}`);
        }
      }),
      onInsertToNote: displayed => this.runAction('insert', displayed, async entry => {
        if (!this.target) { this.chooseTarget(); return; }
        const target = this.target;
        const payload = this.entryWithSelectedMorphemes(entry);
        const outcome = await this.plugin.insert(payload, target);
        if (outcome === 'unchanged') {
          new Notice(`「${payload.term}」已在 ${target.file.name} 中，无需重复插入`);
        } else if (outcome === 'merged') {
          new Notice(`已归类合并至 ${target.file.name} 的「${payload.term}」词条`);
        } else {
          new Notice('已插入 ' + target.file.name);
        }
      }),
      onAddToVocabulary: displayed => this.runAction('vocabulary', displayed, async entry => {
        const payload = this.entryWithSelectedMorphemes(entry);
        await this.plugin.addCard(payload, this.source);
        this.update();
        new Notice('已加入生词本。');
      }),
      onSaveToToday: displayed => this.runAction('archive', displayed, async (entry, id) => {
        const date = localDay();
        const folder = this.plugin.settings.archiveFolder;
        const payload = this.entryWithSelectedMorphemes(entry);
        const existingBefore = await this.plugin.findArchivedWord?.(payload.term);
        await this.plugin.archive(payload, this.source);
        const currentHit = await this.plugin.findArchivedWord?.(payload.term);
        this.saved = { id, date, folder };
        if (currentHit) {
          this.archivedMatch = {
            date: currentHit.date,
            notePath: currentHit.notePath,
            term: currentHit.term,
            blockId: currentHit.blockId,
            line: currentHit.line,
            isToday: currentHit.isToday,
          };
        }
        this.update();
        if (existingBefore?.isToday) {
          this.plugin.notifyArchiveWithJump(
            `「${payload.term}」已在今日归档中，已合并更新到该词块。`,
            currentHit || existingBefore
          );
        } else if (existingBefore) {
          this.plugin.notifyArchiveWithJump(
            `提示：「${payload.term}」此前已在 ${existingBefore.date} 归档过，本次已同步保存到今日归档。`,
            existingBefore
          );
        } else {
          this.plugin.notifyArchiveWithJump(
            `已保存「${payload.term}」到今日独立词块。`,
            currentHit
          );
        }
      }),
    };
  }
}

function safeUi(action) {
  return Promise.resolve().then(action).catch(reportError);
}

class SelectionPopup {
  constructor(plugin, options) {
    this.plugin = plugin;
    this.session = new LookupSession(plugin, options);
    this.document = options.view?.containerEl?.ownerDocument || document;
    this.window = this.document.defaultView;
    this.previousFocus = this.document.activeElement;
    const selection = this.document.getSelection();
    const range = selection?.rangeCount && !selection.isCollapsed ? selection.getRangeAt(0).getBoundingClientRect() : null;
    const editorSelection = options.view?.containerEl?.querySelector('.cm-selectionBackground')?.getBoundingClientRect();
    const anchor = range?.width ? range : editorSelection;
    this.point = options.point || (anchor?.width
      ? { x: anchor.left, y: anchor.bottom } : { x: this.window.innerWidth / 2 - 170, y: this.window.innerHeight / 4 });
    this.session.onUpdate = () => this.render();
  }

  open() {
    this.listening = new AbortController();
    const signal = this.listening.signal;
    this.document.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !this.host?.contains(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.plugin.closeSelection();
    }, { capture: true, signal });
    this.document.addEventListener('pointerdown', event => {
      if (!this.host?.contains(event.target) && !event.target.closest?.('.modal-container')) {
        this.plugin.closeSelection(false);
      }
    }, { signal });
    this.window.addEventListener('resize', () => this.place(), { signal });
    void this.session.search(this.session.initialTerm);
  }

  close(restoreFocus, keepSession = false) {
    this.listening.abort();
    if (!keepSession) {
      this.session.request?.abort();
      this.session.morphemeRequest?.abort();
    }
    this.session.onUpdate = null;
    this.handle?.destroy();
    this.host?.remove();
    if (restoreFocus && this.previousFocus?.isConnected) this.previousFocus.focus();
  }

  pinToSidebar() {
    return safeUi(async () => {
      const pinned = this.session;
      if (pinned.target) pinned.target.pinned = true;
      pinned.initialTarget = null;
      pinned.initialTerm = '';
      this.plugin.closeSelection(false, true);
      await this.plugin.showStudy('lookup', pinned);
    });
  }

  bindPendingHeaderDrag(header) {
    let drag = null;
    header.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest?.('button, a, input, textarea, select')) return;
      const rect = this.host.getBoundingClientRect();
      drag = { id: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
      this.host.dataset.dragging = 'true';
      header.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    header.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.id || !this.host) return;
      const width = this.host.offsetWidth || 360;
      const height = this.host.offsetHeight || 220;
      const x = Math.max(8, Math.min(this.window.innerWidth - width - 8, event.clientX - drag.offsetX));
      const y = Math.max(8, Math.min(this.window.innerHeight - height - 8, event.clientY - drag.offsetY));
      this.draggedPos = { x, y };
      this.host.style.left = x + 'px';
      this.host.style.top = y + 'px';
    });
    const stop = event => {
      if (!drag || event.pointerId !== drag.id) return;
      if (header.hasPointerCapture?.(event.pointerId)) header.releasePointerCapture(event.pointerId);
      drag = null;
      if (this.host) delete this.host.dataset.dragging;
    };
    header.addEventListener('pointerup', stop);
    header.addEventListener('pointercancel', stop);
  }

  render() {
    if (this.listening?.signal.aborted) return;
    const props = this.session.props();
    const success = props.status === 'success';
    if (this.handle && this.success !== success) {
      this.handle.destroy();
      this.host?.remove();
      this.handle = null;
    }
    const callbacks = this.session.callbacks(() => {
      this.plugin.closeSelection(false);
      return safeUi(() => this.plugin.showStudy('settings'));
    });
    const cardProps = { ...props, entry: props.result, visible: true };
    const mount = !this.handle;
    if (mount) {
      this.success = success;
      if (success) {
        this.handle = CiyuUI.createSelectionPopover(cardProps, {
          ...callbacks,
          onClose: () => this.plugin.closeSelection(),
          onPinToSidebar: () => this.pinToSidebar(),
          onDragMove: pos => { this.draggedPos = pos; },
        });
        this.host = this.handle.element;
      } else {
        this.host = this.document.body.createDiv({ cls: 'ciyu-ui ciyu-reduced-transparency ciyu-popover-shell ciyu-pending-popup' });
        this.host.dataset.reducedTransparency = 'true';
        this.host.setAttribute('role', 'dialog');
        const header = this.host.createDiv({ cls: 'ciyu-popover-header', attr: { title: '按住顶栏可拖动浮窗位置' } });
        const pill = header.createSpan({ cls: 'ciyu-popover-pill' });
        pill.appendChild(CiyuUI.createIcon('languages', 'sm'));
        pill.createSpan({ text: '划词翻译' });
        header.createSpan({ cls: 'ciyu-popover-drag-grip', attr: { 'aria-hidden': 'true' } });
        const controls = header.createDiv({ cls: 'ciyu-card-tools' });
        const pin = controls.createEl('button', { cls: 'ciyu-icon-btn', attr: { type: 'button', title: '固定到右侧查词栏', 'aria-label': '固定到右侧查词栏' } });
        pin.appendChild(CiyuUI.createIcon('pin', 'sm'));
        pin.addEventListener('click', () => this.pinToSidebar());
        const close = controls.createEl('button', { cls: 'ciyu-icon-btn', attr: { type: 'button', 'aria-label': '关闭划词浮窗' } });
        close.appendChild(CiyuUI.createIcon('x', 'sm'));
        close.addEventListener('click', () => this.plugin.closeSelection());
        this.bindPendingHeaderDrag(header);
        this.handle = CiyuUI.createLookupView(props, {
          ...callbacks, onCancelSearch: () => this.plugin.closeSelection(),
        });
        this.host.createDiv({ cls: 'ciyu-popover-body' }).appendChild(this.handle.element);
      }
      this.host.addClass('ciyu-selection-host');
      this.document.body.appendChild(this.host);
    } else {
      this.handle.update(success ? cardProps : props);
    }
    CiyuUI.applyGlassPreferences(this.host, {
      ...appearance(this.plugin.settings),
      liquidGlass: false,
      reducedTransparency: true,
      edgeRefraction: false,
    });
    this.place();
    if (mount) this.host.querySelector('[aria-label="关闭划词浮窗"]')?.focus({ preventScroll: true });
  }

  place() {
    if (!this.host?.isConnected) return;
    const width = this.host.offsetWidth;
    const height = this.host.offsetHeight;
    const baseX = this.draggedPos ? this.draggedPos.x : this.point.x;
    const baseY = this.draggedPos ? this.draggedPos.y : this.point.y + 8;
    this.host.style.left = Math.max(8, Math.min(baseX, this.window.innerWidth - width - 8)) + 'px';
    this.host.style.top = Math.max(8, Math.min(baseY, this.window.innerHeight - height - 8)) + 'px';
  }
}

function vocabularyDraft(draft, card = {}) {
  return entryFields({
    ...card, term: draft.word, pronunciation: draft.phonetic, partOfSpeech: draft.partOfSpeech,
    translation: draft.meaningZh, context: draft.sourceSentence,
  });
}

class VocabImportController {
  constructor(plugin) {
    this.plugin = plugin;
    this.handle = null;
    this.extractedByPath = new Map();
    this.state = {
      open: false,
      activeTab: 'paste_list',
      pasteText: '',
      uploadedFileName: '',
      candidates: [],
      noteSources: [],
      busy: false,
      aiAvailable: false,
      statusMessage: '',
      errorMessage: '',
    };
  }

  destroy() {
    this.handle?.destroy();
    this.handle = null;
  }

  existingWordKeys() {
    const keys = new Set();
    const terms = new Set();
    for (const card of this.plugin.cards) {
      keys.add(duplicateKey(card));
      terms.add(card.term.normalize('NFKC').toLowerCase().trim());
    }
    return { keys, terms };
  }

  async hydrateCandidates(rawItems) {
    const { keys, terms } = this.existingWordKeys();
    const seenBatch = new Set();
    const candidates = [];

    for (const raw of rawItems) {
      const word = clean(raw.word, 200);
      if (!word) continue;
      const lowerWord = word.normalize('NFKC').toLowerCase().trim();
      if (seenBatch.has(lowerWord)) continue;
      seenBatch.add(lowerWord);

      let phonetic = clean(raw.phonetic || '', 120);
      let partOfSpeech = clean(raw.partOfSpeech || '', 60);
      let meaningZh = clean(raw.meaningZh || '', 1000);
      let forms = raw.forms || [];
      let providerLabel = '';
      let matchStatus = meaningZh ? 'parsed' : 'missing';

      if (!meaningZh || !phonetic) {
        const dictHit = await this.plugin.dictionaries?.findAnyPack(word, raw.sourceSentence || '');
        if (dictHit) {
          if (!meaningZh) {
            meaningZh = dictHit.entry.translation.split(/\r?\n/u).filter(Boolean).join('；');
            matchStatus = 'dict';
            providerLabel = dictHit.source;
          }
          if (!phonetic && dictHit.entry.pronunciation) phonetic = dictHit.entry.pronunciation;
          if (!partOfSpeech && dictHit.entry.partOfSpeech) partOfSpeech = dictHit.entry.partOfSpeech;
          if (!forms.length && dictHit.entry.forms?.length) forms = dictHit.entry.forms;
        }
      }

      const probe = entryFields({ term: word, translation: meaningZh || ' ' });
      const isDup =
        (meaningZh && keys.has(duplicateKey(probe))) ||
        (!raw.meaningZh && terms.has(lowerWord));
      if (isDup) matchStatus = 'duplicate';

      candidates.push({
        id: randomUUID(),
        selected: matchStatus !== 'duplicate' && Boolean(meaningZh),
        word,
        phonetic,
        partOfSpeech,
        meaningZh,
        sourceSentence: raw.sourceSentence,
        sourceNotePath: raw.sourceNotePath,
        forms,
        derivatives: raw.derivatives,
        phrases: raw.phrases,
        roots: raw.roots,
        examples: raw.examples,
        matchStatus,
        providerLabel,
      });
    }
    return candidates;
  }

  async scanVaultNoteSources() {
    this.extractedByPath.clear();
    const mdFiles = this.plugin.app.vault.getMarkdownFiles?.() || [];
    const { keys, terms } = this.existingWordKeys();
    const sources = [];

    for (const file of mdFiles) {
      if (
        file.path.startsWith(STUDY_TRASH + '/') ||
        file.path.endsWith('真题索引.md') ||
        file.path.endsWith('六级真题下载索引.md') ||
        file.path.endsWith('六级错题索引.md')
      ) {
        continue;
      }
      let content = '';
      try {
        content = this.plugin.app.vault.cachedRead
          ? await this.plugin.app.vault.cachedRead(file)
          : await this.plugin.app.vault.read(file);
      } catch {
        continue;
      }
      const extracted = extractMarkdownVocabEntries(content, file.path);
      if (!extracted.length) continue;

      const freshEntries = extracted.filter(
        entry =>
          !keys.has(duplicateKey(entry)) &&
          !terms.has(entry.term.normalize('NFKC').toLowerCase().trim())
      );
      this.extractedByPath.set(file.path, freshEntries);

      const category = file.path.startsWith(this.plugin.settings.archiveFolder + '/')
        ? 'archive'
        : file.path.startsWith(STUDY_NOTES + '/')
        ? 'study'
        : 'note';

      sources.push({
        path: file.path,
        title: file.basename,
        category,
        totalEntries: extracted.length,
        newEntries: freshEntries.length,
        selected: freshEntries.length > 0,
      });
    }

    sources.sort((a, b) => b.newEntries - a.newEntries || a.path.localeCompare(b.path));
    this.state.noteSources = sources;
  }

  async openModal(tab = 'paste_list') {
    this.state = {
      ...this.state,
      open: true,
      activeTab: tab,
      busy: false,
      aiAvailable:
        this.plugin.modelUi?.connectionStatus === 'connected' ||
        Boolean(this.plugin.settings.inference),
      statusMessage: '',
      errorMessage: '',
    };
    if (tab === 'from_notes') {
      await this.scanVaultNoteSources();
    }
    this.render();
  }

  render() {
    if (!this.handle) {
      this.handle = CiyuUI.createVocabularyQuickImportModal(this.state, this.callbacks());
      document.body.appendChild(this.handle.element);
    } else {
      this.handle.update({ ...this.state });
    }
    if (this.state.open) {
      CiyuUI.applyGlassPreferences(this.handle.element, appearance(this.plugin.settings));
    }
  }

  callbacks() {
    return {
      onClose: () => {
        if (this.state.busy) return;
        this.state.open = false;
        this.render();
      },
      onTabChange: async tab => {
        this.state.activeTab = tab;
        this.state.statusMessage = '';
        this.state.errorMessage = '';
        if (tab === 'from_notes') {
          this.state.busy = true;
          this.render();
          await this.scanVaultNoteSources();
          this.state.busy = false;
        }
        this.render();
      },
      onPasteTextChange: text => {
        this.state.pasteText = text;
      },
      onParsePasteList: async rawText => {
        if (!rawText.trim()) {
          this.state.errorMessage = '请先粘贴至少一个英文单词或词条。';
          this.render();
          return;
        }
        this.state.busy = true;
        this.state.errorMessage = '';
        this.state.statusMessage = '';
        this.render();
        try {
          const parsed = parseVocabImportText(rawText, '');
          this.state.candidates = await this.hydrateCandidates(parsed);
          if (!this.state.candidates.length) {
            this.state.errorMessage = '未识别到有效单词，请每行输入一个单词或词条。';
          }
        } catch (err) {
          this.state.errorMessage = err?.message || '解析词单失败。';
        } finally {
          this.state.busy = false;
          this.render();
        }
      },
      onUploadFiles: async fileList => {
        this.state.busy = true;
        this.state.errorMessage = '';
        this.state.statusMessage = '';
        this.render();
        try {
          const rawAll = [];
          const names = [];
          for (const file of Array.from(fileList)) {
            if (file.size > 16 * 1024 * 1024) throw new Error(`${file.name} 超过 16 MB 上限。`);
            names.push(file.name);
            const text = await file.text();
            rawAll.push(...parseVocabImportText(text, file.name));
          }
          this.state.uploadedFileName = names.join('、');
          this.state.candidates = await this.hydrateCandidates(rawAll);
          if (!this.state.candidates.length) {
            this.state.errorMessage = '所选文件中未解析出可导入词条。';
          }
        } catch (err) {
          this.state.errorMessage = err?.message || '读取词表文件失败。';
        } finally {
          this.state.busy = false;
          this.render();
        }
      },
      onToggleCandidate: (id, selected) => {
        this.state.candidates = this.state.candidates.map(c =>
          c.id === id ? { ...c, selected } : c
        );
        this.render();
      },
      onSelectAllValidCandidates: selected => {
        this.state.candidates = this.state.candidates.map(c =>
          c.matchStatus !== 'duplicate' && c.meaningZh.trim() ? { ...c, selected } : c
        );
        this.render();
      },
      onUpdateCandidateMeaning: (id, meaningZh) => {
        const trimmed = meaningZh.trim();
        this.state.candidates = this.state.candidates.map(c =>
          c.id === id
            ? {
                ...c,
                meaningZh: trimmed,
                selected: Boolean(trimmed),
                matchStatus: trimmed ? (c.matchStatus === 'missing' ? 'parsed' : c.matchStatus) : 'missing',
              }
            : c
        );
        this.render();
      },
      onAiFillMissing: async () => {
        const missing = this.state.candidates.filter(c => c.matchStatus === 'missing');
        if (!missing.length || this.state.busy) return;
        this.state.busy = true;
        this.state.errorMessage = '';
        this.render();
        try {
          for (const item of missing) {
            const res = await translateWithModel(
              this.plugin.settings,
              item.word,
              item.sourceSentence || '',
              undefined,
              false,
              isSentenceQuery(item.word)
            );
            item.meaningZh = res.translation;
            if (!item.phonetic && res.pronunciation) item.phonetic = res.pronunciation;
            if (!item.partOfSpeech && res.partOfSpeech) item.partOfSpeech = res.partOfSpeech;
            item.matchStatus = 'dict';
            item.providerLabel = '本地 AI 补全';
            item.selected = Boolean(item.meaningZh);
            this.render();
          }
        } catch (err) {
          this.state.errorMessage = err?.message || '本地 AI 补全中断，可手工补充剩余释义。';
        } finally {
          this.state.busy = false;
          this.render();
        }
      },
      onConfirmImportCandidates: async () => {
        const chosen = this.state.candidates.filter(
          c => c.selected && c.meaningZh.trim() && c.matchStatus !== 'duplicate'
        );
        if (!chosen.length || this.state.busy) return;
        this.state.busy = true;
        this.render();
        try {
          const payload = chosen.map(c => ({
            source: c.sourceNotePath || '',
            entry: {
              term: c.word,
              pronunciation: c.phonetic,
              partOfSpeech: c.partOfSpeech,
              translation: c.meaningZh,
              context: c.sourceSentence || '',
              forms: c.forms || [],
              derivatives: c.derivatives || [],
              phrases: c.phrases || [],
              roots: c.roots || [],
              examples: c.examples || [],
            },
          }));
          const { added, skipped } = await this.plugin.addCardsBatch(payload);
          new Notice(`成功导入 ${added} 个生词${skipped ? `（跳过重复 ${skipped} 个）` : ''}！`);
          this.state.open = false;
          this.state.candidates = [];
          this.state.pasteText = '';
          this.state.uploadedFileName = '';
        } catch (err) {
          this.state.errorMessage = err?.message || '批量写入生词本失败。';
        } finally {
          this.state.busy = false;
          this.render();
        }
      },
      onToggleNoteSource: (path, selected) => {
        this.state.noteSources = this.state.noteSources.map(n =>
          n.path === path ? { ...n, selected } : n
        );
        this.render();
      },
      onSelectAllNoteSources: selected => {
        this.state.noteSources = this.state.noteSources.map(n =>
          n.newEntries > 0 ? { ...n, selected } : n
        );
        this.render();
      },
      onRefreshNoteSources: async () => {
        this.state.busy = true;
        this.render();
        await this.scanVaultNoteSources();
        this.state.busy = false;
        this.render();
      },
      onConfirmImportFromNotes: async () => {
        const selectedNotes = this.state.noteSources.filter(n => n.selected && n.newEntries > 0);
        if (!selectedNotes.length || this.state.busy) return;
        this.state.busy = true;
        this.render();
        try {
          const batch = [];
          for (const src of selectedNotes) {
            const entries = this.extractedByPath.get(src.path) || [];
            for (const entry of entries) {
              batch.push({ entry, source: src.path });
            }
          }
          const { added, skipped } = await this.plugin.addCardsBatch(batch);
          new Notice(`已从 ${selectedNotes.length} 份笔记提取导入 ${added} 个新词${skipped ? `（跳过重复 ${skipped} 个）` : ''}！`);
          this.state.open = false;
        } catch (err) {
          this.state.errorMessage = err?.message || '从笔记提取生词失败。';
        } finally {
          this.state.busy = false;
          this.render();
        }
      },
    };
  }
}

function reviewTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function archiveEntries(content, filePath) {
  const lines = content.split(/\r?\n/u);
  let current = null;
  let fence = null;
  const entries = [];
  const fields = Object.fromEntries(Object.entries(FIELD_LABELS).map(([field, label]) => [label, field]));
  const plain = text => text.replace(/\\([\\*\x60_~[\]{}#|^$!=:@])/gu, '$1')
    .replace(/&(lt|gt|amp);/gu, (_, entity) => ({ lt: '<', gt: '>', amp: '&' })[entity]);
  for (let line = 0; line < lines.length; line++) {
    const text = lines[line].trim();
    const marker = /^(~{3,}|\x60{3,})(.*)$/u.exec(text);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      continue;
    }
    if (fence) continue;
    const heading = /^##\s+(.+)$/u.exec(text);
    if (heading) {
      const rawHeading = heading[1].trim();
      const inlineBlock = /\s+\^([A-Za-z0-9-]+)$/u.exec(rawHeading);
      const cleanTerm = plain(inlineBlock ? rawHeading.slice(0, inlineBlock.index) : rawHeading).trim();
      current = {
        id: filePath + ':' + line,
        term: cleanTerm,
        meaningZh: '',
        phonetic: '',
        partOfSpeech: '',
        roots: [],
        derivatives: [],
        blockId: inlineBlock?.[1] || '',
        line,
        timeLabel: '',
        details: {},
      };
      entries.push(current);
    } else if (current && (/^#\s+/u.test(text) || /^-{3,}$/u.test(text))) {
      current = null;
    } else if (current && text) {
      const blockAnchor = /^\^([A-Za-z0-9-]+)$/u.exec(text);
      if (blockAnchor) {
        current.blockId = blockAnchor[1];
        continue;
      }
      const metadata = /^-\s+\*\*([^*]+)\*\*[:：]\s*(.*)$/u.exec(text);
      if (metadata && Object.hasOwn(fields, metadata[1])) {
        const field = fields[metadata[1]];
        const val = plain(metadata[2]).trim();
        if (!val) continue;
        if (LIST_FIELDS.has(field)) {
          const items = val.split(/\s*；\s*/u).map(s => s.trim()).filter(Boolean);
          current.details[field] = items;
          if (field === 'roots') current.roots = items;
          if (field === 'derivatives') current.derivatives = items;
        } else {
          current.details[field] = val;
          if (field === 'pronunciation') current.phonetic = val;
          if (field === 'partOfSpeech') current.partOfSpeech = val;
        }
      } else if (!current.meaningZh && !/^[-*>#]/u.test(text)) {
        current.meaningZh = plain(text);
      }
    }
  }
  return entries;
}

class StudyView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.tab = 'lookup';
    this.lookupSession = new LookupSession(plugin);
    this.lookupSession.onUpdate = () => this.refresh();
    this.groups = [];
    this.vocabularyQuery = '';
    this.reviewMode = 'word';
    this.ratings = [];
  }

  getViewType() { return VIEW; }
  getDisplayText() { return '词屿'; }
  getIcon() { return 'languages'; }

  async onOpen() {
    this.contentEl.addClass('ciyu-view-host');
    this.handle = CiyuUI.createCiyuSidebar(this.props(), this.callbacks());
    this.contentEl.appendChild(this.handle.element);
    if (this.plugin.modelUi.connectionStatus === 'disconnected') void this.plugin.modelUi.check();
    void this.plugin.cet6Controller?.syncVaultFiles().catch(() => {});
  }

  async onClose() {
    this.lookupSession.request?.abort();
    this.lookupSession.onUpdate = null;
    this.handle?.destroy();
    this.handle = null;
  }

  show(tab, session) {
    if (session && session !== this.lookupSession) {
      this.lookupSession.request?.abort();
      this.lookupSession.onUpdate = null;
      this.lookupSession = session;
      this.lookupSession.onUpdate = () => this.refresh();
    }
    if (tab === 'review' && this.tab !== 'review') {
      this.reviewCard = null;
      this.revealed = false;
      this.ratings = [];
    }
    this.tab = tab;
    if (tab === 'exams') void this.plugin.cet6Controller?.syncVaultFiles().catch(() => {});
    this.refresh(tab === 'archive' ? ['archive'] : []);
  }

  refresh(panels = []) {
    if (!this.handle) return;
    if (panels.includes('archive') && this.tab === 'archive') void this.loadArchive().catch(reportError);
    this.handle.update(this.props());
  }

  async loadArchive() {
    const reading = {};
    this.archiveReading = reading;
    const markdownLeaves = this.app.workspace.getLeavesOfType('markdown');
    const groups = await Promise.all(this.plugin.archiveFiles().map(async file => {
      const editor = markdownLeaves.map(leaf => leaf.view)
        .find(view => view.file === file && view.getMode() === 'source')?.editor;
      let content;
      try {
        content = editor ? editor.getValue() : await this.app.vault.cachedRead(file);
      } catch {
        return null;
      }
      return {
        date: file.basename, displayLabel: file.basename === localDay() ? '今天 · ' + file.basename : file.basename,
        notePath: file.path, entries: archiveEntries(content, file.path),
      };
    }));
    if (this.archiveReading !== reading || !this.handle) return;
    this.groups = groups.filter(Boolean);
    this.refresh();
  }

  reviewProps(due) {
    const previous = this.reviewCard;
    const card = due.find(item => item.id === previous?.id && item.due === previous.due) || due[0];
    this.reviewCard = card;
    if (previous?.id !== card?.id || previous?.due !== card?.due) this.revealed = false;
    const totalReviewed = this.ratings.length;
    const summary = { totalReviewed, againCount: 0, hardCount: 0, goodCount: 0, easyCount: 0 };
    for (const grade of this.ratings) summary[grade + 'Count']++;
    const next = !card ? this.plugin.cards.reduce((min, item) => Math.min(min, item.due), Infinity) : Infinity;
    const now = Date.now();
    return {
      status: card ? 'active' : totalReviewed ? 'completed' : 'empty',
      mode: this.reviewMode, revealed: this.revealed,
      currentIndex: totalReviewed, totalCount: totalReviewed + due.length,
      summary, nextUpcomingHint: Number.isFinite(next) ? '下次复习：' + reviewTimestamp(next) : '',
      currentCard: card ? (() => {
        const sentence = clozeSentence(card);
        return {
          id: card.id, word: card.term, phonetic: card.pronunciation, partOfSpeech: card.partOfSpeech,
          meaningZh: card.translation, sourceSentence: this.reviewMode === 'cloze' ? sentence?.sentence || '' : card.context || '',
          maskedSentence: sentence?.masked || '', sourceNotePath: card.source,
          sourceNoteTitle: card.source?.split('/').pop(),
          intervals: Object.fromEntries(['again', 'hard', 'good', 'easy'].map(grade => [
            grade, grade === 'again' ? '10 分钟' : reviewDelay(now, scheduleReview(card, grade, now).due),
          ])),
        };
      })() : null,
      isSpeaking: this.plugin.spokenTerm === card?.term && Boolean(this.plugin.spokenTerm),
    };
  }

  props() {
    const due = this.plugin.dueCards();
    const settings = this.plugin.modelUi.props();
    const items = [...this.plugin.cards].sort((a, b) => b.created - a.created).map(card => ({
      id: card.id, word: card.term, phonetic: card.pronunciation, partOfSpeech: card.partOfSpeech,
      meaningZh: card.translation, sourceSentence: card.context, sourceNotePath: card.source,
      sourceNoteTitle: card.source?.split('/').pop(), nextReviewLabel: '下次 ' + reviewTimestamp(card.due),
      dueToday: card.due <= Date.now(), createdAt: new Date(card.created).toISOString(),
      searchableDetails: [...(card.derivatives || []), ...(card.phrases || [])],
      isSpeaking: this.plugin.spokenTerm === card.term,
    }));
    return {
      activeTab: this.tab,
      appVersion: this.plugin.manifest?.version || CiyuUI.CIYU_VERSION,
      dueTodayCount: due.length, connectionStatus: settings.connectionStatus,
      activeModelName: this.plugin.settings.inference?.model || settings.selectedModelId, preferences: settings.preferences,
      lookup: this.lookupSession.props(), vocabulary: { items, searchQuery: this.vocabularyQuery, dueTodayCount: due.length },
      review: this.reviewProps(due), archive: { groups: this.groups },
      dictionaryKey: JSON.stringify(this.plugin.settings.dictionaryPacks),
      cet6IndexAvailable: this.app.vault.getAbstractFileByPath(this.plugin.settings.lastCet6Index) instanceof TFile,
      lastExamAvailable: this.app.vault.getAbstractFileByPath(this.plugin.settings.lastExamNote) instanceof TFile,
      examsAvailable: this.app.vault.getAbstractFileByPath(CET6_EXAM_BANK) instanceof TFile,
      notesKey: JSON.stringify([
        this.plugin.studyFiles().map(file => file.path), this.groups.map(group => group.notePath), this.plugin.noteUndo?.length,
      ]), settings,
      ...(this.plugin.cet6Controller ? {
        examSubView: this.plugin.cet6Controller.subView,
        examBank: this.plugin.cet6Controller.examBankProps(),
        examWorkspace: this.plugin.cet6Controller.examWorkspaceProps(),
        listening: this.plugin.cet6Controller.listeningProps(false),
        mistakes: this.plugin.cet6Controller.mistakesProps(),
      } : {}),
    };
  }

  cardById(id) {
    const card = this.plugin.cards.find(item => item.id === id);
    if (!card) throw new Error('这张生词卡已删除。');
    return card;
  }

  showSaved(entry, source) {
    const session = new LookupSession(this.plugin);
    session.query = entry.term;
    session.target = this.plugin.targetFor(this.plugin.noteView());
    session.setEntry(entry, source);
    this.show('lookup', session);
  }

  callbacks() {
    const openSource = path => safeUi(() => this.plugin.openSource(path));
    const lookup = {};
    for (const [event, original] of Object.entries(this.lookupSession.callbacks())) {
      if (!original) continue;
      lookup[event] = (...args) => this.lookupSession.callbacks(() => this.show('settings'))[event](...args);
    }
    return {
      onTabChange: tab => this.show(tab),
      renderDictionaries: root => manageWordPacks(root, this.plugin),
      renderNotes: root => manageStudyNotes(root, this.plugin),
      onOpenExamBank: () => openSource(CET6_EXAM_BANK),
      onDownloadCet6: () => this.plugin.cet6Controller?.openExamModal('batch_download'),
      onOpenCet6Index: () => openSource(this.plugin.settings.lastCet6Index),
      onImportExams: () => this.plugin.cet6Controller?.openExamModal('import_exam'),
      onOpenLastExam: () => openSource(this.plugin.settings.lastExamNote),
      onToggleLiquidGlass: enabled => safeUi(() => this.plugin.modelUi.setGlass(enabled)),
      ...(this.plugin.cet6Controller ? {
        onExamSubViewChange: subView => {
          const ctrl = this.plugin.cet6Controller;
          ctrl.subView = subView;
          if (subView === 'index') ctrl.workspaceMode = 'index';
          if (subView === 'paper') {
            ctrl.workspaceMode = 'paper';
            void ctrl.ensurePaperLoaded(ctrl.activePaperId);
          }
          if (subView === 'listening') {
            void ctrl.openListeningSelfCheck(ctrl.activePaperId);
            return;
          }
          ctrl.notify();
        },
        examBank: this.plugin.cet6Controller.examBankCallbacks(),
        examWorkspace: this.plugin.cet6Controller.examWorkspaceCallbacks(),
        listening: this.plugin.cet6Controller.listeningCallbacks(false),
        mistakes: this.plugin.cet6Controller.mistakesCallbacks(),
      } : {}),
      lookup,
      vocabulary: {
        onSpeak: term => safeUi(() => this.plugin.speak(term)),
        onSearchChange: query => { this.vocabularyQuery = query; this.refresh(); },
        onOpenQuickImport: () => safeUi(() => this.plugin.vocabImporter.openModal('paste_list')),
        onAutoFillDraft: async word => {
          const hit = await this.plugin.dictionaries?.findAnyPack(word, '');
          if (!hit) return null;
          return {
            phonetic: hit.entry.pronunciation,
            partOfSpeech: hit.entry.partOfSpeech,
            meaningZh: hit.entry.translation.split(/\r?\n/u).filter(Boolean).join('；'),
          };
        },
        onAddItem: async draft => this.plugin.addCard(vocabularyDraft(draft), this.validateSource(draft.sourceNotePath)),
        onEditItem: async (id, draft) => {
          const card = this.cardById(id);
          const source = draft.sourceNotePath === card.source ? card.source : this.validateSource(draft.sourceNotePath);
          await this.plugin.editCard(id, vocabularyDraft(draft, card), source);
        },
        onEditItemDetails: id => safeUi(() => {
          const card = this.cardById(id);
          this.plugin.editEntry(card, entry => this.plugin.editCard(id, entry));
        }),
        onDeleteItem: id => safeUi(() => this.plugin.removeCard(id)),
        onOpenSourceNote: openSource,
        onStartReview: () => this.show('review'),
        onExportAnki: () => safeUi(async () => new Notice('已导出：' + await this.plugin.exportAnki(), 9000)),
        onInspectWord: (word, id) => safeUi(() => {
          const card = id ? this.cardById(id) : this.plugin.cards.find(item => item.term === word);
          if (card) this.showSaved(card, card.source);
        }),
      },
      review: {
        onChangeMode: mode => {
          this.reviewMode = mode;
          this.refresh();
          this.handle.element.querySelector('[data-tab-panel="review"] .ciyu-mode-btn[aria-pressed="true"]')?.focus();
        },
        onReveal: () => {
          this.revealed = true;
          this.refresh();
          this.handle.element.querySelector('[data-tab-panel="review"] [role="toolbar"] button')?.focus();
        },
        onRate: (id, grade) => safeUi(async () => {
          const card = this.reviewCard;
          if (card?.id !== id || !this.revealed || this.ratingPending) return;
          this.ratingPending = true;
          try {
            await this.plugin.rateCard(id, card.due, grade);
            this.ratings.push(grade);
            this.refresh();
            this.handle?.element.querySelector('[data-tab-panel="review"] .ciyu-flashcard .ciyu-btn--primary, [data-tab-panel="review"] .ciyu-state-card button')?.focus();
          } finally {
            this.ratingPending = false;
          }
        }),
        onSpeak: term => safeUi(() => this.plugin.speak(term)),
        onOpenSourceNote: openSource,
        onRestartPractice: () => {
          this.ratings = [];
          this.reviewCard = null;
          this.revealed = false;
          this.refresh();
        },
        onGoToVocabulary: () => this.show('vocabulary'),
      },
      archive: {
        onOpenArchiveNote: (_, path) => openSource(path),
        onSelectEntry: (_, path, id) => {
          const item = this.groups.find(group => group.notePath === path)?.entries.find(entry => entry.id === id);
          if (item?.meaningZh) {
            this.showSaved(entryFields({ ...item.details, term: item.term, translation: item.meaningZh }), path);
            if (path.endsWith('/' + localDay() + '.md')) {
              this.lookupSession.saved = { id: this.lookupSession.id, date: localDay(),
                folder: this.plugin.settings.archiveFolder };
              this.refresh();
            }
          } else {
            openSource(path);
          }
        },
        onJumpToEntryBlock: (item, notePath) => safeUi(() =>
          this.plugin.openArchiveEntry(notePath, item.term, item.blockId, item.line)
        ),
        onUpdateEntryMeta: (notePath, term, patch) => safeUi(async () => {
          await this.plugin.updateArchiveWordMeta(notePath, term, patch);
          await this.loadArchive();
          new Notice(`已更新「${term}」的词根词缀与派生词。`);
        }),
      },
      settings: this.plugin.modelUi.callbacks(),
    };
  }

  validateSource(value) {
    if (!value) return '';
    const file = this.app.vault.getAbstractFileByPath(normalizePath(value));
    if (!(file instanceof TFile) || file.extension !== 'md') throw new Error('找不到来源 Markdown 笔记，请检查路径。');
    return file.path;
  }
}
