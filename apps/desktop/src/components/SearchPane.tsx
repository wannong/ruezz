import { Filter, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, type PageSummary } from "../api";

type SearchPaneProps = {
  onOpen: (id: string) => void;
  onError: (message: string) => void;
  excludeId?: string;
  browsePages?: PageSummary[];
  placeholder?: string;
  emptyHint?: string;
  selectedTags?: string[];
  onTags?: (tags: string[]) => void;
};

export function SearchPane({
  onOpen,
  onError,
  excludeId,
  browsePages,
  placeholder = "搜索页面…",
  emptyHint = "输入关键词，最多返回 20 条",
  selectedTags = [],
  onTags,
}: SearchPaneProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PageSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    (browsePages ?? []).forEach((page) => page.tags?.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], "zh"));
  }, [browsePages]);

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
    return (selectedTags.length ? filtered.filter((p) => selectedTags.every((tag) => p.tags?.includes(tag))) : filtered)
      .slice(0, q ? 20 : 50);
  }, [query, results, browsePages, excludeId, selectedTags]);

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
      {onTags && (
        <div className="search-filters">
          <button type="button" className={`search-filter-button${selectedTags.length ? " active" : ""}`} onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen}>
            <Filter size={13} /> 标签{selectedTags.length ? ` · ${selectedTags.length}` : ""}
          </button>
          {selectedTags.map((tag) => <button key={tag} type="button" className="search-filter-chip" onClick={() => onTags(selectedTags.filter((item) => item !== tag))}>#{tag}<X size={11} /></button>)}
          {filtersOpen && <div className="search-filter-popover">
            <div className="search-filter-popover-head"><strong>按标签筛选</strong>{selectedTags.length > 0 && <button type="button" onClick={() => onTags([])}>清除</button>}</div>
            {allTags.length ? allTags.map(([tag, count]) => <label key={tag}><input type="checkbox" checked={selectedTags.includes(tag)} onChange={() => onTags(selectedTags.includes(tag) ? selectedTags.filter((item) => item !== tag) : [...selectedTags, tag])} />#{tag}<small>{count}</small></label>) : <span className="file-meta">暂无标签</span>}
          </div>}
        </div>
      )}
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
              {p.tags && p.tags.length > 0 && <span className="file-tags">{p.tags.map((tag) => `#${tag}`).join(" ")}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
