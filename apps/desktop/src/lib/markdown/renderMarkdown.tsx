import type { ReactNode } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { unified } from "unified";
import type { PageSummary } from "../../api";
import { isTauriRuntime } from "../../api";
import { resolvePageId, rewriteWikilinks, slugHeading, WIKI_HREF_PREFIX } from "../wikilinks";

export const remarkPlugins = [remarkGfm, remarkMath];
export const rehypePlugins = [rehypeKatex];

export type MarkdownRenderContext = {
  pages: PageSummary[];
  onOpen: (id: string) => void;
  assetRoot?: string;
  basePath?: string;
};

function normalizeRelativePath(path: string): string | undefined {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) return undefined;
      parts.pop();
    } else parts.push(part);
  }
  return parts.join("/") || undefined;
}

function internalTarget(href: string, basePath: string | undefined, pages: PageSummary[]): string | undefined {
  let target = href.split(/[?#]/, 1)[0];
  try {
    target = decodeURIComponent(target);
  } catch {
    return undefined;
  }
  const isWiki = /^(?:\.\.\/|\.\/)*wiki\//i.test(target);
  if (!isWiki && !/\.md$/i.test(target)) return undefined;
  if (!isWiki) {
    const base = (basePath ?? "").replace(/\\/g, "/").split("/").slice(0, -1).join("/");
    const normalized = normalizeRelativePath(`${base}/${target}`);
    if (!normalized) return undefined;
    target = normalized;
  } else {
    target = target.replace(/^(?:\.\.\/|\.\/)*wiki\//i, "");
  }
  target = target.replace(/\.md$/i, "");
  return (resolvePageId(target, pages) ?? target) || undefined;
}

export function safeHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  const value = href.trim();
  if (!value) return undefined;
  if (value.startsWith("//")) return `https:${value}`;
  try {
    const protocol = new URL(value, window.location.href).protocol.toLowerCase();
    if (protocol === "http:" || protocol === "https:" || protocol === "mailto:") return value;
    if (value.startsWith("#")) return value;
    if (/^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith("//")) return undefined;
    return value;
  } catch {
    return undefined;
  }
}

function externalLabel(href: string): string {
  try {
    const url = new URL(href);
    return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`.replace(/\/$/, "");
  } catch {
    return href;
  }
}

export function headingText(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(headingText).join("");
  if (children && typeof children === "object" && "props" in children) {
    return headingText((children as { props: { children?: ReactNode } }).props.children);
  }
  return "";
}

export function createImageSrcResolver(assetRoot?: string, basePath?: string) {
  return (src: string): string => {
    if (!assetRoot || !isTauriRuntime() || /^(?:[a-z]+:|\/\/|data:|#)/i.test(src)) return src;
    let clean = src.split("#")[0].split("?")[0];
    try {
      clean = decodeURIComponent(clean);
    } catch {
      // Keep the original path if a document contains an incomplete escape.
    }
    const base = (basePath ?? "").replace(/\\/g, "/").split("/").slice(0, -1).join("/");
    const relative = clean.replace(/^\.\//, "");
    const vaultRelative = normalizeRelativePath(`${base}/${relative}`);
    if (!vaultRelative || !vaultRelative.toLowerCase().startsWith("wiki/")) return src;
    const root = assetRoot.replace(/[\\/]+$/, "");
    const parts = `${root}/${vaultRelative}`.split(/[\\/]+/).filter(Boolean);
    return convertFileSrc(parts.join("/"));
  };
}

export function createMarkdownComponents(ctx: MarkdownRenderContext) {
  const imageSrc = createImageSrcResolver(ctx.assetRoot, ctx.basePath);
  return {
    a: ({ href, children }: { href?: string; children?: ReactNode }) => {
      if (href?.startsWith(WIKI_HREF_PREFIX)) {
        const id = internalTarget(`wiki/${href.slice(WIKI_HREF_PREFIX.length)}`, ctx.basePath, ctx.pages);
        if (!id) return <span>{children}</span>;
        return (
          <button type="button" className="wikilink" onClick={() => ctx.onOpen(id)}>
            {children}
          </button>
        );
      }
      const safe = safeHref(href);
      const external = Boolean(safe && /^(?:https?:|mailto:)/i.test(safe));
      const id = !external && safe ? internalTarget(safe, ctx.basePath, ctx.pages) : undefined;
      if (id) {
        return (
          <button type="button" className="wikilink" onClick={() => ctx.onOpen(id)}>
            {children}
          </button>
        );
      }
      if (!safe) return <span>{children}</span>;
      const label = external ? externalLabel(safe) : children;
      return (
        <a
          href={safe}
          title={safe}
          target={external ? "_blank" : undefined}
          rel={external ? "noreferrer" : undefined}
          onClick={
            external
              ? (event) => {
                  event.preventDefault();
                  if (isTauriRuntime()) void openUrl(safe);
                  else window.open(safe, "_blank", "noopener,noreferrer");
                }
              : undefined
          }
        >
          {external && typeof children === "string" && children === safe ? label : children}
        </a>
      );
    },
    img: ({ src, alt, title }: { src?: string; alt?: string; title?: string }) => (
      <img
        src={src ? imageSrc(src) : undefined}
        alt={alt ?? ""}
        title={title ?? undefined}
        loading="lazy"
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
      />
    ),
    h1: ({ children }: { children?: ReactNode }) => <h1 id={slugHeading(headingText(children))}>{children}</h1>,
    h2: ({ children }: { children?: ReactNode }) => <h2 id={slugHeading(headingText(children))}>{children}</h2>,
    h3: ({ children }: { children?: ReactNode }) => <h3 id={slugHeading(headingText(children))}>{children}</h3>,
    h4: ({ children }: { children?: ReactNode }) => <h4 id={slugHeading(headingText(children))}>{children}</h4>,
    h5: ({ children }: { children?: ReactNode }) => <h5 id={slugHeading(headingText(children))}>{children}</h5>,
    h6: ({ children }: { children?: ReactNode }) => <h6 id={slugHeading(headingText(children))}>{children}</h6>,
  };
}

const htmlProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeKatex)
  .use(rehypeStringify);

const htmlCache = new Map<string, string>();

function rewriteWikilinksForHtml(markdown: string, ctx: MarkdownRenderContext): string {
  let html = rewriteWikilinks(markdown);
  return html.replace(
    /\[([^\]]+)\]\(#wiki\/([^)]+)\)/g,
    (_full, label: string, encoded: string) => {
      const target = decodeURIComponent(encoded);
      const id = internalTarget(`wiki/${target}`, ctx.basePath, ctx.pages) ?? target;
      return `<button type="button" class="wikilink" data-wikilink="${encodeURIComponent(id)}">${label}</button>`;
    },
  );
}

export async function renderMarkdownToHtml(markdown: string, ctx: MarkdownRenderContext): Promise<string> {
  const key = `${markdown}\0${ctx.basePath ?? ""}`;
  const cached = htmlCache.get(key);
  if (cached != null) return cached;
  const source = rewriteWikilinksForHtml(markdown, ctx);
  const file = await htmlProcessor.process(source);
  let html = String(file);
  if (ctx.assetRoot && isTauriRuntime()) {
    const imageSrc = createImageSrcResolver(ctx.assetRoot, ctx.basePath);
    html = html.replace(/<img([^>]*?)src="([^"]+)"([^>]*)>/g, (_m, pre, src, post) => {
      const resolved = imageSrc(src);
      return `<img${pre}src="${resolved}"${post}>`;
    });
  }
  if (htmlCache.size > 500) htmlCache.clear();
  htmlCache.set(key, html);
  return html;
}

export function renderMarkdownToHtmlSync(markdown: string, ctx: MarkdownRenderContext): string {
  const key = `sync:${markdown}\0${ctx.basePath ?? ""}`;
  const cached = htmlCache.get(key);
  if (cached != null) return cached;
  const source = rewriteWikilinksForHtml(markdown, ctx);
  const file = htmlProcessor.processSync(source);
  let html = String(file);
  if (ctx.assetRoot && isTauriRuntime()) {
    const imageSrc = createImageSrcResolver(ctx.assetRoot, ctx.basePath);
    html = html.replace(/<img([^>]*?)src="([^"]+)"([^>]*)>/g, (_m, pre, src, post) => {
      const resolved = imageSrc(src);
      return `<img${pre}src="${resolved}"${post}>`;
    });
  }
  if (htmlCache.size > 500) htmlCache.clear();
  htmlCache.set(key, html);
  return html;
}
