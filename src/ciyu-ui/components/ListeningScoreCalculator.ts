import { el } from '../dom';
import { createIcon } from '../icons';
import { showCiyuToast } from '../toast';
import { attachLiquidLens } from './LiquidSegmented';

export type ListeningExamLevel = 'cet6' | 'cet4';

interface SectionBlueprint {
  code: 'A' | 'B' | 'C';
  title: string;
  weight: number;
  groups: ReadonlyArray<{ label: string; numbers: number[] }>;
}

const BLUEPRINTS: Record<ListeningExamLevel, ReadonlyArray<SectionBlueprint>> = {
  cet6: [
    {
      code: 'A',
      title: 'Section A · 长对话',
      weight: 7.1,
      groups: [
        { label: '对话 1', numbers: [1, 2, 3, 4] },
        { label: '对话 2', numbers: [5, 6, 7, 8] },
      ],
    },
    {
      code: 'B',
      title: 'Section B · 短文理解',
      weight: 7.1,
      groups: [
        { label: '短文 1', numbers: [9, 10, 11] },
        { label: '短文 2', numbers: [12, 13, 14, 15] },
      ],
    },
    {
      code: 'C',
      title: 'Section C · 讲座或讲话（双倍权重）',
      weight: 14.2,
      groups: [
        { label: '讲座 1', numbers: [16, 17, 18] },
        { label: '讲座 2', numbers: [19, 20, 21] },
        { label: '讲座 3', numbers: [22, 23, 24, 25] },
      ],
    },
  ],
  cet4: [
    {
      code: 'A',
      title: 'Section A · 短篇新闻',
      weight: 7.1,
      groups: [
        { label: '新闻 1', numbers: [1, 2] },
        { label: '新闻 2', numbers: [3, 4] },
        { label: '新闻 3', numbers: [5, 6, 7] },
      ],
    },
    {
      code: 'B',
      title: 'Section B · 长对话',
      weight: 7.1,
      groups: [
        { label: '对话 1', numbers: [8, 9, 10, 11] },
        { label: '对话 2', numbers: [12, 13, 14, 15] },
      ],
    },
    {
      code: 'C',
      title: 'Section C · 听力篇章（双倍权重）',
      weight: 14.2,
      groups: [
        { label: '篇章 1', numbers: [16, 17, 18] },
        { label: '篇章 2', numbers: [19, 20, 21] },
        { label: '篇章 3', numbers: [22, 23, 24, 25] },
      ],
    },
  ],
};

export interface ListeningScoreCalcOptions {
  paperTitle?: string;
  initialLevel?: ListeningExamLevel;
  wrongSet: Set<number>;
  getOnlineWrongNumbers?: () => number[];
  onClose?: () => void;
}

