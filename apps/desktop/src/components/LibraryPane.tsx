import { ChevronDown, ChevronRight, FileText, FolderPlus, Plus, Star } from "lucide-react";
import { useState } from "react";
import type { PageSummary } from "../api";
import type { LibraryFolder } from "../lib/libraryFolders";

type LibraryPaneProps = {
  pages: PageSummary[];
  favorites: Set<string>;
  folders: LibraryFolder[];
  assignments: Record<string, string>;
  onOpen: (id: string) => void;
  onFavorite: (id: string) => void;
  onCreateFolder: () => void;
  onAddToFolder: (folderId: string | null) => void;
};

export function LibraryPane({ pages, favorites, folders, assignments, onOpen, onFavorite, onCreateFolder, onAddToFolder }: LibraryPaneProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const sections = [
    ...folders.map((folder) => ({ ...folder, pages: pages.filter((page) => assignments[page.id] === folder.id) })),
    { id: "", name: "未分类", pages: pages.filter((page) => !folders.some((folder) => folder.id === assignments[page.id])) },
  ];
  const toggle = (id: string) => setCollapsed((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="library-pane">
      <div className="library-actions">
        <span>{pages.length} 篇文献</span>
        <button type="button" title="新建文献文件夹" onClick={onCreateFolder}><FolderPlus size={15} /> 新建文件夹</button>
      </div>
      <div className="library-list">
        {sections.map((section) => {
          const isCollapsed = collapsed.has(section.id);
          return (
            <section className="library-folder" key={section.id || "uncategorized"}>
              <div className="library-folder-row">
                <button type="button" className="library-folder-toggle" onClick={() => toggle(section.id)}>
                  {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  <strong>{section.name}</strong><span>{section.pages.length}</span>
                </button>
                <button type="button" className="library-folder-add" title={`添加文献到${section.name}`} onClick={() => onAddToFolder(section.id || null)}><Plus size={15} /></button>
              </div>
              {!isCollapsed && (section.pages.length ? section.pages.map((page) => (
                <LibraryRow key={page.id} page={page} favorite={favorites.has(page.id)} onOpen={onOpen} onFavorite={onFavorite} />
              )) : <div className="library-folder-empty">暂无文献</div>)}
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function LibraryRow({
  page,
  favorite,
  onOpen,
  onFavorite,
}: {
  page: PageSummary;
  favorite: boolean;
  onOpen: (id: string) => void;
  onFavorite: (id: string) => void;
}) {
  const source = page.sourcePath ?? page.path ?? page.id;
  return (
    <div className="library-row">
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
