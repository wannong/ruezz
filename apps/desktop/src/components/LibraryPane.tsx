import { ChevronDown, ChevronRight, FileText, FolderPlus, Plus, Star } from "lucide-react";
import { useRef, useState, type CSSProperties, type MouseEvent } from "react";
import type { PageSummary } from "../api";
import {
  folderLabelPath,
  sortedLibraryFolders,
  uniqueFolderName,
  type LibraryFolder,
} from "../lib/libraryFolders";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";

type LibraryPaneProps = {
  pages: PageSummary[];
  favorites: Set<string>;
  folders: LibraryFolder[];
  assignments: Record<string, string>;
  onOpen: (id: string) => void;
  onFavorite: (id: string) => void;
  onCreateFolder: (parentId: string | null, name: string) => void;
  onRenameFolder: (folderId: string, name: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onMovePages: (pageIds: string[], folderId: string | null) => void;
  onAddToFolder: (folderId: string | null) => void;
};

type LibraryFolderTreeNode = LibraryFolder & {
  pages: PageSummary[];
  children: LibraryFolderTreeNode[];
};

type LibraryEditor =
  | { mode: "rename"; folderId: string; value: string }
  | { mode: "create"; parentId: string | null; value: string };

type MenuTarget =
  | { type: "blank" }
  | { type: "uncategorized" }
  | { type: "folder"; folderId: string }
  | { type: "page"; pageId: string; folderId: string | null };

function buildFolderTree(folders: LibraryFolder[], assignments: Record<string, string>, pages: PageSummary[]): LibraryFolderTreeNode[] {
  const idMap = new Map<string, LibraryFolderTreeNode>();
  const roots: LibraryFolderTreeNode[] = [];

  for (const folder of folders) {
    idMap.set(folder.id, {
      ...folder,
      pages: pages.filter((page) => assignments[page.id] === folder.id),
      children: [],
    });
  }

  for (const folder of folders) {
    const node = idMap.get(folder.id);
    if (!node) continue;
    if (folder.parentId) {
      const parent = idMap.get(folder.parentId);
      if (parent) parent.children.push(node);
      else roots.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (nodes: LibraryFolderTreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name, "zh"));
    for (const node of nodes) sortNodes(node.children);
  };
  sortNodes(roots);
  return roots;
}

function countTreePages(node: LibraryFolderTreeNode): number {
  return node.pages.length + node.children.reduce((sum, child) => sum + countTreePages(child), 0);
}

export function LibraryPane({
  pages,
  favorites,
  folders,
  assignments,
  onOpen,
  onFavorite,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMovePages,
  onAddToFolder,
}: LibraryPaneProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [editor, setEditor] = useState<LibraryEditor | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; target: MenuTarget } | null>(null);

  const tree = buildFolderTree(folders, assignments, pages);
  const folderIds = new Set(folders.map((folder) => folder.id));
  const uncategorized = pages.filter((page) => {
    const folderId = assignments[page.id];
    return !folderId || !folderIds.has(folderId);
  });

  const toggle = (id: string) => setCollapsed((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const expand = (id: string | null) => {
    if (!id) return;
    setCollapsed((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  };

  const startCreate = (parentId: string | null) => {
    expand(parentId);
    setEditor({ mode: "create", parentId, value: uniqueFolderName(folders, parentId) });
  };

  const startRename = (folderId: string) => {
    const folder = folders.find((item) => item.id === folderId);
    if (!folder) return;
    setEditor({ mode: "rename", folderId, value: folder.name });
  };

  const commitEditor = (next: string) => {
    if (!editor) return;
    const name = next.trim();
    const current = editor;
    setEditor(null);
    if (!name) return;
    if (current.mode === "rename") {
      if (name === folders.find((folder) => folder.id === current.folderId)?.name) return;
      onRenameFolder(current.folderId, name);
      return;
    }
    onCreateFolder(current.parentId, name);
  };

  const openMenu = (event: MouseEvent, target: MenuTarget) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ x: event.clientX, y: event.clientY, target });
  };

  const moveItems = (pageId: string, currentFolderId: string | null): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [
      {
        type: "item",
        label: "移出分类",
        disabled: currentFolderId == null,
        onClick: () => onMovePages([pageId], null),
      },
    ];
    const destinations = sortedLibraryFolders(folders);
    if (destinations.length) items.push({ type: "sep" });
    for (const folder of destinations) {
      items.push({
        type: "item",
        label: `移动到 ${folderLabelPath(folders, folder.id)}`,
        disabled: folder.id === currentFolderId,
        onClick: () => onMovePages([pageId], folder.id),
      });
    }
    return items;
  };

  const menuItems = (target: MenuTarget): ContextMenuItem[] => {
    if (target.type === "blank") {
      return [
        { type: "item", label: "新建文件夹", onClick: () => startCreate(null) },
        { type: "item", label: "导入文献", onClick: () => onAddToFolder(null) },
      ];
    }
    if (target.type === "uncategorized") {
      return [
        { type: "item", label: "导入文献", onClick: () => onAddToFolder(null) },
        { type: "item", label: "新建文件夹", onClick: () => startCreate(null) },
      ];
    }
    if (target.type === "folder") {
      const folder = folders.find((item) => item.id === target.folderId);
      if (!folder) return [];
      return [
        { type: "item", label: "新建子文件夹", onClick: () => startCreate(folder.id) },
        { type: "item", label: `添加文献到${folder.name}`, onClick: () => onAddToFolder(folder.id) },
        { type: "sep" },
        { type: "item", label: "重命名", onClick: () => startRename(folder.id) },
        { type: "item", label: "删除分类", danger: true, onClick: () => onDeleteFolder(folder.id) },
      ];
    }
    const page = pages.find((item) => item.id === target.pageId);
    if (!page) return [];
    const favorite = favorites.has(page.id);
    return [
      { type: "item", label: favorite ? "取消收藏" : "收藏", onClick: () => onFavorite(page.id) },
      { type: "sep" },
      ...moveItems(page.id, target.folderId),
    ];
  };

  return (
    <div className="library-pane" onContextMenu={(event) => openMenu(event, { type: "blank" })}>
      <div className="library-actions">
        <span>{pages.length} 篇文献</span>
        <button type="button" title="新建文献文件夹" onClick={() => startCreate(null)}>
          <FolderPlus size={15} /> 新建文件夹
        </button>
      </div>
      {pages.length === 0 && folders.length === 0 && editor?.mode !== "create" ? (
        <div className="empty">暂无文献。可导入文件，或右键新建分类。</div>
      ) : (
        <div className="library-list">
          {editor?.mode === "create" && editor.parentId === null && (
            <div className="library-folder-row editing" style={{ "--depth": 0 } as CSSProperties}>
              <NameInput
                value={editor.value}
                onChange={(value) => setEditor({ ...editor, value })}
                onCommit={commitEditor}
                onCancel={() => setEditor(null)}
              />
            </div>
          )}
          {tree.map((root) => (
            <FolderNode
              key={root.id}
              node={root}
              depth={0}
              collapsed={collapsed}
              editor={editor}
              favorites={favorites}
              toggle={toggle}
              onOpen={onOpen}
              onFavorite={onFavorite}
              onCreateChild={startCreate}
              onAddToFolder={onAddToFolder}
              onMenu={openMenu}
              onEditorValue={(value) => editor && setEditor({ ...editor, value })}
              onCommitEditor={commitEditor}
              onCancelEditor={() => setEditor(null)}
            />
          ))}
          {uncategorized.length > 0 && (
            <div className="library-folder">
              <div
                className="library-folder-row"
                style={{ "--depth": 0 } as CSSProperties}
                onContextMenu={(event) => openMenu(event, { type: "uncategorized" })}
              >
                <button type="button" className="library-folder-toggle" onClick={() => toggle("__uncategorized")}>
                  {collapsed.has("__uncategorized") ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  <strong>未分类</strong>
                  <span>{uncategorized.length}</span>
                </button>
                <button type="button" className="library-folder-add" title="导入文献" onClick={() => onAddToFolder(null)}>
                  <Plus size={15} />
                </button>
              </div>
              {!collapsed.has("__uncategorized") && (
                <div className="library-children">
                  {uncategorized.map((page) => (
                    <LibraryRow
                      key={page.id}
                      page={page}
                      favorite={favorites.has(page.id)}
                      depth={1}
                      onOpen={onOpen}
                      onFavorite={onFavorite}
                      onMenu={(event) => openMenu(event, { type: "page", pageId: page.id, folderId: null })}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
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

function FolderNode({
  node,
  depth,
  collapsed,
  editor,
  favorites,
  toggle,
  onOpen,
  onFavorite,
  onCreateChild,
  onAddToFolder,
  onMenu,
  onEditorValue,
  onCommitEditor,
  onCancelEditor,
}: {
  node: LibraryFolderTreeNode;
  depth: number;
  collapsed: Set<string>;
  editor: LibraryEditor | null;
  favorites: Set<string>;
  toggle: (id: string) => void;
  onOpen: (id: string) => void;
  onFavorite: (id: string) => void;
  onCreateChild: (parentId: string) => void;
  onAddToFolder: (folderId: string | null) => void;
  onMenu: (event: MouseEvent, target: MenuTarget) => void;
  onEditorValue: (value: string) => void;
  onCommitEditor: (value: string) => void;
  onCancelEditor: () => void;
}) {
  const isCollapsed = collapsed.has(node.id);
  const renaming = editor?.mode === "rename" && editor.folderId === node.id;
  const creatingHere = editor?.mode === "create" && editor.parentId === node.id;
  const expanded = !isCollapsed || creatingHere;
  const pageCount = countTreePages(node);

  return (
    <div className={`library-folder${depth > 0 ? " nested" : ""}`}>
      <div
        className={`library-folder-row${renaming ? " editing" : ""}`}
        style={{ "--depth": depth } as CSSProperties}
        onContextMenu={(event) => onMenu(event, { type: "folder", folderId: node.id })}
      >
        {renaming && editor?.mode === "rename" ? (
          <div className="library-folder-toggle">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <NameInput
              value={editor.value}
              onChange={onEditorValue}
              onCommit={onCommitEditor}
              onCancel={onCancelEditor}
            />
          </div>
        ) : (
          <button type="button" className="library-folder-toggle" onClick={() => toggle(node.id)}>
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <strong>{node.name}</strong>
            <span>{pageCount}</span>
          </button>
        )}
        <button type="button" className="library-folder-add" title="新建子文件夹" onClick={() => onCreateChild(node.id)}>
          <FolderPlus size={15} />
        </button>
        <button type="button" className="library-folder-add" title={`添加文献到${node.name}`} onClick={() => onAddToFolder(node.id)}>
          <Plus size={15} />
        </button>
      </div>
      {expanded && (
        <div className="library-children">
          {creatingHere && editor?.mode === "create" && (
            <div className="library-folder-row editing" style={{ "--depth": depth + 1 } as CSSProperties}>
              <NameInput
                value={editor.value}
                onChange={onEditorValue}
                onCommit={onCommitEditor}
                onCancel={onCancelEditor}
              />
            </div>
          )}
          {node.children.map((child) => (
            <FolderNode
              key={child.id}
              node={child}
              depth={depth + 1}
              collapsed={collapsed}
              editor={editor}
              favorites={favorites}
              toggle={toggle}
              onOpen={onOpen}
              onFavorite={onFavorite}
              onCreateChild={onCreateChild}
              onAddToFolder={onAddToFolder}
              onMenu={onMenu}
              onEditorValue={onEditorValue}
              onCommitEditor={onCommitEditor}
              onCancelEditor={onCancelEditor}
            />
          ))}
          {node.pages.map((page) => (
            <LibraryRow
              key={page.id}
              page={page}
              favorite={favorites.has(page.id)}
              depth={depth + 1}
              onOpen={onOpen}
              onFavorite={onFavorite}
              onMenu={(event) => onMenu(event, { type: "page", pageId: page.id, folderId: node.id })}
            />
          ))}
          {node.children.length === 0 && node.pages.length === 0 && !creatingHere && (
            <div className="library-folder-empty" style={{ "--depth": depth + 1 } as CSSProperties}>此分类暂无文献</div>
          )}
        </div>
      )}
    </div>
  );
}

export function LibraryRow({
  page,
  favorite,
  depth = 0,
  onOpen,
  onFavorite,
  onMenu,
}: {
  page: PageSummary;
  favorite: boolean;
  depth?: number;
  onOpen: (id: string) => void;
  onFavorite: (id: string) => void;
  onMenu?: (event: MouseEvent) => void;
}) {
  const source = page.sourcePath ?? page.path ?? page.id;
  return (
    <div
      className="library-row"
      style={{ "--depth": depth } as CSSProperties}
      onContextMenu={onMenu}
    >
      <button type="button" className="library-open" onClick={() => onOpen(page.id)}>
        <FileText size={15} />
        <span className="library-title">
          <strong>{page.title ?? page.id.split("/").pop()}</strong>
          {page.tags?.length ? <small>{page.tags.map((tag) => `#${tag}`).join(" ")}</small> : null}
        </span>
        <span className="library-source">
          <b>{page.sourceType ?? "文献"}</b>
          <small title={source}>{source}</small>
        </span>
      </button>
      <button
        type="button"
        className={`favorite-star${favorite ? " active" : ""}`}
        title={favorite ? "取消收藏" : "收藏"}
        aria-pressed={favorite}
        aria-label={favorite ? `取消收藏 ${page.title ?? page.id}` : `收藏 ${page.title ?? page.id}`}
        onClick={() => onFavorite(page.id)}
      >
        <Star size={15} fill={favorite ? "currentColor" : "none"} />
      </button>
    </div>
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
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => onChange(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onBlur={() => finish(value)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          finish(value);
        } else if (event.key === "Escape") {
          event.preventDefault();
          finish(null);
        }
      }}
    />
  );
}
