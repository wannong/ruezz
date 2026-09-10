import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  isTauriRuntime,
  type GraphDto,
  type PageContent,
  type PageSummary,
  type VaultSettings,
} from "../api";
import { loadPref, savePref } from "../lib/prefs";
import { parseOutline } from "../lib/outline";
import { markdownBody } from "../lib/noteId";
import { joinWikiId, parentWikiId, pasteDest, type WikiClip } from "../lib/fileTree";
import { tabKey, type Tab } from "../lib/tabs";
import { useMediaQuery } from "../lib/useMediaQuery";
import type { Theme } from "../theme";
import { CommandPalette, type PaletteCommand, type PaletteMode } from "./CommandPalette";
import { IngestModal } from "./IngestModal";
import { LeftSidebar } from "./LeftSidebar";
import { NewNoteModal } from "./NewNoteModal";
import { NoteView } from "./NoteView";
import { Ribbon } from "./Ribbon";
import { RightSidebar, type RightView } from "./RightSidebar";
import { SettingsModal } from "./SettingsModal";
import { StatusBar } from "./StatusBar";
import { TabBar } from "./TabBar";
import type { ChatMessage } from "./AgentPane";

type WorkspaceProps = {
  settings: VaultSettings;
  onSettings: (next: VaultSettings) => void;
  theme: Theme;
  onToggleTheme: () => void;
  error: string | null;
  setError: (message: string | null) => void;
  busy: boolean;
  setBusy: (busy: boolean) => void;
};

