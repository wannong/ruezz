import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PageSummary } from "../api";
import { resolvePageId, rewriteWikilinks, slugHeading, WIKI_HREF_PREFIX } from "../lib/wikilinks";
import { convertFileSrc } from "@tauri-apps/api/core";
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
    const parts = `${assetRoot.replace(/[\\/]+$/, "")}/${base}/${relative}`
      .split(/[\\/]+/)
      .filter((part) => part && part !== ".");
    const normalized: string[] = [];
    for (const part of parts) {
      if (part === "..") normalized.pop();
      else normalized.push(part);
    }
    return convertFileSrc(normalized.join("/"));
  };

  return (
    <div className="md-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith(WIKI_HREF_PREFIX)) {
              const target = decodeURIComponent(href.slice(WIKI_HREF_PREFIX.length));
              const id = resolvePageId(target, pages) ?? target;
              return (
                <button type="button" className="wikilink" onClick={() => onOpen(id)}>
                  {children}
                </button>
              );
            }
            return (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
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
