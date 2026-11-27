import { el } from '../dom';
import { createIcon } from '../icons';
import type { NativeDictionary, ResultCardCallbacks } from '../types';

const providers: [NativeDictionary, string][] = [
  ['youdao', '有道桌面'],
  ['easydict', 'Easydict'],
  ['apple', '系统词典'],
];

export function nativeLookupButtons(
  parent: HTMLElement, query: () => string, run?: ResultCardCallbacks['onNativeLookup']
): void {
  if (!run) return;
  for (const [id, label] of providers) {
    const button = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm', label);
    button.type = 'button';
    button.title = '在' + label + '中打开当前查询';
    button.addEventListener('click', () => run(query(), id));
    parent.appendChild(button);
  }
}

export function speechButton(term: string, active: boolean, speak: () => void): HTMLButtonElement {
  const button = el('button', 'ciyu-btn ciyu-btn--glass ciyu-btn--sm ciyu-speech-btn');
  button.type = 'button';
  updateSpeechButton(button, term, active);
  button.addEventListener('click', speak);
  return button;
}

export function updateSpeechButton(button: HTMLButtonElement, term: string, active: boolean): void {
  const label = active ? '停止朗读' : '朗读';
  button.setAttribute('aria-label', label + (term ? ' ' + term : ''));
  button.setAttribute('aria-pressed', String(active));
  button.replaceChildren(createIcon('volume-2', 'sm'), el('span', undefined, label));
}
