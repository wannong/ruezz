import { FileText, Star } from "lucide-react";
import type { PageSummary } from "../api";

type LibraryPaneProps = {
  pages: PageSummary[];
  favorites: Set<string>;
  onOpen: (id: string) => void;
  onFavorite: (id: string) => void;
};

export function LibraryPane({ pages, favorites, onOpen, onFavorite }: LibraryPaneProps) {
  if (pages.length === 0) return <div className="empty">暂无文献。导入 PDF 或文档后会显示在这里。</div>;

  return (
    <div className="library-pane">
      <div className="library-head" aria-hidden="true">
        <span>标题</span><span>类型 / 来源</span><span />
      </div>
      <div className="library-list">
        {pages.map((page) => (
          <LibraryRow
            key={page.id}
            page={page}
            favorite={favorites.has(page.id)}
            onOpen={onOpen}
            onFavorite={onFavorite}
          />
        ))}
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
