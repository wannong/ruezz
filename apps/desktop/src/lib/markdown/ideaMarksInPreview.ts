import type { Idea, IdeaSelector, TextIdeaSelector } from "../../api";
import { textRevision } from "../ideaAnchors";

function isTextSelector(selector: IdeaSelector): selector is TextIdeaSelector {
  return selector.kind !== "pdf-region";
}

function rankTextMatch(text: string, selector: TextIdeaSelector, at: number): number {
  return (
    (selector.prefix && text.slice(Math.max(0, at - selector.prefix.length), at) === selector.prefix ? 1000 : 0) +
    (selector.suffix &&
    text.slice(at + selector.exact.length, at + selector.exact.length + selector.suffix.length) === selector.suffix
      ? 1000
      : 0) -
    Math.abs(at - selector.start)
  );
}

export function resolveIdeaOffset(text: string, selector: IdeaSelector): number | null {
  if (!isTextSelector(selector)) return null;
  if (textRevision(text) === selector.revision && text.slice(selector.start, selector.end) === selector.exact) {
    return selector.start;
  }
  const candidates: number[] = [];
  let offset = text.indexOf(selector.exact);
  while (offset >= 0) {
    candidates.push(offset);
    offset = text.indexOf(selector.exact, offset + 1);
  }
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => rankTextMatch(text, selector, b) - rankTextMatch(text, selector, a))[0];
}

function findInPlainText(text: string, selector: TextIdeaSelector): number | null {
  const candidates: number[] = [];
  let offset = text.indexOf(selector.exact);
  while (offset >= 0) {
    candidates.push(offset);
    offset = text.indexOf(selector.exact, offset + 1);
  }
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  return candidates.sort((a, b) => rankTextMatch(text, selector, b) - rankTextMatch(text, selector, a))[0];
}

function wrapTextRange(root: HTMLElement, start: number, end: number, idea: Idea): void {
  const segments: Array<{ node: Text; start: number; end: number }> = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let cursor = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.parentElement?.closest("[data-idea-mark]")) continue;
    const nodeStart = cursor;
    const nodeEnd = cursor + node.data.length;
    if (nodeEnd > start && nodeStart < end) {
      const localStart = Math.max(0, start - nodeStart);
      const localEnd = Math.min(node.data.length, end - nodeStart);
      if (localStart < localEnd) segments.push({ node, start: localStart, end: localEnd });
    }
    cursor = nodeEnd;
  }

  for (const { node, start: localStart, end: localEnd } of segments.reverse()) {
    const text = node.data;
    const before = text.slice(0, localStart);
    const middle = text.slice(localStart, localEnd);
    const after = text.slice(localEnd);
    const span = document.createElement("span");
    span.className = `idea-mark-inline idea-mark-${idea.color}`;
    span.dataset.ideaMark = idea.id;
    span.textContent = middle;
    const parent = node.parentNode;
    if (!parent) continue;
    if (before) parent.insertBefore(document.createTextNode(before), node);
    parent.insertBefore(span, node);
    if (after) parent.insertBefore(document.createTextNode(after), node);
    parent.removeChild(node);
  }
}

export function injectIdeaMarksIntoRenderedBlock(
  root: HTMLElement,
  ideas: Idea[],
  blockFrom: number,
  blockTo: number,
  docText: string,
): void {
  const renderedText = root.textContent ?? "";
  const spans: Array<{ start: number; end: number; idea: Idea }> = [];

  for (const idea of ideas) {
    if (idea.status === "resolved" || idea.selector.kind === "pdf-region") continue;
    const docStart = resolveIdeaOffset(docText, idea.selector);
    if (docStart == null) continue;
    const docEnd = docStart + idea.selector.exact.length;
    if (docEnd <= blockFrom || docStart >= blockTo) continue;

    if (!isTextSelector(idea.selector)) continue;
    const renderedStart = findInPlainText(renderedText, idea.selector);
    if (renderedStart == null) continue;
    spans.push({ start: renderedStart, end: renderedStart + idea.selector.exact.length, idea });
  }

  spans.sort((a, b) => b.start - a.start || b.end - a.end);
  for (const span of spans) {
    wrapTextRange(root, span.start, span.end, span.idea);
  }
}
