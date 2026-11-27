import { el } from '../dom';
import { createIcon } from '../icons';
import type {
  LookupViewCallbacks,
  LookupViewProps,
  UIComponentHandle,
} from '../types';
import { nativeLookupButtons, speechButton, updateSpeechButton } from './LookupTools';
import { createResultCard } from './ResultCard';

/**
 * 视图 1：「查词」侧栏
 * 支持单词、短语或句子主动输入，Enter 查询；完整覆盖空白、加载中、错误重试和成功态。
 */
export function createLookupView(
  initialProps: LookupViewProps,
  callbacks: LookupViewCallbacks = {}
): UIComponentHandle<LookupViewProps> {
  let props = initialProps;
  let resultCardHandle: UIComponentHandle<any> | null = null;

  const root = el('section', 'ciyu-lookup-view');

  // 胶囊搜索框（保持持久 DOM 避免输入失焦）
  const form = el('form', 'ciyu-search-form');
  form.setAttribute('role', 'search');

  const capsule = el('div', 'ciyu-glass ciyu-glass-refract ciyu-search-capsule');

  const searchIcon = createIcon('search', 'md');
  searchIcon.classList.add('ciyu-search-icon');

  const input = el('input', 'ciyu-search-input');
  input.type = 'text';
  input.placeholder = '输入词句，按 Enter 查询…';
  input.maxLength = 1000;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('aria-label', '查词输入框');

  const clearBtn = el('button', 'ciyu-icon-btn');
  clearBtn.type = 'button';
  clearBtn.title = '清空输入';
  clearBtn.setAttribute('aria-label', '清空输入');
  clearBtn.appendChild(createIcon('x', 'sm'));
  clearBtn.addEventListener('click', () => {
    input.value = '';
    callbacks.onClearQuery?.();
    input.focus();
  });

  const enterHint = el('kbd', 'ciyu-kbd ciyu-search-kbd', '↵');
  enterHint.setAttribute('aria-hidden', 'true');

  const submitBtn = el('button', 'ciyu-search-submit');
  submitBtn.type = 'submit';
  submitBtn.title = '按 Enter 查询';
  submitBtn.appendChild(el('span', undefined, '查词'));
  submitBtn.appendChild(createIcon('corner-down-left', 'sm'));

  capsule.append(searchIcon, input, enterHint, clearBtn, submitBtn);
  form.appendChild(capsule);

  input.addEventListener('input', () => {
    const empty = input.value.length === 0;
    clearBtn.hidden = empty;
    enterHint.hidden = !empty;
    callbacks.onQueryChange?.(input.value);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const trimmed = input.value.trim();
    if (trimmed) {
      callbacks.onSearch?.(trimmed);
    }
  });

  const stage = el('div', 'ciyu-lookup-stage');
  stage.setAttribute('aria-live', 'polite');

  const shortcuts = el('div', 'ciyu-quick-picks');
  const readInput = speechButton('', false, () => callbacks.onSpeakQuery?.(input.value.trim()));
  if (callbacks.onSpeakQuery) shortcuts.appendChild(readInput);
  if (callbacks.onTranslateSentence) {
    const sentence = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm', '翻译句子');
    sentence.type = 'button';
    sentence.addEventListener('click', () => callbacks.onTranslateSentence?.(input.value.trim()));
    shortcuts.appendChild(sentence);
  }
  nativeLookupButtons(shortcuts, () => input.value.trim(), callbacks.onNativeLookup);
  const nativeStatus = el('p', 'ciyu-toggle-desc');
  nativeStatus.setAttribute('role', 'status');
  root.append(form, shortcuts, nativeStatus, stage);

  function renderStage(): void {
    if (input.value !== props.query) input.value = props.query;
    clearBtn.hidden = input.value.length === 0;
    enterHint.hidden = input.value.length > 0;
    shortcuts.hidden = !input.value.trim() || props.status === 'success' || shortcuts.children.length === 0;
    if (callbacks.onSpeakQuery) updateSpeechButton(readInput, props.query, Boolean(props.isSpeaking));
    submitBtn.disabled = props.status === 'loading';
    nativeStatus.hidden = !props.nativeError;
    nativeStatus.textContent = props.nativeError || '';
    if (resultCardHandle && props.status === 'success' && props.result) {
      resultCardHandle.update({ entry: props.result, targetNotePath: props.targetNotePath,
        detailsExpanded: props.detailsExpanded, isSpeaking: props.isSpeaking });
      return;
    }
    if (resultCardHandle) {
      resultCardHandle.destroy();
      resultCardHandle = null;
    }
    stage.innerHTML = '';

    if (props.status === 'empty') {
      const card = el('div', 'ciyu-surface ciyu-state-card');
      const iconBox = el('div', 'ciyu-state-icon');
      iconBox.appendChild(createIcon('sparkles', 'lg'));

      card.append(
        iconBox,
        el('h3', 'ciyu-state-title', '随时查词、拆解短语或理解长句'),
        el(
          'p',
          'ciyu-state-desc',
          '单词优先使用离线词库。输入英文整句，按 Enter 或点「翻译句子」。'
        )
      );

      if (props.recentQueries.length > 0) {
        const recentSection = el('div', 'ciyu-recent-section');
        const recentHead = el('div', 'ciyu-recent-head');
        recentHead.appendChild(el('span', 'ciyu-section-label', '最近搜索'));
        if (callbacks.onClearRecentQueries) {
          const clearAllBtn = el('button', 'ciyu-recent-clear-btn', '清空全部');
          clearAllBtn.type = 'button';
          clearAllBtn.setAttribute('aria-label', '清空全部搜索记录');
          clearAllBtn.addEventListener('click', () => callbacks.onClearRecentQueries?.());
          recentHead.appendChild(clearAllBtn);
        }
        recentSection.appendChild(recentHead);

        const chips = el('div', 'ciyu-quick-picks');
        chips.setAttribute('aria-label', '最近搜索记录');
        for (const item of props.recentQueries) {
          const wrap = el('span', 'ciyu-recent-chip-wrap');
          const chip = el('button', 'ciyu-quick-chip', item);
          chip.type = 'button';
          chip.title = item;
          chip.addEventListener('click', () => {
            input.value = item;
            clearBtn.hidden = false;
            enterHint.hidden = true;
            callbacks.onSearch?.(item);
          });
          wrap.appendChild(chip);

          if (callbacks.onRemoveRecentQuery) {
            const delBtn = el('button', 'ciyu-quick-chip-del');
            delBtn.type = 'button';
            delBtn.title = `删除「${item}」`;
            delBtn.setAttribute('aria-label', `删除搜索记录 ${item}`);
            delBtn.appendChild(createIcon('x', 'sm'));
            delBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              callbacks.onRemoveRecentQuery?.(item);
            });
            wrap.appendChild(delBtn);
          }

          chips.appendChild(wrap);
        }
        recentSection.appendChild(chips);
        card.appendChild(recentSection);
      }

      stage.appendChild(card);
      return;
    }

    if (props.status === 'loading') {
      const card = el('div', 'ciyu-surface ciyu-loading-card');
      card.setAttribute('aria-busy', 'true');

      const top = el('div', 'ciyu-loading-header');
      const label = el('span', 'ciyu-loading-label');
      label.append(
        el('span', 'ciyu-spinner'),
        el(
          'span',
          undefined,
          props.checkingDictionary ? '正在查离线词库…' : props.sentenceTranslation ? '正在翻译整句…' : `正在用 ${props.activeModelName ?? '本地模型'} 解析「${props.query || '词条'}」…`
        )
      );

      const cancelBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm', '取消');
      cancelBtn.type = 'button';
      cancelBtn.addEventListener('click', () => callbacks.onCancelSearch?.());

      top.append(label, cancelBtn);

      const line1 = el('div', 'ciyu-skeleton-line ciyu-skeleton-line--lg');
      const line2 = el('div', 'ciyu-skeleton-line ciyu-skeleton-line--md');
      const line3 = el('div', 'ciyu-skeleton-line ciyu-skeleton-line--sm');
      const line4 = el('div', 'ciyu-skeleton-line ciyu-skeleton-line--md');

      card.append(top, line1, line2, line3, line4);
      stage.appendChild(card);
      return;
    }

    if (props.status === 'miss') {
      const card = el('div', 'ciyu-surface ciyu-state-card');
      card.append(el('h3', 'ciyu-state-title', '离线词库未收录'),
        el('p', 'ciyu-state-desc', '可以用上面的桌面词典，或点击下方按钮调用本地 AI。'));
      const actions = el('div', 'ciyu-quick-picks');
      const translate = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm', '用本地 AI 翻译');
      translate.type = 'button';
      translate.addEventListener('click', () => callbacks.onQuickTranslate?.(props.query));
      if (callbacks.onQuickTranslate) actions.appendChild(translate);
      const manual = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm', '手动填写');
      manual.type = 'button';
      manual.addEventListener('click', () => callbacks.onManualEntry?.());
      if (callbacks.onManualEntry) actions.appendChild(manual);
      card.appendChild(actions);
      stage.appendChild(card);
      return;
    }

    if (props.status === 'error') {
      const card = el('div', 'ciyu-surface ciyu-state-card');
      card.setAttribute('role', 'alert');

      const iconBox = el('div', 'ciyu-state-icon ciyu-state-icon--error');
      iconBox.appendChild(createIcon('alert-circle', 'lg'));

      card.append(
        iconBox,
        el('h3', 'ciyu-state-title', props.errorMessage ?? '查词请求未能完成'),
        el(
          'p',
          'ciyu-state-desc',
          props.errorDetail ??
            '未能连接到本地 Ollama 服务，请确认服务已启动或切换可用模型后重试。'
        )
      );

      const actions = el('div', 'ciyu-quick-picks');
      const retryBtn = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm');
      retryBtn.type = 'button';
      retryBtn.append(createIcon('refresh-cw', 'sm'), el('span', undefined, '重试查询'));
      retryBtn.addEventListener('click', () =>
        callbacks.onRetrySearch?.(props.query || input.value.trim())
      );

      const settingsBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm');
      settingsBtn.type = 'button';
      settingsBtn.append(createIcon('sliders', 'sm'), el('span', undefined, '模型设置'));
      settingsBtn.addEventListener('click', () => callbacks.onOpenSettings?.());

      actions.append(retryBtn, settingsBtn);
      if (callbacks.onManualEntry) {
        const manual = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm', '手动填写');
        manual.type = 'button';
        manual.addEventListener('click', () => callbacks.onManualEntry?.());
        actions.appendChild(manual);
      }
      card.appendChild(actions);
      stage.appendChild(card);
      return;
    }

    if (props.status === 'success' && props.result) {
      resultCardHandle = createResultCard(
        {
          entry: props.result,
          targetNotePath: props.targetNotePath,
          detailsExpanded: props.detailsExpanded,
          isSpeaking: props.isSpeaking,
        },
        callbacks
      );
      stage.appendChild(resultCardHandle.element);
    }
  }

  input.value = props.query;
  renderStage();

  return {
    element: root,
    update(nextProps) {
      props = nextProps;
      renderStage();
    },
    destroy() {
      resultCardHandle?.destroy();
      root.remove();
    },
  };
}
