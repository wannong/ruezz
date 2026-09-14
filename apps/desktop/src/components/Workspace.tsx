import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  isTauriRuntime,
  type AgentSession,
  type AgentAttachment,
  type AgentSessionMessage,
  type AgentSessionSummary,
  type GraphDto,
  type PageContent,
  type PageSummary,
  type VaultSettings,
} from "../api";
import { clampGraphScope } from "../lib/graph";
import { loadPref, savePref } from "../lib/prefs";
import { parseOutline } from "../lib/outline";
import { markdownBody } from "../lib/noteId";
import { joinWikiId, parentWikiId, pasteDest, type WikiClip } from "../lib/fileTree";
import { tabKey, type Tab } from "../lib/tabs";
import { activeProviderIdOf, modelSwitchKey, providersOf, syncSettings, uniqueModelIds } from "../lib/llmProviders";
import { useMediaQuery } from "../lib/useMediaQuery";
import type { Theme } from "../theme";
import { PanelOpenGlyph } from "./iconGlyphs";
import { CommandPalette, type PaletteCommand, type PaletteMode } from "./CommandPalette";
import { IngestModal } from "./IngestModal";
import { LeftSidebar, type LinkPicker } from "./LeftSidebar";
import { NewNoteModal } from "./NewNoteModal";
import { NoteView } from "./NoteView";
import { Modal } from "./Modal";
import { Presence } from "./Presence";
import { Ribbon } from "./Ribbon";
import { RightSidebar, type RightView } from "./RightSidebar";
import { SettingsModal } from "./SettingsModal";
import { StatusBar } from "./StatusBar";
import { TabBar } from "./TabBar";

type WorkspaceProps = {
  settings: VaultSettings;
  onSettings: (next: VaultSettings) => void;
  theme: Theme;
  onToggleTheme: () => void;
  error: string | null;
  setError: (message: string | null) => void;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onAgentTitle?: (title: string | null) => void;
};

const LEFT_MIN = 180;
const LEFT_MAX = 420;
const RIGHT_MIN = 240;
const RIGHT_MAX = 480;

type AgentUiState = {
  messages: AgentSessionMessage[];
  attachments: AgentAttachment[];
  pendingUser: string | null;
  streamingText: string;
  streamingTools: Array<{ id: string; name: string }>;
  draft: string;
  busy: boolean;
};
type RelatedPanel =
  | { kind: "sessions"; label: string; sessions: AgentSessionSummary[] }
  | { kind: "files"; label: string; files: Array<{ id: string; label: string }> };

