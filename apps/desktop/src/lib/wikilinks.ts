import type { PageSummary } from "../api";

export const WIKI_HREF_PREFIX = "#wiki/";

export function resolvePageId(target: string, pages: PageSummary[]): string | undefined {
  const t = target
    .replace(/^wiki\//, "")
    .replace(/\.md$/i, "")
    .trim();
  if (!t) return undefined;
  const lower = t.toLowerCase();
  const exact = pages.find((p) => p.id === t || p.id.toLowerCase() === lower);
  if (exact) return exact.id;
  const byBase = pages.find((p) => p.id.split("/").pop()?.toLowerCase() === lower);
  if (byBase) return byBase.id;
  return pages.find((p) => p.title?.toLowerCase() === lower)?.id;
}

/** Turn `[[id]]` / `[[id|alias]]` into in-app hash links for react-markdown. */
export function rewriteWikilinks(markdown: string): string {
  return markdown.replace(/\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g, (_full, target: string, alias?: string) => {
    const label = (alias ?? target).trim();
    return `[${label}](${WIKI_HREF_PREFIX}${encodeURIComponent(target.trim())})`;
  });
}

export function slugHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
