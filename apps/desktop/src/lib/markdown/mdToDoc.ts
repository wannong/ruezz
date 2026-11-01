import type {
  Blockquote,
  Code,
  Heading,
  Html,
  Image,
  InlineCode,
  Link,
  List,
  ListItem,
  Paragraph,
  PhrasingContent,
  RootContent,
  Table,
  TableCell,
} from "mdast";
import { hasStyle, parseAlign, tokenizeInlineHtml, type InlineStyle } from "./inlineHtml.ts";
import { parseMarkdown, restoreWikilinks, WIKILINK_TOKEN, type ParsedWikilink } from "./markdownIO.ts";
import type { MarkdownOrigin, PMMark, PMNode } from "./pmTypes.ts";

type Ctx = { marks: PMMark[] };
type AlignSlot = { value: string | null };
type WikiSlot = { links: ParsedWikilink[] };


function withMark(ctx: Ctx, mark: PMMark): Ctx {
  const key = JSON.stringify(mark);
  if (ctx.marks.some((existing) => JSON.stringify(existing) === key)) return ctx;
  return { marks: [...ctx.marks, mark] };
}

function textNode(value: string, ctx: Ctx): PMNode {
  return ctx.marks.length > 0
    ? { type: "text", text: value, marks: ctx.marks.map((mark) => ({ ...mark })) }
    : { type: "text", text: value };
}

function pushInline(out: PMNode[], value: string, ctx: Ctx, wiki: WikiSlot): void {
  if (!value) return;
  const marker = new RegExp(`${WIKILINK_TOKEN}(\\d+)${WIKILINK_TOKEN}`, "g");
  let cursor = 0;
  const flush = (slice: string) => {
    if (!slice) return;
    const marksKey = JSON.stringify(ctx.marks);
    const last = out[out.length - 1];
    if (last && last.type === "text" && JSON.stringify(last.marks ?? []) === marksKey) {
      last.text = `${last.text ?? ""}${slice}`;
      return;
    }
    out.push(textNode(slice, ctx));
  };
  let match = marker.exec(value);
  while (match) {
    flush(value.slice(cursor, match.index));
    const link = wiki.links[Number(match[1])];
    if (link) {
      const ctxWithLink = withMark(ctx, {
        type: "textStyle",
        attrs: { wikilink: link.target, ...(link.label !== link.target ? { wikilinkLabel: link.label } : {}) },
      });
      flushWith(out, link.label, ctxWithLink);
    } else {
      flush(match[0]);
    }
    cursor = match.index + match[0].length;
    match = marker.exec(value);
  }
  flush(value.slice(cursor));
}

function flushWith(out: PMNode[], value: string, ctx: Ctx): void {
  const marksKey = JSON.stringify(ctx.marks);
  const last = out[out.length - 1];
  if (last && last.type === "text" && JSON.stringify(last.marks ?? []) === marksKey) {
    last.text = `${last.text ?? ""}${value}`;
    return;
  }
  out.push(textNode(value, ctx));
}

function textStyleAttrs(style: InlineStyle): Record<string, string> | null {
  if (!hasStyle(style)) return null;
  const attrs: Record<string, string> = {};
  if (style.color) attrs.color = style.color;
  if (style.backgroundColor) attrs.backgroundColor = style.backgroundColor;
  if (style.fontSize) attrs.fontSize = style.fontSize;
  return Object.keys(attrs).length > 0 ? attrs : null;
}

/** Marks accumulated while walking a paragraph, including open HTML tags. */
type InlineState = {
  marks: PMMark[];
  /** Stack of previous mark sets, one entry per open inline HTML tag. */
  open: PMMark[][];
};

function withMarks(marks: PMMark[], mark: PMMark): PMMark[] {
  const key = JSON.stringify(mark);
  return marks.some((existing) => JSON.stringify(existing) === key) ? marks : [...marks, mark];
}