export function createListeningScoreCalculator(options: ListeningScoreCalcOptions): HTMLElement {
  let level: ListeningExamLevel = options.initialLevel ?? 'cet6';
  const wrongSet = options.wrongSet;
  const card = el('section', 'ciyu-surface ciyu-score-calc-card');
  card.setAttribute('aria-label', '纸质版听力算分器');

  function computeSummary() {
    const sections = BLUEPRINTS[level];
    let totalMax = 0;
    let totalEarned = 0;
    const perSection: Array<{
      code: string;
      earned: number;
      max: number;
      wrongCount: number;
      totalCount: number;
    }> = [];

    for (const sec of sections) {
      const nums = sec.groups.flatMap((g) => g.numbers);
      const wrongCount = nums.filter((n) => wrongSet.has(n)).length;
      const max = nums.length * sec.weight;
      const earned = (nums.length - wrongCount) * sec.weight;
      totalMax += max;
      totalEarned += earned;
      perSection.push({
        code: sec.code,
        earned,
        max,
        wrongCount,
        totalCount: nums.length,
      });
    }

    const roundedEarned = Math.round(totalEarned * 10) / 10;
    const roundedMax = Math.round(totalMax * 10) / 10;
    const pct = totalMax > 0 ? Math.round((totalEarned / totalMax) * 100) : 0;
    const grade =
      roundedEarned >= 210
        ? { label: '优秀', cls: 'ciyu-badge ciyu-badge--ok' }
        : roundedEarned >= 180
          ? { label: '良好', cls: 'ciyu-badge ciyu-badge--accent' }
          : roundedEarned >= 149.1
            ? { label: '及格', cls: 'ciyu-badge ciyu-badge--warn' }
            : { label: '待加强', cls: 'ciyu-badge ciyu-badge--danger' };

    return { roundedEarned, roundedMax, pct, grade, perSection };
  }

  function render(): void {
    card.innerHTML = '';
    const { roundedEarned, roundedMax, pct, grade, perSection } = computeSummary();
    const sections = BLUEPRINTS[level];

    // 1. 顶栏：标题 + 六级/四级切换 + 关闭
    const head = el('div', 'ciyu-score-calc-head');
    const titleWrap = el('div', 'ciyu-paper-info');
    titleWrap.append(
      el('strong', 'ciyu-settings-title', '纸质版听力算分器'),
      el('span', 'ciyu-toggle-desc', '点击做错的题号自动按官方权重扣分')
    );

    const headRight = el('div', 'ciyu-toolbar-actions');
    const levelSwitch = el('div', 'ciyu-glass ciyu-mode-switch');
    levelSwitch.setAttribute('role', 'group');
    levelSwitch.setAttribute('aria-label', '选择四六级计分标准');
    const btn6 = el('button', 'ciyu-mode-btn', '六级');
    btn6.type = 'button';
    btn6.setAttribute('aria-pressed', String(level === 'cet6'));
    const btn4 = el('button', 'ciyu-mode-btn', '四级');
    btn4.type = 'button';
    btn4.setAttribute('aria-pressed', String(level === 'cet4'));
    levelSwitch.append(btn6, btn4);
    attachLiquidLens({
      container: levelSwitch,
      buttons: [btn6, btn4],
      activeIndex: level === 'cet4' ? 1 : 0,
      cacheKey: 'ciyu-listening-score-level',
      onSelect: (idx) => {
        const next: ListeningExamLevel = idx === 1 ? 'cet4' : 'cet6';
        if (next !== level) {
          level = next;
          render();
        }
      },
    });
    headRight.appendChild(levelSwitch);

    if (options.onClose) {
      const closeBtn = el('button', 'ciyu-icon-btn');
      closeBtn.type = 'button';
      closeBtn.title = '收起算分器';
      closeBtn.setAttribute('aria-label', '收起算分器');
      closeBtn.appendChild(createIcon('x', 'sm'));
      closeBtn.addEventListener('click', () => options.onClose?.());
      headRight.appendChild(closeBtn);
    }

    head.append(titleWrap, headRight);
    card.appendChild(head);

    // 2. 分数总览条
    const hero = el('div', 'ciyu-score-calc-hero');
    const scoreMain = el('div', 'ciyu-score-calc-big');
    scoreMain.append(
      el('span', 'ciyu-score-num', roundedEarned.toFixed(1)),
      el('span', 'ciyu-score-denom', `/ ${roundedMax.toFixed(1)}`),
      el('span', grade.cls, `${grade.label} · ${pct}%`)
    );

    const breakdown = el('div', 'ciyu-score-breakdown');
    for (const ps of perSection) {
      const chip = el('span', 'ciyu-score-sec-chip');
      chip.textContent = `Sec ${ps.code}: ${ps.earned.toFixed(1)}/${ps.max.toFixed(1)}${ps.wrongCount > 0 ? ` (错${ps.wrongCount})` : ''}`;
      breakdown.appendChild(chip);
    }
    hero.append(scoreMain, breakdown);
    card.appendChild(hero);

    // 3. 分篇分题交互网格（点选做错的题号）
    const gridWrap = el('div', 'ciyu-score-sections');
    for (const sec of sections) {
      const secBox = el('div', 'ciyu-score-sec-box');
      const secHead = el('div', 'ciyu-score-sec-head');
      secHead.append(
        el('span', 'ciyu-score-sec-title', sec.title),
        el('span', 'ciyu-score-sec-weight', `每题 ${sec.weight.toFixed(1)} 分`)
      );
      secBox.appendChild(secHead);

      const groupsRow = el('div', 'ciyu-score-groups');
      for (const grp of sec.groups) {
        const grpBox = el('div', 'ciyu-score-grp');
        grpBox.appendChild(el('span', 'ciyu-score-grp-label', grp.label));
        const numRow = el('div', 'ciyu-score-nums');
        for (const num of grp.numbers) {
          const isWrong = wrongSet.has(num);
          const nBtn = el(
            'button',
            isWrong ? 'ciyu-score-q-btn ciyu-score-q-btn--wrong' : 'ciyu-score-q-btn',
            String(num)
          );
          nBtn.type = 'button';
          nBtn.setAttribute('aria-pressed', String(isWrong));
          nBtn.title = isWrong
            ? `第 ${num} 题（已标错 -${sec.weight} 分，点击恢复为正确）`
            : `第 ${num} 题（当前正确，点击标为做错 -${sec.weight} 分）`;
          nBtn.addEventListener('click', () => {
            if (wrongSet.has(num)) wrongSet.delete(num);
            else wrongSet.add(num);
            render();
          });
          numRow.appendChild(nBtn);
        }
        grpBox.appendChild(numRow);
        groupsRow.appendChild(grpBox);
      }
      secBox.appendChild(groupsRow);
      gridWrap.appendChild(secBox);
    }
    card.appendChild(gridWrap);

    // 4. 底部操作栏：同步线上错题 / 复制成绩 / 重置全对
    const foot = el('div', 'ciyu-score-calc-foot');
    const wrongSorted = Array.from(wrongSet).sort((a, b) => a - b);
    const wrongSummaryText =
      wrongSorted.length > 0
        ? `已标错 ${wrongSorted.length} 题：Q${wrongSorted.join(', Q')}`
        : '当前 25 题全对（满分 248.5）';
    foot.appendChild(el('span', 'ciyu-toggle-desc', wrongSummaryText));

    const footActions = el('div', 'ciyu-toolbar-actions');
    if (options.getOnlineWrongNumbers) {
      const syncBtn = el('button', 'ciyu-mini-btn', '同步本卷错题');
      syncBtn.type = 'button';
      syncBtn.addEventListener('click', () => {
        const onlineWrongs = options.getOnlineWrongNumbers?.() ?? [];
        if (onlineWrongs.length === 0) {
          showCiyuToast('当前线上作答暂无判错题目，可手动点选题号算分', { tone: 'info' });
          return;
        }
        wrongSet.clear();
        for (const n of onlineWrongs) wrongSet.add(n);
        render();
        showCiyuToast(`已同步本卷 ${onlineWrongs.length} 道错题并重新算分`, { tone: 'success' });
      });
      footActions.appendChild(syncBtn);
    }

    const copyBtn = el('button', 'ciyu-mini-btn ciyu-mini-btn--accent', '复制成绩');
    copyBtn.type = 'button';
    copyBtn.addEventListener('click', () => {
      const label = level === 'cet6' ? '六级' : '四级';
      const titlePrefix = options.paperTitle ? `${options.paperTitle} · ` : '';
      const secStr = perSection
        .map((s) => `Sec ${s.code} ${s.earned.toFixed(1)}/${s.max.toFixed(1)}`)
        .join(' | ');
      const wrongStr = wrongSorted.length > 0 ? `错题：Q${wrongSorted.join(', Q')}` : '全对';
      const text = `${titlePrefix}${label}听力得分：${roundedEarned.toFixed(1)} / ${roundedMax.toFixed(1)}（${grade.label} ${pct}%）｜${secStr}｜${wrongStr}`;
      const done = () => showCiyuToast('已复制听力成绩摘要，可直接粘贴到复盘笔记', { tone: 'success' });
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(() => {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); } catch {}
          ta.remove();
          done();
        });
      } else {
        done();
      }
    });

    const resetBtn = el('button', 'ciyu-mini-btn', '重置全对');
    resetBtn.type = 'button';
    resetBtn.disabled = wrongSet.size === 0;
    resetBtn.addEventListener('click', () => {
      wrongSet.clear();
      render();
    });

    footActions.append(copyBtn, resetBtn);
    foot.appendChild(footActions);
    card.appendChild(foot);
  }

  render();
  return card;
}
