import { el } from '../dom';
import { createIcon } from '../icons';
import type {
  DictionaryPacksViewCallbacks,
  DictionaryPacksViewProps,
  UIComponentHandle,
} from '../types';

/**
 * 离线词库管理视图（重绘版 · Apple System Settings Inset Grouped 风格）
 */
export function createDictionaryPacksView(
  initialProps: DictionaryPacksViewProps,
  callbacks: DictionaryPacksViewCallbacks = {}
): UIComponentHandle<DictionaryPacksViewProps> {
  let props = initialProps;

  const root = el('section', 'ciyu-dict-packs-view');
  root.setAttribute('aria-label', '离线词库管理');

  function render(): void {
    root.innerHTML = '';
    const enabledPacks = props.packs.filter((p) => p.enabled);
    const primaryPack = props.packs.find((p) => p.isPrimary);

    // 1. 顶部概览卡片
    const hero = el('div', 'ciyu-surface ciyu-dict-hero');
    const heroHead = el('div', 'ciyu-session-head');
    const titleGroup = el('div', 'ciyu-paper-info');
    const iconBadge = el('span', 'ciyu-pack-icon ciyu-pack-icon--accent');
    iconBadge.appendChild(createIcon('database', 'sm'));
    const textWrap = el('div');
    textWrap.append(
      el('h3', 'ciyu-exam-hero-title', '本地离线词库'),
      el(
        'p',
        'ciyu-exam-hero-sub',
        '词屿内置 ECDICT 精简词典，无需联网即可毫秒级返回音标、中文释义与词形变化。'
      )
    );
    titleGroup.append(iconBadge, textWrap);

    heroHead.append(
      titleGroup,
      el(
        'span',
        enabledPacks.length > 0 ? 'ciyu-badge ciyu-badge--ok' : 'ciyu-badge ciyu-badge--neutral',
        `已启用 ${enabledPacks.length} / ${props.packs.length}`
      )
    );
    hero.appendChild(heroHead);

    if (primaryPack) {
      const metaStrip = el('div', 'ciyu-next-review-tag');
      metaStrip.textContent = `当前优先匹配：${primaryPack.label}（未命中时按顺序检索其余已启用词库）`;
      hero.appendChild(metaStrip);
    }
    root.appendChild(hero);

    // 2. 词库分组列表
    const groupCard = el('div', 'ciyu-surface ciyu-inset-group');
    groupCard.appendChild(el('span', 'ciyu-section-label', '内置词典包'));

    const list = el('ul', 'ciyu-inset-list');
    for (const pack of props.packs) {
      const row = el('li', 'ciyu-inset-row');

      const left = el('div', 'ciyu-inset-row-main');
      const packIcon = el(
        'span',
        pack.isPrimary
          ? 'ciyu-pack-icon ciyu-pack-icon--ok'
          : pack.enabled
          ? 'ciyu-pack-icon ciyu-pack-icon--accent'
          : 'ciyu-pack-icon'
      );
      packIcon.appendChild(createIcon('book-open', 'sm'));

      const meta = el('div', 'ciyu-inset-row-text');
      const titleLine = el('div', 'ciyu-paper-info');
      titleLine.appendChild(el('strong', 'ciyu-toggle-title', pack.label));
      if (pack.isPrimary) {
        titleLine.appendChild(el('span', 'ciyu-badge ciyu-badge--ok', '首选匹配'));
      } else if (pack.enabled) {
        titleLine.appendChild(el('span', 'ciyu-badge ciyu-badge--accent', '已启用'));
      }
      meta.append(
        titleLine,
        el(
          'span',
          'ciyu-toggle-desc',
          `${pack.count.toLocaleString('zh-CN')} 个词条 · ${pack.sourceLabel ?? 'ECDICT 离线包'}`
        )
      );
      left.append(packIcon, meta);

      const actions = el('div', 'ciyu-toolbar-actions');
      if (pack.enabled) {
        if (!pack.isPrimary) {
          const primaryBtn = el('button', 'ciyu-mini-btn ciyu-mini-btn--accent', '设为首选');
          primaryBtn.type = 'button';
          primaryBtn.addEventListener('click', () => callbacks.onSetPrimary?.(pack.id));
          actions.appendChild(primaryBtn);
        }
        const removeBtn = el('button', 'ciyu-mini-btn ciyu-mini-btn--danger', '停用');
        removeBtn.type = 'button';
        removeBtn.title = '停用该离线词库（不影响已收藏的生词）';
        removeBtn.addEventListener('click', () => callbacks.onRemovePack?.(pack.id));
        actions.appendChild(removeBtn);
      } else {
        const addBtn = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm');
        addBtn.type = 'button';
        addBtn.append(createIcon('plus', 'sm'), el('span', undefined, '启用'));
        addBtn.addEventListener('click', () => callbacks.onAddPack?.(pack.id));
        actions.appendChild(addBtn);
      }

      row.append(left, actions);
      list.appendChild(row);
    }

    groupCard.appendChild(list);
    root.appendChild(groupCard);
  }

  render();

  return {
    element: root,
    update(nextProps) {
      props = nextProps;
      render();
    },
    destroy() {
      root.remove();
    },
  };
}
