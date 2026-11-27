function appearance(settings) {
  return {
    liquidGlass: settings.liquidGlass,
    reducedTransparency: settings.reduceTransparency,
    reducedMotion: settings.reducedMotion,
    edgeRefraction: settings.edgeRefraction,
    glassOpacity: typeof settings.glassOpacity === 'number' ? settings.glassOpacity : 68,
    colorTheme: settings.colorTheme || 'system',
    customTheme: {
      ...DEFAULT_SETTINGS.customTheme,
      ...(settings.customTheme || {}),
    },
  };
}

function formatBytes(size) {
  if (!size) return '大小未知';
  return size >= 1_000_000_000
    ? (size / 1_000_000_000).toFixed(1) + ' GB'
    : Math.max(1, Math.round(size / 1_000_000)) + ' MB';
}

function modelName(value) {
  const id = clean(value, 201);
  if (id.length > 200 || !/^[\w][\w./-]*(?::[\w.-]+)?$/u.test(id)) {
    throw new Error('请输入 Ollama 模型名称，例如 qwen2.5:1.5b。');
  }
  if (/(?:[:/-])cloud(?:$|[.-])/iu.test(id)) throw new Error('请选择在本机运行的模型。');
  return id;
}

function localPort(value) {
  const endpoint = new URL(value);
  if (endpoint.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(endpoint.hostname)
      || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash) {
    throw new Error('请使用本机地址，例如 http://127.0.0.1:11434。');
  }
  const port = Number(endpoint.port || '80');
  if (port < 1 || port > 65535) throw new Error('Ollama 端口必须在 1 到 65535 之间。');
  return port;
}

const LIGHT_MODELS = {
  'qwen2.5:0.5b': ['约 398 MB', '更轻量，适合快速释义'],
  'gemma3:1b': ['约 806 MB', '另一款轻量多语言模型'],
};

class ModelSettings {
  constructor(plugin) {
    this.plugin = plugin;
    this.installed = [];
    this.connectionStatus = 'disconnected';
    this.connectionDetail = '请启动 Ollama 后检测连接。';
    this.download = { status: 'idle', progressPercent: 0 };
    this.translationTest = { status: 'idle', sampleText: 'curiosity' };
    this.listeners = new Set();
    this.discovery = { status: 'idle', models: [] };
  }

  props() {
    const settings = this.plugin.settings;
    const ids = new Set([DEFAULT_SETTINGS.model, settings.model, ...Object.keys(LIGHT_MODELS), ...this.installed.map(model => model.id)]);
    const models = [...ids].map(id => {
      const installed = this.installed.find(model => model.id === id);
      return {
        id, name: id, installed: Boolean(installed),
        sizeLabel: installed?.size ? formatBytes(installed.size)
          : id === DEFAULT_SETTINGS.model ? '约 986 MB' : LIGHT_MODELS[id]?.[0] || '大小未知',
        recommendation: id === DEFAULT_SETTINGS.model ? '轻量推荐'
          : installed ? '本地已安装' : LIGHT_MODELS[id]?.[1] || '自选模型',
      };
    });
    return {
      nativeDictionaries: process.platform === 'darwin',
      endpoint: 'http://127.0.0.1:' + settings.port,
      archiveFolder: settings.archiveFolder, useContext: settings.useContext,
      speechEngine: settings.speechEngine || 'human',
      speechAccent: settings.speechAccent || 'us',
      connectionStatus: this.connectionStatus, connectionDetail: this.connectionDetail,
      models, selectedModelId: settings.model, download: this.download, deletingModelId: this.deletingModelId,
      discovery: this.discovery, inference: settings.inference,
      translationTest: this.translationTest, preferences: appearance(settings),
    };
  }

  notify() {
    if (this.plugin.lifecycle.signal.aborted) return;
    this.plugin.refresh(['settings', 'lookup']);
    this.plugin.refreshWideCet6Views?.();
    for (const listener of this.listeners) listener();
  }

  destroy() {
    this.discoveryRequest?.abort();
    this.deleteModal?.close();
    this.deleteRequest?.abort();
    this.checkRequest?.abort();
    this.downloadRequest?.abort();
    this.testRequest?.abort();
    this.listeners.clear();
  }

  async save(key, value, extraPanels = []) {
    await this.plugin.commit(draft => { draft.settings[key] = value; }, extraPanels);
    this.notify();
  }

