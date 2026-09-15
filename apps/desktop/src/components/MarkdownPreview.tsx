import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import type { PageSummary } from "../api";
import { resolvePageId, rewriteWikilinks, slugHeading, WIKI_HREF_PREFIX } from "../lib/wikilinks";
import { convertFileSrc } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauriRuntime } from "../api";

type MarkdownPreviewProps = {
  markdown: string;
  pages: PageSummary[];
  onOpen: (id: string) => void;
  assetRoot?: string;
  basePath?: string;
};

function headingText(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(headingText).join("");
  if (children && typeof children === "object" && "props" in children) {
    return headingText((children as { props: { children?: ReactNode } }).props.children);
  }
  return "";
}

function normalizeRelativePath(path: string): string | undefined {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) return undefined;
      parts.pop();
    }
    else parts.push(part);
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

function safeHref(href: string | undefined): string | undefined {
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

export function MarkdownPreview({ markdown, pages, onOpen, assetRoot, basePath }: MarkdownPreviewProps) {
  const source = rewriteWikilinks(markdown);
  const imageSrc = (src: string): string => {
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

  return (
    <div className="md-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith(WIKI_HREF_PREFIX)) {
              const id = internalTarget(`wiki/${href.slice(WIKI_HREF_PREFIX.length)}`, basePath, pages);
              if (!id) return <span>{children}</span>;
              return (
                <button type="button" className="wikilink" onClick={() => onOpen(id)}>
                  {children}
                </button>
              );
            }
            const safe = safeHref(href);
            const external = Boolean(safe && /^(?:https?:|mailto:)/i.test(safe));
            const id = !external && safe ? internalTarget(safe, basePath, pages) : undefined;
            if (id) {
              return (
                <button type="button" className="wikilink" onClick={() => onOpen(id)}>
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
          img: ({ src, alt, title }) => (
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
          h1: ({ children }) => <h1 id={slugHeading(headingText(children))}>{children}</h1>,
          h2: ({ children }) => <h2 id={slugHeading(headingText(children))}>{children}</h2>,
          h3: ({ children }) => <h3 id={slugHeading(headingText(children))}>{children}</h3>,
          h4: ({ children }) => <h4 id={slugHeading(headingText(children))}>{children}</h4>,
          h5: ({ children }) => <h5 id={slugHeading(headingText(children))}>{children}</h5>,
          h6: ({ children }) => <h6 id={slugHeading(headingText(children))}>{children}</h6>,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
