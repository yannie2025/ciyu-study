import { el } from '../dom';
import { createIcon } from '../icons';
import type {
  Cet6AudioAvailability,
  Cet6OverallStatus,
  Cet6PaperStatus,
  ExamBankViewCallbacks,
  ExamBankViewProps,
  UIComponentHandle,
} from '../types';

function overallStatusMeta(
  status: Cet6OverallStatus,
  downloadedCount: number,
  totalCount: number
): { text: string; cls: string } {
  switch (status) {
    case 'downloaded':
      return { text: `已导入 ${downloadedCount} / ${totalCount}`, cls: 'ciyu-badge ciyu-badge--ok' };
    case 'downloading':
      return { text: `导入中 ${downloadedCount} / ${totalCount}`, cls: 'ciyu-badge ciyu-badge--accent' };
    case 'partial':
      return { text: `部分已导入 ${downloadedCount} / ${totalCount}`, cls: 'ciyu-badge ciyu-badge--warn' };
    case 'error':
      return { text: '下载异常', cls: 'ciyu-badge ciyu-badge--error' };
    case 'not_downloaded':
    default:
      return { text: `待导入 0 / ${totalCount}`, cls: 'ciyu-badge ciyu-badge--neutral' };
  }
}

function paperStatusBadge(status: Cet6PaperStatus): { text: string; cls: string } {
  switch (status) {
    case 'downloaded':
      return { text: '已导入', cls: 'ciyu-badge ciyu-badge--ok' };
    case 'downloading':
      return { text: '导入中…', cls: 'ciyu-badge ciyu-badge--accent' };
    case 'error':
      return { text: '失败', cls: 'ciyu-badge ciyu-badge--error' };
    case 'not_downloaded':
    default:
      return { text: '未导入', cls: 'ciyu-badge ciyu-badge--neutral' };
  }
}

function audioBadgeMeta(audio: Cet6AudioAvailability): { text: string; cls: string } | null {
  switch (audio) {
    case 'local_ready':
      return { text: '音频就绪', cls: 'ciyu-badge ciyu-badge--accent' };
    case 'link_only':
      return { text: '在线音频', cls: 'ciyu-badge ciyu-badge--neutral' };
    case 'unverified_transcript':
      return { text: '原文待核对', cls: 'ciyu-badge ciyu-badge--warn' };
    case 'audio_error':
      return { text: '音频异常', cls: 'ciyu-badge ciyu-badge--error' };
    case 'no_audio':
    default:
      return null;
  }
}

/**
 * 一、题库与一键下载（最高优先级）
 * 按年份、月份、套卷直接浏览与勾选真题；
 * 支持下载单套、勾选多套（「下载并导入文字版」）与「一键下载全部」；
 * 自动展示库内默认目录结构、导入成功直达「打开试卷 / 打开索引」、重复点击防覆盖提示与失败重试。
 */