  async setGlass(enabled) {
    const prevGlass = this.plugin.settings.liquidGlass;
    const prevReduce = this.plugin.settings.reduceTransparency;
    this.plugin.settings.liquidGlass = enabled;
    if (enabled) this.plugin.settings.reduceTransparency = false;
    this.notify();
    try {
      await this.plugin.commit(draft => {
        draft.settings.liquidGlass = enabled;
        if (enabled) draft.settings.reduceTransparency = false;
      }, []);
    } catch (error) {
      this.plugin.settings.liquidGlass = prevGlass;
      this.plugin.settings.reduceTransparency = prevReduce;
      this.notify();
      throw error;
    }
  }

  async setTransparency(reduced) {
    const prevGlass = this.plugin.settings.liquidGlass;
    const prevReduce = this.plugin.settings.reduceTransparency;
    this.plugin.settings.reduceTransparency = reduced;
    if (!reduced) this.plugin.settings.liquidGlass = true;
    this.notify();
    try {
      await this.plugin.commit(draft => {
        draft.settings.reduceTransparency = reduced;
        if (!reduced) draft.settings.liquidGlass = true;
      }, []);
    } catch (error) {
      this.plugin.settings.liquidGlass = prevGlass;
      this.plugin.settings.reduceTransparency = prevReduce;
      this.notify();
      throw error;
    }
  }

  async setEndpoint(value) {
    if (this.deletingModelId) throw new Error('请先等待模型删除完成。');
    let port;
    try {
      port = localPort(value);
    } catch {
      this.connectionDetail = '请使用本机地址，如 http://127.0.0.1:11434。';
      this.notify();
      return;
    }
    if (this.plugin.settings.port !== port) {
      this.checkRequest?.abort();
      this.downloadRequest?.abort();
      this.testRequest?.abort();
      this.installed = [];
      this.connectionStatus = 'disconnected';
      this.download = { status: 'idle', progressPercent: 0 };
      this.translationTest = { status: 'idle', sampleText: this.translationTest.sampleText };
      await this.save('port', port);
    }
    await this.check();
  }

  async check() {
    this.checkRequest?.abort();
    const request = new AbortController();
    this.checkRequest = request;
    this.connectionStatus = 'checking';
    this.connectionDetail = '正在读取本机模型…';
    this.notify();
    try {
      const installed = await modelInventory(this.plugin.settings, request.signal);
      if (request.signal.aborted) return;
      this.installed = installed.filter(model => {
        try { return Boolean(modelName(model.id)); } catch { return false; }
      });
      this.connectionStatus = 'connected';
      this.connectionDetail = '已检测到 ' + this.installed.length + ' 个本地模型。';
    } catch (error) {
      if (request.signal.aborted) return;
      this.connectionStatus = 'error';
      this.connectionDetail = error.message;
    }
    this.notify();
  }

  async downloadModel(value) {
    if (this.download.status === 'downloading' || this.deletingModelId) return;
    const model = modelName(value);
    const request = new AbortController();
    this.downloadRequest = request;
    const settings = { ...this.plugin.settings, model };
    const layers = new Map();
    this.download = { status: 'downloading', modelId: model, progressPercent: 0 };
    this.notify();
    try {
      await pullModel(settings, progress => {
        if (request.signal.aborted) return;
        if (progress.total) layers.set(progress.digest || 'model', {
          total: Number(progress.total), completed: Number(progress.completed) || 0,
        });
        let completed = 0;
        let total = 0;
        for (const layer of layers.values()) {
          completed += layer.completed;
          total += layer.total;
        }
        const next = {
          ...this.download,
          progressPercent: total ? Math.min(99, Math.floor(completed * 100 / total)) : 0,
          downloadedLabel: total ? formatBytes(completed) + ' / ' + formatBytes(total) : '准备下载',
        };
        if (next.progressPercent !== this.download.progressPercent
          || next.downloadedLabel !== this.download.downloadedLabel) {
          this.download = next;
          this.notify();
        }
      }, request.signal);
      if (request.signal.aborted) return;
      this.download = { status: 'completed', modelId: model, progressPercent: 100 };
      this.installed = [...this.installed.filter(item => item.id !== model), { id: model, size: 0 }];
      this.notify();
      await this.check();
    } catch (error) {
      if (request.signal.aborted) return;
      this.download = { status: 'error', modelId: model, progressPercent: 0, errorMessage: error.message };
      this.notify();
    }
  }