function marksForTag(
  marks: PMMark[],
  tag: string,
  style: InlineStyle,
  attrs: Record<string, string>,
): PMMark[] {
  let next = marks;
  // A <mark> carries its colour as the highlight mark, not as a text style.
  const styleAttrs = textStyleAttrs(tag === "mark" ? { ...style, backgroundColor: undefined } : style);
  if (styleAttrs) next = withMarks(next, { type: "textStyle", attrs: styleAttrs });
  if (tag === "u") next = withMarks(next, { type: "underline" });
  if (tag === "sup") next = withMarks(next, { type: "superscript" });
  if (tag === "sub") next = withMarks(next, { type: "subscript" });
  if (tag === "mark") {
    // TipTap renders `background-color`, this app writes `data-color`; accept both.
    const color = attrs["data-color"] ?? style.backgroundColor;
    next = withMarks(next, color ? { type: "highlight", attrs: { color } } : { type: "highlight" });
  }
  if (tag === "span" && attrs["data-wikilink"]) {
    const target = attrs["data-wikilink"];
    const label = attrs["data-wikilink-label"];
    next = withMarks(next, {
      type: "textStyle",
      attrs: { wikilink: target, ...(label && label !== target ? { wikilinkLabel: label } : {}) },
    });
  }
  if (tag === "strong" || tag === "b") next = withMarks(next, { type: "bold" });
  if (tag === "em" || tag === "i") next = withMarks(next, { type: "italic" });
  if (tag === "s" || tag === "del" || tag === "strike") next = withMarks(next, { type: "strike" });
  if (tag === "code") next = withMarks(next, { type: "code" });
  return next;
}

/**
 * Apply one inline HTML fragment to the running paragraph state.
 *
 * mdast hands us opening and closing tags as *separate* html nodes, so the
 * state has to survive across siblings; that is why the stack lives here and
 * not inside this function.
 */
function applyHtml(html: string, state: InlineState, out: PMNode[], wiki: WikiSlot): void {
  for (const token of tokenizeInlineHtml(html)) {
    if (token.type === "text") {
      pushInline(out, token.value, { marks: state.marks }, wiki);
      continue;
    }
    if (token.type === "br") {
      out.push({ type: "hardBreak" });
      continue;
    }
    if (token.type === "open") {
      state.open.push(state.marks);
      state.marks = marksForTag(state.marks, token.tag, token.style, token.attrs);
      continue;
    }
    state.marks = state.open.pop() ?? state.marks;
  }
}

function inlineInto(node: PhrasingContent, state: InlineState, out: PMNode[], wiki: WikiSlot): void {
  switch (node.type) {
    case "text":
      pushInline(out, node.value, { marks: state.marks }, wiki);
      return;
    case "html":
      applyHtml((node as Html).value, state, out, wiki);
      return;
    case "break":
      out.push({ type: "hardBreak" });
      return;
    case "image": {
      // Images are block nodes in the editor schema. Record them as placeholders
      // here; `splitInlineBlocks` promotes them into their own blocks afterwards.
      const image = node as Image;
      out.push({ type: IMAGE_PLACEHOLDER, attrs: { src: image.url, alt: image.alt ?? null, title: image.title ?? null } });
      return;
    }
    case "inlineMath":
      out.push({ type: "inlineMath", attrs: { latex: String((node as { value?: string }).value ?? "") } });
      return;
    case "footnoteReference":
      pushInline(out, `[^${String((node as { label?: string }).label ?? "")}]`, { marks: state.marks }, wiki);
      return;
    default:
      break;
  }

  let childState: InlineState = state;
  switch (node.type) {
    case "inlineCode":
      pushInline(out, (node as InlineCode).value, { marks: withMarks(state.marks, { type: "code" }) }, wiki);
      return;
    case "strong":
      childState = { marks: withMarks(state.marks, { type: "bold" }), open: state.open };
      break;
    case "emphasis":
      childState = { marks: withMarks(state.marks, { type: "italic" }), open: state.open };
      break;
    case "delete":
      childState = { marks: withMarks(state.marks, { type: "strike" }), open: state.open };
      break;
    case "link": {
      const link = node as Link;
      childState = {
        marks: withMarks(state.marks, { type: "link", attrs: { href: link.url, title: link.title ?? null } }),
        open: state.open,
      };
      break;
    }
    default:
      break;
  }

  const children = (node as { children?: PhrasingContent[] }).children;
  for (const child of children ?? []) inlineInto(child, childState, out, wiki);
}

