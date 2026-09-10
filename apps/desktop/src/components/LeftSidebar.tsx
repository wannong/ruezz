import type { PageSummary } from "../api";
import { attachResizeX } from "../lib/pointerResize";
import type { WikiClip } from "../lib/fileTree";
import { FileTree } from "./FileTree";
import { SearchPane } from "./SearchPane";

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
  onOpen: (id: string) => void;
  onCopy: (clip: WikiClip) => void;
  onPaste: (folderId: string) => void;
  onRename: (kind: "page" | "folder", fromId: string, name: string) => void;
  onCreateNote: (folderId: string, name: string) => void;
  onCreateFolder: (folderId: string, name: string) => void;
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
  onOpen,
  onCopy,
  onPaste,
  onRename,
  onCreateNote,
  onCreateFolder,
  onError,
  onResize,
}: LeftSidebarProps) {
  if (collapsed) return null;

  return (
    <aside
      className={`sidebar sidebar-left${overlay ? " overlay" : ""}`}
      style={{ width }}
    >
      <div className="sidebar-header">
        <span>{view === "files" ? "文件" : "搜索"}</span>
      </div>
      {view === "files" ? (
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
}
