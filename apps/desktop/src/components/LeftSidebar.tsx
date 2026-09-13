import { useEffect } from "react";
import { ChevronLeft } from "lucide-react";
import type { PageSummary } from "../api";
import { attachResizeX } from "../lib/pointerResize";
import type { WikiClip } from "../lib/fileTree";
import { FileTree } from "./FileTree";
import { Presence } from "./Presence";
import { SearchPane } from "./SearchPane";

export type LinkPicker = {
  fromId: string;
  range?: { start: number; end: number };
};

type LeftSidebarProps = {
  view: "files" | "search";
  pages: PageSummary[];
  folders: string[];
  activeId: string | null;
  clipboard: WikiClip | null;
  busy: boolean;
  width: number;
  collapsed: boolean;
  overlay: boolean;
  linkPicker: LinkPicker | null;
  onOpen: (id: string) => void;
  onCopy: (clip: WikiClip) => void;
  onPaste: (folderId: string) => void;
  onRename: (kind: "page" | "folder", fromId: string, name: string) => void;
  onCreateNote: (folderId: string, name: string) => void;
  onCreateFolder: (folderId: string, name: string) => void;
  onReveal: (kind: "root" | "page" | "folder", id?: string) => void;
  onLink: (pageId: string) => void;
  onRelatedSessions?: (pageId: string, label: string) => void;
  onPickLink: (toId: string) => void;
  onCloseLinkPicker: () => void;
  onError: (message: string) => void;
  onResize: (dx: number) => void;
};

export function LeftSidebar({
  view,
  pages,
  folders,
  activeId,
  clipboard,
  busy,
  width,
  collapsed,
  overlay,
  linkPicker,
  onOpen,
  onCopy,
  onPaste,
  onRename,
  onCreateNote,
  onCreateFolder,
  onReveal,
  onLink,
  onRelatedSessions,
  onPickLink,
  onCloseLinkPicker,
  onError,
  onResize,
}: LeftSidebarProps) {
  useEffect(() => {
    if (!linkPicker) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseLinkPicker();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [linkPicker, onCloseLinkPicker]);

  const linking = linkPicker !== null;
  const aside = (
    <aside
      className={`sidebar sidebar-left${overlay ? " overlay" : ""}`}
      style={{ width }}
    >
      <div className="sidebar-header">
        {linking ? (
          <button type="button" className="sidebar-back" onClick={onCloseLinkPicker}>
            <ChevronLeft size={14} />
            链接
          </button>
        ) : (
          <span>{view === "files" ? "文件" : "搜索"}</span>
        )}
      </div>
      {linking ? (
        <SearchPane
          onOpen={onPickLink}
          onError={onError}
          excludeId={linkPicker.fromId}
          browsePages={pages}
          placeholder="搜索要链接的页面…"
          emptyHint="选择一篇笔记插入链接"
        />
      ) : view === "files" ? (
        <FileTree
          pages={pages}
          folders={folders}
          activeId={activeId}
          clipboard={clipboard}
          disabled={busy}
          onOpen={onOpen}
          onCopy={onCopy}
          onPaste={onPaste}
          onRename={onRename}
          onCreateNote={onCreateNote}
          onCreateFolder={onCreateFolder}
          onReveal={onReveal}
           onLink={onLink}
           onRelatedSessions={onRelatedSessions}
        />
      ) : (
        <SearchPane onOpen={onOpen} onError={onError} />
      )}
      <div
        className="resize-handle"
        onPointerDown={(e) => attachResizeX(e, onResize)}
      />
    </aside>
  );

  if (overlay) return <Presence open={!collapsed}>{aside}</Presence>;
  if (collapsed) return null;
  return aside;
}
