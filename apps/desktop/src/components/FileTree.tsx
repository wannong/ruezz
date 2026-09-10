import { useState } from "react";
import { ChevronDown, ChevronRight, FileText, Folder } from "lucide-react";
import type { PageSummary } from "../api";
import { buildFileTree, type FileTreeNode } from "../lib/fileTree";

type FileTreeProps = {
  pages: PageSummary[];
  activeId: string | null;
  onOpen: (id: string) => void;
};

export function FileTree({ pages, activeId, onOpen }: FileTreeProps) {
  const tree = buildFileTree(pages);

  if (pages.length === 0) {
    return <div className="empty">暂无页面，先从左侧图标栏入库资料</div>;
  }

  return (
    <ul className="file-tree">
      {tree.map((node) => (
        <TreeItem key={node.path} node={node} activeId={activeId} onOpen={onOpen} depth={0} />
      ))}
    </ul>
  );
}

function TreeItem({
  node,
  activeId,
  onOpen,
  depth,
}: {
  node: FileTreeNode;
  activeId: string | null;
  onOpen: (id: string) => void;
  depth: number;
}) {
  const hasChildren = node.children.length > 0;
  const [open, setOpen] = useState(true);
  const isActive = node.page != null && node.page.id === activeId;

  return (
    <li>
      <div className="tree-row" style={{ paddingLeft: 8 + depth * 12 }}>
        {hasChildren ? (
          <button
            type="button"
            className="tree-twist"
            aria-label={open ? "折叠" : "展开"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="tree-twist spacer" />
        )}
        {node.page ? (
          <button
            type="button"
            className={`tree-label${isActive ? " active" : ""}`}
            onClick={() => onOpen(node.page!.id)}
            title={node.page.id}
          >
            <FileText size={14} />
            <span className="file-name">{node.page.title ?? node.name}</span>
          </button>
        ) : (
          <button type="button" className="tree-label folder" onClick={() => setOpen((v) => !v)}>
            <Folder size={14} />
            <span className="file-name">{node.name}</span>
          </button>
        )}
      </div>
      {hasChildren && open && (
        <ul>
          {node.children.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              activeId={activeId}
              onOpen={onOpen}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
