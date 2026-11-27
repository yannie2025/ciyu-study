const STUDY_NOTES = '词屿/笔记';
const CET6_EXAM_BANK = STUDY_NOTES + '/六级题库.md';
const STUDY_TRASH = '词屿/回收站';

function manageStudyNotes(root, plugin) {
  const studySet = new Set(plugin.studyFiles().map(file => file.path));
  const combined = [...plugin.studyFiles(), ...plugin.archiveFiles()];
  const uniqueFiles = [...new Map(combined.map(file => [file.path, file])).values()];

  const buildProps = () => ({
    canUndo: Boolean(plugin.noteUndo?.length),
    notes: uniqueFiles.map(file => ({
      path: file.path,
      basename: file.basename,
      group: studySet.has(file.path) ? 'study' : 'archive',
      subtitle: file.path,
    })),
  });

  const handle = CiyuUI.createStudyNotesManagerView(buildProps(), {
    onCreateNote: name => plugin.createStudyNote(name),
    onUndoLastAction: () => safeUi(() => plugin.undoNote()),
    onOpenNote: path => safeUi(() => plugin.openSource(path)),
    onTrashNote: item => safeUi(async () => {
      const target = plugin.app.vault.getAbstractFileByPath(item.path);
      if (target instanceof TFile) await plugin.removeStudyNote(target);
    }),
  });
  root.appendChild(handle.element);
}

function manageWordPacks(root, plugin) {
  const selected = plugin.settings.dictionaryPacks || [];
  const packs = WORD_PACKS.map(pack => ({
    id: pack.id,
    label: pack.label,
    count: pack.count,
    sourceLabel: 'ECDICT 离线词库',
    enabled: selected.includes(pack.id),
    isPrimary: selected[0] === pack.id,
  }));

  const handle = CiyuUI.createDictionaryPacksView({ packs }, {
    onSetPrimary: packId => safeUi(() => plugin.dictionaries.change(packId, 'primary')),
    onAddPack: packId => safeUi(() => plugin.dictionaries.change(packId, 'add')),
    onRemovePack: packId => safeUi(() => plugin.dictionaries.change(packId, 'remove')),
  });
  root.appendChild(handle.element);
}
