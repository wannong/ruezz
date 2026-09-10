import type { PageSummary } from "../api";

type BacklinksPaneProps = {
  pageId: string | null;
  links: PageSummary[];
  onOpen: (id: string) => void;
};

export function BacklinksPane({ pageId, links, onOpen }: BacklinksPaneProps) {
  if (!pageId) {
    return <div className="empty">打开一篇笔记查看反链</div>;
  }
  if (links.length === 0) {
    return <div className="empty">没有指向此页的链接</div>;
  }

  return (
    <ul className="file-tree">
      {links.map((p) => (
        <li key={p.id}>
          <button type="button" className="tree-label search-hit" onClick={() => onOpen(p.id)}>
            <span className="file-name">{p.title ?? p.id}</span>
            <span className="file-meta">{p.id}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
