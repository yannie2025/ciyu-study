import { el } from '../dom';
import { createIcon } from '../icons';
import { CIYU_COLOR_THEMES, DEFAULT_CUSTOM_THEME, normalizeHexColor } from '../themes';
import type {
  CiyuCustomThemeColors,
  OllamaConnectionStatus,
  SettingsViewCallbacks,
  SettingsViewProps,
  UIComponentHandle,
} from '../types';

function connectionMeta(status: OllamaConnectionStatus): {
  label: string;
  pillClass: string;
  dotClass: string;
} {
  switch (status) {
    case 'connected':
      return {
        label: '已连接',
        pillClass: 'ciyu-status-pill ciyu-status-pill--ok',
        dotClass: 'ciyu-status-dot ciyu-status-dot--ok',
      };
    case 'checking':
      return {
        label: '检测中…',
        pillClass: 'ciyu-status-pill ciyu-status-pill--warn',
        dotClass: 'ciyu-status-dot ciyu-status-dot--warn',
      };
    case 'disconnected':
      return {
        label: '未连接',
        pillClass: 'ciyu-status-pill ciyu-status-pill--error',
        dotClass: 'ciyu-status-dot ciyu-status-dot--error',
      };
    case 'error':
      return {
        label: '连接异常',
        pillClass: 'ciyu-status-pill ciyu-status-pill--error',
        dotClass: 'ciyu-status-dot ciyu-status-dot--error',
      };
  }
}

/**
 * 视图 6：「模型设置」
 * 包含 Ollama 连接状态、模型选择、下载进度、测试翻译及失败重试，以及透明度与动态效果开关。
 */