/** Temporary node type used while collecting a paragraph's inline content. */
const IMAGE_PLACEHOLDER = "imagePlaceholder";

function isBlank(node: PMNode): boolean {
  if (node.type === "hardBreak") return true;
  return node.type === "text" && (node.text ?? "").trim().length === 0;
}

/**
 * Split collected inline content around block nodes (images, block math) so the
 * resulting document is schema-valid: a paragraph cannot contain a block image.
 */
export function splitInlineBlocks(nodes: PMNode[], attrs?: Record<string, unknown>): PMNode[] {
  const blocks: PMNode[] = [];
  let paragraphContent: PMNode[] = [];

  const trimEdge = (node: PMNode, side: "start" | "end"): PMNode => {
    if (node.type !== "text") return node;
    const text = node.text ?? "";
    const trimmed = side === "start" ? text.replace(/^[ \t]+/, "") : text.replace(/[ \t]+$/, "");
    return trimmed === text ? node : { ...node, text: trimmed };
  };

  const flush = () => {
    // Trim the whitespace that separated the image from its neighbouring text.
    const kept = [...paragraphContent];
    paragraphContent = [];
    if (kept.length > 0) kept[0] = trimEdge(kept[0], "start");
    if (kept.length > 0) kept[kept.length - 1] = trimEdge(kept[kept.length - 1], "end");
    if (kept.every(isBlank)) return;
    blocks.push({ type: "paragraph", ...(attrs ? { attrs } : {}), content: kept });
  };

  for (const node of nodes) {
    if (node.type === IMAGE_PLACEHOLDER) {
      flush();
      blocks.push({ type: "image", attrs: node.attrs });
      continue;
    }
    paragraphContent.push(node);
  }
  flush();
  return blocks;
}

function phrasing(nodes: PhrasingContent[] | undefined, ctx: Ctx, _align: AlignSlot, wiki: WikiSlot): PMNode[] {
  const out: PMNode[] = [];
  const state: InlineState = { marks: ctx.marks, open: [] };
  for (const node of nodes ?? []) inlineInto(node, state, out, wiki);
  return out;
}

/**
 * Slice the source for a block so unedited blocks can be written back verbatim.
 * Offsets refer to the wikilink-substituted text, so placeholders are restored.
 */
function sourceOf(markdown: string, node: { position?: { start: { offset?: number }; end: { offset?: number } } }, wiki: WikiSlot): string | null {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start == null || end == null) return null;
  return restoreWikilinks(markdown.slice(start, end), wiki.links);
}

const ALIGN_OPEN = /^<(?<tag>p|div|h[1-6])\b[^>]*>/i;