const LEFT_MIN = 180;
const LEFT_MAX = 420;
const RIGHT_MIN = 240;
const RIGHT_MAX = 480;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function Workspace({
  settings,
  onSettings,
  theme,
  onToggleTheme,
  error,
  setError,
  busy,
  setBusy,
}: WorkspaceProps) {
  const narrow = useMediaQuery("(max-width: 960px)");
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [clip, setClip] = useState<WikiClip | null>(null);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [pageCache, setPageCache] = useState<Record<string, PageContent>>({});
  const [missingIds, setMissingIds] = useState<Record<string, true>>({});
  const [noteMode, setNoteMode] = useState<"read" | "edit">("read");
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [noteSaving, setNoteSaving] = useState(false);
  const [leftView, setLeftView] = useState<"files" | "search">("files");
  const [rightView, setRightView] = useState<RightView>("agent");
  const [leftCollapsed, setLeftCollapsed] = useState(() => loadPref("leftCollapsed", false));
  const [rightCollapsed, setRightCollapsed] = useState(() => loadPref("rightCollapsed", false));
  const [leftWidth, setLeftWidth] = useState(() => loadPref("leftWidth", 240));
  const [rightWidth, setRightWidth] = useState(() => loadPref("rightWidth", 320));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ingestOpen, setIngestOpen] = useState(false);
  const [newNoteOpen, setNewNoteOpen] = useState(false);
  const [palette, setPalette] = useState<PaletteMode | null>(null);
  const [graph, setGraph] = useState<GraphDto | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");

  const activeTab = tabs.find((t) => tabKey(t) === activeKey) ?? null;
  const activePageId = activeTab?.kind === "page" ? activeTab.id : null;
  const activePage = activePageId ? (pageCache[activePageId] ?? null) : null;
  const graphOpen = !rightCollapsed && rightView === "graph";

  const onError = useCallback(
    (message: string) => setError(message),
    [setError],
  );

  const loadPages = useCallback(async () => {
    const [list, folderList] = await Promise.all([api.vaultListPages(), api.vaultListFolders()]);
    setPages(list);
    setFolders(folderList);
    return list;
  }, []);

  const loadGraph = useCallback(async () => {
    const g = await api.vaultGraph();
    setGraph(g);
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
      if (!page || text == null || text === page.raw) return;
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
        await loadGraph();
      } catch (e) {
        onError(e instanceof Error ? e.message : String(e));
      } finally {
        setNoteSaving(false);
      }
    },
    [pageCache, noteDrafts, loadPages, loadGraph, onError, setError],
  );

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
    loadGraph().catch(() => {
      /* graph may be empty on fresh vault */
    });
  }, [loadPages, loadGraph, onError]);

  useEffect(() => {
    savePref("leftCollapsed", leftCollapsed);
  }, [leftCollapsed]);
  useEffect(() => {
    savePref("rightCollapsed", rightCollapsed);
  }, [rightCollapsed]);
  useEffect(() => {
    savePref("leftWidth", leftWidth);
  }, [leftWidth]);
  useEffect(() => {
    savePref("rightWidth", rightWidth);
  }, [rightWidth]);

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
    (id: string) => {
      setTabs((prev) => {
        if (prev.some((t) => t.kind === "page" && t.id === id)) return prev;
        return [...prev, { kind: "page", id }];
      });
      setActiveKey(`page:${id}`);
      if (narrow) setLeftCollapsed(true);
    },
    [narrow],
  );

  const openGraph = useCallback(() => {
    if (!rightCollapsed && rightView === "graph") setRightCollapsed(true);
    else {
      setRightCollapsed(false);
      setRightView("graph");
    }
  }, [rightCollapsed, rightView]);

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
  }, []);

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
    setClip((cur) => {
      if (!cur) return cur;
      if (cur.kind === "folder" && cur.id === from) return { ...cur, id: to };
      return { ...cur, id: mapId(cur.id) };
    });
  }, []);

  const takenIds = useMemo(() => {
    const set = new Set<string>();
    for (const page of pages) set.add(page.id);
    for (const folder of folders) set.add(folder);
    return set;
  }, [pages, folders]);

  const titleFor = useCallback(
    (id: string) => pages.find((p) => p.id === id)?.title ?? pageCache[id]?.title ?? id.split("/").pop() ?? id,
    [pages, pageCache],
  );

  async function createNote(id: string, title: string) {
    setBusy(true);
    setError(null);
    try {
      const created = await api.vaultCreatePage(id, title);
      setPageCache((c) => ({ ...c, [created.id]: created }));
      await loadPages();
      await loadGraph();
      openPage(created.id);
      setNoteMode("edit");
      setNewNoteOpen(false);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function createNoteIn(folderId: string, name: string) {
    await createNote(joinWikiId(folderId, name), name);
  }

  async function createFolderIn(folderId: string, name: string) {
    setBusy(true);
    setError(null);
    try {
      await api.vaultCreateFolder(joinWikiId(folderId, name));
      await loadPages();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function revealEntry(kind: "root" | "page" | "folder", id?: string) {
    try {
      await api.vaultReveal({ kind, id });
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  async function renameEntry(kind: "page" | "folder", fromId: string, name: string) {
    const dest = joinWikiId(parentWikiId(fromId), name);
    if (dest === fromId) return;
    setBusy(true);
    setError(null);
    try {
      if (kind === "page") {
        const page = await api.vaultRenamePage(fromId, dest);
        remapPageId(fromId, page.id);
        setPageCache((c) => ({ ...c, [page.id]: page }));
        setClip((cur) => (cur?.kind === "page" && cur.id === fromId ? { ...cur, id: page.id } : cur));
      } else {
        const folder = await api.vaultRenameFolder(fromId, dest);
        remapFolderPrefix(fromId, folder.id);
      }
      await loadPages();
      await loadGraph();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function pasteInto(folderId: string) {
    if (!clip) return;
    const dest = pasteDest(clip.id, folderId, takenIds);
    setBusy(true);
    setError(null);
    try {
      if (clip.kind === "page") {
        const page = await api.vaultCopyPage(clip.id, dest);
        setPageCache((c) => ({ ...c, [page.id]: page }));
        await loadPages();
        await loadGraph();
        openPage(page.id);
      } else {
        await api.vaultCopyFolder(clip.id, dest);
        await loadPages();
        await loadGraph();
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function ingestFiles(paths: string[]) {
    if (!paths.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const p of paths) {
        await api.vaultIngestPath(p);
      }
      await loadPages();
      await loadGraph();
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "system", content: `已入库 ${paths.length} 个文件` },
      ]);
      setIngestOpen(false);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function ingestPaste(title: string, body: string) {
    setBusy(true);
    setError(null);
    try {
      await api.vaultIngestText(title, body);
      await loadPages();
      await loadGraph();
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "system", content: `已入库文本「${title}」` },
      ]);
      setIngestOpen(false);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    setBusy(true);
    setError(null);
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: text }]);
    try {
      const res = await api.vaultAsk(text);
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: res.answer, sources: res.sources },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      onError(msg);
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "system", content: `错误：${msg}` }]);
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings(next: VaultSettings) {
    setBusy(true);
    setError(null);
    try {
      await api.settingsSet(next);
      onSettings(next);
      if (next.vaultPath && next.vaultPath !== settings.vaultPath) {
        await api.vaultInit(next.vaultPath);
      }
      await loadPages();
      await loadGraph();
      setSettingsOpen(false);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const toggleLeftFiles = () => {
    if (!leftCollapsed && leftView === "files") setLeftCollapsed(true);
    else {
      setLeftCollapsed(false);
      setLeftView("files");
    }
  };
  const toggleLeftSearch = () => {
    if (!leftCollapsed && leftView === "search") setLeftCollapsed(true);
    else {
      setLeftCollapsed(false);
      setLeftView("search");
    }
  };

  const commands: PaletteCommand[] = useMemo(
    () => [
      { id: "files", label: "显示文件列表", hint: "Ctrl+[", run: () => { setLeftCollapsed(false); setLeftView("files"); } },
      { id: "search", label: "搜索", run: () => { setLeftCollapsed(false); setLeftView("search"); } },
      { id: "new-note", label: "新建笔记", hint: "Ctrl+N", run: () => setNewNoteOpen(true) },
      { id: "edit", label: "切换阅读/编辑", hint: "Ctrl+E", run: () => setNoteMode((m) => (m === "edit" ? "read" : "edit")) },
      { id: "graph", label: "打开图谱", hint: "Ctrl+G", run: () => { setRightCollapsed(false); setRightView("graph"); } },
      { id: "ingest", label: "入库…", run: () => setIngestOpen(true) },
      { id: "settings", label: "打开设置", run: () => setSettingsOpen(true) },
      { id: "theme", label: "切换深浅色", run: onToggleTheme },
      { id: "left", label: "折叠/展开左栏", hint: "Ctrl+[", run: () => setLeftCollapsed((v) => !v) },
      { id: "right", label: "折叠/展开右栏", hint: "Ctrl+]", run: () => setRightCollapsed((v) => !v) },
    ],
    [onToggleTheme, activePageId, saveNote],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === "Escape") {
        setPalette(null);
        setSettingsOpen(false);
        setIngestOpen(false);
        setNewNoteOpen(false);
        return;
      }
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "p") {
        e.preventDefault();
        setPalette(e.shiftKey ? "commands" : "quick");
      } else if (key === "s") {
        e.preventDefault();
        if (activePageId) void saveNote(activePageId);
      } else if (key === "n") {
        e.preventDefault();
        setNewNoteOpen(true);
      } else if (key === "e") {
        e.preventDefault();
        setNoteMode((m) => (m === "edit" ? "read" : "edit"));
      } else if (key === "g") {
        e.preventDefault();
        setRightCollapsed(false);
        setRightView("graph");
      } else if (e.key === "[") {
        e.preventDefault();
        setLeftCollapsed((v) => !v);
      } else if (e.key === "]") {
        e.preventDefault();
        setRightCollapsed((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activePageId, saveNote]);

  const outlineSource =
    activePageId && noteDrafts[activePageId] != null
      ? markdownBody(noteDrafts[activePageId])
      : (activePage?.body ?? "");
  const outline = outlineSource ? parseOutline(outlineSource) : [];
  const activeDirty = Boolean(activePageId && isDirty(activePageId));

  const jumpHeading = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className={`workspace${narrow ? " narrow" : ""}`}>
      <div className="workspace-body">
        <Ribbon
          leftView={leftView}
          leftCollapsed={leftCollapsed}
          graphOpen={graphOpen}
          busy={busy}
          onFiles={toggleLeftFiles}
          onSearch={toggleLeftSearch}
          onGraph={openGraph}
          onIngest={() => setIngestOpen(true)}
          onSettings={() => setSettingsOpen(true)}
        />
        <LeftSidebar
          view={leftView}
          pages={pages}
          folders={folders}
          activeId={activePageId}
          clipboard={clip}
          busy={busy}
          width={leftWidth}
          collapsed={leftCollapsed}
          overlay={narrow}
          onOpen={openPage}
          onCopy={setClip}
          onPaste={(folderId) => void pasteInto(folderId)}
          onRename={(kind, fromId, name) => void renameEntry(kind, fromId, name)}
          onCreateNote={(folderId, name) => void createNoteIn(folderId, name)}
          onCreateFolder={(folderId, name) => void createFolderIn(folderId, name)}
          onReveal={(kind, id) => void revealEntry(kind, id)}
          onError={onError}
          onResize={(dx) => setLeftWidth((w) => clamp(w + dx, LEFT_MIN, LEFT_MAX))}
        />
        <section className="center-pane">
          <TabBar
            tabs={tabs}
            activeKey={activeKey}
            titleFor={titleFor}
            isDirty={isDirty}
            onSelect={setActiveKey}
            onClose={closeTab}
          />
          <div className="center-body">
            {!activeTab && (
              <div className="empty-center">
                打开笔记，或按 {modHint()}P 快速打开
              </div>
            )}
            {activeTab && missingIds[activeTab.id] && (
              <div className="empty-center">页面不存在或尚未编译：{activeTab.id}</div>
            )}
            {activeTab && !activePage && !missingIds[activeTab.id] && (
              <div className="empty-center">加载中…</div>
            )}
            {activeTab && activePage && (
              <NoteView
                page={activePage}
                pages={pages}
                mode={noteMode}
                draft={noteDrafts[activePage.id] ?? activePage.raw}
                dirty={isDirty(activePage.id)}
                saving={noteSaving}
                onMode={setNoteMode}
                onDraft={(value) =>
                  setNoteDrafts((d) => ({ ...d, [activePage.id]: value }))
                }
                onSave={() => void saveNote(activePage.id)}
                onOpen={openPage}
              />
            )}
          </div>
        </section>
        <RightSidebar
          view={rightView}
          onView={setRightView}
          width={rightWidth}
          collapsed={rightCollapsed}
          overlay={narrow}
          messages={messages}
          draft={draft}
          busy={busy}
          pages={pages}
          outline={outline}
          pageId={activePageId}
          graph={graph}
          theme={theme}
          onDraft={setDraft}
          onSend={() => void sendMessage()}
          onOpen={openPage}
          onJump={jumpHeading}
          onResize={(dx) => setRightWidth((w) => clamp(w + dx, RIGHT_MIN, RIGHT_MAX))}
        />
      </div>
      <StatusBar
        vaultPath={settings.vaultPath}
        pageCount={pages.length}
        currentId={activePageId}
        busy={busy}
        dirty={activeDirty}
        saving={noteSaving}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />
      {error && (
        <div className="toast-error" onClick={() => setError(null)}>
          {error}
        </div>
      )}
      {settingsOpen && (
        <SettingsModal
          settings={settings}
          busy={busy}
          onClose={() => setSettingsOpen(false)}
          onSave={saveSettings}
        />
      )}
      {ingestOpen && (
        <IngestModal
          busy={busy}
          canPickFiles={isTauriRuntime()}
          onClose={() => setIngestOpen(false)}
          onImportFiles={async () => {
            const files = await api.pickFiles();
            await ingestFiles(files);
          }}
          onPaste={ingestPaste}
        />
      )}
      {newNoteOpen && (
        <NewNoteModal
          busy={busy}
          onClose={() => setNewNoteOpen(false)}
          onCreate={createNote}
        />
      )}
      {palette && (
        <CommandPalette
          mode={palette}
          pages={pages}
          commands={commands}
          onClose={() => setPalette(null)}
          onOpenPage={openPage}
        />
      )}
    </div>
  );
}

function modHint(): string {
  return typeof navigator !== "undefined" && /Mac/i.test(navigator.platform) ? "⌘" : "Ctrl+";
}
