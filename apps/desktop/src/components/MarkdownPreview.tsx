import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PageSummary } from "../api";
import { resolvePageId, rewriteWikilinks, slugHeading, WIKI_HREF_PREFIX } from "../lib/wikilinks";

type MarkdownPreviewProps = {
  markdown: string;
  pages: PageSummary[];
  onOpen: (id: string) => void;
};

function headingText(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(headingText).join("");
  if (children && typeof children === "object" && "props" in children) {
    return headingText((children as { props: { children?: ReactNode } }).props.children);
  }
  return "";
}

export function MarkdownPreview({ markdown, pages, onOpen }: MarkdownPreviewProps) {
  const source = rewriteWikilinks(markdown);

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