  cancelDownload() {
    this.downloadRequest?.abort();
    this.download = { status: 'idle', progressPercent: 0 };
    this.notify();
  }

  confirmDelete(model) {
    if (this.deleteModal || !this.installed.some(item => item.id === model)) return;
    const port = this.plugin.settings.port;
    const modal = new DeleteModelModal(this.plugin.app, model, () => this.deleteModel(model, port));
    this.deleteModal = modal;
    modal.cleanup = () => { this.deleteModal = null; };
    modal.open();
  }

  async deleteModel(value, port) {
    const model = modelName(value);
    if (this.deletingModelId || this.download.status === 'downloading') {
      throw new Error('请等待当前模型操作完成。');
    }
    if (port !== this.plugin.settings.port || !this.installed.some(item => item.id === model)) {
      throw new Error('本机地址或模型列表已变化，请重新选择。');
    }
    this.checkRequest?.abort();
    const request = new AbortController();
    this.deleteRequest = request;
    this.deletingModelId = model;
    this.notify();
    try {
      await removeLocalModel({ port }, model, request.signal);
      if (request.signal.aborted) return;
      this.installed = this.installed.filter(item => item.id !== model);
      if (this.download.modelId === model) this.download = { status: 'idle', progressPercent: 0 };
      if (this.plugin.settings.model === model) {
        this.testRequest?.abort();
        this.translationTest = { status: 'idle', sampleText: this.translationTest.sampleText };
        const replacement = this.installed.find(item => item.id === DEFAULT_SETTINGS.model) || this.installed[0];
        if (replacement) {
          try {
            await this.plugin.commit(draft => {
              if (draft.settings.model === model) draft.settings.model = replacement.id;
            }, []);
          } catch {
            new Notice('模型已删除，切换模型未能保存，请手动选择。');
          }
        }
      }
      await this.check();
      if (!request.signal.aborted) new Notice('已从本机 Ollama 删除 ' + model);
    } finally {
      this.deletingModelId = undefined;
      this.notify();
    }
  }

  async testTranslation() {
    if (this.translationTest.status === 'running') return;
    const request = new AbortController();
    this.testRequest = request;
    const sampleText = this.translationTest.sampleText;
    this.translationTest = { status: 'running', sampleText };
    const started = Date.now();
    this.notify();
    try {
      const entry = await translateWithModel(this.plugin.settings, sampleText, '', request.signal);
      if (request.signal.aborted) return;
      this.translationTest = { status: 'success', sampleText, outputText: entry.translation, latencyMs: Date.now() - started };
      this.connectionStatus = 'connected';
      this.connectionDetail = '本地模型翻译成功。';
    } catch (error) {
      if (request.signal.aborted) return;
      this.translationTest = { status: 'error', sampleText, errorMessage: error.message };
    }
    this.notify();
  }

  async discover() {
    this.discoveryRequest?.abort();
    const request = new AbortController();
    this.discoveryRequest = request;
    this.discovery = { status: 'finding', models: [] };
    this.notify();
    const models = await discoverLocalModels(this.plugin.settings, request.signal);
    if (request.signal.aborted) return;
    this.discovery = { status: 'ready', models };
    this.notify();
  }

  async useDiscovered(item) {
    if (!this.discovery.models.some(model => model.model === item.model
      && model.port === item.port && model.provider === item.provider)) return;
    if (this.deletingModelId || this.download.status === 'downloading') throw new Error('请先等待当前模型操作完成。');
    this.testRequest?.abort();
    this.translationTest = { status: 'idle', sampleText: this.translationTest.sampleText };
    if (item.provider === 'ollama') {
      await this.plugin.commit(draft => {
        draft.settings.model = modelName(item.model);
        draft.settings.port = item.port;
        draft.settings.inference = null;
      }, []);
      await this.check();
    } else {
      await this.save('inference', { provider: 'openai', port: item.port, model: item.model });
    }
    new Notice('已接入 ' + item.model);
  }

  async selectOllama(value) {
    const model = modelName(value);
    this.testRequest?.abort();
    this.translationTest = { status: 'idle', sampleText: this.translationTest.sampleText };
    await this.plugin.commit(draft => {
      draft.settings.model = model;
      draft.settings.inference = null;
    }, []);
    this.notify();
  }

