/**
 * 轻量级 DOM 辅助工具，保持语义 HTML 清晰且避免 XSS。
 */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * 将句子中包含的目标词高亮为 <mark>（纯 DOM 创建，不拼接 HTML 字符串）
 */
export function appendHighlightedText(
  container: HTMLElement,
  sentence: string,
  keyword?: string
): void {
  if (!keyword || !keyword.trim()) {
    container.textContent = sentence;
    return;
  }
  const escaped = keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = sentence.split(regex);
  for (const part of parts) {
    if (!part) continue;
    if (part.toLowerCase() === keyword.trim().toLowerCase()) {
      const mark = document.createElement('mark');
      mark.textContent = part;
      container.appendChild(mark);
    } else {
      container.appendChild(document.createTextNode(part));
    }
  }
}

/**
 * 原句挖空渲染（用于「今日复习」的原句挖空模式）
 */
export function appendClozeSentence(
  container: HTMLElement,
  sentence: string,
  targetWord: string,
  revealed: boolean
): void {
  const escaped = targetWord.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = sentence.split(regex);
  let matched = false;

  for (const part of parts) {
    if (!part) continue;
    if (part.toLowerCase() === targetWord.trim().toLowerCase()) {
      matched = true;
      const span = document.createElement('span');
      if (revealed) {
        span.className = 'ciyu-cloze-revealed';
        span.textContent = part;
      } else {
        span.className = 'ciyu-cloze-blank';
        span.setAttribute('aria-label', '待回忆词汇');
        span.textContent = '______';
      }
      container.appendChild(span);
    } else {
      container.appendChild(document.createTextNode(part));
    }
  }

  if (!matched) {
    container.appendChild(document.createTextNode(' '));
    const fallback = document.createElement('span');
    fallback.className = revealed ? 'ciyu-cloze-revealed' : 'ciyu-cloze-blank';
    fallback.textContent = revealed ? targetWord : '______';
    container.appendChild(fallback);
  }
}
