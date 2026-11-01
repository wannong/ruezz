import { fromMarkdown } from "mdast-util-from-markdown";
import { toMarkdown, type Options as ToMarkdownOptions } from "mdast-util-to-markdown";
import type { Root } from "mdast";
import { gfm } from "micromark-extension-gfm";
import { gfmFromMarkdown, gfmToMarkdown } from "mdast-util-gfm";
import { math } from "micromark-extension-math";
import { mathFromMarkdown, mathToMarkdown } from "mdast-util-math";
import { escapeHtmlAttribute, hasStyle, type InlineStyle } from "./inlineHtml.ts";

/**
 * Wikilinks are not Markdown. Swap them for placeholders before parsing and put
 * them back when serialising so `[[page id]]` survives a round-trip untouched.
 */
export const WIKILINK_TOKEN = "\uE000";
const WIKILINK_PATTERN = /\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g;

export type ParsedWikilink = { target: string; label: string };

export function replaceWikilinks(markdown: string): { text: string; links: ParsedWikilink[] } {
  const links: ParsedWikilink[] = [];
  const text = markdown.replace(WIKILINK_PATTERN, (_full, target: string, alias?: string) => {
    const index = links.push({ target: target.trim(), label: (alias ?? target).trim() }) - 1;
    return `${WIKILINK_TOKEN}${index}${WIKILINK_TOKEN}`;
  });
  return { text, links };
}

export function restoreWikilinks(markdown: string, links: ParsedWikilink[]): string {
  if (links.length === 0) return markdown;
  return markdown.replace(
    new RegExp(`${WIKILINK_TOKEN}(\\d+)${WIKILINK_TOKEN}`, "g"),
    (full, index: string) => {
      const link = links[Number(index)];
      if (!link) return full;
      return link.label === link.target ? `[[${link.target}]]` : `[[${link.target}|${link.label}]]`;
    },
  );
}

export const markdownParseOptions = {
  extensions: [gfm(), math()],
  mdastExtensions: [gfmFromMarkdown(), mathFromMarkdown()],
};

/** mdast tree with wikilinks already replaced by placeholder text. */
export function parseMarkdown(markdown: string): {
  tree: Root;
  wikilinks: ParsedWikilink[];
  /** Placeholder-substituted source; mdast offsets refer to this string. */
  replaced: string;
} {
  const { text, links } = replaceWikilinks(markdown);
  return { tree: fromMarkdown(text, markdownParseOptions) as Root, wikilinks: links, replaced: text };
}

/** Build the inline HTML that carries attributes Markdown has no syntax for. */
export function inlineHtml(text: string, style: InlineStyle): string {
  if (!hasStyle(style)) return text;
  const declarations: string[] = [];
  if (style.color) declarations.push(`color: ${style.color}`);
  if (style.backgroundColor) declarations.push(`background-color: ${style.backgroundColor}`);
  if (style.fontSize) declarations.push(`font-size: ${style.fontSize}`);
  if (declarations.length === 0) return text;
  return `<span style="${escapeHtmlAttribute(declarations.join("; "))}">${text}</span>`;
}

/**
 * Wrapper tags (underline, sup, sub) are stored as attributes on the text run so
 * they compose with the style span without nesting surprises.
 */
export function wrapInlineHtml(text: string, wrappers: string[]): string {
  return wrappers.reduceRight((acc, tag) => `<${tag}>${acc}</${tag}>`, text);
}

export function joinPhrasing(values: string[]): string {
  return values.join("");
}

export const toMarkdownExtensions = [gfmToMarkdown(), mathToMarkdown()];

/** Serialize an mdast tree back to Markdown with GFM + math support. */
export function serialize(tree: Root): string {
  return toMarkdown(tree, { extensions: toMarkdownExtensions, bullet: "-", emphasis: "*", strong: "*" });
}

export { toMarkdown, type ToMarkdownOptions };
