import { escapeHtmlAttribute } from "./inlineHtml.ts";
import { inlineHtml } from "./markdownIO.ts";
import type { MarkdownOrigin, PMNode } from "./pmTypes.ts";

type Attrs = Record<string, unknown>;

function attr(node: PMNode, key: string): unknown {
  return node.attrs?.[key];
}

function textStyles(node: PMNode, type: string): Attrs | undefined {
  return node.marks?.find((item) => item.type === type)?.attrs;
}

/**
 * Escape characters that would otherwise turn into Markdown syntax. Only literal
 * text is escaped; HTML wrappers are added afterwards so their brackets survive.
 */
function escapeInline(text: string, insideCode = false): string {
  if (insideCode) return text.replace(/`/g, "\\`");
  return text
    .replace(/\\/g, "\\\\")
    .replace(/([`*_[\]])/g, "\\$1")
    .replace(/<(?=[a-zA-Z/!?])/g, "&lt;")
    .replace(/^(\s*)([-+]\s|\d+\.\s|#)/, (_full, lead: string, marker: string) => `${lead}\\${marker}`);
}

/**
 * Serialise one text run's attributes that Markdown has no syntax for (colour,
 * highlight, sup/sub, wikilink). Emphasis is handled by the caller so that
 * adjacent runs sharing a mark produce `**bold text**`, not `**bo**` `**ld**`.
 */
function renderTextBody(node: PMNode): { text: string; opaque: boolean } {
  const raw = node.text ?? "";
  const style = textStyles(node, "textStyle");
  const target = style?.wikilink;
  if (typeof target === "string" && target) {
    const label = String(style?.wikilinkLabel ?? target);
    return { text: label === target ? `[[${target}]]` : `[[${target}|${label}]]`, opaque: true };
  }

  const wrappers: string[] = [];
  if (node.marks?.some((mark) => mark.type === "underline")) wrappers.push("u");
  if (node.marks?.some((mark) => mark.type === "superscript")) wrappers.push("sup");
  if (node.marks?.some((mark) => mark.type === "subscript")) wrappers.push("sub");

  const color = style ? String(style.color ?? "") : "";
  const background = style ? String(style.backgroundColor ?? "") : "";
  const fontSize = style ? String(style.fontSize ?? "") : "";
  const hasStyles = Boolean(color || background || fontSize);

  const highlight = node.marks?.find((mark) => mark.type === "highlight")?.attrs;
  const highlightColor = highlight ? String(highlight.color ?? "") : "";
  const inCode = node.marks?.some((mark) => mark.type === "code") === true;

  let text = escapeInline(raw, inCode);
  if (highlightColor) text = `<mark data-color="${escapeHtmlAttribute(highlightColor)}">${text}</mark>`;
  else if (node.marks?.some((mark) => mark.type === "highlight")) text = `<mark>${text}</mark>`;
  if (hasStyles) text = inlineHtml(text, { color, backgroundColor: background, fontSize });
  for (const tag of wrappers.reverse()) text = `<${tag}>${text}</${tag}>`;
  return { text, opaque: false };
}

/** Marks that become Markdown syntax, ordered outermost to innermost. */
const MARK_ORDER = ["link", "bold", "italic", "strike", "code"] as const;

type OpenMark = { type: string; marker: string; href?: string };

function markerFor(type: string): string {
  if (type === "bold") return "**";
  if (type === "italic") return "_";
  if (type === "strike") return "~~";
  if (type === "code") return "`";
  return "";
}

function marksOf(node: PMNode): OpenMark[] {
  const out: OpenMark[] = [];
  for (const type of MARK_ORDER) {
    const mark = node.marks?.find((item) => item.type === type);
    if (!mark) continue;
    if (type === "link") {
      const href = String(mark.attrs?.href ?? "");
      if (!href) continue;
      out.push({ type, marker: "", href });
      continue;
    }
    out.push({ type, marker: markerFor(type) });
  }
  return out;
}

/** Close markers until `current` is a prefix of `next`, then open the rest. */
function transition(current: OpenMark[], next: OpenMark[], out: string[]): OpenMark[] {
  let shared = 0;
  while (shared < current.length && shared < next.length && current[shared].type === next[shared].type) {
    shared += 1;
  }
  for (let index = current.length - 1; index >= shared; index -= 1) {
    const mark = current[index];
    out.push(mark.type === "link" ? `](${mark.href ?? ""})` : mark.marker);
  }
  for (let index = shared; index < next.length; index += 1) {
    const mark = next[index];
    out.push(mark.type === "link" ? "[" : mark.marker);
  }
  return next;
}

function inlineNodes(nodes: PMNode[] | undefined): string {
  const out: string[] = [];
  let current: OpenMark[] = [];
  for (const node of nodes ?? []) {
    switch (node.type) {
      case "text": {
        const { text, opaque } = renderTextBody(node);
        current = transition(current, opaque ? [] : marksOf(node), out);
        out.push(text);
        break;
      }
      case "hardBreak":
        current = transition(current, [], out);
        out.push("<br />\n");
        break;
      case "image": {
        current = transition(current, [], out);
        const src = String(attr(node, "src") ?? "");
        const alt = String(attr(node, "alt") ?? "");
        const title = attr(node, "title");
        out.push(title ? `![${alt}](${src} ${JSON.stringify(String(title))})` : `![${alt}](${src})`);
        break;
      }
      case "inlineMath":
        current = transition(current, [], out);
        out.push(`$${String(attr(node, "latex") ?? "")}$`);
        break;
      case "rawHtmlBlock":
        out.push(String(attr(node, "value") ?? ""));
        break;
      default:
        out.push(inlineNodes(node.content));
        break;
    }
  }
  transition(current, [], out);
  return out.join("");
}

function alignPrefix(node: PMNode): string | null {
  // TipTap's TextAlign extension stores the value as `textAlign`.
  const align = attr(node, "textAlign") ?? attr(node, "align");
  return typeof align === "string" && align ? align : null;
}

/**
 * Alignment has no Markdown syntax. A short paragraph becomes a bare
 * `<p align>` line; anything longer keeps the div wrapper so it still renders
 * as one aligned block.
 */
function wrapAligned(inner: string, node: PMNode): string {
  const align = alignPrefix(node);
  if (!align || align === "left") return inner;
  if (!inner.includes("\n") && !inner.includes("<") && inner.length > 0) return `<p align="${align}">${inner}</p>`;
  return `<div align="${align}">\n\n${inner}\n\n</div>`;
}

function renderTableCell(node: PMNode): string {
  return (node.content ?? [])
    .map((child) => inlineNodes(child.content).replace(/\n+/g, " ").replace(/\|/g, "\\|").trim())
    .join(" ");
}

function renderTable(node: PMNode): string {
  const rows = (node.content ?? []).filter((row) => row.type === "tableRow");
  if (rows.length === 0) return "";
  const matrix = rows.map((row) => (row.content ?? []).map(renderTableCell));
  const width = Math.max(...matrix.map((cells) => cells.length));
  const normalise = (cells: string[]) => {
    const copy = [...cells];
    while (copy.length < width) copy.push("");
    return copy;
  };
  const header = normalise(matrix[0]);
  const aligns = (rows[0].content ?? []).map((cell) => {
    const align = attr(cell, "align");
    return typeof align === "string" ? align : "";
  });
  const divider = Array.from({ length: width }, (_value, index) => {
    const align = aligns[index];
    if (align === "center") return ":---:";
    if (align === "right") return "---:";
    if (align === "left") return ":---";
    return "---";
  });
  const lines = [`| ${header.join(" | ")} |`, `| ${divider.join(" | ")} |`];
  for (const cells of matrix.slice(1)) lines.push(`| ${normalise(cells).join(" | ")} |`);
  return lines.join("\n");
}

function renderList(node: PMNode, depth: number): string {
  const ordered = node.type === "orderedList";
  const start = Number(attr(node, "start") ?? 1) || 1;
  const lines: string[] = [];
  (node.content ?? []).forEach((item, index) => {
    const checked = item.type === "taskItem" ? Boolean(attr(item, "checked")) : null;
    const marker = checked == null ? (ordered ? `${start + index}.` : "-") : `- [${checked ? "x" : " "}]`;
    const [first, ...rest] = item.content ?? [];
    const head = first && (first.type === "paragraph" || first.type === "heading") ? inlineNodes(first.content) : "";
    lines.push(`${"  ".repeat(depth)}${marker} ${head}`.trimEnd());
    for (const child of rest) {
      if (child.type === "bulletList" || child.type === "orderedList" || child.type === "taskList") {
        lines.push(renderList(child, depth + 1));
      } else {
        const rendered = renderBlock(child, depth + 1);
        if (rendered) lines.push(rendered);
      }
    }
  });
  return lines.join("\n");
}

export function renderBlock(node: PMNode, depth = 0): string {
  switch (node.type) {
    case "paragraph":
      return inlineNodes(node.content);
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(attr(node, "level") ?? 1)));
      return `${"#".repeat(level)} ${inlineNodes(node.content)}`;
    }
    case "codeBlock": {
      const language = String(attr(node, "language") ?? "");
      const body = (node.content ?? []).map((child) => child.text ?? "").join("");
      return `\`\`\`${language}\n${body}\n\`\`\``;
    }
    case "blockquote": {
      const inner = (node.content ?? []).map((child) => renderBlock(child, depth)).filter(Boolean).join("\n\n");
      return inner
        .split("\n")
        .map((line) => (line ? `> ${line}` : ">"))
        .join("\n");
    }
    case "bulletList":
    case "orderedList":
    case "taskList":
      return renderList(node, 0);
    case "table":
      return renderTable(node);
    case "horizontalRule":
      return "---";
    case "image": {
      const src = String(attr(node, "src") ?? "");
      const alt = String(attr(node, "alt") ?? "");
      return `![${alt}](${src})`;
    }
    case "blockMath":
      return `$$\n${String(attr(node, "latex") ?? "")}\n$$`;
    case "rawHtmlBlock":
      return String(attr(node, "value") ?? "");
    default:
      return inlineNodes(node.content);
  }
}

/** The exact string this block serialises to, including any alignment wrapper. */
export function renderBlockForCompare(node: PMNode): string {
  return wrapAligned(renderBlock(node), node);
}

export function renderDocBlocks(doc: PMNode): string[] {
  return (doc.content ?? []).map((node) => renderBlock(node));
}

/**
 * Convert a ProseMirror doc back to Markdown. When the doc still lines up with
 * the markdown it was parsed from, untouched blocks are written back verbatim so
 * opening and closing a note never reformats it.
 */
export function docToMarkdown(doc: PMNode, origin?: MarkdownOrigin): string {
  const blocks = doc.content ?? [];
  const parts: string[] = [];
  const aligned =
    origin != null && origin.sources.length === blocks.length && origin.snapshots.length === blocks.length;
  for (let index = 0; index < blocks.length; index += 1) {
    const node = blocks[index];
    const preserved = aligned ? origin.sources[index] : null;
    const snapshot = aligned ? origin.snapshots[index] : null;
    const rendered = renderBlockForCompare(node);
    if (preserved != null && snapshot != null && snapshot === rendered) {
      parts.push(preserved);
      continue;
    }
    parts.push(rendered);
  }
  return `${parts.filter((part) => part.trim().length > 0).join("\n\n").trimEnd()}\n`;
}
