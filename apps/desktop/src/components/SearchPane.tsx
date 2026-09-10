import { useEffect, useState } from "react";
import { api, type PageSummary } from "../api";

type SearchPaneProps = {
  onOpen: (id: string) => void;
  onError: (message: string) => void;
};

export function SearchPane({ onOpen, onError }: SearchPaneProps) {
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

  return (
    <div className="search-pane">
      <input
        className="search-input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜索页面…"
        autoFocus
      />
      <ul className="file-tree">
        {!query.trim() && <li className="empty">输入关键词，最多返回 20 条</li>}
        {query.trim() && searching && <li className="empty">搜索中…</li>}
        {query.trim() && !searching && results.length === 0 && <li className="empty">没有匹配</li>}
        {results.map((p) => (
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