export function createSettingsView(
  initialProps: SettingsViewProps,
  callbacks: SettingsViewCallbacks = {}
): UIComponentHandle<SettingsViewProps> {
  let props = initialProps;

  const root = el('section', 'ciyu-settings-view');
  root.setAttribute('aria-label', '模型与外观设置');

  function createToggleRow(options: {
    title: string;
    description: string;
    checked: boolean;
    disabled?: boolean;
    onChange: (next: boolean) => void;
  }): HTMLDivElement {
    const row = el('div', 'ciyu-toggle-row');
    const text = el('div', 'ciyu-toggle-text');
    text.append(
      el('span', 'ciyu-toggle-title', options.title),
      el('span', 'ciyu-toggle-desc', options.description)
    );

    const sw = el('button', 'ciyu-switch');
    sw.type = 'button';
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', String(options.checked));
    sw.setAttribute('aria-label', options.title);
    sw.disabled = Boolean(options.disabled);
    sw.addEventListener('click', () => options.onChange(!options.checked));

    row.append(text, sw);
    return row;
  }

  function render(): void {
    root.innerHTML = '';

    // 卡片 1：Ollama 服务连接状态
    const connCard = el('section', 'ciyu-surface ciyu-settings-card');
    const connTop = el('div', 'ciyu-settings-title-row');
    connTop.appendChild(el('h3', 'ciyu-settings-title', 'Ollama 本地服务'));

    const meta = connectionMeta(props.connectionStatus);
    const pill = el('span', meta.pillClass);
    pill.append(el('span', meta.dotClass), el('span', undefined, meta.label));
    connTop.appendChild(pill);

    const epRow = el('div', 'ciyu-endpoint-row');
    const epInput = el('input', 'ciyu-input');
    epInput.type = 'url';
    epInput.defaultValue = props.endpoint;
    epInput.placeholder = 'http://127.0.0.1:11434';
    epInput.setAttribute('aria-label', 'Ollama 服务地址');

    const checkBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm');
    checkBtn.type = 'button';
    checkBtn.disabled = props.connectionStatus === 'checking' || Boolean(props.deletingModelId);
    checkBtn.append(createIcon('refresh-cw', 'sm'), el('span', undefined, '检测'));
    checkBtn.addEventListener('click', () => {
      if (epInput.value.trim() !== props.endpoint) callbacks.onEndpointChange?.(epInput.value.trim());
      else callbacks.onCheckConnection?.();
    });
    epInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); checkBtn.click(); }
    });

    epRow.append(epInput, checkBtn);
    connCard.append(connTop, epRow);
    const ollamaLink = el('a', 'ciyu-toggle-desc', '下载 Ollama');
    ollamaLink.href = 'https://ollama.com/download';
    ollamaLink.target = '_blank';
    ollamaLink.rel = 'noopener noreferrer';
    connCard.appendChild(ollamaLink);

    if (props.connectionDetail) {
      connCard.appendChild(el('span', 'ciyu-toggle-desc', props.connectionDetail));
    }

    // 卡片 2：模型选择与下载进度
    const modelCard = el('section', 'ciyu-surface ciyu-settings-card');
    const modelTop = el('div', 'ciyu-settings-title-row');
    modelTop.appendChild(el('h3', 'ciyu-settings-title', '翻译与释义模型'));
    modelTop.appendChild(
      el('span', 'ciyu-next-review-tag', 'Ollama：' + props.selectedModelId
        + (props.models.some(model => model.id === props.selectedModelId && model.installed) ? '' : '（未安装）'))
    );

    const modelList = el('ul', 'ciyu-model-list');

    modelList.setAttribute('aria-label', '选择本地模型');

    for (const model of props.models) {
      const selected = model.id === props.selectedModelId && !props.inference;
      const li = el('li', 'ciyu-model-option');
      li.setAttribute('data-selected', String(selected));

      const info = el('div', 'ciyu-model-info');
      info.append(
        el('span', 'ciyu-model-name', model.name),
        el('span', 'ciyu-model-desc', `${model.sizeLabel} · ${model.recommendation}`)
      );

      if (model.installed) {
        const useBtn = el(
          'button',
          selected
            ? 'ciyu-btn ciyu-btn--saved ciyu-btn--sm'
            : 'ciyu-btn ciyu-btn--glass ciyu-btn--sm',
          selected ? '使用中' : '切换'
        );
        useBtn.type = 'button';
        useBtn.setAttribute('aria-pressed', String(selected));
        useBtn.addEventListener('click', () => callbacks.onSelectModel?.(model.id));
        const actions = el('div', 'ciyu-model-actions');
        actions.appendChild(useBtn);
        useBtn.disabled = Boolean(props.deletingModelId);
        if (callbacks.onDeleteModel) {
          const deleting = props.deletingModelId === model.id;
          const remove = el('button', 'ciyu-btn ciyu-btn--danger ciyu-btn--sm', deleting ? '删除中…' : '删除');
          remove.type = 'button';
          remove.setAttribute('aria-label', '删除本地模型 ' + model.name);
          remove.disabled = Boolean(props.deletingModelId) || props.download.status === 'downloading'
            || props.connectionStatus !== 'connected';
          remove.addEventListener('click', () => callbacks.onDeleteModel?.(model.id));
          actions.appendChild(remove);
        }
        li.append(info, actions);
      } else {
        const isDownloadingThis =
          props.download.status === 'downloading' && props.download.modelId === model.id;
        const dlBtn = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm');
        dlBtn.type = 'button';
        dlBtn.disabled = props.download.status === 'downloading' || Boolean(props.deletingModelId);
        dlBtn.append(
          createIcon('download', 'sm'),
          el('span', undefined, isDownloadingThis ? '下载中…' : '下载')
        );
        dlBtn.addEventListener('click', () => callbacks.onStartDownload?.(model.id));
        li.append(info, dlBtn);
      }

      modelList.appendChild(li);
    }

    modelCard.append(modelTop, modelList);
    if (callbacks.onCustomModel) {
      const form = el('form', 'ciyu-endpoint-row');
      const custom = el('input', 'ciyu-input');
      custom.placeholder = '输入本地模型名称';
      custom.setAttribute('aria-label', '本地模型名称');
      custom.required = true;
      custom.maxLength = 200;
      const add = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm', '选择');
      add.type = 'submit';
      form.append(custom, add);
      form.addEventListener('submit', event => {
        event.preventDefault();
        callbacks.onCustomModel?.(custom.value.trim());
      });
      modelCard.appendChild(form);
    }

    // 下载进度面板
    if (props.download.status !== 'idle') {
      const dlBox = el('div', 'ciyu-download-box');
      const dlMeta = el('div', 'ciyu-download-meta');

      if (props.download.status === 'downloading') {
        dlMeta.append(
          el('strong', undefined, `正在拉取 ${props.download.modelId ?? ''}`),
          el('span', undefined, `${props.download.progressPercent}%`)
        );

        const track = el('div', 'ciyu-progress-track');
        track.setAttribute('role', 'progressbar');
        track.setAttribute('aria-valuemin', '0');
        track.setAttribute('aria-valuemax', '100');
        track.setAttribute('aria-valuenow', String(props.download.progressPercent));
        const fill = el('div', 'ciyu-progress-fill');
        fill.style.width = `${props.download.progressPercent}%`;
        track.appendChild(fill);

        const bottom = el('div', 'ciyu-download-meta');
        bottom.appendChild(
          el(
            'span',
            undefined,
            [props.download.downloadedLabel, props.download.speedLabel]
              .filter(Boolean)
              .join(' · ')
          )
        );
        const cancelBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm', '取消');
        cancelBtn.type = 'button';
        cancelBtn.addEventListener('click', () => callbacks.onCancelDownload?.());
        bottom.appendChild(cancelBtn);

        dlBox.append(dlMeta, track, bottom);
      } else if (props.download.status === 'completed') {
        dlMeta.append(
          el('span', undefined, `${props.download.modelId ?? '模型'} 已下载就绪`),
          el('span', 'ciyu-status-pill ciyu-status-pill--ok', '100%')
        );
        dlBox.appendChild(dlMeta);
      } else if (props.download.status === 'error') {
        dlMeta.append(
          el('span', undefined, props.download.errorMessage ?? '模型下载中断'),
          el('span', 'ciyu-status-pill ciyu-status-pill--error', '失败')
        );
        const retryBtn = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm');
        retryBtn.type = 'button';
        retryBtn.append(createIcon('refresh-cw', 'sm'), el('span', undefined, '重试下载'));
        retryBtn.addEventListener('click', () =>
          callbacks.onRetryDownload?.(props.download.modelId ?? props.selectedModelId)
        );
        dlBox.append(dlMeta, retryBtn);
      }

      modelCard.appendChild(dlBox);
    }

    // 卡片 3：测试翻译及失败重试
    const testCard = el('section', 'ciyu-surface ciyu-settings-card');
    const testTop = el('div', 'ciyu-settings-title-row');
    testTop.appendChild(el('h3', 'ciyu-settings-title', '测试翻译'));

    const runBtn = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm');
    runBtn.type = 'button';
    runBtn.disabled = props.translationTest.status === 'running';
    runBtn.append(
      createIcon(props.translationTest.status === 'error' ? 'refresh-cw' : 'sparkles', 'sm'),
      el(
        'span',
        undefined,
        props.translationTest.status === 'running'
          ? '测试中…'
          : props.translationTest.status === 'error'
          ? '重试测试'
          : '运行测试'
      )
    );
    runBtn.addEventListener('click', () => {
      if (props.translationTest.status === 'error') {
        callbacks.onRetryTranslationTest?.();
      } else {
        callbacks.onRunTranslationTest?.();
      }
    });
    testTop.appendChild(runBtn);

    testCard.append(
      testTop,
      el('span', 'ciyu-toggle-desc', `测试句：${props.translationTest.sampleText}`)
    );

    if (props.translationTest.status === 'success' && props.translationTest.outputText) {
      const okBox = el('div', 'ciyu-test-result ciyu-test-result--ok');
      okBox.append(
        el('div', undefined, props.translationTest.outputText),
        el(
          'span',
          'ciyu-next-review-tag',
          `响应正常 · 耗时 ${props.translationTest.latencyMs ?? 420} ms`
        )
      );
      testCard.appendChild(okBox);
    } else if (props.translationTest.status === 'error') {
      const errBox = el('div', 'ciyu-test-result ciyu-test-result--error');
      errBox.setAttribute('role', 'alert');
      errBox.appendChild(
        el(
          'div',
          undefined,
          props.translationTest.errorMessage ??
            '翻译测试超时：请检查本地 Ollama 是否已加载对应模型。'
        )
      );
      testCard.appendChild(errBox);
    }

    // 卡片 3.5：英语朗读与真人发音
    const speechCard = el('section', 'ciyu-surface ciyu-settings-card');
    const speechHead = el('div', 'ciyu-settings-title-row');
    speechHead.appendChild(el('h3', 'ciyu-settings-title', '英语朗读与真人发音'));
    speechCard.appendChild(speechHead);

    const speechEngine = props.speechEngine ?? 'human';
    const speechAccent = props.speechAccent ?? 'us';

    const engineRow = el('div', 'ciyu-toggle-row');
    const engineMeta = el('div', 'ciyu-toggle-meta');
    engineMeta.append(
      el('span', 'ciyu-toggle-title', '朗读发音来源'),
      el(
        'span',
        'ciyu-toggle-desc',
        speechEngine === 'human'
          ? '单词/短语优先有道真人录音并自动缓存，整句优先自然语音，离线自动回退本机语音'
          : '仅使用系统离线朗读（macOS 自动优选已安装的高级/增强音色）'
      )
    );
    const engineBtns = el('div', 'ciyu-card-actions');
    for (const opt of [
      { id: 'human' as const, label: '真人优先' },
      { id: 'system' as const, label: '纯系统离线' },
    ]) {
      const btn = el(
        'button',
        speechEngine === opt.id ? 'ciyu-btn ciyu-btn--primary ciyu-btn--sm' : 'ciyu-btn ciyu-btn--glass ciyu-btn--sm',
        opt.label
      );
      btn.type = 'button';
      btn.setAttribute('aria-pressed', String(speechEngine === opt.id));
      btn.addEventListener('click', () => callbacks.onSpeechEngineChange?.(opt.id));
      engineBtns.appendChild(btn);
    }
    engineRow.append(engineMeta, engineBtns);

    const accentRow = el('div', 'ciyu-toggle-row');
    const accentMeta = el('div', 'ciyu-toggle-meta');
    accentMeta.append(
      el('span', 'ciyu-toggle-title', '默认英语口音'),
      el('span', 'ciyu-toggle-desc', '查词卡片、划词浮窗、生词本与复习发音同步生效')
    );
    const accentBtns = el('div', 'ciyu-card-actions');
    for (const opt of [
      { id: 'us' as const, label: '美音 (US)' },
      { id: 'uk' as const, label: '英音 (UK)' },
    ]) {
      const btn = el(
        'button',
        speechAccent === opt.id ? 'ciyu-btn ciyu-btn--primary ciyu-btn--sm' : 'ciyu-btn ciyu-btn--glass ciyu-btn--sm',
        opt.label
      );
      btn.type = 'button';
      btn.setAttribute('aria-pressed', String(speechAccent === opt.id));
      btn.addEventListener('click', () => callbacks.onSpeechAccentChange?.(opt.id));
      accentBtns.appendChild(btn);
    }
    accentRow.append(accentMeta, accentBtns);

    const previewRow = el('div', 'ciyu-card-actions');
    const previewWordBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm');
    previewWordBtn.type = 'button';
    previewWordBtn.append(createIcon('volume-2', 'sm'), el('span', undefined, '试听单词 (resilience)'));
    previewWordBtn.addEventListener('click', () => callbacks.onPreviewSpeech?.('resilience'));

    const previewSentBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm');
    previewSentBtn.type = 'button';
    previewSentBtn.append(createIcon('volume-2', 'sm'), el('span', undefined, '试听英文整句'));
    previewSentBtn.addEventListener('click', () =>
      callbacks.onPreviewSpeech?.('They have helped boost the local economy.')
    );
    previewRow.append(previewWordBtn, previewSentBtn);

    speechCard.append(engineRow, accentRow, previewRow);

    // 卡片 4：主题配色与自定义（MIT 开源配色预设 + 4 色自由调色）
    const themeCard = el('section', 'ciyu-surface ciyu-settings-card');
    const themeHead = el('div', 'ciyu-settings-title-row');
    themeHead.append(
      el('h3', 'ciyu-settings-title', '主题配色与自定义'),
      el('span', 'ciyu-count-pill', 'MIT 开源色板 + 自定义')
    );
    themeCard.append(
      themeHead,
      el(
        'p',
        'ciyu-toggle-desc',
        '除系统黑白默认外，内置 Catppuccin、Nord、Rosé Pine、Everforest、Solarized 开源配色，并支持自由调色实时预览。'
      )
    );

    const activeThemeId = props.preferences.colorTheme ?? 'system';
    const currentCustom: CiyuCustomThemeColors = {
      ...DEFAULT_CUSTOM_THEME,
      ...(props.preferences.customTheme || {}),
    };

    const themeGrid = el('div', 'ciyu-theme-grid');
    for (const preset of CIYU_COLOR_THEMES) {
      const isSelected = activeThemeId === preset.id;
      const swatchBtn = el(
        'button',
        isSelected ? 'ciyu-theme-swatch ciyu-theme-swatch--active' : 'ciyu-theme-swatch'
      );
      swatchBtn.type = 'button';
      swatchBtn.setAttribute('aria-pressed', String(isSelected));
      swatchBtn.title = preset.source ? `${preset.name}（${preset.source}）` : preset.name;

      const dots = el('span', 'ciyu-theme-dots');
      const previewColors =
        preset.id === 'system'
          ? ['#f2f2f7', '#1c1c1e', '#007aff']
          : preset.id === 'custom'
            ? [currentCustom.canvasBg, currentCustom.surfaceBg, currentCustom.accent]
            : [preset.colors!.canvasBg, preset.colors!.surfaceBg, preset.colors!.accent];
      for (const hex of previewColors) {
        const dot = el('span', 'ciyu-theme-dot');
        dot.style.backgroundColor = hex;
        dots.appendChild(dot);
      }

      const meta = el('span', 'ciyu-theme-meta');
      meta.append(
        el('span', 'ciyu-theme-name', preset.name),
        el('span', 'ciyu-theme-tag', preset.tag)
      );

      swatchBtn.append(dots, meta);
      swatchBtn.addEventListener('click', () => {
        callbacks.onSelectColorTheme?.(preset.id);
      });
      themeGrid.appendChild(swatchBtn);
    }
    themeCard.appendChild(themeGrid);

    // 若当前选中了某个开源预设，提供一键复制为自定义微调的快捷按钮
    const activePreset = CIYU_COLOR_THEMES.find((t) => t.id === activeThemeId);
    if (activePreset?.colors && activeThemeId !== 'custom') {
      const forkRow = el('div', 'ciyu-theme-actions');
      const forkBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm', `以「${activePreset.name}」为基础自定义微调`);
      forkBtn.type = 'button';
      forkBtn.addEventListener('click', () => {
        callbacks.onCustomThemeChange?.({ ...activePreset.colors! });
      });
      const resetSysBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm', '恢复黑白默认');
      resetSysBtn.type = 'button';
      resetSysBtn.addEventListener('click', () => callbacks.onSelectColorTheme?.('system'));
      forkRow.append(forkBtn, resetSysBtn);
      themeCard.appendChild(forkRow);
    }

    // 自定义取色器面板（选中「自定义配色」时展开）
    if (activeThemeId === 'custom') {
      const customBox = el('div', 'ciyu-custom-theme-box');
      const fields: Array<{ key: keyof CiyuCustomThemeColors; label: string; desc: string }> = [
        { key: 'accent', label: '主题强调色', desc: '按钮、进度条、选中态与高亮色' },
        { key: 'canvasBg', label: '背景底色', desc: '主面板与工作区画布背景' },
        { key: 'surfaceBg', label: '卡片表面色', desc: '卡片、浮窗与输入框底色' },
        { key: 'textPrimary', label: '正文文字色', desc: '主文字颜色（次级文字自动推算）' },
      ];

      for (const f of fields) {
        const row = el('div', 'ciyu-color-picker-row');
        const info = el('div', 'ciyu-color-picker-info');
        info.append(
          el('strong', 'ciyu-toggle-title', f.label),
          el('span', 'ciyu-toggle-desc', f.desc)
        );
        const controls = el('div', 'ciyu-color-picker-controls');
        const currentVal = normalizeHexColor(currentCustom[f.key], DEFAULT_CUSTOM_THEME[f.key]);

        const colorInput = el('input', 'ciyu-color-input');
        colorInput.type = 'color';
        colorInput.value = currentVal;
        colorInput.setAttribute('aria-label', `${f.label}取色器`);

        const hexInput = el('input', 'ciyu-input ciyu-hex-input');
        hexInput.type = 'text';
        hexInput.defaultValue = currentVal;
        hexInput.value = currentVal;
        hexInput.maxLength = 7;
        hexInput.setAttribute('aria-label', `${f.label}色值`);

        const commitColor = (nextHex: string) => {
          const safe = normalizeHexColor(nextHex, currentVal);
          if (safe === currentVal) return;
          callbacks.onCustomThemeChange?.({
            ...currentCustom,
            [f.key]: safe,
          });
        };

        colorInput.addEventListener('change', () => {
          hexInput.value = colorInput.value;
          commitColor(colorInput.value);
        });
        hexInput.addEventListener('change', () => {
          const val = hexInput.value.trim();
          if (/^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(val)) {
            const normalized = normalizeHexColor(val.startsWith('#') ? val : `#${val}`, currentVal);
            hexInput.value = normalized;
            colorInput.value = normalized;
            commitColor(normalized);
          } else {
            hexInput.value = currentVal;
          }
        });

        controls.append(colorInput, hexInput);
        row.append(info, controls);
        customBox.appendChild(row);
      }

      const customActions = el('div', 'ciyu-theme-actions');
      const resetCustomBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm', '重置自定义色值');
      resetCustomBtn.type = 'button';
      resetCustomBtn.addEventListener('click', () =>
        callbacks.onCustomThemeChange?.({ ...DEFAULT_CUSTOM_THEME })
      );
      const backSysBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm', '切回系统黑白默认');
      backSysBtn.type = 'button';
      backSysBtn.addEventListener('click', () => callbacks.onSelectColorTheme?.('system'));
      customActions.append(resetCustomBtn, backSysBtn);
      customBox.appendChild(customActions);
      themeCard.appendChild(customBox);
    }

    // 卡片 5：界面材质与无障碍（含一键 Liquid Glass 开关与透明度开关）
    const prefCard = el('section', 'ciyu-surface ciyu-settings-card');
    prefCard.appendChild(el('h3', 'ciyu-settings-title', '外观与 Liquid Glass'));

    const glassActive =
      props.preferences.liquidGlass && !props.preferences.reducedTransparency;
    const glassOpacity =
      typeof props.preferences.glassOpacity === 'number'
        ? Math.max(20, Math.min(100, Math.round(props.preferences.glassOpacity)))
        : 68;

    const opacityRow = el('div', 'ciyu-slider-row');
    if (!glassActive) opacityRow.classList.add('ciyu-slider-row--disabled');
    const opacityHead = el('div', 'ciyu-slider-head');
    const opacityMeta = el('div', 'ciyu-color-picker-info');
    opacityMeta.append(
      el('strong', 'ciyu-toggle-title', '玻璃不透明度'),
      el('span', 'ciyu-toggle-desc', '自由调节液态玻璃与阅读卡片的透底程度（数值越低越通透）')
    );
    const opacityValueBadge = el('span', 'ciyu-count-pill', `${glassOpacity}%`);
    opacityHead.append(opacityMeta, opacityValueBadge);

    const opacitySlider = el('input', 'ciyu-opacity-slider');
    opacitySlider.type = 'range';
    opacitySlider.min = '20';
    opacitySlider.max = '100';
    opacitySlider.step = '2';
    opacitySlider.defaultValue = String(glassOpacity);
    opacitySlider.value = String(glassOpacity);
    opacitySlider.disabled = !glassActive;
    opacitySlider.setAttribute('aria-label', '玻璃不透明度');

    const applyLivePreview = (pct: number) => {
      opacityValueBadge.textContent = `${pct}%`;
      const host = root.closest<HTMLElement>('.ciyu-ui');
      if (host && glassActive) {
        const elevatedPct = Math.min(98, pct + 12);
        const readingPct = Math.min(98, pct + 18);
        const stickyPct = Math.min(98, Math.max(76, pct + 24));
        const blurPx = Math.round(8 + ((100 - pct) / 80) * 12);
        host.style.setProperty('--ciyu-glass-bg', `color-mix(in srgb, var(--ciyu-reading-bg-solid) ${pct}%, transparent)`);
        host.style.setProperty('--ciyu-glass-bg-elevated', `color-mix(in srgb, var(--ciyu-reading-bg-solid) ${elevatedPct}%, transparent)`);
        host.style.setProperty('--ciyu-reading-bg', `color-mix(in srgb, var(--ciyu-reading-bg-solid) ${readingPct}%, transparent)`);
        host.style.setProperty('--ciyu-sticky-bg', `color-mix(in srgb, var(--ciyu-reading-bg-solid) ${stickyPct}%, transparent)`);
        host.style.setProperty('--ciyu-glass-blur', `${blurPx}px`);
      }
    };

    opacitySlider.addEventListener('input', () => {
      applyLivePreview(Number(opacitySlider.value));
    });
    opacitySlider.addEventListener('change', () => {
      callbacks.onGlassOpacityChange?.(Number(opacitySlider.value));
    });

    const quickRow = el('div', 'ciyu-theme-actions');
    const presets = [
      { label: '极透 36%', val: 36 },
      { label: '标准 68%', val: 68 },
      { label: '柔和 88%', val: 88 },
    ];
    for (const p of presets) {
      const qBtn = el(
        'button',
        glassOpacity === p.val ? 'ciyu-mini-btn ciyu-mini-btn--accent' : 'ciyu-mini-btn',
        p.label
      );
      qBtn.type = 'button';
      qBtn.disabled = !glassActive;
      qBtn.addEventListener('click', () => {
        opacitySlider.value = String(p.val);
        applyLivePreview(p.val);
        callbacks.onGlassOpacityChange?.(p.val);
      });
      quickRow.appendChild(qBtn);
    }
    opacityRow.append(opacityHead, opacitySlider, quickRow);

    prefCard.append(
      createToggleRow({
        title: 'Liquid Glass 清透材质',
        description: '一键开启或关闭全界面液态玻璃、磨砂透底与高光边',
        checked: glassActive,
        onChange: (next) => callbacks.onToggleLiquidGlass?.(next),
      }),
      opacityRow,
      createToggleRow({
        title: '降低透明度（纯色模式）',
        description: '关闭半透明与折射，切换为高对比 Apple 设置实色表面',
        checked: props.preferences.reducedTransparency || !props.preferences.liquidGlass,
        onChange: (next) => callbacks.onToggleReducedTransparency?.(next),
      }),
      createToggleRow({
        title: '边缘微折射效果',
        description: '在液态玻璃壳层边缘叠加轻微光学折射高光',
        checked: props.preferences.edgeRefraction && glassActive,
        disabled: !glassActive,
        onChange: (next) => callbacks.onToggleEdgeRefraction?.(next),
      }),
      createToggleRow({
        title: '减少动态效果',
        description: '关闭骨架闪烁与微交互过渡，适配系统无障碍偏好',
        checked: props.preferences.reducedMotion,
        onChange: (next) => callbacks.onToggleReducedMotion?.(next),
      })
    );

    if (props.nativeDictionaries) {
      const dictionaries = el('section', 'ciyu-surface ciyu-settings-card');
      const link = el('a', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm', 'Easydict 官方发布');
      link.href = 'https://github.com/tisfeng/Easydict/releases';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      dictionaries.append(el('h3', 'ciyu-settings-title', 'macOS 桌面词典'),
        el('p', 'ciyu-toggle-desc', '可直接交给系统词典、有道桌面或已安装的 Easydict。'),
        link);
      root.appendChild(dictionaries);
    }
    root.append(connCard);
    if (props.discovery && callbacks.onDiscoverModels) {
      const searchCard = el('section', 'ciyu-surface ciyu-settings-card');
      searchCard.appendChild(el('h3', 'ciyu-settings-title', '自动发现本机模型'));
      const search = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm',
        props.discovery.status === 'finding' ? '检测中…' : '搜索本机模型');
      search.type = 'button';
      search.disabled = props.discovery.status === 'finding';
      search.addEventListener('click', () => callbacks.onDiscoverModels?.());
      searchCard.append(search, el('p', 'ciyu-toggle-desc', props.inference
        ? '当前使用：' + props.inference.model
        : '检测 Ollama、LM Studio 和常见本机兼容端口。'));
      if (props.discovery.status === 'ready' && !props.discovery.models.length) {
        searchCard.appendChild(el('p', 'ciyu-toggle-desc', '未发现可用的本机模型。请先启动本地服务。'));
      }
      for (const item of props.discovery.models) {
        const row = el('div', 'ciyu-model-option');
        const info = el('div', 'ciyu-model-info');
        info.append(el('strong', 'ciyu-model-name', item.model),
          el('span', 'ciyu-toggle-desc', item.label + ' · ' + item.port));
        const use = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm', '接入');
        use.type = 'button';
        use.addEventListener('click', () => callbacks.onUseDiscovered?.(item));
        row.append(info, use);
        searchCard.appendChild(row);
      }
      root.appendChild(searchCard);
    }
    root.append(speechCard, themeCard, prefCard, modelCard, testCard);
    if (props.archiveFolder !== undefined) {
      const vaultCard = el('section', 'ciyu-surface ciyu-settings-card');
      vaultCard.appendChild(el('h3', 'ciyu-settings-title', '笔记与归档'));
      const form = el('form', 'ciyu-endpoint-row');
      const folder = el('input', 'ciyu-input');
      folder.defaultValue = props.archiveFolder;
      folder.setAttribute('aria-label', '每日归档目录');
      folder.required = true;
      const save = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm', '保存目录');
      save.type = 'submit';
      form.append(folder, save);
      form.addEventListener('submit', event => {
        event.preventDefault();
        callbacks.onArchiveFolderChange?.(folder.value.trim());
      });
      vaultCard.append(form, createToggleRow({
        title: '划词使用附近上下文',
        description: '将选区附近的文字用于本地释义。',
        checked: Boolean(props.useContext),
        onChange: next => callbacks.onContextChange?.(next),
      }));
      root.appendChild(vaultCard);
    }
  }

  render();

  return {
    element: root,
    update(nextProps) {
      const focused = root.ownerDocument.activeElement;
      const inputs = Array.from(root.querySelectorAll('input'));
      const edited = inputs.filter(input => input.value !== input.defaultValue)
        .map(input => [input.getAttribute('aria-label'), input.value] as const);
      const focusLabel = root.contains(focused) ? focused?.getAttribute('aria-label') : null;
      const old = props;
      props = nextProps;
      render();
      for (const input of root.querySelectorAll('input')) {
        const label = input.getAttribute('aria-label');
        if ((label !== 'Ollama 服务地址' || old.endpoint === props.endpoint)
          && (label !== '每日归档目录' || old.archiveFolder === props.archiveFolder)
          && (label !== '本地模型名称' || old.selectedModelId === props.selectedModelId)) {
          const editedInput = edited.find(item => item[0] === label);
          if (editedInput) input.value = editedInput[1];
        }
        if (focusLabel && label === focusLabel) input.focus();
      }
      if (focusLabel) Array.from(root.querySelectorAll('button')).find(button =>
        button.getAttribute('aria-label') === focusLabel)?.focus();
    },
    destroy() {
      root.remove();
    },
  };
}