  callbacks() {
    const launch = task => (...args) => Promise.resolve().then(() => task(...args)).catch(reportError);
    return {
      onEndpointChange: launch(value => this.setEndpoint(value)),
      onCheckConnection: launch(() => this.check()),
      onCustomModel: launch(value => this.selectOllama(value)),
      onSelectModel: launch(value => this.selectOllama(value)),
      onDiscoverModels: launch(() => this.discover()),
      onUseDiscovered: launch(item => this.useDiscovered(item)),
      onStartDownload: launch(model => this.downloadModel(model)),
      onCancelDownload: () => this.cancelDownload(),
      onDeleteModel: model => this.confirmDelete(model),
      onRetryDownload: launch(model => this.downloadModel(model)),
      onRunTranslationTest: launch(() => this.testTranslation()),
      onRetryTranslationTest: launch(() => this.testTranslation()),
      onToggleLiquidGlass: launch(enabled => this.setGlass(enabled)),
      onToggleReducedTransparency: launch(enabled => this.setTransparency(enabled)),
      onToggleReducedMotion: launch(enabled => this.save('reducedMotion', enabled)),
      onToggleEdgeRefraction: launch(enabled => this.save('edgeRefraction', enabled)),
      onGlassOpacityChange: launch(pct => {
        const clamped = Math.max(20, Math.min(100, Math.round(Number(pct) || 68)));
        return this.save('glassOpacity', clamped);
      }),
      onSelectColorTheme: launch(themeId => this.save('colorTheme', themeId || 'system')),
      onCustomThemeChange: launch(colors =>
        this.plugin.commit(draft => {
          draft.settings.colorTheme = 'custom';
          draft.settings.customTheme = {
            ...DEFAULT_SETTINGS.customTheme,
            ...(draft.settings.customTheme || {}),
            ...(colors || {}),
          };
        }, []).then(() => this.notify())
      ),
      onContextChange: launch(enabled => this.save('useContext', enabled)),
      onSpeechEngineChange: launch(engine => this.save('speechEngine', engine === 'system' ? 'system' : 'human')),
      onSpeechAccentChange: launch(accent => this.save('speechAccent', accent === 'uk' ? 'uk' : 'us')),
      onPreviewSpeech: launch(sample => this.plugin.speak(sample, { force: true })),
      onArchiveFolderChange: launch(value => {
        if (!value || value.startsWith('/') || value.split('/').some(part => ['.', '..'].includes(part))
            || /[\\:*?"<>|]/u.test(value)) throw new Error('请输入有效的库内相对目录。');
        return this.save('archiveFolder', normalizePath(value), ['archive']);
      }),
    };
  }
}

class DeleteModelModal extends CiyuModal {
  constructor(app, model, onDelete) {
    super(app);
    this.model = model;
    this.onDelete = onDelete;
  }

  onOpen() {
    super.onOpen();
    this.heading('删除本地模型');
    this.contentEl.createEl('p', { text: '确定从本机 Ollama 删除「' + this.model + '」？' });
    this.contentEl.createEl('p', { text: '其他使用此 Ollama 的应用也将无法调用该模型。需要时可以重新下载。' });
    const status = statusRegion(this.contentEl);
    const actions = this.contentEl.createDiv({ cls: 'ciyu-model-actions' });
    const cancel = action(actions, '取消', () => this.close());
    cancel.focus();
    action(actions, '确认删除', async () => {
      cancel.disabled = true;
      status.setText('正在删除模型…');
      try {
        await this.onDelete();
        this.close();
      } catch (error) {
        status.setText(error.message || '删除失败，请重试。');
      } finally {
        cancel.disabled = false;
      }
    }, { danger: true });
  }
}

class CiyuSettings extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    this.hide();
    this.containerEl.empty();
    const root = this.containerEl.createDiv({ cls: 'ciyu-ui ciyu-settings-host' });
    const model = this.plugin.modelUi;
    this.handle = CiyuUI.createSettingsView(model.props(), model.callbacks());
    root.appendChild(this.handle.element);
    CiyuUI.applyGlassPreferences(root, appearance(this.plugin.settings));
    this.listener = () => {
      this.handle.update(model.props());
      CiyuUI.applyGlassPreferences(root, appearance(this.plugin.settings));
    };
    model.listeners.add(this.listener);
    if (model.connectionStatus === 'disconnected') void model.check();
  }

  hide() {
    this.plugin.modelUi.listeners.delete(this.listener);
    this.handle?.destroy();
    this.handle = null;
  }
}
