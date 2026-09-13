import { useMemo, useRef, useState, type MouseEvent } from "react";
import { ChevronRight, FileText, Folder } from "lucide-react";
import type { PageSummary } from "../api";
import {
  buildFileTree,
  parentWikiId,
  uniqueChildId,
  validNameSegment,
  type FileTreeNode,
  type WikiClip,
} from "../lib/fileTree";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";

type TreeEditor =
  | { mode: "rename"; path: string; kind: "page" | "folder"; value: string }
  | { mode: "create"; kind: "note" | "folder"; parent: string; value: string };

type MenuTarget = { type: "blank" } | { type: "node"; node: FileTreeNode };

type FileTreeProps = {
  pages: PageSummary[];
  folders: string[];
  activeId: string | null;
  clipboard: WikiClip | null;
  disabled?: boolean;
  onOpen: (id: string) => void;
  onCopy: (clip: WikiClip) => void;
  onPaste: (folderId: string) => void;
  onRename: (kind: "page" | "folder", fromId: string, name: string) => void;
  onCreateNote: (folderId: string, name: string) => void;
  onCreateFolder: (folderId: string, name: string) => void;
  onReveal: (kind: "root" | "page" | "folder", id?: string) => void;
  onLink?: (pageId: string) => void;
  onRelatedSessions?: (pageId: string, label: string) => void;
};

export function FileTree({
  pages,
  folders,
  activeId,
  clipboard,
  disabled,
  onOpen,
  onCopy,
  onPaste,
  onRename,
  onCreateNote,
  onCreateFolder,
  onReveal,
  onLink,
  onRelatedSessions,
}: FileTreeProps) {
  const tree = useMemo(() => buildFileTree(pages, folders), [pages, folders]);
  const taken = useMemo(() => {
    const set = new Set<string>();
    for (const page of pages) set.add(page.id);
    for (const folder of folders) set.add(folder);
    return set;
  }, [pages, folders]);
  const [editor, setEditor] = useState<TreeEditor | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; target: MenuTarget } | null>(null);
  const [forceOpen, setForceOpen] = useState<Record<string, true>>({});

  const createParent = (node: FileTreeNode): string => {
    if (!node.page || node.children.length > 0) return node.path;
    return parentWikiId(node.path);
  };

  const startCreate = (parent: string, kind: "note" | "folder") => {
    if (parent) setForceOpen((m) => ({ ...m, [parent]: true }));
    const base = kind === "note" ? "未命名" : "未命名文件夹";
    const id = uniqueChildId(parent, base, taken);
    const name = id.slice(parent ? parent.length + 1 : 0);
    setEditor({ mode: "create", kind, parent, value: name });
  };

  const startRename = (node: FileTreeNode) => {
    const kind = node.page ? "page" : "folder";
    setEditor({ mode: "rename", path: node.path, kind, value: node.name });
  };

  const commitEditor = (next: string) => {
    if (!editor) return;
    const name = validNameSegment(next);
    setEditor(null);
    if (!name) return;
    if (editor.mode === "rename") {
      if (name === editor.path.split("/").pop()) return;
      onRename(editor.kind, editor.path, name);
      return;
    }
    if (editor.kind === "note") onCreateNote(editor.parent, name);
    else onCreateFolder(editor.parent, name);
  };

  const openMenu = (e: MouseEvent, target: MenuTarget) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, target });
  };

  const menuItems = (target: MenuTarget): ContextMenuItem[] => {
    const folderId = target.type === "blank" ? "" : createParent(target.node);
    const canCopy = target.type === "node";
    const items: ContextMenuItem[] = [
      { type: "item", label: "新建笔记", disabled, onClick: () => startCreate(folderId, "note") },
      { type: "item", label: "新建文件夹", disabled, onClick: () => startCreate(folderId, "folder") },
    ];
    if (canCopy) {
      const node = target.node;
      const clip: WikiClip = node.page
        ? { kind: "page", id: node.page.id }
        : { kind: "folder", id: node.path };
      items.push({ type: "sep" });
      items.push({ type: "item", label: "复制", disabled, onClick: () => onCopy(clip) });
    }
    items.push({
      type: "item",
      label: "粘贴",
      disabled: disabled || !clipboard,
      onClick: () => onPaste(folderId),
    });
    if (target.type === "node") {
      if (target.node.page && onLink) {
        items.push({
          type: "item",
          label: "链接",
          disabled,
          onClick: () => onLink(target.node.page!.id),
        });
      }
      if (target.node.page && onRelatedSessions) {
        items.push({
          type: "item",
          label: "查看相关会话",
          disabled,
          onClick: () => onRelatedSessions(target.node.page!.id, target.node.page!.title ?? target.node.name),
        });
      }
      items.push({ type: "sep" });
      items.push({ type: "item", label: "重命名", disabled, onClick: () => startRename(target.node) });
      const revealKind = target.node.page ? "page" : "folder";
      const revealId = target.node.page?.id ?? target.node.path;
      items.push({
        type: "item",
        label: "在资源管理器中显示",
        disabled,
        onClick: () => onReveal(revealKind, revealId),
      });
    } else {
      items.push({ type: "sep" });
      items.push({
        type: "item",
        label: "在资源管理器中打开",
        disabled,
        onClick: () => onReveal("root"),
      });
    }
    return items;
  };

  const empty = pages.length === 0 && folders.length === 0 && editor?.mode !== "create";

  return (
    <div
      className="file-tree-wrap"
      onContextMenu={(e) => openMenu(e, { type: "blank" })}
    >
      {empty && (
        <div className="empty">暂无页面。笔记在知识库的 wiki 文件夹里，右键可新建或在资源管理器中打开。</div>
      )}
      <ul className="file-tree">
        {editor?.mode === "create" && editor.parent === "" && (
          <CreateRow editor={editor} onChange={(value) => setEditor({ ...editor, value })} onCommit={commitEditor} />
        )}
        {tree.map((node) => (
          <TreeItem
            key={node.path}
            node={node}
            activeId={activeId}
            depth={0}
            editor={editor}
            forceOpen={forceOpen}
            onOpen={onOpen}
            onMenu={openMenu}
            onEditorValue={(value) => editor && setEditor({ ...editor, value })}
            onCommitEditor={commitEditor}
            onCancelEditor={() => setEditor(null)}
          />
        ))}
      </ul>
      <ContextMenu
        open={menu !== null}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        items={menu ? menuItems(menu.target) : []}
        onClose={() => setMenu(null)}
      />
    </div>
  );
}

