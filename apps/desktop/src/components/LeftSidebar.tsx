import type { PointerEvent as ReactPointerEvent } from "react";
import type { PageSummary } from "../api";
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
  onError,
  onResize,
}: LeftSidebarProps) {
  if (collapsed) return null;

  return (
    <aside
      className={`sidebar sidebar-left${overlay ? " overlay" : ""}`}
      style={{ width }}
    >
      <div className="sidebar-header">{view === "files" ? "文件" : "搜索"}</div>
      {view === "files" ? (
        <FileTree pages={pages} activeId={activeId} onOpen={onOpen} />
      ) : (
        <SearchPane onOpen={onOpen} onError={onError} />
      )}
      <div
        className="resize-handle"
        onPointerDown={(e) => attachResize(e, onResize)}
      />
    </aside>
  );
}

export function attachResize(
  e: ReactPointerEvent<HTMLDivElement>,
  onDelta: (dx: number) => void,
): void {
  e.preventDefault();
  const el = e.currentTarget;
  el.setPointerCapture(e.pointerId);
  let last = e.clientX;
  const move = (ev: globalThis.PointerEvent) => {
    onDelta(ev.clientX - last);
    last = ev.clientX;
  };
  const up = () => {
    el.releasePointerCapture(e.pointerId);
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", up);
  };
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
}