/** Read an alignment from `<p align=..>` or `<p style="text-align:..">`. */
function alignmentOfTag(openTag: string): string | null {
  const attr = /\balign\s*=\s*["']?(left|center|right|justify)/i.exec(openTag)?.[1];
  if (attr) return parseAlign(attr) ?? null;
  const style = /\bstyle\s*=\s*["']([^"']*)["']/i.exec(openTag)?.[1];
  const fromStyle = style ? /text-align\s*:\s*(left|center|right|justify)/i.exec(style)?.[1] : undefined;
  return parseAlign(fromStyle) ?? null;
}

/** True for `<div align=..>text</div>` style wrappers produced by this app. */
function isSelfContainedAlignmentWrapper(html: string): boolean {
  const open = ALIGN_OPEN.exec(html);
  if (!open?.groups?.tag) return false;
  const tag = open.groups.tag.toLowerCase();
  const withoutOpen = html.slice(open[0].length);
  return withoutOpen.trimEnd().toLowerCase().endsWith(`</${tag}>`);
}

/** Strip the wrapper tags and the blank lines Markdown put inside it. */
function innerTextOf(html: string): string {
  const open = ALIGN_OPEN.exec(html);
  if (!open?.groups?.tag) return html;
  const tag = open.groups.tag.toLowerCase();
  return html
    .slice(open[0].length)
    .replace(new RegExp(`</${tag}>\\s*$`, "i"), "")
    .replace(/^\s*\n/, "")
    .replace(/\n\s*$/, "")
    .trim();
}

function convertBlock(node: RootContent, markdown: string, wiki: WikiSlot): { nodes: PMNode[]; source: string | null } {
  const source = sourceOf(markdown, node, wiki);
  switch (node.type) {
    case "paragraph": {
      const align: AlignSlot = { value: null };
      const content = phrasing((node as Paragraph).children, { marks: [] }, align, wiki);
      const nodes = splitInlineBlocks(content, align.value ? { textAlign: align.value } : undefined);
      return {
        // A paragraph with no text would vanish; keep an empty paragraph.
        nodes: nodes.length > 0 ? nodes : [{ type: "paragraph", ...(align.value ? { attrs: { textAlign: align.value } } : {}) }],
        source,
      };
    }
    case "heading": {
      const heading = node as Heading;
      const align: AlignSlot = { value: null };
      const content = phrasing(heading.children, { marks: [] }, align, wiki).map((child) =>
        child.type === IMAGE_PLACEHOLDER
          ? { type: "text", text: String(child.attrs?.alt ?? "") }
          : child,
      );
      return {
        nodes: [
          {
            type: "heading",
            attrs: { level: heading.depth, ...(align.value ? { textAlign: align.value } : {}) },
            ...(content.length ? { content } : {}),
          },
        ],
        source,
      };
    }
    case "code": {
      const code = node as Code;
      return {
        nodes: [
          {
            type: "codeBlock",
            attrs: { language: code.lang ?? null },
            ...(code.value ? { content: [{ type: "text", text: code.value }] } : {}),
          },
        ],
        source,
      };
    }
    case "blockquote": {
      const children = convertBlocks((node as Blockquote).children, markdown, wiki);
      return {
        nodes: [{ type: "blockquote", content: children.length ? children : [{ type: "paragraph" }] }],
        source,
      };
    }
    case "list":
      return { nodes: [convertList(node as List, markdown, wiki)], source };
    case "table":
      return { nodes: [convertTable(node as Table, markdown, wiki)], source };
    case "thematicBreak":
      return { nodes: [{ type: "horizontalRule" }], source };
    case "html": {
      // A single line `<div align>` is a paragraph attribute; anything else is
      // preserved verbatim so embedded HTML (iframes, widgets) is never lost.
      const html = (node as Html).value;
      const openTag = ALIGN_OPEN.exec(html)?.[0] ?? "";
      const align = openTag ? alignmentOfTag(openTag) : null;
      if (align && isSelfContainedAlignmentWrapper(html)) {
        // `<p align=..>`, `<p style="text-align:..">` and the div wrapper this app
        // writes all mean "align this block"; parse the inside as inline content.
        const inner = innerTextOf(html);
        const content = innerTextNodes(inner, wiki);
        return {
          nodes: [
            {
              type: "paragraph",
              attrs: { textAlign: align },
              ...(content.length > 0 ? { content } : {}),
            },
          ],
          source,
        };
      }
      return { nodes: [{ type: "rawHtmlBlock", attrs: { value: html } }], source };
    }
    case "math":
      return {
        nodes: [{ type: "blockMath", attrs: { latex: String((node as { value?: string }).value ?? "") } }],
        source,
      };
    case "definition":
    case "footnoteDefinition":
      return { nodes: [{ type: "rawHtmlBlock", attrs: { value: "" } }], source };
    default: {
      const children = (node as { children?: RootContent[] }).children;
      return children ? { nodes: convertBlocks(children, markdown, wiki), source } : { nodes: [], source };
    }
  }
}

function convertBlocks(nodes: RootContent[], markdown: string, wiki: WikiSlot): PMNode[] {
  const out: PMNode[] = [];
  for (const node of nodes) out.push(...convertBlock(node, markdown, wiki).nodes);
  return out;
}

function convertList(list: List, markdown: string, wiki: WikiSlot): PMNode {
  const ordered = Boolean(list.ordered);
  const isTask = list.children.some((item) => item.checked != null);
  const items: PMNode[] = [];
  for (const item of list.children as ListItem[]) {
    const children = convertBlocks(item.children, markdown, wiki);
    const content = children.length ? children : [{ type: "paragraph" } as PMNode];
    items.push({
      type: isTask ? "taskItem" : "listItem",
      ...(isTask ? { attrs: { checked: item.checked === true } } : {}),
      content,
    });
  }
  const orderedAttrs = ordered && list.start && list.start !== 1 ? { attrs: { start: list.start } } : {};
  if (isTask) return { type: "taskList", content: items };
  return {
    type: ordered ? "orderedList" : "bulletList",
    ...orderedAttrs,
    content: items.length ? items : [{ type: "listItem", content: [{ type: "paragraph" }] }],
  };
}

/** GFM stores column alignment on the cell; mirror it onto the node. */
function tableAlignment(cell: TableCell): string | null {
  const align = (cell as unknown as { align?: string | null }).align;
  return typeof align === "string" && align ? align : null;
}

/** Parse a standalone HTML fragment as inline content of one paragraph. */
function innerTextNodes(html: string, wiki: WikiSlot): PMNode[] {
  const out: PMNode[] = [];
  const state: InlineState = { marks: [], open: [] };
  applyHtml(html, state, out, wiki);
  return out;
}

/** Inline content for contexts that cannot hold block nodes (table cells, headings). */
function inlineWithoutBlocks(children: PhrasingContent[] | undefined, wiki: WikiSlot): PMNode[] {
  return phrasing(children, { marks: [] }, { value: null }, wiki).map((child) =>
    child.type === IMAGE_PLACEHOLDER ? { type: "text", text: String(child.attrs?.alt ?? "") } : child,
  );
}

function convertTable(table: Table, markdown: string, wiki: WikiSlot): PMNode {
  void markdown;
  const rows: PMNode[] = [];
  table.children.forEach((row, rowIndex) => {
    const cells = (row.children as TableCell[]).map((cell) => ({
      type: rowIndex === 0 ? "tableHeader" : "tableCell",
      ...(tableAlignment(cell) ? { attrs: { align: tableAlignment(cell) } } : {}),
      // Table cells hold inline content only, so an image degrades to its alt text.
      content: [{ type: "paragraph", content: inlineWithoutBlocks(cell.children, wiki) }],
    }));
    if (cells.length > 0) rows.push({ type: "tableRow", content: cells });
  });
  return { type: "table", content: rows };
}

export function markdownToDoc(markdown: string): { doc: PMNode; origin: MarkdownOrigin } {
  const { tree, wikilinks, replaced } = parseMarkdown(markdown);
  const wiki: WikiSlot = { links: wikilinks };
  const nodes: PMNode[] = [];
  const sources: Array<string | null> = [];
  for (const child of tree.children) {
    const converted = convertBlock(child, replaced, wiki);
    for (const node of converted.nodes) {
      nodes.push(node);
      sources.push(converted.source);
    }
  }
  if (nodes.length === 0) {
    return { doc: { type: "doc", content: [{ type: "paragraph" }] }, origin: { sources: [""], snapshots: [] } };
  }
  return { doc: { type: "doc", content: nodes }, origin: { sources, snapshots: [] } };
}
