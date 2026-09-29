import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type PageContent, type PageSummary } from "../../api";
import {
  defaultPageMode,
  normalizeNoteMode,
  remapRecordId,
  remapRecordIds,
  type PageViewMemory,
} from "../pageViewMemory";
import { tabKey, type Tab } from "../tabs";
import type { NoteMode } from "../../components/NoteView";

type UsePageTabsOptions = {
  onError: (message: string) => void;
  setError: (message: string | null) => void;
  onVaultMutated?: () => Promise<void>;
  onPageIdRemapped?: (oldId: string, newId: string) => void;
  onFolderPrefixRemapped?: (from: string, to: string, mapId: (id: string) => string) => void;
};

export function usePageTabs({
  onError,
  setError,
  onVaultMutated,
  onPageIdRemapped,
  onFolderPrefixRemapped,
}: UsePageTabsOptions) {
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [pageHistory, setPageHistory] = useState<string[]>([]);
  const [pageHistoryIndex, setPageHistoryIndex] = useState(-1);
  const [pageCache, setPageCache] = useState<Record<string, PageContent>>({});
  const [missingIds, setMissingIds] = useState<Record<string, true>>({});
  const [pageModes, setPageModes] = useState<Record<string, NoteMode>>({});
  const pageViewMemoryRef = useRef<Record<string, PageViewMemory>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [noteSaving, setNoteSaving] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);

  const activeTab = tabs.find((t) => tabKey(t) === activeKey) ?? null;
  const activePageId = activeTab?.kind === "page" ? activeTab.id : null;
  const activePage = activePageId ? (pageCache[activePageId] ?? null) : null;

  const activePageNoteMode = useMemo((): NoteMode => {
    if (!activePage) return "live";
    const sourceType = activePage.sourceType?.toLowerCase();
    const hasSource = sourceType === "pdf" || sourceType === "docx";
    const savedMode = pageModes[activePage.id] ?? pageViewMemoryRef.current[activePage.id]?.mode;
    if (savedMode) return normalizeNoteMode(savedMode, hasSource);
    return defaultPageMode(activePage.type, hasSource);
  }, [activePage, pageModes]);

  const setPageNoteMode = useCallback((mode: NoteMode) => {
    if (!activePageId) return;
    setPageModes((prev) => ({ ...prev, [activePageId]: mode }));
    pageViewMemoryRef.current[activePageId] = { ...pageViewMemoryRef.current[activePageId], mode };
  }, [activePageId]);

  const togglePageNoteMode = useCallback(() => {
    setPageNoteMode(activePageNoteMode === "source" ? "live" : "source");
  }, [activePageNoteMode, setPageNoteMode]);

  const patchPageViewMemory = useCallback((pageId: string, patch: Partial<PageViewMemory>) => {
    pageViewMemoryRef.current[pageId] = { ...pageViewMemoryRef.current[pageId], ...patch };
  }, []);

  const activeViewMemory = useMemo(() => {
    if (!activePageId) return undefined;
    return pageViewMemoryRef.current[activePageId];
  }, [activePageId, activeKey]);

  const handleActiveViewMemoryChange = useCallback((patch: Partial<PageViewMemory>) => {
    if (!activePageId) return;
    patchPageViewMemory(activePageId, patch);
  }, [activePageId, patchPageViewMemory]);

  const loadPages = useCallback(async () => {
    const [list, folderList] = await Promise.all([api.vaultListPages(), api.vaultListFolders()]);
    setPages(list);
    setFolders(folderList);
    return list;
  }, []);

  const isDirty = useCallback(
    (id: string) => {
      const page = pageCache[id];
      const text = noteDrafts[id];
      return text != null && page != null && text !== page.raw;
    },
    [noteDrafts, pageCache],
  );

  const saveNote = useCallback(
    async (id: string) => {
      const page = pageCache[id];
      const text = noteDrafts[id] ?? page?.raw;
      if (!page || text == null || text === page.raw) return true;
      setNoteSaving(true);
      setError(null);
      try {
        const saved = await api.vaultWritePage(id, text);
        setPageCache((c) => ({ ...c, [saved.id]: saved }));
        setNoteDrafts((d) => {
          if (d[id] !== text) return d;
          const next = { ...d };
          delete next[id];
          return next;
        });
        await loadPages();
        await onVaultMutated?.();
        return true;
      } catch (e) {
        onError(e instanceof Error ? e.message : String(e));
        return false;
      } finally {
        setNoteSaving(false);
      }
    },
    [loadPages, noteDrafts, onError, onVaultMutated, pageCache, setError],
  );

  const updatePageTags = useCallback(async (id: string, tags: string[]) => {
    setTagError(null);
    try {
      if (isDirty(id) && !(await saveNote(id))) throw new Error("正文保存失败，未更新标签");
      const updated = await api.vaultUpdatePageTags(id, tags);
      setPageCache((cache) => ({ ...cache, [id]: updated }));
      setPages((current) => current.map((page) => page.id === id ? { ...page, tags: updated.tags } : page));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setTagError(message);
      onError(message);
      throw e;
    }
  }, [isDirty, onError, saveNote]);

  useEffect(() => {
    if (!activePageId) return;
    const page = pageCache[activePageId];
    const text = noteDrafts[activePageId];
    if (!page || text == null || text === page.raw) return;
    const timer = window.setTimeout(() => {
      void saveNote(activePageId);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [activePageId, noteDrafts, pageCache, saveNote]);

  useEffect(() => {
    loadPages().catch((e) => onError(String(e)));
  }, [loadPages, onError]);

  useEffect(() => {
    if (!activePageId) return;
    let cancelled = false;
    api
      .vaultReadPage(activePageId)
      .then((p) => {
        if (cancelled) return;
        if (p) {
          setPageCache((c) => ({ ...c, [p.id]: p }));
          setMissingIds((m) => {
            if (!(activePageId in m)) return m;
            const next = { ...m };
            delete next[activePageId];
            return next;
          });
        } else {
          setMissingIds((m) => ({ ...m, [activePageId]: true }));
        }
      })
      .catch((e) => {
        if (!cancelled) onError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [activePageId, onError]);

  const openPage = useCallback(
    (id: string, recordHistory = true) => {
      setTabs((prev) => {
        if (prev.some((t) => t.kind === "page" && t.id === id)) return prev;
        return [...prev, { kind: "page", id }];
      });
      setActiveKey(`page:${id}`);
      if (recordHistory) {
        setPageHistory((prev) => {
          const current = pageHistoryIndex >= 0 ? prev[pageHistoryIndex] : undefined;
          if (current === id) return prev;
          const next = prev.slice(0, pageHistoryIndex + 1);
          next.push(id);
          setPageHistoryIndex(next.length - 1);
          return next;
        });
      }
    },
    [pageHistoryIndex],
  );

  const navigatePageHistory = useCallback((direction: -1 | 1) => {
    setPageHistoryIndex((index) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= pageHistory.length) return index;
      const id = pageHistory[nextIndex];
      setTabs((prev) => prev.some((tab) => tab.id === id) ? prev : [...prev, { kind: "page", id }]);
      setActiveKey(`page:${id}`);
      return nextIndex;
    });
  }, [pageHistory]);

  const insertWikilink = useCallback(
    async (fromId: string, toId: string, range?: { start: number; end: number }, onOpened?: () => void) => {
      if (!fromId || !toId || fromId === toId) return;
      const link = `[[${toId}]]`;
      let current = noteDrafts[fromId] ?? pageCache[fromId]?.raw;
      if (current == null) {
        try {
          const page = await api.vaultReadPage(fromId);
          if (page) {
            setPageCache((c) => ({ ...c, [page.id]: page }));
            current = page.raw;
          } else {
            current = "";
          }
        } catch (e) {
          onError(e instanceof Error ? e.message : String(e));
          return;
        }
      }
      let next: string;
      if (range) {
        const start = Math.max(0, Math.min(range.start, current.length));
        const end = Math.max(start, Math.min(range.end, current.length));
        next = current.slice(0, start) + link + current.slice(end);
      } else {
        const trimmed = current.replace(/\s+$/, "");
        next = trimmed ? `${trimmed}\n\n${link}\n` : `${link}\n`;
      }
      setNoteDrafts((d) => ({ ...d, [fromId]: next }));
      setPageModes((d) => ({ ...d, [fromId]: "live" }));
      openPage(fromId);
      onOpened?.();
    },
    [noteDrafts, onError, openPage, pageCache],
  );

  const closeTab = useCallback(
    (key: string) => {
      const id = key.startsWith("page:") ? key.slice(5) : "";
      if (id && isDirty(id)) {
        const ok = window.confirm("有未保存的更改，确定关闭？未保存内容将丢失。");
        if (!ok) return;
        setNoteDrafts((d) => {
          const next = { ...d };
          delete next[id];
          return next;
        });
      }
      setTabs((prev) => {
        const idx = prev.findIndex((t) => tabKey(t) === key);
        const next = prev.filter((t) => tabKey(t) !== key);
        if (activeKey === key) {
          const neighbor = next[Math.min(idx, next.length - 1)];
          setActiveKey(neighbor ? tabKey(neighbor) : null);
        }
        return next;
      });
    },
    [activeKey, isDirty],
  );

  const remapPageId = useCallback((oldId: string, newId: string) => {
    if (oldId === newId) return;
    setTabs((prev) => prev.map((t) => (t.id === oldId ? { ...t, id: newId } : t)));
    setActiveKey((key) => (key === `page:${oldId}` ? `page:${newId}` : key));
    setPageCache((c) => {
      if (!(oldId in c)) return c;
      const next = { ...c };
      next[newId] = { ...next[oldId], id: newId };
      delete next[oldId];
      return next;
    });
    setNoteDrafts((d) => {
      if (!(oldId in d)) return d;
      const next = { ...d };
      next[newId] = next[oldId];
      delete next[oldId];
      return next;
    });
    setMissingIds((m) => {
      if (!(oldId in m)) return m;
      const next = { ...m };
      delete next[oldId];
      return next;
    });
    setPageModes((modes) => remapRecordId(modes, oldId, newId));
    pageViewMemoryRef.current = remapRecordId(pageViewMemoryRef.current, oldId, newId);
    onPageIdRemapped?.(oldId, newId);
  }, [onPageIdRemapped]);

  const remapFolderPrefix = useCallback((from: string, to: string) => {
    if (from === to) return;
    const mapId = (id: string) => (id.startsWith(`${from}/`) ? `${to}${id.slice(from.length)}` : id);
    setTabs((prev) => prev.map((t) => ({ ...t, id: mapId(t.id) })));
    setActiveKey((key) => {
      if (!key?.startsWith("page:")) return key;
      return `page:${mapId(key.slice(5))}`;
    });
    setPageCache((c) => {
      const next: Record<string, PageContent> = {};
      for (const [id, page] of Object.entries(c)) {
        const nid = mapId(id);
        next[nid] = nid === id ? page : { ...page, id: nid };
      }
      return next;
    });
    setNoteDrafts((d) => {
      const next: Record<string, string> = {};
      for (const [id, text] of Object.entries(d)) next[mapId(id)] = text;
      return next;
    });
    setMissingIds((m) => {
      const next: Record<string, true> = {};
      for (const id of Object.keys(m)) next[mapId(id)] = true;
      return next;
    });
    setPageModes((modes) => remapRecordIds(modes, mapId));
    pageViewMemoryRef.current = remapRecordIds(pageViewMemoryRef.current, mapId);
    onFolderPrefixRemapped?.(from, to, mapId);
  }, [onFolderPrefixRemapped]);

  const titleFor = useCallback(
    (id: string) => pages.find((p) => p.id === id)?.title ?? pageCache[id]?.title ?? id.split("/").pop() ?? id,
    [pages, pageCache],
  );

  const takenIds = useMemo(() => {
    const set = new Set<string>();
    for (const page of pages) set.add(page.id);
    for (const folder of folders) set.add(folder);
    return set;
  }, [pages, folders]);

  return {
    pages,
    setPages,
    folders,
    tabs,
    activeKey,
    setActiveKey,
    activeTab,
    activePageId,
    activePage,
    activePageNoteMode,
    pageCache,
    setPageCache,
    missingIds,
    pageModes,
    setPageModes,
    noteDrafts,
    setNoteDrafts,
    noteSaving,
    tagError,
    pageHistory,
    pageHistoryIndex,
    activeViewMemory,
    loadPages,
    isDirty,
    saveNote,
    updatePageTags,
    setPageNoteMode,
    togglePageNoteMode,
    handleActiveViewMemoryChange,
    openPage,
    navigatePageHistory,
    insertWikilink,
    closeTab,
    remapPageId,
    remapFolderPrefix,
    titleFor,
    takenIds,
  };
}
