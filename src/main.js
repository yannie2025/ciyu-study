const {
  Plugin, ItemView, Modal, Notice: ObsidianNotice, PluginSettingTab, Setting, FuzzySuggestModal,
  MarkdownView, TFile, TFolder, normalizePath, loadPdfJs, requestUrl,
} = require('obsidian');
const { randomUUID } = require('crypto');

class Notice {
  constructor(message, duration) {
    const ui = typeof CiyuUI !== 'undefined' ? CiyuUI : null;
    if (typeof document !== 'undefined' && document.body && ui?.showCiyuToast) {
      const handle = ui.showCiyuToast(String(message ?? ''), { duration });
      if (handle) {
        this._handle = handle;
        return;
      }
    }
    this._fallback = new ObsidianNotice(message, duration);
  }
  hide() {
    this._handle?.hide();
    this._fallback?.hide?.();
  }
  setMessage(message) {
    this._handle?.setMessage(String(message ?? ''));
    this._fallback?.setMessage?.(message);
    return this;
  }
}

const VIEW = 'ciyu-study';
const MAX_SELECTION = 1000;

module.exports = class CiyuPlugin extends Plugin {
  async onload() {
    this.data = initialData(await this.loadData());
    this.pending = Promise.resolve();
    this.lifecycle = new AbortController();
    this.modelUi = new ModelSettings(this);
    this.dictionaries = new Dictionaries(this);
    this.cet6Controller = new Cet6StudyController(this);
    this.vocabImporter = new VocabImportController(this);
    this.app.workspace.onLayoutReady?.(() => {
      if (this.lifecycle.signal.aborted) return;
      const primary = WORD_PACKS.find(pack => pack.id === this.settings.dictionaryPacks[0]);
      if (primary) void this.dictionaries.load(primary.id).catch(() => {});
      void this.cet6Controller.syncVaultFiles().catch(() => {});
    });
    this.noteUndo = [];
    this.modelCache = new Map();
    this.recentQueries = [];
    this.speechAudioCache = new Map();
    this.speechSeq = 0;
    this.speechAudio = null;
    this.macVoices = null;
    this.registerView(VIEW, leaf => new StudyView(leaf, this));
    this.registerView(CET6_WIDE_VIEW, leaf => new CiyuCet6WorkspaceView(leaf, this));
    this.registerEvent(this.app.workspace.on('editor-menu', (menu, editor, view) => {
      const term = editor.getSelection().trim();
      if (!term) return;
      const context = editorContext(editor);
      menu.addItem(item => item.setTitle('词屿：翻译选中文字').setIcon('languages')
        .onClick(() => this.lookup({ term, context, view })));
      menu.addItem(item => item.setTitle('词屿：一键加入生词本').setIcon('bookmark')
        .onClick(() => this.quickAddSelection({ term, context, view }).catch(reportError)));
    }));
    this.registerEvent(this.app.workspace.on('active-leaf-change', leaf => {
      if (leaf?.view instanceof MarkdownView) this.lastNoteView = leaf.view;
      this.refresh(['lookup']);
    }));
    for (const event of ['create', 'modify', 'delete']) {
      this.registerEvent(this.app.vault.on(event, file => {
        if (file.path.startsWith(this.settings.archiveFolder + '/') || file.path.startsWith(STUDY_NOTES + '/')) this.refresh(['archive']);
        if (file.path.startsWith('词屿/') || (this.settings.cet6CatalogFolder && file.path.startsWith(this.settings.cet6CatalogFolder))) {
          void this.cet6Controller?.syncVaultFiles().catch(() => {});
        }
      }));
    }
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      const prefix = this.settings.archiveFolder + '/';
      if ([file.path, oldPath].some(path => path.startsWith(prefix) || path.startsWith(STUDY_NOTES + '/'))) this.refresh(['archive']);
      if (!this.data.cards.some(card => card.source === oldPath || card.source?.startsWith(oldPath + '/'))) return;
      this.commit(draft => {
        for (const card of draft.cards) {
          if (card.source === oldPath || card.source?.startsWith(oldPath + '/')) {
            card.source = file.path + card.source.slice(oldPath.length);
          }
        }
      }).catch(error => reportError(error));
    }));
    this.addRibbonIcon('languages', '打开词屿', () => this.showStudy('lookup').catch(reportError));
    this.addCommand({
      id: 'lookup', name: '搜词翻译', callback: () => this.lookup({ view: this.noteView() }),
    });
    this.addCommand({
      id: 'translate-selection', name: '翻译选中文字',
      checkCallback: checking => {
        const selected = this.selectionIn(this.noteView());
        if (!selected?.term) return false;
        if (!checking) this.lookup(selected);
        return true;
      },
    });
    this.addCommand({
      id: 'quick-add-selection', name: '快速加入生词本（选中词即收）',
      checkCallback: checking => {
        const selected = this.selectionIn(this.noteView());
        if (!selected?.term) return false;
        if (!checking) void this.quickAddSelection(selected).catch(reportError);
        return true;
      },
    });
    this.addCommand({
      id: 'study', name: '打开生词本', callback: () => this.showStudy('vocabulary').catch(reportError),
    });
    this.addCommand({
      id: 'import-vocabulary', name: '批量导入生词本', callback: async () => {
        await this.showStudy('vocabulary');
        await this.vocabImporter.openModal('paste_list');
      },
    });
    this.addCommand({
      id: 'review', name: '开始今日复习', callback: () => this.showStudy('review').catch(reportError),
    });
    this.addCommand({
      id: 'archive', name: '打开每日归档', callback: () => this.showStudy('archive').catch(reportError),
    });
    this.addCommand({ id: 'undo-note', name: '撤销最近的词屿笔记操作', callback: () => this.undoNote().catch(reportError) });
    this.addCommand({ id: 'open-exams', name: '打开六级题库', callback: () => {
      this.cet6Controller.subView = 'bank';
      return this.showStudy('exams').catch(reportError);
    } });
    this.addCommand({ id: 'open-cet6-listening', name: '启动六级听力自查', callback: async () => {
      await this.showStudy('exams');
      await this.cet6Controller.openListeningSelfCheck();
    } });
    this.addCommand({ id: 'open-cet6-wide-listening', name: '在主阅读区打开六级听力自查（双栏宽屏）', callback: () => {
      return this.openWideCet6Workspace('listening').catch(reportError);
    } });
    this.addCommand({ id: 'open-cet6-mistakes', name: '打开六级错题本', callback: async () => {
      this.cet6Controller.subView = 'mistakes';
      await this.showStudy('exams');
      this.cet6Controller.notify();
    } });
    this.addCommand({ id: 'open-dictionaries', name: '打开词库', callback: () => this.showStudy('dictionaries').catch(reportError) });
    this.addSettingTab(new CiyuSettings(this.app, this));
    this.registerDomEvent(document, 'mouseup', event => {
      window.requestAnimationFrame(() => {
        if (!this.lifecycle.signal.aborted) this.showSelectionButton(event);
      });
    });
    this.registerDomEvent(document, 'dblclick', event => {
      window.requestAnimationFrame(() => {
        if (!this.lifecycle.signal.aborted) this.showSelectionButton(event);
      });
    });
    this.registerDomEvent(document, 'mousedown', event => {
      if (!this.selectionButton?.contains(event.target)) this.removeReadingButton();
    });
    this.registerDomEvent(document, 'keydown', event => {
      if (event.key === 'Escape') this.removeReadingButton();
    });
    this.registerDomEvent(document, 'selectionchange', () => {
      if (!this.selectionButton) return;
      if (this.selectionView) {
        if (this.selectionView.getMode() === 'preview' && !this.selectionIn(this.selectionView)?.term) {
          this.removeReadingButton();
        }
      } else {
        const sel = document.getSelection();
        if (!sel || sel.isCollapsed || !sel.toString().trim()) {
          this.removeReadingButton();
        }
      }
    });
    this.registerInterval(window.setInterval(() => this.refresh(['vocabulary', 'review', 'lookup']), 30_000));
  }

  onunload() {
    this.lifecycle?.abort();
    this.removeReadingButton();
    this.closeSelection();
    this.modelUi?.destroy();
    this.cet6Controller?.destroy();
    this.vocabImporter?.destroy();
    for (const modal of this.entryModals || []) modal.close();
    if (typeof CiyuUI !== 'undefined') CiyuUI?.destroyCiyuToasts?.();
    document.getElementById('ciyu-liquid-glass-defs')?.remove();
    this.app.workspace.detachLeavesOfType(VIEW);
    this.app.workspace.detachLeavesOfType(CET6_WIDE_VIEW);
    this.stopSpeech();
    if (this.speechAudioCache) {
      for (const objectUrl of this.speechAudioCache.values()) {
        try { URL.revokeObjectURL(objectUrl); } catch {}
      }
      this.speechAudioCache.clear();
    }
  }

  get settings() { return this.data.settings; }
  get cards() { return this.data.cards; }

  commit(change, panels = ['vocabulary', 'review', 'lookup']) {
    const operation = this.pending.then(async () => {
      const draft = structuredClone(this.data);
      const result = change(draft);
      await this.saveData(draft);
      this.data = draft;
      this.refresh(panels);
      return result;
    });
    this.pending = operation.catch(() => {});
    return operation;
  }

  refresh(panels) {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW)) {
      leaf.view.refresh?.(panels);
    }
    if (panels.includes('settings')) this.refreshWideCet6Views();
    if (panels.includes('lookup') || panels.includes('settings')) this.selectionPopup?.render();
  }

  refreshWideCet6Views() {
    for (const leaf of this.app.workspace.getLeavesOfType(CET6_WIDE_VIEW) || []) {
      leaf.view.render?.();
    }
  }

  async openWideCet6Workspace(subView = 'listening', paperId) {
    const ctrl = this.cet6Controller;
    if (paperId) ctrl.activePaperId = paperId;
    ctrl.subView = subView;
    if (subView === 'index') ctrl.workspaceMode = 'index';
    if (subView === 'paper') ctrl.workspaceMode = 'paper';

    let leaf = this.app.workspace.getLeavesOfType(CET6_WIDE_VIEW)?.[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf('tab');
      await leaf.setViewState({ type: CET6_WIDE_VIEW, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
    if (subView === 'listening') {
      await ctrl.openListeningSelfCheck(ctrl.activePaperId);
    } else if (subView === 'paper') {
      await ctrl.openPaperReader(ctrl.activePaperId);
    } else {
      ctrl.notify();
    }
    return leaf.view;
  }

  async showStudy(panel, session) {
    this.lastNoteView = this.noteView();
    let leaf = this.app.workspace.getLeavesOfType(VIEW)[0];
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false) || this.app.workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
    if (leaf.loadIfDeferred) await leaf.loadIfDeferred();
    leaf.view.show?.(panel, session);
    if (panel === 'lookup' && (!session || session.status === 'empty')) {
      leaf.view.handle?.element.querySelector('.ciyu-search-input')?.focus();
    }
    return leaf.view;
  }

  noteView() {
    const active = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (active?.file) return active;
    const leaves = this.app.workspace.getLeavesOfType('markdown');
    const recent = this.lastNoteView;
    if (recent?.file && leaves.some(leaf => leaf.view === recent)) return recent;
    const file = this.app.workspace.getActiveFile?.();
    const matching = file && leaves.find(leaf => leaf.view.file === file)?.view;
    return matching || (leaves.length === 1 ? leaves[0].view : null);
  }

  selectionIn(view) {
    if (!view?.file) return null;
    if (view.getMode() === 'source') {
      const editorTerm = view.editor?.getSelection?.().trim() || '';
      if (editorTerm) {
        return { term: editorTerm, context: editorContext(view.editor), view };
      }
      // 实时预览（Live Preview）中选中 Callout、表格、数学块等渲染元素时，editor.getSelection() 可能为空，需回退到 DOM 选区
    }
    const selection = view.containerEl.ownerDocument.getSelection();
    const node = selection?.anchorNode;
    if (!selection || selection.isCollapsed || !node || !view.containerEl.contains(node) || !view.containerEl.contains(selection.focusNode)) {
      return null;
    }
    const term = selection.toString().trim();
    if (!term) return null;
    const container = node.nodeType === 1 ? node : node.parentElement;
    const context = container?.closest('p, li, td, th, blockquote, .callout-content, h1, h2, h3, h4, .cm-line')?.textContent || '';
    return { term, context, view };
  }

  mountSelectionPill(selected, point, view = null) {
    this.removeReadingButton();
    const button = document.body.createDiv({
      cls: 'ciyu-ui ciyu-selection-button',
      attr: { role: 'group' },
    });
    const lookupBtn = button.createEl('button', {
      cls: 'ciyu-selection-pill-action',
      attr: { type: 'button' },
    });
    lookupBtn.append(CiyuUI.createIcon('languages', 'sm'));
    lookupBtn.createSpan({ text: '翻译选中内容' });

    const quickAddBtn = button.createEl('button', {
      cls: 'ciyu-selection-pill-action ciyu-selection-pill-action--add',
      attr: { type: 'button', title: '不打开浮窗，自动查词库并直接加入生词本' },
    });
    quickAddBtn.append(CiyuUI.createIcon('bookmark', 'sm'));
    quickAddBtn.createSpan({ text: '+ 生词' });

    const x = Math.max(8, Math.min(window.innerWidth - 230, (point?.x ?? 24) + 10));
    const y = Math.max(8, Math.min(window.innerHeight - 44, (point?.y ?? 24) + 10));
    button.style.left = x + 'px';
    button.style.top = y + 'px';
    button.addEventListener('mousedown', mouse => mouse.preventDefault());
    button.addEventListener('mouseup', mouse => mouse.stopPropagation());
    lookupBtn.addEventListener('click', () => {
      this.removeReadingButton();
      this.lookup({ ...selected, point: { x, y } });
    });
    quickAddBtn.addEventListener('click', () => {
      this.removeReadingButton();
      void this.quickAddSelection(selected).catch(reportError);
    });
    this.selectionButton = button;
    this.selectionView = view;
  }

  showSelectionPillForProse(term, context, rect) {
    if (this.selectionPopup) {
      this.removeReadingButton();
      return;
    }
    const cleaned = String(term || '').trim();
    if (!cleaned || cleaned.length > MAX_SELECTION) return;
    const point = rect
      ? { x: rect.left, y: rect.bottom }
      : { x: window.innerWidth / 2 - 110, y: window.innerHeight / 3 };
    this._lastProsePillStamp = Date.now();
    this.mountSelectionPill({ term: cleaned, context: context || cleaned, view: null }, point, null);
  }

  showSelectionButton(event) {
    if (event.button !== 0) return;
    if (this.selectionPopup) {
      this.removeReadingButton();
      return;
    }
    const targetEl = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (!targetEl || !targetEl.isConnected) return;
    if (this.selectionButton?.contains(targetEl)) return;
    if (this.selectionPopup?.host?.contains(targetEl)) return;
    if (targetEl.closest('input, textarea, select')) return;

    const doc = targetEl.ownerDocument || document;
    const domSel = doc.getSelection();
    const anchorEl = domSel?.anchorNode
      ? (domSel.anchorNode.nodeType === 1 ? domSel.anchorNode : domSel.anchorNode.parentElement)
      : null;

    // 1. 插件内置听力自查 / 真题阅读区（.ciyu-selectable-prose）划词
    const proseHost = targetEl.closest('.ciyu-selectable-prose') || anchorEl?.closest?.('.ciyu-selectable-prose');
    if (proseHost) {
      const term = domSel && !domSel.isCollapsed ? domSel.toString().trim() : '';
      if (!term || term.length > MAX_SELECTION) {
        this.removeReadingButton();
        return;
      }
      const rect = domSel.rangeCount > 0 ? domSel.getRangeAt(0).getBoundingClientRect() : null;
      const point = rect && rect.width ? { x: rect.left, y: rect.bottom } : { x: event.clientX, y: event.clientY };
      this.mountSelectionPill({ term, context: proseHost.textContent?.trim() || term, view: null }, point, null);
      return;
    }

    // 若刚由组件内 mouseup 弹出了 prose 胶囊（例如拖选结束于元素边缘），不要在紧接着的 rAF 里误清
    if (this.selectionButton && !this.selectionView && Date.now() - (this._lastProsePillStamp || 0) < 120) {
      return;
    }

    this.removeReadingButton();

    // 2. 支持任意 Markdown 视图（含非焦点分屏、实时预览 Callout/表格、源码模式与阅读模式）
    const mdLeaves = this.app.workspace.getLeavesOfType('markdown').map(leaf => leaf.view).filter(Boolean);
    let view = mdLeaves.find(v => v.containerEl?.contains(targetEl))
      || (anchorEl ? mdLeaves.find(v => v.containerEl?.contains(anchorEl)) : null)
      || null;
    if (!view) {
      const active = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (active?.containerEl?.contains(targetEl) || (anchorEl && active?.containerEl?.contains(anchorEl))) {
        view = active;
      }
    }
    if (!view) return;
    if (targetEl.closest('.view-header, .metadata-container, .inline-title')) return;
    const selected = this.selectionIn(view);
    if (!selected?.term) return;
    const rect = domSel && domSel.rangeCount > 0 && !domSel.isCollapsed
      ? domSel.getRangeAt(0).getBoundingClientRect()
      : null;
    const point = rect && rect.width ? { x: rect.left, y: rect.bottom } : { x: event.clientX, y: event.clientY };
    this.mountSelectionPill(selected, point, view);
  }

  removeReadingButton() {
    this.selectionButton?.remove();
    this.selectionButton = null;
    this.selectionView = null;
  }

  lookup(options) {
    this.removeReadingButton();
    if (!options.term) {
      this.showStudy('lookup').catch(reportError);
      return;
    }
    if (options.term.length > MAX_SELECTION) return new Notice('请选取 1000 字符以内的词句。');
    this.closeSelection(false);
    this.selectionPopup = new SelectionPopup(this, options);
    this.selectionPopup.open();
  }

  closeSelection(restoreFocus = true, keepSession = false) {
    const popup = this.selectionPopup;
    this.selectionPopup = null;
    popup?.close(restoreFocus, keepSession);
  }

  editEntry(entry, onSave) {
    const modal = new EntryModal(this.app, entry, onSave, this);
    this.entryModals ??= new Set();
    this.entryModals.add(modal);
    modal.cleanup = () => this.entryModals.delete(modal);
    modal.open();
  }

  targetFor(view) {
    if (!view?.file) return null;
    const file = view.file;
    const editor = view.getMode?.() === 'source' ? view.editor : null;
    return {
      file, view, editor,
      position: editor?.getCursor('to'),
      snapshot: editor?.getValue(),
      source: file.path,
    };
  }

  chooseFile(onChoose) {
    new FilePicker(this.app, onChoose).open();
  }

  async insert(entry, target) {
    const file = target.file;
    if (!(this.app.vault.getAbstractFileByPath(file.path) === file)) {
      throw new Error('目标笔记已移动或删除，请重新选择。');
    }
    const body = '\n\n' + markdownEntry(entry) + '\n';
    const openViews = this.app.workspace.getLeavesOfType('markdown').map(leaf => leaf.view);
    if (target.editor && target.view?.file === file && target.view.getMode() === 'source'
      && target.view.editor === target.editor && openViews.includes(target.view)) {
      const currentVal = target.editor.getValue();
      const snapshotMatches = currentVal === target.snapshot;
      if (!snapshotMatches && !target.pinned) {
        throw new Error('原笔记内容已变化。请重新选择插入笔记以使用当前光标位置。');
      }
      const merged = mergeMarkdownWordEntry(currentVal, entry, '', 3);
      if (merged.matched) {
        if (!merged.changed) {
          target.snapshot = currentVal;
          return 'unchanged';
        }
        const before = currentVal;
        const initialPosition = target.position;
        const fromPos = offsetToLineCh(before, merged.blockStart);
        const toPos = offsetToLineCh(before, merged.blockEnd);
        target.editor.replaceRange(merged.replacementBlock, fromPos, toPos);
        target.snapshot = target.editor.getValue();
        if (target.position && target.editor.posToOffset && target.editor.offsetToPos) {
          const curOffset = target.editor.posToOffset(target.position);
          if (curOffset >= merged.blockEnd) {
            const delta = merged.replacementBlock.length - (merged.blockEnd - merged.blockStart);
            target.position = target.editor.offsetToPos(Math.max(0, curOffset + delta));
          }
        }
        this.noteChange({ file, before, after: target.snapshot, target, initialPosition });
        return 'merged';
      }
      if (!snapshotMatches) {
        // 固定到侧栏后原笔记曾被编辑且尚无该词条：安全追加到文末并刷新快照
        const before = currentVal;
        const last = target.editor.lastLine();
        target.editor.replaceRange(body, { line: last, ch: target.editor.getLine(last).length });
        target.snapshot = target.editor.getValue();
        this.noteChange({ file, before, after: target.snapshot });
        return 'inserted';
      }
      const before = target.snapshot;
      const initialPosition = target.position;
      target.editor.replaceRange(body, target.position);
      target.snapshot = target.editor.getValue();
      this.noteChange({ file, before, after: target.snapshot, target, initialPosition });
      target.position = target.editor.offsetToPos(target.editor.posToOffset(target.position) + body.length);
      return 'inserted';
    }
    const openEditor = openViews.find(view => view.file === file && view.getMode() === 'source')?.editor;
    if (openEditor) {
      const before = openEditor.getValue();
      const merged = mergeMarkdownWordEntry(before, entry, '', 3);
      if (merged.matched) {
        if (!merged.changed) return 'unchanged';
        openEditor.replaceRange(
          merged.replacementBlock,
          offsetToLineCh(before, merged.blockStart),
          offsetToLineCh(before, merged.blockEnd)
        );
        this.noteChange({ file, before, after: openEditor.getValue() });
        return 'merged';
      }
      const last = openEditor.lastLine();
      openEditor.replaceRange(body, { line: last, ch: openEditor.getLine(last).length });
      this.noteChange({ file, before, after: openEditor.getValue() });
      return 'inserted';
    } else {
      const change = { file };
      let status = 'inserted';
      await this.app.vault.process(file, current => {
        const merged = mergeMarkdownWordEntry(current, entry, '', 3);
        if (merged.matched) {
          if (!merged.changed) {
            status = 'unchanged';
            return current;
          }
          status = 'merged';
          change.before = current;
          change.after = merged.content;
          return merged.content;
        }
        change.before = current;
        change.after = current.trimEnd() + body;
        return change.after;
      });
      if (status !== 'unchanged') this.noteChange(change);
      return status;
    }
  }

  noteChange(change) {
    this.noteUndo ??= [];
    this.noteUndo.push(change);
    if (this.noteUndo.length > 15) this.noteUndo.shift();
    this.refresh(['archive']);
  }

  studyFiles() {
    const folder = this.app.vault.getAbstractFileByPath(STUDY_NOTES);
    return folder instanceof TFolder ? folder.children.filter(file => file instanceof TFile && file.extension === 'md') : [];
  }

  async createStudyNote(value) {
    const name = clean(value, 120).replace(/\.md$/iu, '');
    if (!name || name === '.' || name === '..' || /[\\/:*?"<>|#\[\]\p{Cc}]/u.test(name)) {
      throw new Error('请输入有效的笔记名称。');
    }
    await this.ensureFolder(STUDY_NOTES);
    const file = await this.app.vault.create(STUDY_NOTES + '/' + name + '.md', '');
    this.noteChange({ file, created: true, after: '' });
    await this.openSource(file.path);
  }

  async moveStudyNoteToTrash(file) {
    await this.ensureFolder(STUDY_TRASH);
    const target = STUDY_TRASH + '/' + randomUUID().slice(0, 8) + ' ' + file.name;
    await this.app.vault.rename(file, target);
  }

  async removeStudyNote(file) {
    const original = file.path;
    if (!this.studyFiles().includes(file) && !this.archiveFiles().includes(file)) throw new Error('该笔记不属于词屿管理。');
    await this.moveStudyNoteToTrash(file);
    this.noteChange({ file, restorePath: original });
    new Notice('已移到词屿回收站。');
  }

  async undoNote() {
    const action = this.noteUndo?.at(-1);
    if (!action) throw new Error('当前没有可撤销的词屿笔记操作。');
    if (this.undoInProgress) return;
    this.undoInProgress = true;
    try {
      const { file } = action;
      if (this.app.vault.getAbstractFileByPath(file.path) !== file) throw new Error('笔记已移除。');
      if (action.restorePath) {
        if (this.app.vault.getAbstractFileByPath(action.restorePath)) throw new Error('原路径已有同名笔记，请先在回收站手动恢复。');
        await this.app.vault.rename(file, action.restorePath);
      } else {
        const editor = this.app.workspace.getLeavesOfType('markdown').map(leaf => leaf.view)
          .find(view => view.file === file && view.getMode() === 'source')?.editor;
        const verify = current => {
          if (current !== action.after) throw new Error('笔记之后又被编辑过，请使用 Obsidian 的编辑撤销或手动修改。');
        };
        if (action.created) {
          verify(editor ? editor.getValue() : await this.app.vault.read(file));
          await this.moveStudyNoteToTrash(file);
        } else if (editor) {
          verify(editor.getValue());
          editor.replaceRange(action.before, { line: 0, ch: 0 }, editor.offsetToPos(action.after.length));
        } else {
          await this.app.vault.process(file, current => {
            verify(current);
            return action.before;
          });
        }
      }
      if (action.target && action.target.snapshot === action.after) {
        action.target.snapshot = action.before;
        action.target.position = action.initialPosition;
      }
      this.noteUndo.splice(this.noteUndo.indexOf(action), 1);
      this.refresh(['archive', 'lookup']);
      new Notice('已撤销词屿笔记操作。');
    } finally {
      this.undoInProgress = false;
    }
  }

  addCard(entry, source) {
    return this.commit(draft => {
      const key = duplicateKey(entry);
      if (draft.cards.some(card => duplicateKey(card) === key)) {
        throw new Error('生词本中已有同样的原词和释义。');
      }
      const now = Date.now();
      draft.cards.push({
        ...entry, id: randomUUID(), source: source || '', created: now, updated: now,
        due: now, step: -1, reviews: [],
      });
    });
  }

  addCardsBatch(items) {
    return this.commit(draft => {
      const seen = new Set(draft.cards.map(card => duplicateKey(card)));
      let added = 0;
      let skipped = 0;
      const now = Date.now();
      for (const [idx, item] of items.entries()) {
        const entry = entryFields(item.entry || item);
        const source = item.source || '';
        if (!entry.term || !entry.translation) {
          skipped++;
          continue;
        }
        const key = duplicateKey(entry);
        if (seen.has(key)) {
          skipped++;
          continue;
        }
        seen.add(key);
        draft.cards.push({
          ...entry,
          id: randomUUID(),
          source,
          created: now + idx,
          updated: now + idx,
          due: now,
          step: -1,
          reviews: [],
        });
        added++;
      }
      return { added, skipped };
    });
  }

  async quickAddSelection(options) {
    const rawTerm = clean(options?.term || '', MAX_SELECTION);
    if (!rawTerm) throw new Error('请先选中要加入生词本的单词或短语。');
    const context = this.settings.useContext ? clean(options?.context || '', 1200) : '';
    const source = options?.view?.file?.path || this.noteView()?.file?.path || '';

    let entry = null;
    const dictMatch = !isSentenceQuery(rawTerm) ? await this.dictionaries?.findAnyPack(rawTerm, context) : null;
    if (dictMatch) {
      entry = dictMatch.entry;
    } else {
      try {
        const translated = await translateWithModel(
          this.settings,
          rawTerm,
          context,
          undefined,
          false,
          isSentenceQuery(rawTerm)
        );
        entry = entryFields({ ...translated, term: rawTerm, context });
      } catch {
        // 离线未收录且本机 AI 未开启时，直接弹出预填原词与原句语境的编辑框供补充释义
        this.editEntry(entryFields({ term: rawTerm, context }), saved => this.addCard(saved, source));
        return 'manual';
      }
    }

    const key = duplicateKey(entry);
    if (this.cards.some(card => duplicateKey(card) === key)) {
      new Notice(`「${entry.term}」已在生词本中`);
      return 'duplicate';
    }
    await this.addCard(entry, source);
    const shortMeaning = entry.translation.split(/\r?\n/u)[0].slice(0, 36);
    new Notice(`✓ 已加入生词本：${entry.term} — ${shortMeaning}`);
    return 'added';
  }

  editCard(id, entry, source) {
    return this.commit(draft => {
      const index = draft.cards.findIndex(card => card.id === id);
      if (index < 0) throw new Error('这张生词卡已删除。');
      if (draft.cards.some(card => card.id !== id && duplicateKey(card) === duplicateKey(entry))) {
        throw new Error('生词本中已有同样的原词和释义。');
      }
      draft.cards[index] = { ...draft.cards[index], ...entry, updated: Date.now() };
      if (source !== undefined) draft.cards[index].source = source;
    });
  }

  removeCard(id) {
    return this.commit(draft => { draft.cards = draft.cards.filter(card => card.id !== id); });
  }

  rateCard(id, previousDue, grade) {
    return this.commit(draft => {
      const index = draft.cards.findIndex(card => card.id === id);
      const card = draft.cards[index];
      if (!card || card.due !== previousDue || card.due > Date.now()) {
        throw new Error('这张卡片的复习状态已变化。');
      }
      draft.cards[index] = scheduleReview(card, grade);
    });
  }

  dueCards() {
    const now = Date.now();
    return this.cards.filter(card => card.due <= now).sort((a, b) => a.due - b.due);
  }

  async ensureFolder(path) {
    const parts = path.split('/');
    for (let index = 1; index <= parts.length; index++) {
      const location = parts.slice(0, index).join('/');
      const existing = this.app.vault.getAbstractFileByPath(location);
      if (existing instanceof TFolder) continue;
      if (existing) throw new Error(`归档路径被文件占用：${location}`);
      try {
        await this.app.vault.createFolder(location);
      } catch (error) {
        if (!(this.app.vault.getAbstractFileByPath(location) instanceof TFolder)) throw error;
      }
    }
  }

  async archive(entry, source) {
    const folder = this.settings.archiveFolder;
    const date = localDay();
    const path = `${folder}/${date}.md`;
    const sourceFile = source ? this.app.vault.getAbstractFileByPath(source) : null;
    const link = sourceFile instanceof TFile && sourceFile.path !== path
      ? this.app.fileManager.generateMarkdownLink(sourceFile, path) : '';
    const body = '\n' + markdownEntry(entry, link, 2, { archiveBlock: true });
    await this.ensureFolder(folder);
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!file) {
      try {
        const createdText = '# ' + date + ' 词汇\n' + body;
        file = await this.app.vault.create(path, createdText);
        this.noteChange({ file, created: true, after: createdText });
        return path;
      } catch (error) {
        file = this.app.vault.getAbstractFileByPath(path);
        if (!file) throw error;
      }
    }
    if (!(file instanceof TFile)) throw new Error('归档路径不是 Markdown 文件。');
    const editor = this.app.workspace.getLeavesOfType('markdown').map(leaf => leaf.view)
      .find(view => view.file === file && view.getMode() === 'source')?.editor;
    const change = { file };
    if (editor) {
      const before = editor.getValue();
      const merged = mergeMarkdownWordEntry(before, entry, link, 2, { archiveBlock: true });
      if (merged.matched) {
        if (merged.changed) {
          change.before = before;
          editor.replaceRange(
            merged.replacementBlock,
            offsetToLineCh(before, merged.blockStart),
            offsetToLineCh(before, merged.blockEnd)
          );
          change.after = editor.getValue();
          this.noteChange(change);
        }
        return path;
      }
      change.before = before;
      const line = editor.lastLine();
      editor.replaceRange('\n' + body, { line, ch: editor.getLine(line).length });
      change.after = editor.getValue();
    } else {
      let changed = true;
      await this.app.vault.process(file, text => {
        const merged = mergeMarkdownWordEntry(text, entry, link, 2, { archiveBlock: true });
        if (merged.matched) {
          if (!merged.changed) {
            changed = false;
            return text;
          }
          change.before = text;
          change.after = merged.content;
          return merged.content;
        }
        change.before = text;
        change.after = text.trimEnd() + '\n' + body;
        return change.after;
      });
      if (!changed) return path;
    }
    this.noteChange(change);
    return path;
  }

  async findArchivedWord(term) {
    const targetKey = normalizeWordHeadingKey(term);
    if (!targetKey) return null;
    const markdownLeaves = this.app.workspace.getLeavesOfType('markdown') || [];
    const today = localDay();
    for (const file of this.archiveFiles()) {
      const editor = markdownLeaves.map(leaf => leaf.view)
        .find(view => view?.file === file && view.getMode?.() === 'source')?.editor;
      let content = '';
      try {
        content = editor
          ? editor.getValue()
          : this.app.vault.cachedRead
          ? await this.app.vault.cachedRead(file)
          : await this.app.vault.read(file);
      } catch {
        continue;
      }
      const hit = archiveEntries(content, file.path)
        .find(item => normalizeWordHeadingKey(item.term) === targetKey);
      if (hit) {
        return {
          term: hit.term,
          date: file.basename,
          notePath: file.path,
          blockId: hit.blockId || '',
          line: hit.line ?? 0,
          isToday: file.basename === today,
          meaningZh: hit.meaningZh,
          details: hit.details || {},
        };
      }
    }
    return null;
  }

  async updateArchiveWordMeta(notePath, term, patch = {}) {
    const file = this.app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof TFile)) throw new Error('找不到对应的每日归档笔记。');
    const roots = Array.isArray(patch.roots)
      ? patch.roots.map(v => clean(v, 300)).filter(Boolean)
      : clean(patch.roots || '', 1200).split(/[；;\n\r]+/u).map(v => v.trim()).filter(Boolean);
    const derivatives = Array.isArray(patch.derivatives)
      ? patch.derivatives.map(v => clean(v, 300)).filter(Boolean)
      : clean(patch.derivatives || '', 1200).split(/[；;\n\r]+/u).map(v => v.trim()).filter(Boolean);
    const updatePayload = { term, roots, derivatives };
    const options = { archiveBlock: true, replaceFields: ['roots', 'derivatives'] };
    const editor = this.app.workspace.getLeavesOfType('markdown').map(leaf => leaf.view)
      .find(view => view.file === file && view.getMode() === 'source')?.editor;
    const change = { file };
    if (editor) {
      const before = editor.getValue();
      const merged = mergeMarkdownWordEntry(before, updatePayload, '', 2, options);
      if (!merged.matched) throw new Error(`归档笔记中未找到「${term}」词块。`);
      if (merged.changed) {
        change.before = before;
        editor.replaceRange(
          merged.replacementBlock,
          offsetToLineCh(before, merged.blockStart),
          offsetToLineCh(before, merged.blockEnd)
        );
        change.after = editor.getValue();
        this.noteChange(change);
      }
    } else {
      let matched = false;
      let changed = false;
      await this.app.vault.process(file, text => {
        const merged = mergeMarkdownWordEntry(text, updatePayload, '', 2, options);
        if (!merged.matched) return text;
        matched = true;
        if (!merged.changed) return text;
        changed = true;
        change.before = text;
        change.after = merged.content;
        return merged.content;
      });
      if (!matched) throw new Error(`归档笔记中未找到「${term}」词块。`);
      if (changed) this.noteChange(change);
    }

    // 同步更新生词本中的同名词条（若有）
    const targetKey = normalizeWordHeadingKey(term);
    if (this.cards.some(card => normalizeWordHeadingKey(card.term) === targetKey)) {
      await this.commit(draft => {
        for (const card of draft.cards) {
          if (normalizeWordHeadingKey(card.term) === targetKey) {
            card.roots = roots;
            card.derivatives = derivatives;
            card.updated = Date.now();
          }
        }
      }, ['vocabulary', 'lookup']);
    }
    this.refresh(['archive', 'lookup']);
    return { roots, derivatives };
  }

  async openArchiveEntry(notePath, term, blockId = '', line = 0) {
    const file = this.app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof TFile)) throw new Error('该每日归档笔记已删除或不在此库中。');
    const baseTarget = file.path.replace(/\.md$/iu, '');
    if (this.app.workspace.openLinkText && (blockId || term)) {
      const anchor = blockId ? `#^${blockId}` : `#${term}`;
      await this.app.workspace.openLinkText(`${baseTarget}${anchor}`, '', false);
    } else {
      await this.app.workspace.getLeaf(false).openFile(file);
    }
    // 若编辑器已打开，精准将光标滚动到该词条块标题行
    const view = (this.app.workspace.getLeavesOfType('markdown') || [])
      .map(leaf => leaf.view)
      .find(v => v?.file === file && v.getMode?.() === 'source');
    if (view?.editor) {
      let targetLine = Number.isInteger(line) && line >= 0 ? line : 0;
      const content = view.editor.getValue?.() || '';
      const hit = archiveEntries(content, file.path)
        .find(item => normalizeWordHeadingKey(item.term) === normalizeWordHeadingKey(term));
      if (hit && Number.isInteger(hit.line)) targetLine = hit.line;
      const safeLine = Math.max(0, Math.min(view.editor.lastLine?.() ?? targetLine, targetLine));
      view.editor.setCursor?.({ line: safeLine, ch: 0 });
      view.editor.scrollIntoView?.({ from: { line: safeLine, ch: 0 }, to: { line: safeLine + 5, ch: 0 } }, true);
    }
  }

  notifyArchiveWithJump(message, hit) {
    if (typeof document === 'undefined' || !hit?.notePath) {
      new Notice(message, 6000);
      return;
    }
    const frag = document.createDocumentFragment();
    const wrap = document.createElement('div');
    wrap.className = 'ciyu-notice-jump-wrap';
    const textEl = document.createElement('span');
    textEl.textContent = message;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ciyu-notice-jump-btn';
    btn.textContent = `跳转到 ${hit.date} 词块 ↗`;
    let notice;
    btn.addEventListener('click', () => {
      notice?.hide?.();
      void this.openArchiveEntry(hit.notePath, hit.term, hit.blockId, hit.line).catch(reportError);
    });
    wrap.append(textEl, btn);
    frag.appendChild(wrap);
    notice = new Notice(frag, 9000);
  }

  archiveFiles() {
    const folder = this.app.vault.getAbstractFileByPath(this.settings.archiveFolder);
    if (!(folder instanceof TFolder)) return [];
    return folder.children.filter(file => file instanceof TFile && /^\d{4}-\d{2}-\d{2}\.md$/.test(file.name))
      .sort((a, b) => b.basename.localeCompare(a.basename));
  }

  openSource(path) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error('来源笔记已删除或不在此库中。');
    return this.app.workspace.getLeaf(false).openFile(file);
  }

  async exportAnki() {
    if (!this.cards.length) throw new Error('生词本为空。');
    const folder = '词屿/导出';
    await this.ensureFolder(folder);
    const now = new Date();
    const clock = [now.getHours(), now.getMinutes(), now.getSeconds()]
      .map(value => String(value).padStart(2, '0')).join('');
    const path = `${folder}/生词本-${localDay(now)}-${clock}-${randomUUID().slice(0, 6)}.tsv`;
    await this.app.vault.adapter.write(path, ankiTsv(this.cards));
    return path;
  }

  setSpeaking(term) {
    this.spokenTerm = term;
    if (!this.lifecycle?.signal.aborted) this.refresh(['lookup', 'review']);
  }

  stopSpeech() {
    this.speechSeq = (this.speechSeq || 0) + 1;
    const oldAudio = this.speechAudio;
    this.speechAudio = null;
    if (oldAudio) {
      try {
        oldAudio.pause();
        oldAudio.src = '';
      } catch {}
    }
    const oldProc = this.speechProcess;
    this.speechProcess = null;
    oldProc?.kill();
    this.currentUtterance = null;
    if (this.webSpeechUsed) window.speechSynthesis?.cancel();
  }

  speak(value, options = {}) {
    const term = clean(value, MAX_SELECTION);
    if (!term) throw new Error('请先输入或选中要朗读的内容。');
    const stop = this.spokenTerm === term && !options.force;
    this.stopSpeech();
    if (stop) {
      this.setSpeaking('');
      return;
    }
    const seq = this.speechSeq;
    const accent = (options.accent || this.settings?.speechAccent) === 'uk' ? 'uk' : 'us';
    const engine = options.engine || this.settings?.speechEngine || 'human';
    const candidates = engine === 'human' ? speechAudioCandidates(term, accent) : [];

    if (candidates.length > 0 && typeof Audio !== 'undefined' && typeof requestUrl === 'function' && typeof Blob !== 'undefined') {
      this.setSpeaking(term);
      void this.speakHumanAudio(term, accent, candidates, seq);
      return;
    }
    this.speakSystem(term, accent, seq);
  }

  async speakHumanAudio(term, accent, candidates, seq) {
    const cacheKey = `${accent}:${term.toLowerCase()}`;
    this.speechAudioCache ??= new Map();
    let objectUrl = this.speechAudioCache.get(cacheKey) || '';

    if (!objectUrl) {
      for (const candidate of candidates) {
        if (this.speechSeq !== seq || this.lifecycle?.signal.aborted) return;
        try {
          const response = await Promise.race([
            requestUrl({ url: candidate.url, method: 'GET', throw: false }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4500)),
          ]);
          if (this.speechSeq !== seq || this.lifecycle?.signal.aborted) return;
          const headers = response?.headers || {};
          const ctKey = Object.keys(headers).find(k => k.toLowerCase() === 'content-type');
          const contentType = String(ctKey ? headers[ctKey] : '').toLowerCase();
          const buf = response?.arrayBuffer;
          if (response?.status === 200 && buf && buf.byteLength > 256
              && !contentType.includes('json') && !contentType.includes('html') && !contentType.includes('text/')) {
            const blob = new Blob([buf], { type: contentType.includes('audio') ? contentType : 'audio/mpeg' });
            objectUrl = URL.createObjectURL(blob);
            if (this.speechAudioCache.size >= 120) {
              const oldestKey = this.speechAudioCache.keys().next().value;
              const oldestUrl = this.speechAudioCache.get(oldestKey);
              this.speechAudioCache.delete(oldestKey);
              try { URL.revokeObjectURL(oldestUrl); } catch {}
            }
            this.speechAudioCache.set(cacheKey, objectUrl);
            break;
          }
        } catch {}
      }
    }

    if (this.speechSeq !== seq || this.lifecycle?.signal.aborted) return;
    if (!objectUrl) {
      this.speakSystem(term, accent, seq);
      return;
    }

    const audio = new Audio(objectUrl);
    this.speechAudio = audio;
    const finish = () => {
      if (this.speechAudio !== audio) return;
      this.speechAudio = null;
      if (this.speechSeq === seq) this.setSpeaking('');
    };
    audio.addEventListener('ended', finish, { once: true });
    audio.addEventListener('error', () => {
      if (this.speechAudio !== audio) return;
      this.speechAudio = null;
      this.speechAudioCache.delete(cacheKey);
      try { URL.revokeObjectURL(objectUrl); } catch {}
      if (this.speechSeq === seq) this.speakSystem(term, accent, seq);
    }, { once: true });

    try {
      await audio.play();
    } catch (err) {
      if (this.speechAudio !== audio || this.speechSeq !== seq) return;
      const msg = String(err?.message || '');
      if (err?.name === 'AbortError' || /interrupted by a call to pause/iu.test(msg)) {
        finish();
        return;
      }
      this.speechAudio = null;
      this.speakSystem(term, accent, seq);
    }
  }

  availableMacVoices() {
    if (this.macVoices) return this.macVoices;
    try {
      const { execFileSync } = require('child_process');
      const out = execFileSync('/usr/bin/say', ['-v', '?'], { encoding: 'utf8', timeout: 1500 });
      this.macVoices = out.split(/\r?\n/u)
        .map(line => line.match(/^(.+?)\s+[a-z]{2}_[A-Z]{2}\b/u)?.[1]?.trim())
        .filter(Boolean);
    } catch {
      this.macVoices = [];
    }
    return this.macVoices;
  }

  pickMacVoice(term, accent = 'us') {
    const installed = this.availableMacVoices();
    const isHan = /[\p{Script=Han}]/u.test(term);
    const preferred = isHan
      ? ['Tingting (Enhanced)', 'Tingting']
      : accent === 'uk'
      ? ['Jamie (Premium)', 'Serena (Premium)', 'Daniel (Enhanced)', 'Kate (Enhanced)', 'Jamie', 'Serena', 'Daniel']
      : ['Zoe (Premium)', 'Ava (Premium)', 'Allison (Enhanced)', 'Samantha (Enhanced)', 'Nicky', 'Samantha'];
    if (installed.length) {
      const match = preferred.find(name => installed.includes(name));
      if (match) return match;
    }
    return isHan ? 'Tingting' : accent === 'uk' ? 'Daniel' : 'Samantha';
  }

  speakSystem(term, accent = 'us', seq = this.speechSeq) {
    if (this.speechSeq !== seq) return;
    if (process.platform === 'darwin') {
      const voice = this.pickMacVoice(term, accent);
      this.speakOnMac(term, voice);
      return;
    }
    const synth = window.speechSynthesis;
    if (!synth || !window.SpeechSynthesisUtterance) {
      this.setSpeaking('');
      throw new Error('此设备没有可用的系统朗读。');
    }
    const utterance = new SpeechSynthesisUtterance(term);
    utterance.lang = /[\p{Script=Han}]/u.test(term) ? 'zh-CN' : accent === 'uk' ? 'en-GB' : 'en-US';
    const finish = () => {
      if (this.currentUtterance !== utterance) return;
      this.currentUtterance = null;
      this.setSpeaking('');
    };
    utterance.onend = finish;
    utterance.onerror = ({ error }) => {
      finish();
      if (!['interrupted', 'canceled'].includes(error)) new Notice('系统朗读失败，请检查系统语音设置。');
    };
    this.currentUtterance = utterance;
    this.webSpeechUsed = true;
    synth.cancel();
    this.setSpeaking(term);
    synth.speak(utterance);
  }

  speakOnMac(term, voice) {
    const { spawn } = require('child_process');
    const args = voice ? ['-v', voice, '-f', '-'] : ['-f', '-'];
    const child = spawn('/usr/bin/say', args, { stdio: ['pipe', 'ignore', 'ignore'] });
    this.speechProcess = child;
    this.setSpeaking(term);
    child.once('error', () => {
      if (this.speechProcess !== child) return;
      this.speechProcess = null;
      this.setSpeaking('');
      new Notice('无法使用 macOS 系统朗读。');
    });
    child.once('close', code => {
      if (this.speechProcess !== child) return;
      this.speechProcess = null;
      if (code && voice) {
        this.speakOnMac(term);
        return;
      }
      this.setSpeaking('');
      if (code) new Notice('系统朗读失败。');
    });
    child.stdin.on('error', () => {});
    child.stdin.end(term + '\n', 'utf8');
  }

};

function editorContext(editor) {
  const from = editor.getCursor('from').line;
  const to = editor.getCursor('to').line;
  return editor.getRange({ line: from, ch: 0 }, {
    line: Math.min(from + 4, to), ch: editor.getLine(Math.min(from + 4, to)).length,
  });
}

function reportError(error) {
  if (error?.name !== 'AbortError') new Notice(error?.message || '操作失败，请重试。');
}