function TreeItem({
  node,
  activeId,
  depth,
  editor,
  forceOpen,
  onOpen,
  onMenu,
  onEditorValue,
  onCommitEditor,
  onCancelEditor,
}: {
  node: FileTreeNode;
  activeId: string | null;
  depth: number;
  editor: TreeEditor | null;
  forceOpen: Record<string, true>;
  onOpen: (id: string) => void;
  onMenu: (e: MouseEvent, target: MenuTarget) => void;
  onEditorValue: (value: string) => void;
  onCommitEditor: (value: string) => void;
  onCancelEditor: () => void;
}) {
  const hasChildren = node.children.length > 0;
  const [open, setOpen] = useState(true);
  const expanded =
    Boolean(forceOpen[node.path]) || open || (editor?.mode === "create" && editor.parent === node.path);
  const isActive = node.page != null && node.page.id === activeId;
  const renaming = editor?.mode === "rename" && editor.path === node.path;
  const creatingHere = editor?.mode === "create" && editor.parent === node.path;

  return (
    <li>
      <div
        className={`tree-row${renaming ? " editing" : ""}`}
        style={{ paddingLeft: 8 + depth * 12 }}
        onContextMenu={(e) => onMenu(e, { type: "node", node })}
      >
        {hasChildren || creatingHere ? (
          <button
            type="button"
            className="tree-twist"
            aria-label={expanded ? "折叠" : "展开"}
            onClick={() => setOpen((v) => !v)}
          >
            <ChevronRight size={14} className={expanded ? "tree-twist-open" : undefined} />
          </button>
        ) : (
          <span className="tree-twist spacer" />
        )}
        {renaming && editor ? (
          <NameInput
            value={editor.value}
            onChange={onEditorValue}
            onCommit={onCommitEditor}
            onCancel={onCancelEditor}
          />
        ) : node.page ? (
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
      {expanded && (hasChildren || creatingHere) && (
        <ul>
          {creatingHere && editor && (
            <CreateRow
              editor={editor}
              depth={depth + 1}
              onChange={onEditorValue}
              onCommit={onCommitEditor}
            />
          )}
          {node.children.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              activeId={activeId}
              depth={depth + 1}
              editor={editor}
              forceOpen={forceOpen}
              onOpen={onOpen}
              onMenu={onMenu}
              onEditorValue={onEditorValue}
              onCommitEditor={onCommitEditor}
              onCancelEditor={onCancelEditor}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function CreateRow({
  editor,
  depth = 0,
  onChange,
  onCommit,
}: {
  editor: Extract<TreeEditor, { mode: "create" }>;
  depth?: number;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
}) {
  return (
    <li>
      <div className="tree-row editing" style={{ paddingLeft: 8 + depth * 12 }}>
        <span className="tree-twist spacer" />
        {editor.kind === "folder" ? <Folder size={14} /> : <FileText size={14} />}
        <NameInput
          value={editor.value}
          onChange={onChange}
          onCommit={onCommit}
          onCancel={() => onCommit("")}
        />
      </div>
    </li>
  );
}

function NameInput({
  value,
  onChange,
  onCommit,
  onCancel,
}: {
  value: string;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const done = useRef(false);
  const finish = (next: string | null) => {
    if (done.current) return;
    done.current = true;
    if (next == null) onCancel();
    else onCommit(next);
  };

  return (
    <input
      className="tree-rename"
      value={value}
      autoFocus
      spellCheck={false}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => finish(value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          finish(value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          finish(null);
        }
      }}
    />
  );
}
