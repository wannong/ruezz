import type { PageSummary } from "../api";
import { attachResizeX } from "../lib/pointerResize";
import { FileTree } from "./FileTree";
import { SearchPane } from "./SearchPane";

type LeftSidebarProps = {
  view: "files" | "search";
  pages: PageSummary[];
  activeId: string | null;
  width: number;
  collapsed: boolean;
  overlay: boolean;
  onOpen: (id: string) => void;
  onNewNote?: () => void;
  onError: (message: string) => void;
  onResize: (dx: number) => void;
};

export function LeftSidebar({
  view,
  pages,
  activeId,
  width,
  collapsed,
  overlay,
  onOpen,
  onNewNote,
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
        {view === "files" && onNewNote && (
          <button type="button" className="icon-btn sidebar-new" title="新建笔记" onClick={onNewNote}>
            +
          </button>
        )}
      </div>
      {view === "files" ? (
        <FileTree pages={pages} activeId={activeId} onOpen={onOpen} />
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
