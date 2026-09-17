import { FileText, Star } from "lucide-react";
import type { ReactNode } from "react";
import type { PageSummary } from "../api";
import { LibraryRow } from "./LibraryPane";

type FavoritesPaneProps = {
  pages: PageSummary[];
  favoriteIds: string[];
  onOpen: (id: string) => void;
  onFavorite: (id: string) => void;
};

export function FavoritesPane({ pages, favoriteIds, onOpen, onFavorite }: FavoritesPaneProps) {
  const favoriteSet = new Set(favoriteIds);
  const favorites = pages.filter((page) => favoriteSet.has(page.id));
  const literature = favorites.filter((page) => page.type === "source");
  const knowledge = favorites.filter((page) => page.type !== "source");

  if (favorites.length === 0) return <div className="empty">暂无收藏。可从文件右键菜单或文献库星标收藏。</div>;

  return (
    <div className="favorites-pane">
      <FavoriteSection title="文献" empty="暂无收藏文献">
        {literature.map((page) => (
          <LibraryRow key={page.id} page={page} favorite onOpen={onOpen} onFavorite={onFavorite} />
        ))}
      </FavoriteSection>
      <FavoriteSection title="知识页" empty="暂无收藏知识页">
        {knowledge.map((page) => (
          <div className="favorite-page-row" key={page.id}>
            <button type="button" className="favorite-page-open" onClick={() => onOpen(page.id)}>
              <FileText size={14} />
              <span><strong>{page.title ?? page.id.split("/").pop()}</strong><small>{page.id}</small></span>
            </button>
            <button type="button" className="favorite-star active" title="取消收藏" aria-pressed="true" onClick={() => onFavorite(page.id)}>
              <Star size={15} fill="currentColor" />
            </button>
          </div>
        ))}
      </FavoriteSection>
    </div>
  );
}

function FavoriteSection({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section className="favorite-section">
      <h3>{title}</h3>
      {hasChildren ? children : <div className="favorite-empty">{empty}</div>}
    </section>
  );
}
