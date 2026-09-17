import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import type { Idea, IdeaSelector, IdeaTarget, PageSummary } from "../api";
import { resolvePageId, rewriteWikilinks, slugHeading, WIKI_HREF_PREFIX } from "../lib/wikilinks";
import { convertFileSrc } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauriRuntime } from "../api";
import { rangeFromSelector, selectorFromRange } from "../lib/ideaAnchors";
import { ContextMenu } from "./ContextMenu";

type MarkdownPreviewProps = {
  markdown: string;
  pages: PageSummary[];
  onOpen: (id: string) => void;
  assetRoot?: string;
  basePath?: string;
  ideaTarget?: IdeaTarget;
  ideas?: Idea[];
  ideasVisible?: boolean;
  onCreateIdea?: (selector: IdeaSelector, content: string) => Promise<boolean>;
};

type MarkRect = { id: string; color: Idea["color"]; left: number; top: number; width: number; height: number };

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

export function MarkdownPreview({
  markdown,
  pages,
  onOpen,
  assetRoot,
  basePath,
  ideaTarget,
  ideas = [],
  ideasVisible = true,
  onCreateIdea,
}: MarkdownPreviewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{ selector: IdeaSelector; x: number; y: number } | null>(null);
  const [menu, setMenu] = useState<{ selector: IdeaSelector; x: number; y: number } | null>(null);
  const [composer, setComposer] = useState<{ selector: IdeaSelector; x: number; y: number } | null>(null);
  const [content, setContent] = useState("");
  const [marks, setMarks] = useState<MarkRect[]>([]);
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

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !ideasVisible) {
      setMarks([]);
      return;
    }
    const update = () => {
      const rootRect = root.getBoundingClientRect();
      const next: MarkRect[] = [];
      for (const idea of ideas) {
        if (idea.status === "resolved") continue;
        const range = rangeFromSelector(root, idea.selector);
        if (!range) continue;
        for (const rect of range.getClientRects()) {
          if (rect.width <= 0 || rect.height <= 0) continue;
          next.push({
            id: idea.id,
            color: idea.color,
            left: rect.left - rootRect.left,
            top: rect.top - rootRect.top,
            width: rect.width,
            height: rect.height,
          });
        }
      }
      setMarks(next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [ideas, ideasVisible, source]);

  const captureSelection = (event: MouseEvent<HTMLDivElement>) => {
    if (!ideaTarget || !onCreateIdea) return;
    const root = rootRef.current;
    const browserSelection = window.getSelection();
    if (!root || !browserSelection) {
      setSelection(null);
      return;
    }
    let range = browserSelection.rangeCount > 0 && !browserSelection.isCollapsed
      ? browserSelection.getRangeAt(0).cloneRange()
      : null;
    if (!range && event.type === "contextmenu") {
      const documentWithCaret = document as Document & {
        caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
        caretRangeFromPoint?: (x: number, y: number) => Range | null;
      };
      const position = documentWithCaret.caretPositionFromPoint?.(event.clientX, event.clientY);
      range = position ? document.createRange() : documentWithCaret.caretRangeFromPoint?.(event.clientX, event.clientY) ?? null;
      if (range && position) range.setStart(position.offsetNode, position.offset);
      if (range && position) range.collapse(true);
      if (range?.startContainer.nodeType === Node.TEXT_NODE) {
        const text = range.startContainer.textContent ?? "";
        let start = range.startOffset;
        let end = range.startOffset;
        while (start > 0 && !/\s/u.test(text[start - 1])) start -= 1;
        while (end < text.length && !/\s/u.test(text[end])) end += 1;
        range.setStart(range.startContainer, start);
        range.setEnd(range.startContainer, end);
      }
    }
    if (!range) {
      setSelection(null);
      return;
    }
    const selector = selectorFromRange(root, range);
    if (!selector) return;
    const rangeRect = range.getBoundingClientRect();
    setSelection({ selector, x: rangeRect.right, y: rangeRect.bottom + 6 });
    if (event.type === "contextmenu") {
      event.preventDefault();
      setMenu({ selector, x: event.clientX, y: event.clientY });
      setSelection(null);
    }
  };

  const openComposer = (picked: { selector: IdeaSelector; x: number; y: number }) => {
    setContent("");
    setComposer(picked);
    setSelection(null);
    setMenu(null);
  };

  const submitIdea = async () => {
    const note = content.trim();
    if (!composer || !note || !onCreateIdea) return;
    const saved = await onCreateIdea(composer.selector, note);
    if (!saved) return;
    setComposer(null);
    setContent("");
    window.getSelection()?.removeAllRanges();
  };

  return (
    <div
      ref={rootRef}
      className={`md-body${ideaTarget ? " md-annotatable" : ""}`}
      onMouseUp={captureSelection}
      onContextMenu={captureSelection}
    >
      {marks.length > 0 && (
        <div className="idea-mark-layer" aria-hidden="true">
          {marks.map((mark, index) => (
            <span
              key={`${mark.id}:${index}`}
              data-idea-mark={mark.id}
              className={`idea-mark idea-mark-${mark.color}`}
              style={{ left: mark.left, top: mark.top, width: mark.width, height: mark.height }}
            />
          ))}
        </div>
      )}
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
      {selection && (
        <button
          type="button"
          className="idea-selection-action"
          style={{ left: selection.x, top: selection.y }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => openComposer(selection)}
        >
          + Idea
        </button>
      )}
      {composer && (
        <div className="idea-composer" style={{ left: composer.x, top: composer.y }}>
          <div className="idea-composer-quote">“{composer.selector.exact.slice(0, 120)}”</div>
          <textarea
            autoFocus
            value={content}
            maxLength={20_000}
            placeholder="记下你的想法…"
            onChange={(event) => setContent(event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === "Enter") void submitIdea();
              if (event.key === "Escape") setComposer(null);
            }}
          />
          <div className="idea-composer-actions">
            <button type="button" onClick={() => setComposer(null)}>取消</button>
            <button type="button" className="primary" disabled={!content.trim()} onClick={() => void submitIdea()}>保存 Idea</button>
          </div>
        </div>
      )}
      <ContextMenu
        open={menu !== null}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        items={menu ? [{ type: "item", label: "添加 Idea", onClick: () => openComposer(menu) }] : []}
        onClose={() => setMenu(null)}
      />
    </div>
  );
}