export function createExamBankView(
  initialProps: ExamBankViewProps,
  callbacks: ExamBankViewCallbacks = {}
): UIComponentHandle<ExamBankViewProps> {
  let props = initialProps;
  let showFolderTree = false;
  let yearFilter: string = 'all';

  const root = el('section', 'ciyu-exam-bank');
  root.setAttribute('aria-label', '六级真题题库与一键下载');

  function render(): void {
    root.innerHTML = '';
    const isDownloading = props.overallStatus === 'downloading';
    const selectedSet = new Set(props.selectedPaperIds);

    // 1. 顶部当前库名 + 默认保存位置 + 目录结构折叠预览
    const vaultCard = el('div', 'ciyu-surface ciyu-exam-hero');
    const vaultRow = el('div', 'ciyu-vault-bar');
    vaultRow.style.padding = '0';

    const vaultMeta = el('div', 'ciyu-vault-meta');
    const vaultChip = el('span', 'ciyu-vault-chip');
    vaultChip.append(createIcon('folder', 'sm'), el('span', undefined, `库：${props.vaultName || '当前库'}`));

    const pathSpan = el(
      'span',
      'ciyu-folder-path',
      `保存至：${props.vaultPaths.rootFolder}/`
    );
    pathSpan.title = `真题与错题目录根路径：${props.vaultPaths.rootFolder}/`;
    vaultMeta.append(vaultChip, pathSpan);

    const folderActions = el('div', 'ciyu-toolbar-actions');
    const treeBtn = el('button', 'ciyu-mini-btn', showFolderTree ? '收起目录' : '目录结构');
    treeBtn.type = 'button';
    treeBtn.setAttribute('aria-expanded', String(showFolderTree));
    treeBtn.addEventListener('click', () => {
      showFolderTree = !showFolderTree;
      render();
    });

    const changeFolderBtn = el('button', 'ciyu-mini-btn', '更换保存位置');
    changeFolderBtn.type = 'button';
    changeFolderBtn.disabled = isDownloading;
    changeFolderBtn.addEventListener('click', () => callbacks.onPickTargetFolder?.());

    folderActions.append(treeBtn, changeFolderBtn);
    vaultRow.append(vaultMeta, folderActions);
    vaultCard.appendChild(vaultRow);

    if (showFolderTree) {
      const treePre = el('pre', 'ciyu-vault-tree');
      const r = props.vaultPaths.rootFolder || '词屿';
      treePre.textContent =
        `${r}/\n` +
        `  六级题库/\n` +
        `    真题索引.md\n` +
        `    历年真题/\n` +
        `    听力原文/\n` +
        `    听力音频/\n` +
        `  错题本/\n` +
        `    六级错题索引.md`;
      vaultCard.appendChild(treePre);
    }

    // 标题与状态统计
    const heroTop = el('div', 'ciyu-exam-hero-top');
    const titleWrap = el('div');
    titleWrap.append(
      el('h3', 'ciyu-exam-hero-title', '六级历年真题题库（2024 – 2026）'),
      el(
        'p',
        'ciyu-exam-hero-sub',
        '首次使用自动创建库内「词屿」目录，直接写入排版好的 Markdown 真题并生成可点击索引。'
      )
    );
    const statusMeta = overallStatusMeta(
      props.overallStatus,
      props.downloadedCount,
      props.totalCount
    );
    heroTop.append(titleWrap, el('span', statusMeta.cls, statusMeta.text));
    vaultCard.appendChild(heroTop);

    const allPapers = props.sessions.flatMap((s) => s.papers);
    const selectedImportedIds = allPapers
      .filter((p) => selectedSet.has(p.id) && p.status === 'downloaded')
      .map((p) => p.id);
    const defaultListenPaperId =
      props.lastImportedPaperId ||
      allPapers.find((p) => p.status === 'downloaded')?.id ||
      allPapers[0]?.id ||
      '202606-1';

    // 主操作区：下载并导入文字版（主按钮） + 一键下载全部 + 启动听力自查 / 批量删除 / 索引 / 错题本
    const ctaGrid = el('div', 'ciyu-exam-cta-grid');

    const primaryBtn = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm');
    primaryBtn.type = 'button';
    primaryBtn.disabled = isDownloading || selectedSet.size === 0;
    primaryBtn.append(
      createIcon('download', 'sm'),
      el(
        'span',
        undefined,
        isDownloading
          ? '正在下载并导入…'
          : selectedSet.size > 0
          ? `下载并导入文字版（已选 ${selectedSet.size} 套）`
          : '下载并导入文字版（请先勾选）'
      )
    );
    primaryBtn.addEventListener('click', () =>
      callbacks.onDownloadAndImportSelected?.(Array.from(selectedSet))
    );

    const selfCheckBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm');
    selfCheckBtn.type = 'button';
    selfCheckBtn.title = '在扩展内直接启动六级听力自查、在线播放与原文对照';
    selfCheckBtn.append(
      createIcon('headphones', 'sm'),
      el('span', undefined, '启动听力自查')
    );
    selfCheckBtn.addEventListener('click', () =>
      callbacks.onOpenPaperListening?.(defaultListenPaperId)
    );

    ctaGrid.append(primaryBtn, selfCheckBtn);

    const subActions = el('div', 'ciyu-exam-cta-grid');

    const dlAllBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm');
    dlAllBtn.type = 'button';
    dlAllBtn.disabled = isDownloading;
    dlAllBtn.append(
      createIcon('sparkles', 'sm'),
      el('span', undefined, `一键下载全部 (${props.totalCount} 套)`)
    );
    dlAllBtn.addEventListener('click', () => callbacks.onDownloadAllPapers?.());

    const indexBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm');
    indexBtn.type = 'button';
    indexBtn.append(createIcon('list', 'sm'), el('span', undefined, '真题索引'));
    indexBtn.addEventListener('click', () => callbacks.onOpenCet6Index?.());

    const mistakeBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm');
    mistakeBtn.type = 'button';
    mistakeBtn.append(
      createIcon('flag', 'sm'),
      el(
        'span',
        undefined,
        typeof props.mistakeCount === 'number' && props.mistakeCount > 0
          ? `错题本 (${props.mistakeCount})`
          : '错题本'
      )
    );
    mistakeBtn.addEventListener('click', () => callbacks.onOpenMistakeBook?.());

    const extraImportBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm');
    extraImportBtn.type = 'button';
    extraImportBtn.disabled = isDownloading;
    extraImportBtn.append(createIcon('file-plus', 'sm'), el('span', undefined, '导入样卷/本地'));
    extraImportBtn.addEventListener('click', () => callbacks.onOpenImportModal?.());

    subActions.append(dlAllBtn, indexBtn, mistakeBtn, extraImportBtn);

    if (props.downloadedCount > 0) {
      const batchDeleteBtn = el(
        'button',
        selectedImportedIds.length > 0
          ? 'ciyu-btn ciyu-btn--danger ciyu-btn--sm'
          : 'ciyu-btn ciyu-btn--glass ciyu-btn--sm ciyu-btn--danger-subtle'
      );
      batchDeleteBtn.type = 'button';
      batchDeleteBtn.disabled = isDownloading;
      const deleteTargets =
        selectedImportedIds.length > 0
          ? selectedImportedIds
          : allPapers.filter((p) => p.status === 'downloaded').map((p) => p.id);
      batchDeleteBtn.append(
        createIcon('trash-2', 'sm'),
        el(
          'span',
          undefined,
          selectedImportedIds.length > 0
            ? `批量删除所选（${selectedImportedIds.length} 套）`
            : `批量删除已导入（${props.downloadedCount} 套）`
        )
      );
      batchDeleteBtn.addEventListener('click', () =>
        callbacks.onRequestBatchDeletePapers?.(deleteTargets)
      );
      subActions.appendChild(batchDeleteBtn);
    }

    vaultCard.append(ctaGrid, subActions);
    root.appendChild(vaultCard);

    // 2. 导入成功即时直达横幅（「打开试卷」与「打开索引」）
    if (props.justImported && !isDownloading) {
      const okBanner = el('div', 'ciyu-banner ciyu-banner--ok');
      okBanner.setAttribute('role', 'status');
      const main = el('div', 'ciyu-banner-main');
      main.append(
        createIcon('check', 'sm'),
        el(
          'span',
          undefined,
          `已成功导入 ${props.justImported.count} 套真题并更新「真题索引.md」。`
        )
      );
      const btns = el('div', 'ciyu-toolbar-actions');
      const openPaperBtn = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm', '打开试卷');
      openPaperBtn.type = 'button';
      openPaperBtn.addEventListener('click', () =>
        callbacks.onOpenPaperReader?.(props.justImported!.primaryPaperId)
      );
      const openIdxBtn = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm', '打开索引');
      openIdxBtn.type = 'button';
      openIdxBtn.addEventListener('click', () => callbacks.onOpenCet6Index?.());
      btns.append(openPaperBtn, openIdxBtn);
      okBanner.append(main, btns);
      root.appendChild(okBanner);
    }

    // 3. 重复点击已导入套卷的防覆盖保护横幅
    if (props.duplicateClickNotice) {
      const dup = props.duplicateClickNotice;
      const dupBanner = el('div', 'ciyu-banner ciyu-banner--info');
      dupBanner.setAttribute('role', 'status');
      const main = el('div', 'ciyu-banner-main');
      main.append(
        createIcon('shield-alert', 'sm'),
        el(
          'span',
          undefined,
          `「${dup.title}」已导入在库内。为保护你写过的批注，未覆盖原文件。`
        )
      );
      const btns = el('div', 'ciyu-toolbar-actions');
      const openExisting = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm', '打开已有试卷');
      openExisting.type = 'button';
      openExisting.addEventListener('click', () => callbacks.onOpenPaperReader?.(dup.paperId));

      const openMd = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm', '打开笔记文件');
      openMd.type = 'button';
      openMd.addEventListener('click', () =>
        callbacks.onOpenPaperNote?.(dup.paperId, dup.notePath)
      );

      const dismiss = el('button', 'ciyu-icon-btn');
      dismiss.type = 'button';
      dismiss.setAttribute('aria-label', '关闭提示');
      dismiss.appendChild(createIcon('x', 'sm'));
      dismiss.addEventListener('click', () => callbacks.onDismissDuplicateNotice?.());

      btns.append(openExisting, openMd, dismiss);
      dupBanner.append(main, btns);
      root.appendChild(dupBanner);
    }

    // 3b. 删除真题完成反馈横幅（移入回收站时支持一键撤销恢复）
    if (props.justDeleted && !isDownloading) {
      const delBanner = el('div', 'ciyu-banner ciyu-banner--info');
      delBanner.setAttribute('role', 'status');
      const main = el('div', 'ciyu-banner-main');
      main.append(
        createIcon('check', 'sm'),
        el(
          'span',
          undefined,
          props.justDeleted.mode === 'trash'
            ? `已将 ${props.justDeleted.count} 套真题安全移入「词屿/回收站」。`
            : `已从库中彻底删除 ${props.justDeleted.count} 套真题。`
        )
      );
      const btns = el('div', 'ciyu-toolbar-actions');
      if (props.justDeleted.canUndo) {
        const undoBtn = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm');
        undoBtn.type = 'button';
        undoBtn.append(createIcon('undo-2', 'sm'), el('span', undefined, '撤销删除'));
        undoBtn.addEventListener('click', () => callbacks.onUndoLastDelete?.());
        btns.appendChild(undoBtn);
      }
      const closeDel = el('button', 'ciyu-icon-btn');
      closeDel.type = 'button';
      closeDel.setAttribute('aria-label', '关闭删除提示');
      closeDel.appendChild(createIcon('x', 'sm'));
      closeDel.addEventListener('click', () => callbacks.onDismissDeleteNotice?.());
      btns.appendChild(closeDel);
      delBanner.append(main, btns);
      root.appendChild(delBanner);
    }

    // 4. 下载进度 / 部分成功 / 失败重试状态条
    const failedIds = props.sessions
      .flatMap((s) => s.papers)
      .filter((p) => p.status === 'error')
      .map((p) => p.id);

    if (props.overallStatus === 'downloading') {
      const banner = el('div', 'ciyu-banner ciyu-banner--info');
      banner.setAttribute('aria-live', 'polite');
      const main = el('div', 'ciyu-banner-main');
      main.append(
        el('span', 'ciyu-spinner'),
        el('span', undefined, props.progressText ?? '正在创建词屿目录并写入排版后的 Markdown 真题…')
      );
      banner.appendChild(main);
      if (typeof props.progressPercent === 'number') {
        const track = el('div', 'ciyu-progress-track');
        track.style.width = '100%';
        const fill = el('div', 'ciyu-progress-fill');
        fill.style.width = `${Math.max(6, Math.min(100, props.progressPercent))}%`;
        track.appendChild(fill);
        banner.appendChild(track);
      }
      root.appendChild(banner);
    } else if (props.overallStatus === 'partial' && failedIds.length > 0) {
      const banner = el('div', 'ciyu-banner ciyu-banner--warn');
      banner.setAttribute('role', 'status');
      const main = el('div', 'ciyu-banner-main');
      main.append(
        createIcon('alert-circle', 'sm'),
        el(
          'span',
          undefined,
          props.errorMessage ??
            `已导入 ${props.downloadedCount} 套，另有 ${failedIds.length} 套网络超时未完成。`
        )
      );
      const retryBtn = el('button', 'ciyu-btn ciyu-btn--primary ciyu-btn--sm');
      retryBtn.type = 'button';
      retryBtn.append(createIcon('refresh-cw', 'sm'), el('span', undefined, '重试失败套卷'));
      retryBtn.addEventListener('click', () => callbacks.onRetryFailedPapers?.(failedIds));
      banner.append(main, retryBtn);
      root.appendChild(banner);
    } else if (props.overallStatus === 'error') {
      const banner = el('div', 'ciyu-banner ciyu-banner--error');
      banner.setAttribute('role', 'alert');
      const main = el('div', 'ciyu-banner-main');
      main.append(
        createIcon('alert-circle', 'sm'),
        el('span', undefined, props.errorMessage ?? '在线题库源暂不可达，请检查网络后重试。')
      );
      const retryBtn = el('button', 'ciyu-btn ciyu-btn--danger ciyu-btn--sm');
      retryBtn.type = 'button';
      retryBtn.append(createIcon('refresh-cw', 'sm'), el('span', undefined, '重试下载'));
      retryBtn.addEventListener('click', () =>
        callbacks.onRetryFailedPapers?.(
          failedIds.length ? failedIds : Array.from(selectedSet)
        )
      );
      banner.append(main, retryBtn);
      root.appendChild(banner);
    }

    // 5. 年份筛选 + 全选/清空工具栏
    const years = Array.from(new Set(props.sessions.map((s) => s.year)));
    const filterToolbar = el('div', 'ciyu-check-toolbar');

    const yearPills = el('div', 'ciyu-filter-pills');
    const makeYearPill = (yr: string, label: string) => {
      const btn = el(
        'button',
        yearFilter === yr ? 'ciyu-mini-btn ciyu-mini-btn--accent' : 'ciyu-mini-btn',
        label
      );
      btn.type = 'button';
      btn.setAttribute('aria-pressed', String(yearFilter === yr));
      btn.addEventListener('click', () => {
        yearFilter = yr;
        render();
      });
      return btn;
    };
    yearPills.appendChild(makeYearPill('all', '全部年份'));
    for (const yr of years) {
      yearPills.appendChild(makeYearPill(yr, `${yr} 年`));
    }

    const selTools = el('div', 'ciyu-toolbar-actions');
    const allBtn = el('button', 'ciyu-mini-btn', '全选');
    allBtn.type = 'button';
    allBtn.disabled = isDownloading || selectedSet.size === props.totalCount;
    allBtn.addEventListener('click', () => callbacks.onSelectAllPapers?.());

    if (props.downloadedCount > 0) {
      const selImpBtn = el('button', 'ciyu-mini-btn', '选已导入');
      selImpBtn.type = 'button';
      selImpBtn.disabled = isDownloading;
      selImpBtn.title = '一键勾选全部已导入真题，便于批量删除管理';
      selImpBtn.addEventListener('click', () => callbacks.onSelectImportedPapers?.());
      selTools.appendChild(selImpBtn);
    }

    const clrBtn = el('button', 'ciyu-mini-btn', '清空');
    clrBtn.type = 'button';
    clrBtn.disabled = isDownloading || selectedSet.size === 0;
    clrBtn.addEventListener('click', () => callbacks.onClearSelection?.());

    selTools.append(allBtn, clrBtn);
    filterToolbar.append(yearPills, selTools);
    root.appendChild(filterToolbar);

    // 6. 按年份 · 月份 · 套卷分组卡片（支持直接勾选多套或单套下载/打开）
    const sessionList = el('ul', 'ciyu-session-list');
    sessionList.setAttribute('aria-label', '按年份与月份分组的六级真题');

    const visibleSessions =
      yearFilter === 'all'
        ? props.sessions
        : props.sessions.filter((s) => s.year === yearFilter);

    for (const session of visibleSessions) {
      const li = el('li', 'ciyu-surface ciyu-session-card');

      const head = el('div', 'ciyu-session-head');
      const sessionLabelWrap = el('label', 'ciyu-check-pill-left');
      sessionLabelWrap.style.cursor = 'pointer';
      const sessionCb = el('input');
      sessionCb.type = 'checkbox';
      sessionCb.disabled = isDownloading;
      sessionCb.checked = session.papers.every((p) => selectedSet.has(p.id));
      sessionCb.setAttribute('aria-label', `勾选 ${session.sessionLabel} 全部 3 套`);
      sessionCb.addEventListener('change', () =>
        callbacks.onToggleSessionSelect?.(session.sessionId, sessionCb.checked)
      );
      sessionLabelWrap.append(
        sessionCb,
        el('h4', 'ciyu-session-title', `${session.year} 年 · ${session.month}`)
      );

      const readyInSession = session.papers.filter((p) => p.status === 'downloaded').length;
      head.append(
        sessionLabelWrap,
        el(
          'span',
          readyInSession === session.papers.length
            ? 'ciyu-badge ciyu-badge--ok'
            : 'ciyu-badge ciyu-badge--neutral',
          `${readyInSession} / ${session.papers.length} 已导入`
        )
      );

      const paperRows = el('ul', 'ciyu-paper-rows');
      for (const paper of session.papers) {
        const row = el('li', 'ciyu-paper-row');

        const info = el('label', 'ciyu-paper-info');
        info.style.cursor = 'pointer';
        const cb = el('input');
        cb.type = 'checkbox';
        cb.disabled = isDownloading;
        cb.checked = selectedSet.has(paper.id);
        cb.addEventListener('change', () =>
          callbacks.onTogglePaperSelect?.(paper.id, cb.checked)
        );
        info.append(cb, el('span', 'ciyu-paper-set', `第 ${paper.setNumber} 套`));

        const pBadge = paperStatusBadge(paper.status);
        const badgeEl = el('span', pBadge.cls, pBadge.text);
        if (paper.errorMessage) badgeEl.title = paper.errorMessage;
        info.appendChild(badgeEl);

        const aBadge = audioBadgeMeta(paper.audioStatus);
        if (aBadge && paper.status === 'downloaded') {
          info.appendChild(el('span', aBadge.cls, aBadge.text));
        }

        const actions = el('div', 'ciyu-paper-actions');
        if (paper.status === 'downloaded') {
          const openBtn = el('button', 'ciyu-mini-btn ciyu-mini-btn--accent', '打开试卷');
          openBtn.type = 'button';
          openBtn.addEventListener('click', () => callbacks.onOpenPaperReader?.(paper.id));

          const listenBtn = el('button', 'ciyu-mini-btn');
          listenBtn.type = 'button';
          listenBtn.title = '启动本套真题的听力自查与原文对照';
          listenBtn.append(createIcon('headphones', 'sm'), el('span', undefined, '听力自查'));
          listenBtn.addEventListener('click', () => callbacks.onOpenPaperListening?.(paper.id));

          const delOneBtn = el('button', 'ciyu-icon-btn ciyu-icon-btn--danger-hover');
          delOneBtn.type = 'button';
          delOneBtn.title = `删除「${paper.title}」`;
          delOneBtn.setAttribute('aria-label', `删除 ${paper.title}`);
          delOneBtn.appendChild(createIcon('trash-2', 'sm'));
          delOneBtn.addEventListener('click', () =>
            callbacks.onRequestDeleteSinglePaper
              ? callbacks.onRequestDeleteSinglePaper(paper.id)
              : callbacks.onRequestBatchDeletePapers?.([paper.id])
          );

          actions.append(openBtn, listenBtn, delOneBtn);
        } else if (paper.status === 'downloading') {
          const busyBtn = el('button', 'ciyu-mini-btn', '导入中…');
          busyBtn.type = 'button';
          busyBtn.disabled = true;
          actions.appendChild(busyBtn);
        } else if (paper.status === 'error') {
          const retryOne = el('button', 'ciyu-mini-btn');
          retryOne.type = 'button';
          retryOne.append(createIcon('refresh-cw', 'sm'), el('span', undefined, '重试'));
          retryOne.addEventListener('click', () => callbacks.onDownloadSinglePaper?.(paper.id));
          actions.appendChild(retryOne);
        } else {
          const listenQuick = el('button', 'ciyu-mini-btn');
          listenQuick.type = 'button';
          listenQuick.disabled = isDownloading;
          listenQuick.title = '直接在线启动本套听力自查';
          listenQuick.append(createIcon('headphones', 'sm'), el('span', undefined, '自查'));
          listenQuick.addEventListener('click', () => callbacks.onOpenPaperListening?.(paper.id));

          const dlOne = el('button', 'ciyu-mini-btn');
          dlOne.type = 'button';
          dlOne.disabled = isDownloading;
          dlOne.append(createIcon('download', 'sm'), el('span', undefined, '下载单套'));
          dlOne.addEventListener('click', () => callbacks.onDownloadSinglePaper?.(paper.id));
          actions.append(listenQuick, dlOne);
        }

        row.append(info, actions);
        paperRows.appendChild(row);
      }

      li.append(head, paperRows);
      sessionList.appendChild(li);
    }

    root.appendChild(sessionList);
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
