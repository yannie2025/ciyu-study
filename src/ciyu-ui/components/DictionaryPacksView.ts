import { el } from '../dom';
import { createIcon, type IconName } from '../icons';
import type {
  DictionaryPackItem,
  DictionaryPacksViewCallbacks,
  DictionaryPacksViewProps,
  UIComponentHandle,
} from '../types';

type SquircleTone = 'blue' | 'cyan' | 'pink' | 'indigo' | 'purple' | 'orange' | 'green' | 'gray';

const PACK_META: Record<string, { group: 'base' | 'domestic' | 'abroad'; tone: SquircleTone; icon: IconName }> = {
  common: { group: 'base', tone: 'blue', icon: 'database' },
  gk: { group: 'domestic', tone: 'green', icon: 'book-open' },
  cet4: { group: 'domestic', tone: 'cyan', icon: 'book-open' },
  cet6: { group: 'domestic', tone: 'indigo', icon: 'book-open' },
  ky: { group: 'domestic', tone: 'orange', icon: 'sparkles' },
  ielts: { group: 'abroad', tone: 'pink', icon: 'languages' },
  toefl: { group: 'abroad', tone: 'purple', icon: 'languages' },
  gre: { group: 'abroad', tone: 'gray', icon: 'layers' },
};

function createSquircle(icon: IconName, tone: SquircleTone): HTMLSpanElement {
  const badge = el('span', `ciyu-squircle ciyu-squircle--${tone}`);
  badge.setAttribute('aria-hidden', 'true');
  badge.appendChild(createIcon(icon, 'sm'));
  return badge;
}

/**
 * 离线词库管理视图（Apple System Settings Inset Grouped + iOS 27 Layered Squircle 风格）
 */
export function createDictionaryPacksView(
  initialProps: DictionaryPacksViewProps,
  callbacks: DictionaryPacksViewCallbacks = {}
): UIComponentHandle<DictionaryPacksViewProps> {
  let props = initialProps;

  const root = el('section', 'ciyu-dict-packs-view');
  root.setAttribute('aria-label', '离线词库管理');

  function renderPackRow(pack: DictionaryPackItem): HTMLDivElement {
    const metaInfo = PACK_META[pack.id] ?? { group: 'base', tone: 'blue' as SquircleTone, icon: 'book-open' as IconName };
    const row = el('div', 'ciyu-apple-row ciyu-apple-row--with-icon');

    const lead = el('div', 'ciyu-apple-row-lead');
    lead.appendChild(createSquircle(metaInfo.icon, metaInfo.tone));

    const text = el('div', 'ciyu-toggle-text');
    const titleLine = el('div', 'ciyu-paper-info');
    titleLine.appendChild(el('strong', 'ciyu-toggle-title', pack.label));
    if (pack.isPrimary) {
      titleLine.appendChild(el('span', 'ciyu-badge ciyu-badge--ok', '首选'));
    }
    text.append(
      titleLine,
      el(
        'span',
        'ciyu-toggle-desc',
        `${pack.count.toLocaleString('zh-CN')} 词 · ${pack.sourceLabel ?? 'ECDICT 离线包'}`
      )
    );
    lead.appendChild(text);

    const actions = el('div', 'ciyu-toolbar-actions');
    if (pack.enabled && !pack.isPrimary) {
      const primaryBtn = el('button', 'ciyu-mini-btn', '设为首选');
      primaryBtn.type = 'button';
      primaryBtn.addEventListener('click', () => callbacks.onSetPrimary?.(pack.id));
      actions.appendChild(primaryBtn);
    }

    const sw = el('button', 'ciyu-switch');
    sw.type = 'button';
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', String(pack.enabled));
    sw.setAttribute('aria-label', `${pack.enabled ? '停用' : '启用'} ${pack.label}`);
    sw.title = pack.enabled ? '点击停用该离线词库（不影响已收藏生词）' : '点击启用该离线词库';
    sw.addEventListener('click', () => {
      if (pack.enabled) callbacks.onRemovePack?.(pack.id);
      else callbacks.onAddPack?.(pack.id);
    });
    actions.appendChild(sw);

    row.append(lead, actions);
    return row;
  }

  function render(): void {
    root.innerHTML = '';
    const enabledPacks = props.packs.filter((p) => p.enabled);
    const primaryPack = props.packs.find((p) => p.isPrimary);
    const totalActiveCount = enabledPacks.reduce((acc, p) => acc + p.count, 0);

    // 1. 顶部概览卡片
    const hero = el('div', 'ciyu-surface ciyu-dict-hero');
    const heroHead = el('div', 'ciyu-session-head');
    const titleGroup = el('div', 'ciyu-paper-info');
    titleGroup.appendChild(createSquircle('database', 'blue'));
    const textWrap = el('div');
    textWrap.append(
      el('h3', 'ciyu-exam-hero-title', '本地离线词库'),
      el(
        'p',
        'ciyu-exam-hero-sub',
        '基于 MIT 协议 ECDICT 官方词源，离线毫秒级返回音标、中文释义、词形变化与词族拆解。'
      )
    );
    titleGroup.appendChild(textWrap);

    heroHead.append(
      titleGroup,
      el(
        'span',
        enabledPacks.length > 0 ? 'ciyu-badge ciyu-badge--ok' : 'ciyu-badge ciyu-badge--neutral',
        `已启用 ${enabledPacks.length} / ${props.packs.length}`
      )
    );
    hero.appendChild(heroHead);

    const metaStrip = el('div', 'ciyu-next-review-tag');
    metaStrip.textContent = primaryPack
      ? `首选词库：${primaryPack.label} · 已加载约 ${totalActiveCount.toLocaleString('zh-CN')} 词条（未命中时按序检索其余已启用词库）`
      : '请至少启用一套离线词库以获得毫秒级离线查词体验';
    hero.appendChild(metaStrip);
    root.appendChild(hero);

    // 2. Apple Inset Grouped 分组列表
    const sections: Array<{ key: 'base' | 'domestic' | 'abroad'; title: string; footer?: string }> = [
      { key: 'base', title: '基础通用' },
      { key: 'domestic', title: '国内升学与四六级考研' },
      {
        key: 'abroad',
        title: '出国留学考试',
        footer: '所有词库均存储在本地插件目录，启用或停用仅影响查词检索范围，不会修改已收藏的生词本与笔记。',
      },
    ];

    for (const sec of sections) {
      const items = props.packs.filter((p) => (PACK_META[p.id]?.group ?? 'base') === sec.key);
      if (items.length === 0) continue;
      const group = el('section', 'ciyu-apple-group');
      group.appendChild(el('h4', 'ciyu-apple-group-header', sec.title));
      const card = el('div', 'ciyu-surface ciyu-apple-group-card');
      for (const pack of items) {
        card.appendChild(renderPackRow(pack));
      }
      group.appendChild(card);
      if (sec.footer) {
        group.appendChild(el('p', 'ciyu-apple-group-footer', sec.footer));
      }
      root.appendChild(group);
    }
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