const emptyAgentState = (): AgentUiState => ({
  messages: [], attachments: [], pendingUser: null, streamingText: "", streamingTools: [], draft: "", busy: false,
});

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function clampHops(n: unknown): number {
  const value = Number(n);
  if (!Number.isFinite(value)) return 0;
  return Math.min(3, Math.max(0, Math.round(value)));
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
  onAgentTitle,
}: WorkspaceProps) {
  const narrow = useMediaQuery("(max-width: 960px)");
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [clip, setClip] = useState<WikiClip | null>(null);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [pageCache, setPageCache] = useState<Record<string, PageContent>>({});
  const [missingIds, setMissingIds] = useState<Record<string, true>>({});
  const [noteMode, setNoteMode] = useState<"read" | "edit" | "source">("read");
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [noteSaving, setNoteSaving] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);
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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [openSessionIds, setOpenSessionIds] = useState<string[]>([]);
  const [sessions, setSessions] = useState<AgentSessionSummary[]>([]);
  const [agentStates, setAgentStates] = useState<Record<string, AgentUiState>>({});
  const [draftFallback, setDraftFallback] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [relatedPanel, setRelatedPanel] = useState<RelatedPanel | null>(null);
  const graphDepth = clampHops(loadPref("agentGraphDepth", 0));
  const [graphHops, setGraphHops] = useState(() => clampGraphScope(loadPref("graphViewDepth", 1)));
  const [linkPicker, setLinkPicker] = useState<LinkPicker | null>(null);
  const [runnerProviders, setRunnerProviders] = useState<Array<{ name: string; models: string[] }>>([]);
  const sendingRef = useRef(false);
  const abortingRef = useRef(false);
  const sessionLoadGen = useRef(0);
  const lastPaletteMode = useRef<PaletteMode>("quick");
  const lastError = useRef<string | null>(null);
  if (error) lastError.current = error;

  const activeTab = tabs.find((t) => tabKey(t) === activeKey) ?? null;
  const activePageId = activeTab?.kind === "page" ? activeTab.id : null;
  const activePage = activePageId ? (pageCache[activePageId] ?? null) : null;
  const activeAgentState = sessionId ? (agentStates[sessionId] ?? emptyAgentState()) : emptyAgentState();
  const { messages, attachments, pendingUser, streamingText, streamingTools } = activeAgentState;
  const draft = sessionId ? activeAgentState.draft : draftFallback;
  const agentBusy = activeAgentState.busy;
  const updateAgentState = useCallback((id: string, update: Partial<AgentUiState> | ((state: AgentUiState) => AgentUiState)) => {
    setAgentStates((prev) => {
      const current = prev[id] ?? emptyAgentState();
      const next = typeof update === "function" ? update(current) : { ...current, ...update };
      return { ...prev, [id]: next };
    });
  }, []);
  const modelMissing = !settings.mock && !settings.model.trim();
  const modelProviders = providersOf(settings);
  const activeProviderId = activeProviderIdOf(settings, modelProviders);
  const modelGroups = useMemo(() => {
    const fromSettings = modelProviders
      .map((provider) => ({
        providerId: provider.id,
        providerName: provider.name,
        models:
          provider.id === activeProviderId
            ? uniqueModelIds([
                settings.model,
                ...provider.models,
                ...runnerProviders.flatMap((item) => item.models),
              ])
            : provider.models,
      }))
      .filter((group) => group.models.length > 0);
    if (fromSettings.length > 0) return fromSettings;
    return runnerProviders
      .map((provider) => ({
        providerId: provider.name,
        providerName: provider.name === "openai-compatible" ? "当前端点" : provider.name,
        models: provider.models,
      }))
      .filter((group) => group.models.length > 0);
  }, [modelProviders, activeProviderId, settings.model, runnerProviders]);
  const modelValue = modelSwitchKey(activeProviderId, settings.model);
  const modelLabel = settings.mock
    ? "模型：Mock（不走 API）"
    : modelMissing
      ? "未选择模型 — 请在设置中填写 API 并拉取或输入模型名"
      : `模型：${settings.model}`;
  const agentOpen = !rightCollapsed && rightView === "agent";
  const graphOpen = !rightCollapsed && rightView === "graph";

  const relatedSessions = useCallback((pageId: string, label: string) => {
    const matches = sessions.filter((session) =>
      session.linkedPageIds.includes(pageId) || session.attachments?.some((attachment) => attachment.id === pageId),
    );
    setRelatedPanel({ kind: "sessions", label, sessions: matches });
  }, [sessions]);

  const relatedFiles = useCallback((session: AgentSessionSummary) => {
    const files = session.attachments?.length
      ? session.attachments.map((attachment) => ({ id: attachment.id, label: attachment.label }))
      : session.linkedPageIds.map((id) => ({ id, label: pages.find((page) => page.id === id)?.title ?? id }));
    setRelatedPanel({ kind: "files", label: session.title || "新对话", files });
  }, [pages]);

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
        await loadGraph();
        return true;
      } catch (e) {
        onError(e instanceof Error ? e.message : String(e));
        return false;
      } finally {
        setNoteSaving(false);
      }
    },
    [pageCache, noteDrafts, loadPages, loadGraph, onError, setError],
  );

  const updatePageTags = useCallback(async (id: string, tags: string[]) => {
    setTagError(null);
    try {
      // Save an edited body first so the tag write cannot be overwritten by the autosave timer.
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
    loadGraph().catch(() => {
      /* graph may be empty on fresh vault */
    });
  }, [loadPages, loadGraph, onError]);

  const applySession = useCallback(
    (session: AgentSession, activate = true) => {
      if (activate) {
        setSessionId(session.id);
        setOpenSessionIds((prev) => prev.includes(session.id) ? prev : [...prev, session.id].slice(-3));
      }
      updateAgentState(session.id, (state) => ({ ...state, messages: session.messages, attachments: session.attachments ?? [], pendingUser: null, streamingText: "", streamingTools: [], busy: false }));
      setSessions((prev) => {
           const summary: AgentSessionSummary = {
          id: session.id,
          title: session.title,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          model: session.model,
          messageCount: session.messages.length,
           linkedPageIds: session.linkedPageIds,
           attachments: session.attachments ?? [],
          archived: Boolean(session.archived),
        };
        const index = prev.findIndex((item) => item.id === session.id);
        if (index < 0) return [summary, ...prev];
        const next = [...prev];
        next[index] = summary;
        return next;
      });
      if (activate) {
        savePref(`agentSession:${settings.vaultPath}`, session.id);
        onAgentTitle?.(session.title || "新对话");
      }
    },
    [onAgentTitle, settings.vaultPath, updateAgentState],
  );

  const refreshSessions = useCallback(async () => {
    const { sessions: list } = await api.agentSessionList();
    setSessions(list);
    return list;
  }, []);

  const refreshRunnerProviders = useCallback(async () => {
    try {
      const { providers } = await api.agentListProviders();
      setRunnerProviders(providers);
    } catch {
      setRunnerProviders([]);
    }
  }, []);

  useEffect(() => {
    const gen = ++sessionLoadGen.current;
    let cancelled = false;
    void (async () => {
      try {
        await refreshRunnerProviders();
        const list = await refreshSessions();
        if (cancelled || sessionLoadGen.current !== gen) return;
        if (!list.length) {
          setSessionId(null);
          onAgentTitle?.(null);
          return;
        }
        const saved = loadPref<string | null>(`agentSession:${settings.vaultPath}`, null);
        const pick = list.find((item) => item.id === saved) ?? list[0];
        const { session } = await api.agentSessionGet(pick.id);
        if (cancelled || sessionLoadGen.current !== gen) return;
        let current = session;
        if (!settings.mock && settings.model.trim() && session.model.modelId !== settings.model) {
          const updated = await api.agentSetModel({
            sessionId: session.id,
            provider: "openai-compatible",
            model: settings.model,
          });
          current = updated.session;
        }
        if (cancelled || sessionLoadGen.current !== gen) return;
        applySession(current);
      } catch (e) {
        if (!cancelled && sessionLoadGen.current === gen) onError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applySession, onAgentTitle, onError, refreshRunnerProviders, refreshSessions, settings.vaultPath]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

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
    savePref("graphViewDepth", graphHops);
  }, [graphHops]);

  useEffect(() => {
    if (palette) lastPaletteMode.current = palette;
  }, [palette]);

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

  const startLinkPicker = useCallback((fromId: string, range?: { start: number; end: number }) => {
    setLinkPicker({ fromId, range });
    setLeftCollapsed(false);
  }, []);

  const insertWikilink = useCallback(
    async (fromId: string, toId: string, range?: { start: number; end: number }) => {
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
      setNoteMode("edit");
      openPage(fromId);
    },
    [noteDrafts, pageCache, onError, openPage],
  );

  const openAgent = useCallback(() => {
    if (!rightCollapsed && rightView === "agent") setRightCollapsed(true);
    else {
      setRightCollapsed(false);
      setRightView("agent");
    }
  }, [rightCollapsed, rightView]);

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
    let internalizationSessionId: string | null = null;
    try {
      const imported: Array<{ pageIds: string[]; sourcePath?: string }> = [];
      for (const p of paths) imported.push(await api.vaultIngestPath(p) as { pageIds: string[]; sourcePath?: string });
      await loadPages();
      await loadGraph();
      setNotice(`已整篇导入 ${paths.length} 个文件`);
      setIngestOpen(false);
      const created = await api.agentSessionCreate({ title: `内化：${paths.length} 个文件` });
      internalizationSessionId = created.session.id;
      applySession(created.session);
      for (const item of imported) {
        for (const pageId of item.pageIds ?? []) {
          const page = pages.find((candidate) => candidate.id === pageId);
          const attached = await api.agentSessionAttach(created.session.id, { id: pageId, kind: "page", label: page?.title ?? pageId });
          applySession(attached.session);
        }
      }
      const importedIds = imported.flatMap((item) => item.pageIds ?? []);
      const prompt = `请立即内化刚刚导入并附加的资料，不要向用户索要资料位置。资料页面 ID：${importedIds.join(", ")}。请先逐个调用 read_page 读取这些页面的正文，提炼重要概念、事实和关系；然后创建必要的新 Markdown 页面，并将新页面中的概念与已有知识库页面用 [[page-id]] 链接起来；已有相关页面请更新。请先完整分析资料，再执行写入。`;
      updateAgentState(created.session.id, { busy: true, pendingUser: prompt, streamingText: "", streamingTools: [] });
      const internalized = await api.agentPromptStream({ sessionId: created.session.id, message: prompt, graphDepth: 0 }, (event) => {
        if (event.type === "text") updateAgentState(created.session.id, { streamingText: event.text });
        if (event.type === "tool_start") {
          updateAgentState(created.session.id, (state) => ({
            ...state,
            streamingTools: state.streamingTools.some((tool) => tool.id === event.id)
              ? state.streamingTools
              : [...state.streamingTools, { id: event.id, name: event.name }],
          }));
        }
      });
      applySession(internalized.session);
      await refreshSessions();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
      if (internalizationSessionId) updateAgentState(internalizationSessionId, { pendingUser: null, streamingText: "", streamingTools: [], busy: false });
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
      setNotice(`已整篇入库文本「${title}」`);
      setIngestOpen(false);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function isAbortError(error: unknown): boolean {
    if (!error) return false;
    if (error instanceof DOMException && error.name === "AbortError") return true;
    if (error instanceof Error && (error.name === "AbortError" || /abort/i.test(error.message))) {
      return true;
    }
    return false;
  }

  async function reloadSession(id: string) {
    const { session } = await api.agentSessionGet(id);
    applySession(session, id === sessionId);
  }

  async function stopGeneration() {
    if (!agentBusy) return;
    abortingRef.current = true;
    try {
      await api.agentAbort();
    } catch {
      /* stop is best-effort; the in-flight prompt still settles */
    }
  }

  async function sendMessage() {
    const text = draft.trim();
    if (!text || agentBusy || sendingRef.current) return;
    sendingRef.current = true;
    abortingRef.current = false;
    setError(null);
    let id = sessionId;
    try {
      if (!id) {
        sessionLoadGen.current += 1;
        const created = await api.agentSessionCreate({
          currentPageId: activePageId ?? undefined,
        });
        id = created.session.id;
        applySession(created.session);
      }
      updateAgentState(id, { draft: "", pendingUser: text, streamingText: "", streamingTools: [], busy: true });
      const result = await api.agentPromptStream(
        {
          sessionId: id,
          message: text,
           currentPageId: undefined,
          graphDepth,
        },
        (event) => {
           if (event.type === "text") updateAgentState(id!, { streamingText: event.text });
          if (event.type === "tool_start") {
            updateAgentState(id!, (state) => ({ ...state, streamingTools: state.streamingTools.some((tool) => tool.id === event.id) ? state.streamingTools : [...state.streamingTools, { id: event.id, name: event.name }] }));
          }
        },
      );
       applySession(result.session, false);
      await refreshSessions();
      await loadPages();
      await loadGraph();
    } catch (e) {
      if (abortingRef.current || isAbortError(e)) {
        if (id) {
          try {
            await reloadSession(id);
            await refreshSessions();
          } catch {
            /* session may not have been persisted yet */
          }
        }
      } else {
        onError(e instanceof Error ? e.message : String(e));
      }
    } finally {
       if (id) updateAgentState(id, { pendingUser: null, streamingText: "", streamingTools: [], busy: false });
      sendingRef.current = false;
      abortingRef.current = false;
    }
  }

  async function newChat() {
    if (Object.values(agentStates).some((state) => state.busy)) return;
    sessionLoadGen.current += 1;
    try {
      const created = await api.agentSessionCreate({
           currentPageId: undefined,
      });
      applySession(created.session);
      await refreshSessions();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  async function attachCurrentPage() {
    if (!sessionId || !activePageId) return;
    try {
      const { session } = await api.agentSessionAttach(sessionId, {
        id: activePageId,
        kind: "page",
        label: titleFor(activePageId),
      });
      applySession(session);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  const closeAgentSession = useCallback((id: string) => {
    if (agentStates[id]?.busy) return;
    setOpenSessionIds((prev) => {
      const next = prev.filter((item) => item !== id);
      if (id === sessionId) {
        const replacement = next[next.length - 1] ?? null;
        setSessionId(replacement);
        if (replacement) void selectSession(replacement);
        else onAgentTitle?.(null);
      }
      return next;
    });
  }, [agentStates, onAgentTitle, selectSession, sessionId]);

  async function detachAttachment(id: string) {
    if (!sessionId) return;
    try {
      const { session } = await api.agentSessionDetach(sessionId, id);
      applySession(session);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  async function selectSession(id: string) {
    if (id === sessionId) return;
    sessionLoadGen.current += 1;
    try {
      const { session } = await api.agentSessionGet(id);
      applySession(session);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  async function deleteAgentSession(id: string) {
    if (agentStates[id]?.busy) return;
    try {
      await api.agentSessionDelete(id);
      setOpenSessionIds((prev) => prev.filter((item) => item !== id));
      setAgentStates((prev) => { const next = { ...prev }; delete next[id]; return next; });
      const list = await refreshSessions();
      if (id !== sessionId) return;
      const next = list.find((item) => !item.archived);
      if (next) {
        sessionLoadGen.current += 1;
        const { session } = await api.agentSessionGet(next.id);
        applySession(session);
        return;
      }
      sessionLoadGen.current += 1;
      setSessionId(null);
      savePref(`agentSession:${settings.vaultPath}`, null);
      onAgentTitle?.(null);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  async function archiveAgentSession(id: string, archived: boolean) {
    if (agentStates[id]?.busy) return;
    try {
      await api.agentSessionArchive(id, archived);
      await refreshSessions();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  async function switchModel(providerId: string, modelId: string) {
    if (!modelId.trim() || (providerId === activeProviderId && modelId === settings.model && !settings.mock)) {
      return;
    }
    const settingsProvider = modelProviders.some((provider) => provider.id === providerId);
    try {
      if (settingsProvider) {
        const next = { ...syncSettings(settings, modelProviders, providerId, modelId), mock: false };
        await api.settingsSet(next);
        onSettings(next);
      }
      if (sessionId) {
        await api.agentSetModel({
          sessionId,
          provider: settingsProvider ? "openai-compatible" : providerId,
          model: modelId,
        });
      }
      await refreshRunnerProviders();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  async function saveSettings(next: VaultSettings) {
    setBusy(true);
    setError(null);
    try {
      const vaultChanged = Boolean(next.vaultPath && next.vaultPath !== settings.vaultPath);
      const saved = { ...next, mock: false };
      await api.settingsSet(saved);
      onSettings(saved);
      if (vaultChanged) {
        await api.vaultInit(saved.vaultPath);
      } else if (sessionId && saved.model.trim()) {
        await api.agentSetModel({
          sessionId,
          provider: "openai-compatible",
          model: saved.model,
        });
      }
      await refreshRunnerProviders();
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
      { id: "agent", label: "显示 Agent", run: () => { setRightCollapsed(false); setRightView("agent"); } },
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
          agentOpen={agentOpen}
          graphOpen={graphOpen}
          busy={busy}
          onFiles={toggleLeftFiles}
          onSearch={toggleLeftSearch}
          onAgent={openAgent}
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
          linkPicker={linkPicker}
          onOpen={openPage}
          onCopy={setClip}
          onPaste={(folderId) => void pasteInto(folderId)}
          onRename={(kind, fromId, name) => void renameEntry(kind, fromId, name)}
          onCreateNote={(folderId, name) => void createNoteIn(folderId, name)}
          onCreateFolder={(folderId, name) => void createFolderIn(folderId, name)}
          onReveal={(kind, id) => void revealEntry(kind, id)}
           onLink={(id) => startLinkPicker(id)}
           onRelatedSessions={relatedSessions}
          onPickLink={(toId) => {
            if (!linkPicker) return;
            void insertWikilink(linkPicker.fromId, toId, linkPicker.range);
            setLinkPicker(null);
          }}
          onCloseLinkPicker={() => setLinkPicker(null)}
          onError={onError}
          onResize={(dx) => setLeftWidth((w) => clamp(w + dx, LEFT_MIN, LEFT_MAX))}
        />
        <section className="center-pane">
          <div className="center-header">
            <TabBar
              tabs={tabs}
              activeKey={activeKey}
              titleFor={titleFor}
              isDirty={isDirty}
              onSelect={setActiveKey}
              onClose={closeTab}
            />
            {rightCollapsed && (
              <button
                type="button"
                className="sidebar-expand"
                data-icon="expand"
                title="展开右侧栏"
                aria-label="展开右侧栏"
                onClick={() => setRightCollapsed(false)}
              >
                <PanelOpenGlyph />
              </button>
            )}
          </div>
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
              <div className="empty-center loading-breathe">加载中…</div>
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
                onLink={(range) => startLinkPicker(activePage.id, range)}
                assetRoot={settings.vaultPath}
                onUpdateTags={(tags) => updatePageTags(activePage.id, tags)}
                tagError={tagError}
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
          pendingUser={pendingUser}
          streamingText={streamingText}
          streamingTools={streamingTools}
          draft={draft}
          busy={agentBusy}
          pages={pages}
          sessions={sessions}
           sessionId={sessionId}
           openSessionIds={openSessionIds}
          outline={outline}
          pageId={activePageId}
          graph={graph}
          theme={theme}
           onDraft={(value) => sessionId ? updateAgentState(sessionId, { draft: value }) : setDraftFallback(value)}
          onSend={() => void sendMessage()}
          onStop={() => void stopGeneration()}
          onOpen={openPage}
          onJump={jumpHeading}
          onResize={(dx) => setRightWidth((w) => clamp(w + dx, RIGHT_MIN, RIGHT_MAX))}
          onCollapse={() => setRightCollapsed(true)}
          modelLabel={modelLabel}
          modelMissing={modelMissing}
          modelValue={modelValue}
          modelGroups={modelGroups}
           mock={settings.mock}
           attachments={attachments}
           canAttachCurrent={Boolean(activePageId && !attachments.some((item) => item.id === activePageId))}
           currentPageLabel={activePageId ? titleFor(activePageId) : "未打开文件"}
          graphHops={graphHops}
          onGraphHops={setGraphHops}
          onNewChat={() => void newChat()}
          onSelectSession={(id) => void selectSession(id)}
          onDeleteSession={(id) => void deleteAgentSession(id)}
          onArchiveSession={(id, archived) => void archiveAgentSession(id, archived)}
           onSwitchModel={(providerId, modelId) => void switchModel(providerId, modelId)}
           onAttachCurrent={() => void attachCurrentPage()}
           onDetachAttachment={(id) => void detachAttachment(id)}
           onRelatedFiles={relatedFiles}
           onCloseSession={closeAgentSession}
         />
      </div>
      <StatusBar
        vaultPath={settings.vaultPath}
        pageCount={pages.length}
        currentId={activePageId}
        busy={busy || agentBusy}
        notice={notice}
        dirty={activeDirty}
        saving={noteSaving}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />
      <Presence open={!!error}>
        <div className="toast-error" onClick={() => setError(null)}>
          {error ?? lastError.current}
        </div>
      </Presence>
      <Presence open={relatedPanel !== null}>
        {relatedPanel && (
          <Modal title={relatedPanel.kind === "sessions" ? `相关会话：${relatedPanel.label}` : `相关文件：${relatedPanel.label}`} onClose={() => setRelatedPanel(null)}>
            {relatedPanel.kind === "sessions" ? (
              relatedPanel.sessions.length ? (
                <div className="related-result-list">
                  {relatedPanel.sessions.map((session) => (
                    <button key={session.id} type="button" className="related-result" onClick={() => { setRelatedPanel(null); void selectSession(session.id); }}>
                      <strong>{session.title || "新对话"}</strong>
                      <span>{formatRelatedDate(session.updatedAt)} · {session.messageCount} 条消息</span>
                    </button>
                  ))}
                </div>
              ) : <div className="related-empty">暂无相关会话</div>
            ) : relatedPanel.files.length ? (
              <div className="related-result-list">
                {relatedPanel.files.map((file) => (
                  <button key={file.id} type="button" className="related-result" onClick={() => { setRelatedPanel(null); openPage(file.id); }}>
                    <strong>{file.label}</strong><span>{file.id}</span>
                  </button>
                ))}
              </div>
            ) : <div className="related-empty">暂无相关文件</div>}
          </Modal>
        )}
      </Presence>
      <Presence open={settingsOpen}>
        <SettingsModal
          settings={settings}
          busy={busy}
          onClose={() => setSettingsOpen(false)}
          onSave={saveSettings}
        />
      </Presence>
      <Presence open={ingestOpen}>
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
      </Presence>
      <Presence open={newNoteOpen}>
        <NewNoteModal
          busy={busy}
          onClose={() => setNewNoteOpen(false)}
          onCreate={createNote}
        />
      </Presence>
      <Presence open={palette !== null}>
        <CommandPalette
          mode={palette ?? lastPaletteMode.current}
          pages={pages}
          commands={commands}
          onClose={() => setPalette(null)}
          onOpenPage={openPage}
        />
      </Presence>
    </div>
  );
}

function modHint(): string {
  return typeof navigator !== "undefined" && /Mac/i.test(navigator.platform) ? "⌘" : "Ctrl+";
}

function formatRelatedDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString([], { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
