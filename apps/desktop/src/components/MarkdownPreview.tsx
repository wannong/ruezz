import { Check, Eye, EyeOff, StickyNote } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
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

const AGENT_STICKY_WIDTH = 200;

type MarkdownPreviewProps = {
  markdown: string;
  pages: PageSummary[];
  onOpen: (id: string) => void;
  assetRoot?: string;
  basePath?: string;
  ideaTarget?: IdeaTarget;
  ideas?: Idea[];
  ideasVisible?: boolean;
  onIdeasVisible?: (visible: boolean) => void;
  onCreateIdea?: (selector: IdeaSelector, content: string) => Promise<boolean>;
  onUpdateIdea?: (id: string, patch: Partial<Pick<Idea, "content" | "status">>) => Promise<void>;
  /** Quote the selected text into the Agent composer. */
  onAddToChat?: (text: string) => void;
};

type MarkRect = { id: string; color: Idea["color"]; left: number; top: number; width: number; height: number };
type StickyPlacement = {
  idea: Idea;
  left: number;
  top: number;
  width: number;
  anchorX: number;
  anchorY: number;
  /** Agent chat: pin with viewport right/bottom so the card opens upper-left. */
  fixed?: boolean;
  right?: number;
  bottom?: number;
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

export function MarkdownPreview({
  markdown,
  pages,
  onOpen,
  assetRoot,
  basePath,
  ideaTarget,
  ideas = [],
  ideasVisible = true,
  onIdeasVisible,
  onCreateIdea,
  onUpdateIdea,
  onAddToChat,
}: MarkdownPreviewProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{ selector: IdeaSelector; x: number; y: number } | null>(null);
  const [menu, setMenu] = useState<{ selector: IdeaSelector; x: number; y: number } | null>(null);
  const [composer, setComposer] = useState<{ selector: IdeaSelector; x: number; y: number } | null>(null);
  const [content, setContent] = useState("");
  const [marks, setMarks] = useState<MarkRect[]>([]);
  const [stickies, setStickies] = useState<StickyPlacement[]>([]);
  const [hoveredIdeaId, setHoveredIdeaId] = useState<string | null>(null);
  const hideTimer = useRef<number | null>(null);
  const canAnnotate = Boolean(ideaTarget && (onCreateIdea || onAddToChat));
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
    const surface = surfaceRef.current;
    if (!root || !surface) {
      setMarks([]);
      setStickies([]);
      return;
    }
    const update = () => {
      const surfaceRect = surface.getBoundingClientRect();
      const next: MarkRect[] = [];
      const anchored: StickyPlacement[] = [];
      for (const idea of ideas) {
        if (idea.status === "resolved") continue;
        if (idea.selector.kind === "pdf-region") continue;
        const range = rangeFromSelector(root, idea.selector);
        if (!range) continue;
        const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
        for (const rect of rects) {
          if (rect.width <= 0 || rect.height <= 0) continue;
          next.push({
            id: idea.id,
            color: idea.color,
            left: rect.left - surfaceRect.left,
            top: rect.top - surfaceRect.top,
            width: rect.width,
            height: rect.height,
          });
        }
        const anchor = rects[0] ?? rects.at(-1);
        if (!anchor) continue;
        // Prefer each idea's own target so Agent notes always use left-upper layout.
        const agentSticky = idea.target.kind === "assistant" || ideaTarget?.kind === "assistant";
        if (agentSticky) {
          // Pin the sticky's right + bottom edges to the selection start.
          // The card then naturally extends upper-left (no transform needed).
          const width = AGENT_STICKY_WIDTH;
          anchored.push({
            idea,
            left: 0,
            top: 0,
            width,
            right: Math.max(0, window.innerWidth - anchor.left),
            bottom: Math.max(0, window.innerHeight - anchor.top),
            anchorX: anchor.left,
            anchorY: anchor.top + anchor.height / 2,
            fixed: true,
          });
          continue;
        }
        const noteWidth = Math.min(236, Math.max(184, surfaceRect.width - 16));
        const roomOnRight = surfaceRect.right - anchor.right;
        const placeBeside = roomOnRight >= noteWidth + 20;
        const left = placeBeside
          ? anchor.right - surfaceRect.left + 14
          : Math.max(8, Math.min(anchor.left - surfaceRect.left, surfaceRect.width - noteWidth - 8));
        const anchorTop = anchor.top - surfaceRect.top;
        const top = placeBeside ? anchorTop - 8 : anchorTop + anchor.height + 10;
        anchored.push({
          idea,
          left,
          top,
          width: noteWidth,
          anchorX: anchor.right - surfaceRect.left,
          anchorY: anchor.top - surfaceRect.top + anchor.height / 2,
        });
      }
      setMarks(next);
      setStickies(anchored);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [ideas, source, ideaTarget?.kind]);

  const showIdea = (id: string) => {
    if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
    setHoveredIdeaId(id);
  };
  const hideIdea = () => {
    if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setHoveredIdeaId(null), 100);
  };

  const captureSelection = (event: MouseEvent<HTMLDivElement>) => {
    if (!canAnnotate) return;
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
    // Pin point = selection start; floating UI opens upper-left from here.
    setSelection({ selector, x: rangeRect.left, y: rangeRect.top });
    if (event.type === "contextmenu") {
      event.preventDefault();
      setMenu({ selector, x: rangeRect.left, y: rangeRect.top });
      setSelection(null);
    }
  };

  const openComposer = (picked: { selector: IdeaSelector; x: number; y: number }) => {
    if (!onCreateIdea) return;
    setContent("");
    setComposer(picked);
    setSelection(null);
    setMenu(null);
  };

  const addSelectionToChat = (picked: { selector: IdeaSelector }) => {
    const text = (picked.selector.exact ?? "").trim();
    if (!text || !onAddToChat) return;
    onAddToChat(text);
    setSelection(null);
    setMenu(null);
    window.getSelection()?.removeAllRanges();
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

  const menuItems = menu
    ? [
        ...(onCreateIdea
          ? [{ type: "item" as const, label: "添加 Idea", onClick: () => openComposer(menu) }]
          : []),
        ...(onAddToChat
          ? [{ type: "item" as const, label: "加入对话", onClick: () => addSelectionToChat(menu) }]
          : []),
      ]
    : [];

  return (
    <div
      ref={surfaceRef}
      className={`md-annotation-surface${canAnnotate ? " md-annotatable" : ""}`}
    >
      {ideasVisible && marks.length > 0 && (
        <div className="idea-mark-layer">
          {marks.map((mark, index) => (
            <span
              key={`${mark.id}:${index}`}
              data-idea-mark={mark.id}
              className={`idea-mark${hoveredIdeaId === mark.id ? " active" : ""}`}
              style={{ left: mark.left, top: mark.top, width: mark.width, height: mark.height }}
              tabIndex={0}
              role="button"
              aria-label="查看 Idea"
              onMouseEnter={() => showIdea(mark.id)}
              onMouseLeave={hideIdea}
              onFocus={() => showIdea(mark.id)}
              onBlur={hideIdea}
            />
          ))}
        </div>
      )}
      <div ref={rootRef} className="md-body" onMouseUp={captureSelection} onContextMenu={captureSelection}>
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
      {ideas.some((idea) => idea.status === "open") && onIdeasVisible && (
        <button
          type="button"
          className={`idea-surface-toggle${ideasVisible ? " active" : ""}`}
          title={ideasVisible ? "隐藏全部便签" : "显示全部便签"}
          onClick={() => onIdeasVisible(!ideasVisible)}
        >
          <StickyNote size={14} />
          {ideasVisible ? <EyeOff size={13} /> : <Eye size={13} />}
          <span>{ideasVisible ? "隐藏便签" : `显示便签 · ${ideas.filter((idea) => idea.status === "open").length}`}</span>
        </button>
      )}
      {ideasVisible && hoveredIdeaId && (() => {
        const visible = stickies.filter((sticky) => sticky.idea.id === hoveredIdeaId);
        if (visible.length === 0) return null;
        const layer = visible.map((sticky) => (
          <IdeaStickyNote
            key={sticky.idea.id}
            placement={sticky}
            onUpdate={onUpdateIdea}
            onEnter={() => showIdea(sticky.idea.id)}
            onLeave={hideIdea}
          />
        ));
        // Fixed agent stickies portal out so chat overflow cannot clip them.
        if (visible.some((sticky) => sticky.fixed)) {
          return createPortal(<div className="idea-sticky-layer idea-sticky-layer-fixed">{layer}</div>, document.body);
        }
        return <div className="idea-sticky-layer">{layer}</div>;
      })()}
      {selection &&
        createPortal(
          <div
            className="idea-selection-actions"
            style={{
              top: "auto",
              left: "auto",
              right: Math.max(8, window.innerWidth - selection.x),
              bottom: Math.max(8, window.innerHeight - selection.y),
            }}
            onMouseDown={(event) => event.preventDefault()}
          >
            {onCreateIdea && (
              <button type="button" className="idea-selection-action" onClick={() => openComposer(selection)}>
                + Idea
              </button>
            )}
            {onAddToChat && (
              <button type="button" className="idea-selection-action" onClick={() => addSelectionToChat(selection)}>
                加入对话
              </button>
            )}
          </div>,
          document.body,
        )}
      {composer &&
        createPortal(
          <div
            className="idea-composer idea-composer-anchor"
            style={{
              top: "auto",
              left: "auto",
              right: Math.max(8, window.innerWidth - composer.x),
              bottom: Math.max(8, window.innerHeight - composer.y),
            }}
          >
            <div className="idea-composer-quote">“{(composer.selector.exact ?? "选中区域").slice(0, 120)}”</div>
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
          </div>,
          document.body,
        )}
      <ContextMenu
        open={menu !== null && menuItems.length > 0}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        items={menuItems}
        onClose={() => setMenu(null)}
      />
    </div>
  );
}

function IdeaStickyNote({
  placement,
  onUpdate,
  onEnter,
  onLeave,
}: {
  placement: StickyPlacement;
  onUpdate?: (id: string, patch: Partial<Pick<Idea, "content" | "status">>) => Promise<void>;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const { idea, left, top, width, right, bottom, anchorX, anchorY, fixed } = placement;
  const [draft, setDraft] = useState(idea.content);
  const [saving, setSaving] = useState(false);
  const dirty = draft.trim() !== idea.content;
  useEffect(() => setDraft(idea.content), [idea.content]);
  const save = async () => {
    if (!onUpdate || !draft.trim() || !dirty || saving) return;
    setSaving(true);
    try { await onUpdate(idea.id, { content: draft.trim() }); } finally { setSaving(false); }
  };
  const threadWidth = fixed ? 0 : Math.max(10, Math.abs(anchorX - (left + width)));
  const threadDx = Math.min(0, anchorX - left);
  return (
    <div
      className={`idea-sticky idea-sticky-hover${fixed ? " idea-sticky-fixed" : ""}`}
      style={
        fixed
          ? {
              width,
              top: "auto",
              left: "auto",
              right: right ?? 0,
              bottom: bottom ?? 0,
              transform: "none",
            }
          : { width, transform: `translate3d(${left}px, ${top}px, 0)` }
      }
      data-idea-sticky={idea.id}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {!fixed && (
        <span
          className="idea-sticky-thread"
          style={{
            width: threadWidth,
            transform: `translate3d(${threadDx}px, ${anchorY - top}px, 0)`,
          }}
          aria-hidden="true"
        />
      )}
      <div className="idea-sticky-head">
        <span>IDEA</span>
        <small>{new Date(idea.updatedAt).toLocaleDateString()}</small>
      </div>
      <div className="idea-sticky-quote">“{idea.selector.exact}”</div>
      <textarea value={draft} aria-label="Idea 便签内容" onChange={(event) => setDraft(event.target.value)} />
      <div className="idea-sticky-foot">
        <span>悬浮便签</span>
        {dirty && (
          <button type="button" disabled={saving || !draft.trim()} onClick={() => void save()}>
            <Check size={13} /> {saving ? "保存中" : "保存"}
          </button>
        )}
      </div>
    </div>
  );
}
