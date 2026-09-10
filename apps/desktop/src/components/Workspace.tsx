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
import { tabKey, type Tab } from "../lib/tabs";
import { useMediaQuery } from "../lib/useMediaQuery";
import type { Theme } from "../theme";
import { CommandPalette, type PaletteCommand, type PaletteMode } from "./CommandPalette";
import { GraphView } from "./GraphView";
import { IngestModal } from "./IngestModal";
import { LeftSidebar } from "./LeftSidebar";
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
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [pageCache, setPageCache] = useState<Record<string, PageContent>>({});
  const [missingIds, setMissingIds] = useState<Record<string, true>>({});
  const [noteMode, setNoteMode] = useState<"read" | "source">("read");
  const [leftView, setLeftView] = useState<"files" | "search">("files");
  const [rightView, setRightView] = useState<RightView>("agent");
  const [leftCollapsed, setLeftCollapsed] = useState(() => loadPref("leftCollapsed", false));
  const [rightCollapsed, setRightCollapsed] = useState(() => loadPref("rightCollapsed", false));
  const [leftWidth, setLeftWidth] = useState(() => loadPref("leftWidth", 240));
  const [rightWidth, setRightWidth] = useState(() => loadPref("rightWidth", 320));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ingestOpen, setIngestOpen] = useState(false);
  const [palette, setPalette] = useState<PaletteMode | null>(null);
  const [graph, setGraph] = useState<GraphDto | null>(null);
  const [backlinks, setBacklinks] = useState<PageSummary[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");

  const activeTab = tabs.find((t) => tabKey(t) === activeKey) ?? null;
  const activePageId = activeTab?.kind === "page" ? activeTab.id : null;
  const activePage = activePageId ? (pageCache[activePageId] ?? null) : null;
  const graphOpen = activeTab?.kind === "graph";

  const onError = useCallback(
    (message: string) => setError(message),
    [setError],
  );

  const loadPages = useCallback(async () => {
    const list = await api.vaultListPages();
    setPages(list);
    return list;
  }, []);

  const loadGraph = useCallback(async () => {
    const g = await api.vaultGraph();
    setGraph(g);
  }, []);

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

  useEffect(() => {
    if (!activePageId) {
      setBacklinks([]);
      return;
    }
    let cancelled = false;
    api
      .vaultBacklinks(activePageId)
      .then((list) => {
        if (!cancelled) setBacklinks(list);
      })
      .catch(() => {
        if (!cancelled) setBacklinks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activePageId]);

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
    setTabs((prev) => (prev.some((t) => t.kind === "graph") ? prev : [...prev, { kind: "graph" }]));
    setActiveKey("graph");
    void loadGraph();
  }, [loadGraph]);

  const closeTab = useCallback(
    (key: string) => {
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
    [activeKey],
  );

  const titleFor = useCallback(
    (id: string) => pages.find((p) => p.id === id)?.title ?? pageCache[id]?.title ?? id.split("/").pop() ?? id,
    [pages, pageCache],
  );

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
      { id: "graph", label: "打开图谱", hint: "Ctrl+G", run: openGraph },
      { id: "ingest", label: "入库…", run: () => setIngestOpen(true) },
      { id: "settings", label: "打开设置", run: () => setSettingsOpen(true) },
      { id: "theme", label: "切换深浅色", run: onToggleTheme },
      { id: "left", label: "折叠/展开左栏", hint: "Ctrl+[", run: () => setLeftCollapsed((v) => !v) },
      { id: "right", label: "折叠/展开右栏", hint: "Ctrl+]", run: () => setRightCollapsed((v) => !v) },
    ],
    [openGraph, onToggleTheme],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === "Escape") {
        setPalette(null);
        setSettingsOpen(false);
        setIngestOpen(false);
        return;
      }
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "p") {
        e.preventDefault();
        setPalette(e.shiftKey ? "commands" : "quick");
      } else if (key === "g") {
        e.preventDefault();
        openGraph();
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
  }, [openGraph]);

  const outline = activePage ? parseOutline(activePage.body) : [];

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
          activeId={activePageId}
          width={leftWidth}
          collapsed={leftCollapsed}
          overlay={narrow}
          onOpen={openPage}
          onError={onError}
          onResize={(dx) => setLeftWidth((w) => clamp(w + dx, LEFT_MIN, LEFT_MAX))}
        />
        <section className="center-pane">
          <TabBar
            tabs={tabs}
            activeKey={activeKey}
            titleFor={titleFor}
            onSelect={setActiveKey}
            onClose={closeTab}
          />
          <div className="center-body">
            {!activeTab && (
              <div className="empty-center">
                打开笔记，或按 {modHint()}P 快速打开
              </div>
            )}
            {activeTab?.kind === "page" && missingIds[activeTab.id] && (
              <div className="empty-center">页面不存在或尚未编译：{activeTab.id}</div>
            )}
            {activeTab?.kind === "page" && !activePage && !missingIds[activeTab.id] && (
              <div className="empty-center">加载中…</div>
            )}
            {activeTab?.kind === "page" && activePage && (
              <NoteView
                page={activePage}
                pages={pages}
                mode={noteMode}
                onMode={setNoteMode}
                onOpen={openPage}
              />
            )}
            {activeTab?.kind === "graph" && <GraphView graph={graph} theme={theme} onOpen={openPage} />}
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
          backlinks={backlinks}
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
