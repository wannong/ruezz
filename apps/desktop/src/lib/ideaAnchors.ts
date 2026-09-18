import type { IdeaSelector } from "../api";

export function textRevision(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function selectorFromRange(root: HTMLElement, range: Range): IdeaSelector | null {
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const exact = range.toString().trim();
  if (!exact) return null;
  const before = document.createRange();
  before.selectNodeContents(root);
  before.setEnd(range.startContainer, range.startOffset);
  const rootText = root.textContent ?? "";
  const rawStart = before.toString().length;
  const selected = range.toString();
  const leading = selected.length - selected.trimStart().length;
  const start = rawStart + leading;
  const end = start + exact.length;
  return {
    exact,
    prefix: rootText.slice(Math.max(0, start - 96), start),
    suffix: rootText.slice(end, end + 96),
    start,
    end,
    revision: textRevision(rootText),
  };
}

export function rangeFromSelector(root: HTMLElement, selector: IdeaSelector): Range | null {
  if (selector.kind === "pdf-region") return null;
  const text = root.textContent ?? "";
  let start = selector.start;
  const originalPositionStillValid =
    textRevision(text) === selector.revision && text.slice(start, selector.end) === selector.exact;
  if (!originalPositionStillValid) {
    const candidates: number[] = [];
    let offset = text.indexOf(selector.exact);
    while (offset >= 0) {
      candidates.push(offset);
      offset = text.indexOf(selector.exact, offset + 1);
    }
    if (candidates.length === 0) return null;
    start = candidates.sort((a, b) => {
      const score = (at: number) =>
        (selector.prefix && text.slice(Math.max(0, at - selector.prefix.length), at) === selector.prefix ? 1000 : 0) +
        (selector.suffix && text.slice(at + selector.exact.length, at + selector.exact.length + selector.suffix.length) === selector.suffix ? 1000 : 0) -
        Math.abs(at - selector.start);
      return score(b) - score(a);
    })[0];
  }
  const end = start + selector.exact.length;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let cursor = 0;
  let startNode: Text | null = null;
  let endNode: Text | null = null;
  let startOffset = 0;
  let endOffset = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const next = cursor + node.data.length;
    if (!startNode && start >= cursor && start <= next) {
      startNode = node;
      startOffset = start - cursor;
    }
    if (end >= cursor && end <= next) {
      endNode = node;
      endOffset = end - cursor;
      break;
    }
    cursor = next;
  }
  if (!startNode || !endNode) return null;
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}
