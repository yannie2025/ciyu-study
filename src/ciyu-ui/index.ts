/**
 * 词屿 (Ciyu) UI 组件库总入口
 * 供 Codex 在 Obsidian 插件中直接引入样式与组件。
 */

import './styles/tokens.css';
import './styles/ciyu-ui.css';
import './styles/cet6.css';

export * from './types';
export { CIYU_VERSION, CIYU_CHANGELOG, CIYU_CHANGELOG_FOREWORD } from './changelog';
export { CIYU_COLOR_THEMES, DEFAULT_CUSTOM_THEME, applyColorTheme, resolveThemeColors } from './themes';
export { createIcon, createBrandLogo, CIYU_BRAND_ICON_INNER, type IconName } from './icons';
export { ensureLiquidGlassFilter, applyGlassPreferences } from './glass';
export { showCiyuToast, destroyCiyuToasts, type CiyuToastTone, type CiyuToastOptions, type CiyuToastHandle } from './toast';
export { createSegmentedNav, type SegmentedNavProps, type SegmentedNavCallbacks } from './components/SegmentedNav';
export { createResultCard } from './components/ResultCard';
export { createLookupView } from './components/LookupView';
export { createSelectionPopover } from './components/SelectionPopover';
export { createVocabularyView } from './components/VocabularyView';
export { createVocabularyQuickImportModal } from './components/VocabularyQuickImportModal';
export { createReviewView } from './components/ReviewView';
export { createArchiveView } from './components/ArchiveView';
export { createSettingsView } from './components/SettingsView';
export { createExamBankView } from './components/ExamBankView';
export { createExamDownloadImportModal } from './components/ExamDownloadImportModal';
export { createExamDeleteConfirmModal } from './components/ExamDeleteConfirmModal';
export { createListeningIntensiveView } from './components/ListeningIntensiveView';
export { createExamWorkspaceView } from './components/ExamWorkspaceView';
export { createMistakeBookView } from './components/MistakeBookView';
export { createDictionaryPacksView } from './components/DictionaryPacksView';
export { createStudyNotesManagerView } from './components/StudyNotesManagerView';
export { createEntryEditorModal } from './components/EntryEditorModal';
export { createCiyuSidebar } from './components/CiyuSidebar';
