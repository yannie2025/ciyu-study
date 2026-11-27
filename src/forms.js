function action(parent, label, callback, options = {}) {
  const cls = options.danger
    ? 'ciyu-btn ciyu-btn--danger ciyu-btn--sm'
    : options.primary
    ? 'ciyu-btn ciyu-btn--primary ciyu-btn--sm'
    : 'ciyu-btn ciyu-btn--secondary ciyu-btn--sm';
  const button = parent.createEl('button', {
    text: label, cls, attr: { type: 'button' },
  });
  if (options.label) button.setAttribute('aria-label', options.label);
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    try {
      await callback();
    } catch (error) {
      reportError(error);
    } finally {
      button.disabled = Boolean(options.disabled);
    }
  });
  button.disabled = Boolean(options.disabled);
  return button;
}

function statusRegion(parent) {
  return parent.createDiv({ cls: 'ciyu-status', attr: { role: 'status', 'aria-live': 'polite' } });
}

class CiyuModal extends Modal {
  onOpen() {
    this.modalEl.addClass('ciyu-ui', 'ciyu-modal');
  }

  onClose() {
    this.contentEl.empty();
    this.cleanup?.();
  }

  heading(label) {
    this.setTitle(label);
  }
}

class EntryModal {
  constructor(app, entry, onSave, plugin) {
    this.app = app;
    this.entry = entry;
    this.onSave = onSave;
    this.plugin = plugin;
  }

  valuesFromEntry(raw = {}) {
    const out = {};
    for (const field of Object.keys(FIELD_LABELS)) {
      const val = raw?.[field];
      out[field] = (Array.isArray(val) ? val.join('\n') : val) || '';
    }
    return out;
  }

  open() {
    if (this.handle) return;
    const props = {
      open: true,
      title: this.entry?.term ? '编辑词条' : '手动添加生词',
      values: this.valuesFromEntry(this.entry),
      busy: false,
    };
    this.handle = CiyuUI.createEntryEditorModal(props, {
      onClose: () => this.close(),
      onSave: async values => {
        const entry = entryFields(values);
        if (!entry.term || !entry.translation) throw new Error('请填写原词和中文释义。');
        await this.onSave(entry);
        this.close();
      },
    });
    if (this.plugin?.settings) {
      CiyuUI.applyGlassPreferences(this.handle.element, appearance(this.plugin.settings));
    }
    document.body.appendChild(this.handle.element);
  }

  close() {
    if (!this.handle) return;
    const current = this.handle;
    this.handle = null;
    current.update({
      open: false,
      title: '',
      values: this.valuesFromEntry({}),
    });
    current.destroy();
    this.cleanup?.();
  }
}

class FilePicker extends FuzzySuggestModal {
  constructor(app, onChoose) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder('搜索要插入的 Markdown 笔记');
  }
  getItems() { return this.app.vault.getMarkdownFiles(); }
  getItemText(file) { return file.path; }
  onChooseItem(file) { this.onChoose(file); }
}
