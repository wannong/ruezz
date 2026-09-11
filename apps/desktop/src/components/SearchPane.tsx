import { useEffect, useMemo, useState } from "react";
import { api, type PageSummary } from "../api";

type SearchPaneProps = {
  onOpen: (id: string) => void;
  onError: (message: string) => void;
  excludeId?: string;
  browsePages?: PageSummary[];
  placeholder?: string;
  emptyHint?: string;
};

export function SearchPane({
  onOpen,
  onError,
  excludeId,
  browsePages,
  placeholder = "搜索页面…",
  emptyHint = "输入关键词，最多返回 20 条",
}: SearchPaneProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PageSummary[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      api
        .vaultSearch(q)
        .then(setResults)
        .catch((e) => onError(e instanceof Error ? e.message : String(e)))
        .finally(() => setSearching(false));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query, onError]);

  const visible = useMemo(() => {
    const q = query.trim();
    const source = q ? results : (browsePages ?? []);
    const filtered = excludeId ? source.filter((p) => p.id !== excludeId) : source;
    return q ? filtered : filtered.slice(0, 50);
  }, [query, results, browsePages, excludeId]);

  const browsing = Boolean(browsePages) && !query.trim();

  return (
    <div className="search-pane">
      <input
        className="search-input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        autoFocus
      />
      <ul className="file-tree search-hits">
        {!query.trim() && !browsing && <li className="empty">{emptyHint}</li>}
        {query.trim() && searching && <li className="empty">搜索中…</li>}
        {query.trim() && !searching && visible.length === 0 && <li className="empty">没有匹配</li>}
        {browsing && visible.length === 0 && <li className="empty">{emptyHint}</li>}
        {visible.map((p) => (
          <li key={p.id}>
            <button type="button" className="tree-label search-hit" onClick={() => onOpen(p.id)}>
              <span className="file-name">{p.title ?? p.id}</span>
              <span className="file-meta">{p.id}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
