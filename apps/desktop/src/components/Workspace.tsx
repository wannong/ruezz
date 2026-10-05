import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  api,
  isTauriRuntime,
  type AgentSessionSummary,
  type GraphDto,
  type Idea,
  type IdeaSelector,
  type VaultSettings,
} from "../api";
import { clampGraphScope } from "../lib/graph";
import { loadPref, savePref } from "../lib/prefs";
import { loadFavorites, remapFavoriteFolder, remapFavoritePage, saveFavorites } from "../lib/favorites";
import { assignPagesToFolder } from "../lib/libraryFolders";
import { parseOutline } from "../lib/outline";
import { markdownBody } from "../lib/noteId";
import { joinWikiId, parentWikiId, pasteDest, type WikiClip } from "../lib/fileTree";
import { useMediaQuery } from "../lib/useMediaQuery";
import { useAgentSession } from "../lib/workspace/useAgentSession";
import { useLibraryOrganization } from "../lib/workspace/useLibraryOrganization";
import { usePageTabs } from "../lib/workspace/usePageTabs";
import type { ColorPalette, Theme } from "../theme";
import { PALETTE_META } from "../theme";
import { PanelOpenGlyph } from "./iconGlyphs";
import { appendSelectionToDraft } from "./agentChatCore";
import { CommandPalette, type PaletteCommand, type PaletteMode } from "./CommandPalette";
import { IngestModal } from "./IngestModal";
import { IngestProgressHost, type IngestProgressRunner } from "./IngestProgressHost";
import { INGEST_PROGRESS_PREVIEW_PATHS } from "../lib/ingestProgress";
import { titleFromPaste } from "../lib/ingestTitle";
import { LeftSidebar, type LeftView, type LinkPicker } from "./LeftSidebar";
import { NewNoteModal } from "./NewNoteModal";
import { NoteView } from "./NoteView";
import { Modal } from "./Modal";
import { Presence } from "./Presence";
import { Ribbon } from "./Ribbon";
import { RightSidebar, type RightView } from "./RightSidebar";
import { SettingsModal } from "./SettingsModal";
import { AgentFloatingIsland } from "./AgentFloatingIsland";
import { ruezzWorkModeFromNoteMode } from "../lib/centaur-character/activity";
import { centaurTransferMs } from "./CentaurChromeSlot";
import { StatusBar } from "./StatusBar";
import { TabBar } from "./TabBar";
import type { TitleBarCentaurProps } from "./TitleBar";

type WorkspaceProps = {
  settings: VaultSettings;
  onSettings: (next: VaultSettings) => void;
  colorPalette: ColorPalette;
  graphTheme: Theme;
  onColorPaletteChange: (palette: ColorPalette) => void;
  onCycleColorPalette: () => void;
  error: string | null;
  setError: (message: string | null) => void;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onAgentTitle?: (title: string | null) => void;
  onTitleBarCentaur?: (centaur: TitleBarCentaurProps | null) => void;
};

const LEFT_MIN = 180;
const LEFT_MAX = 420;
const RIGHT_MIN = 240;
const RIGHT_MAX = 480;

type RelatedPanel =
  | { kind: "sessions"; label: string; sessions: AgentSessionSummary[] }
  | { kind: "files"; label: string; files: Array<{ id: string; label: string }> };

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function clampHops(n: unknown): number {
  const value = Number(n);
  if (!Number.isFinite(value)) return 0;
  return Math.min(3, Math.max(0, Math.round(value)));
}

function ingestPause(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

export function Workspace({
  settings,
  onSettings,
  colorPalette,
  graphTheme,
  onColorPaletteChange,
  onCycleColorPalette,
  error,
  setError,
  busy,
  setBusy,
  onAgentTitle,
  onTitleBarCentaur,
}: WorkspaceProps) {
  const ideaPalette = {
    white: { paper: "255, 255, 255", ink: "38, 38, 38" },
    yellow: { paper: "244, 217, 120", ink: "53, 45, 27" },
    blue: { paper: "190, 220, 242", ink: "28, 48, 61" },
    green: { paper: "198, 226, 197", ink: "30, 53, 35" },
    pink: { paper: "239, 202, 214", ink: "65, 33, 44" },
  }[settings.ideaColor] ?? { paper: "255, 255, 255", ink: "38, 38, 38" };
  const narrow = useMediaQuery("(max-width: 960px)");
  const [clip, setClip] = useState<WikiClip | null>(null);
  const [leftView, setLeftView] = useState<LeftView>("library");
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => loadFavorites(settings.vaultPath));
  const [rightView, setRightView] = useState<RightView>("agent");
  const [leftCollapsed, setLeftCollapsed] = useState(() => loadPref("leftCollapsed", false));
  const [rightCollapsed, setRightCollapsed] = useState(() => loadPref("rightCollapsed", false));
  const [headerCentaurShown, setHeaderCentaurShown] = useState(true);
  const [titlebarCentaurShown, setTitlebarCentaurShown] = useState(() => loadPref("rightCollapsed", false));
  const [agentIslandOpen, setAgentIslandOpen] = useState(false);
  const centaurTransferTimer = useRef<number | undefined>(undefined);
  const [leftWidth, setLeftWidth] = useState(() => loadPref("leftWidth", 240));
  const [rightWidth, setRightWidth] = useState(() => loadPref("rightWidth", 320));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [developerMode, setDeveloperMode] = useState(() => loadPref("developerMode", false));
  const [ingestOpen, setIngestOpen] = useState(false);
  const [ingestFolderId, setIngestFolderId] = useState<string | null>(null);
  const ingestProgressRunnerRef = useRef<IngestProgressRunner | null>(null);
  const [newNoteOpen, setNewNoteOpen] = useState(false);
  const [palette, setPalette] = useState<PaletteMode | null>(null);
  const [graph, setGraph] = useState<GraphDto | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [ideasVisible, setIdeasVisible] = useState(() => loadPref("ideasVisible", true));
  const [notice, setNotice] = useState<string | null>(null);
  const [relatedPanel, setRelatedPanel] = useState<RelatedPanel | null>(null);
  const graphDepth = clampHops(loadPref("agentGraphDepth", 0));
  const [graphHops, setGraphHops] = useState(() => clampGraphScope(loadPref("graphViewDepth", 1)));
  const [linkPicker, setLinkPicker] = useState<LinkPicker | null>(null);
  const lastPaletteMode = useRef<PaletteMode>("quick");
  const lastError = useRef<string | null>(null);
  if (error) lastError.current = error;

  const onError = useCallback((message: string) => setError(message), [setError]);

  const loadGraph = useCallback(async () => {
    const g = await api.vaultGraph();
    setGraph(g);
  }, []);

  const onVaultMutated = useCallback(async () => {
    await loadGraph();
  }, [loadGraph]);

  const pageTabs = usePageTabs({
    onError,
    setError,
    onVaultMutated,
    onPageIdRemapped: (oldId, newId) => {
      setFavoriteIds((ids) => {
        const next = remapFavoritePage(ids, oldId, newId);
        saveFavorites(settings.vaultPath, next);
        return next;
      });
    },
    onFolderPrefixRemapped: (from, to, mapId) => {
      setClip((cur) => {
        if (!cur) return cur;
        if (cur.kind === "folder" && cur.id === from) return { ...cur, id: to };
        return { ...cur, id: mapId(cur.id) };
      });
      setFavoriteIds((ids) => {
        const next = remapFavoriteFolder(ids, from, to);
        saveFavorites(settings.vaultPath, next);
        return next;
      });
    },
  });

  const {
    pages,
    folders,
    tabs,
    activeKey,
    setActiveKey,
    activeTab,
    activePageId,
    activePage,
    activePageNoteMode,
    setPageCache,
    missingIds,
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
    openPage: openPageInternal,
    navigatePageHistory,
    insertWikilink,
    closeTab,
    remapPageId,
    remapFolderPrefix,
    titleFor,
    takenIds,
  } = pageTabs;

  const openPage = useCallback((id: string, recordHistory = true) => {
    openPageInternal(id, recordHistory);
    if (narrow) setLeftCollapsed(true);
  }, [narrow, openPageInternal]);

  const {
    libraryOrganization,
    persistLibrary,
    createLibraryFolderIn,
    renameLibraryFolderIn,
    deleteLibraryFolderIn,
    moveLibraryPages,
  } = useLibraryOrganization({
    vaultPath: settings.vaultPath,
    onError,
    onMigrated: setNotice,
  });

  const agent = useAgentSession({
    settings,
    onSettings,
    onAgentTitle,
    onError,
    setError,
    activePageId,
    titleFor,
    graphDepth,
    onVaultMutated: async () => {
      await loadPages();
      await loadGraph();
    },
  });

  const {
    sessionId,
    openSessionIds,
    sessions,
    setDraftFallback,
    ruezzCelebrate,
    messages,
    attachments,
    pendingUser,
    streamingText,
    streamingTools,
    streamingPhase,
    draft,
    agentBusy,
    modelGroups,
    modelValue,
    modelMissing,
    modelLabel,
    updateAgentState,
    applySession,
    refreshSessions,
    refreshRunnerProviders,
    triggerRuezzCelebrate,
    createAgentIdea: createAgentIdeaInternal,
    sendMessage,
    stopGeneration,
    newChat,
    attachCurrentPage,
    detachAttachment,
    selectSession,
    closeAgentSession,
    deleteAgentSession,
    archiveAgentSession,
    switchModel,
  } = agent;

  const ruezzWorkMode = useMemo(
    () => (activePageId ? ruezzWorkModeFromNoteMode(activePageNoteMode) : "idle"),
    [activePageId, activePageNoteMode],
  );

  const agentOpen = !rightCollapsed && rightView === "agent";
  const graphOpen = !rightCollapsed && rightView === "graph";
  const shouldHandoffCentaur =
    rightView === "agent" && (messages.length > 0 || Boolean(pendingUser) || agentBusy);

  const setRightCollapsedAnimated = useCallback(
    (next: boolean) => {
      window.clearTimeout(centaurTransferTimer.current);
      if (next === rightCollapsed) return;

      if (next) {
        if (!rightCollapsed && shouldHandoffCentaur) {
          setHeaderCentaurShown(false);
          centaurTransferTimer.current = window.setTimeout(() => {
            setRightCollapsed(true);
            setTitlebarCentaurShown(true);
          }, centaurTransferMs);
          return;
        }
        setRightCollapsed(true);
        setTitlebarCentaurShown(true);
        return;
      }

      if (rightCollapsed && shouldHandoffCentaur) {
        setTitlebarCentaurShown(false);
        centaurTransferTimer.current = window.setTimeout(() => {
          setRightCollapsed(false);
          setHeaderCentaurShown(true);
        }, centaurTransferMs);
        return;
      }

      setRightCollapsed(false);
      setTitlebarCentaurShown(false);
      setHeaderCentaurShown(true);
    },
    [rightCollapsed, shouldHandoffCentaur],
  );

  useEffect(() => {
    if (!onTitleBarCentaur) return;
    if (!rightCollapsed) {
      onTitleBarCentaur(null);
      return;
    }
    onTitleBarCentaur({
      open: agentIslandOpen,
      visible: titlebarCentaurShown,
      onToggle: () => setAgentIslandOpen((open) => !open),
      activity: {
        busy: agentBusy,
        pendingUser,
        streamingPhase,
        streamingText,
        streamingTools,
        celebrate: ruezzCelebrate,
        workMode: ruezzWorkMode,
      },
    });
  }, [
    rightCollapsed,
    titlebarCentaurShown,
    agentIslandOpen,
    onTitleBarCentaur,
    agentBusy,
    pendingUser,
    streamingPhase,
    streamingText,
    streamingTools,
    ruezzCelebrate,
    ruezzWorkMode,
  ]);

  useEffect(() => () => window.clearTimeout(centaurTransferTimer.current), []);
  useEffect(() => () => onTitleBarCentaur?.(null), [onTitleBarCentaur]);
  useEffect(() => {
    if (!rightCollapsed) setAgentIslandOpen(false);
  }, [rightCollapsed]);

  useEffect(() => {
    loadGraph().catch(() => {
      /* graph may be empty on fresh vault */
    });
  }, [loadGraph]);

  useEffect(() => {
    setFavoriteIds(loadFavorites(settings.vaultPath));
  }, [settings.vaultPath]);

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

  const loadIdeas = useCallback(async () => {
    const result = await api.ideaList();
    setIdeas(result.ideas);
    return result.ideas;
  }, []);

  useEffect(() => {
    void loadIdeas().catch((e) => onError(e instanceof Error ? e.message : String(e)));
  }, [loadIdeas, onError, settings.vaultPath]);

  useEffect(() => {
    savePref("ideasVisible", ideasVisible);
  }, [ideasVisible]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const createPageIdea = useCallback(async (selector: IdeaSelector, content: string) => {
    if (!activePageId) return false;
    try {
      const { idea } = await api.ideaCreate({
        content,
        target: { kind: "page", pageId: activePageId },
        selector,
      });
      setIdeas((current) => [idea, ...current]);
      setRightCollapsed(false);
      setRightView("ideas");
      return true;
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }, [activePageId, onError]);

  const createAgentIdea = useCallback(async (messageId: string, selector: IdeaSelector, content: string) => {
    const idea = await createAgentIdeaInternal(messageId, selector, content);
    if (!idea) return false;
    setIdeas((current) => [idea, ...current]);
    setRightView("ideas");
    return true;
  }, [createAgentIdeaInternal]);

  const updateIdea = useCallback(async (id: string, patch: Partial<Pick<Idea, "content" | "status">>) => {
    try {
      const { idea } = await api.ideaUpdate(id, patch);
      setIdeas((current) => current.map((item) => item.id === id ? idea : item));
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }, [onError]);

  const deleteIdea = useCallback(async (id: string) => {
    try {
      const { ok } = await api.ideaDelete(id);
      if (ok) setIdeas((current) => current.filter((item) => item.id !== id));
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }, [onError]);

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

  const startLinkPicker = useCallback((fromId: string, range?: { start: number; end: number }) => {
    setLinkPicker({ fromId, range });
    setLeftCollapsed(false);
  }, []);

  const openAgent = useCallback(() => {
    if (!rightCollapsed && rightView === "agent") setRightCollapsedAnimated(true);
    else {
      setRightCollapsedAnimated(false);
      setRightView("agent");
    }
  }, [rightCollapsed, rightView, setRightCollapsedAnimated]);

  const openGraph = useCallback(() => {
    if (!rightCollapsed && rightView === "graph") setRightCollapsed(true);
    else {
      setRightCollapsed(false);
      setRightView("graph");
    }
  }, [rightCollapsed, rightView]);

  const openLibraryImport = useCallback((folderId: string | null) => {
    setIngestFolderId(folderId);
    setIngestOpen(true);
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setFavoriteIds((ids) => {
      const next = ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
      saveFavorites(settings.vaultPath, next);
      return next;
    });
  }, [settings.vaultPath]);


  async function createNote(id: string, title: string) {
    setBusy(true);
    setError(null);
    try {
      const created = await api.vaultCreatePage(id, title);
      setPageCache((c) => ({ ...c, [created.id]: created }));
      await loadPages();
      await loadGraph();
      openPage(created.id);
      setPageModes((modes) => ({ ...modes, [created.id]: "live" }));
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

  async function deleteLibraryPage(pageId: string) {
    const page = pages.find((item) => item.id === pageId);
    const title = page?.title ?? pageId.split("/").pop() ?? pageId;
    if (!window.confirm(`确定删除文献「${title}」吗？此操作不可恢复。`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.vaultDeletePage(pageId);
      closeTab(`page:${pageId}`);
      setPageCache((cache) => {
        if (!(pageId in cache)) return cache;
        const next = { ...cache };
        delete next[pageId];
        return next;
      });
      setNoteDrafts((drafts) => {
        if (!(pageId in drafts)) return drafts;
        const next = { ...drafts };
        delete next[pageId];
        return next;
      });
      setFavoriteIds((ids) => {
        if (!ids.includes(pageId)) return ids;
        const next = ids.filter((id) => id !== pageId);
        saveFavorites(settings.vaultPath, next);
        return next;
      });
      await persistLibrary((org) => {
        if (!(pageId in org.assignments)) return org;
        const assignments = { ...org.assignments };
        delete assignments[pageId];
        return { ...org, assignments };
      });
      await loadPages();
      await loadGraph();
      await loadIdeas();
      setNotice(`已删除文献「${title}」`);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
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
      await loadIdeas();
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

  async function previewIngestAnimation() {
    setIngestOpen(false);
    await ingestProgressRunnerRef.current?.run(
      INGEST_PROGRESS_PREVIEW_PATHS,
      async () => {
        await ingestPause(900);
      },
    );
  }

  async function ingestFiles(paths: string[]) {
    if (!paths.length) return;
    setIngestOpen(false);
    const folderTarget = ingestFolderId;

    setBusy(true);
    setError(null);
    let internalizationSessionId: string | null = null;
    try {
      const imported: Array<{ pageIds: string[]; sourcePath?: string }> = [];
      await ingestProgressRunnerRef.current?.run(paths, async (path) => {
        imported.push(
          await api.vaultIngestPath(path) as { pageIds: string[]; sourcePath?: string },
        );
      });

      const importedIds = imported.flatMap((item) => item.pageIds ?? []);
      if (folderTarget) {
        await persistLibrary((org) => assignPagesToFolder(org, importedIds, folderTarget));
      }
      await loadPages();
      await loadGraph();
      setNotice(`已整篇导入 ${paths.length} 个文件`);
      setIngestFolderId(null);
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
      const prompt = `请立即内化刚刚导入并附加的资料，不要向用户索要资料位置。资料页面 ID：${importedIds.join(", ")}。请先逐个调用 read_page 读取这些页面的正文，提炼重要概念、事实和关系；然后创建必要的新 Markdown 页面，并将新页面中的概念与已有知识库页面用 [[page-id]] 链接起来；已有相关页面请更新。请先完整分析资料，再执行写入。`;
      updateAgentState(created.session.id, { busy: true, pendingUser: prompt, streamingText: "", streamingTools: [], streamingPhase: "thinking" });
      const internalized = await api.agentPromptStream({ sessionId: created.session.id, message: prompt, graphDepth: 0 }, (event) => {
        if (event.type === "text") updateAgentState(created.session.id, { streamingText: event.text });
        if (event.type === "tool_start") {
          updateAgentState(created.session.id, (state) => ({
            ...state,
            streamingTools: state.streamingTools.some((tool) => tool.id === event.id)
              ? state.streamingTools
              : [...state.streamingTools, { id: event.id, name: event.name, status: "running" }],
          }));
        }
        if (event.type === "phase") updateAgentState(created.session.id, { streamingPhase: event.phase });
        if (event.type === "tool_end") updateAgentState(created.session.id, (state) => ({ ...state, streamingTools: state.streamingTools.map((tool) => tool.id === event.id ? { ...tool, status: event.isError ? "error" : "done" } : tool) }));
      });
      applySession(internalized.session);
      await refreshSessions();
      triggerRuezzCelebrate();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
      if (internalizationSessionId) updateAgentState(internalizationSessionId, { pendingUser: null, streamingText: "", streamingTools: [], streamingPhase: null, busy: false });
    } finally {
      setBusy(false);
    }
  }

  async function ingestPaste(body: string) {
    const title = titleFromPaste(body);
    setBusy(true);
    setError(null);
    try {
      const imported = await api.vaultIngestText(title, body) as { pageIds?: string[] };
      if (ingestFolderId && imported.pageIds?.length) {
        await persistLibrary((org) => assignPagesToFolder(org, imported.pageIds ?? [], ingestFolderId));
      }
      await loadPages();
      await loadGraph();
      setNotice(`已整篇入库文本「${title}」`);
      setIngestOpen(false);
      setIngestFolderId(null);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const navigateIdea = (idea: Idea) => {
    if (idea.target.kind === "page") {
      openPage(idea.target.pageId);
      window.setTimeout(() => {
        document.querySelector(`[data-idea-mark="${CSS.escape(idea.id)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 80);
      return;
    }
    const messageId = idea.target.messageId;
    void selectSession(idea.target.sessionId).then(() => {
      setRightCollapsedAnimated(false);
      setRightView("agent");
      window.setTimeout(() => {
        document.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 80);
    });
  };

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

  const toggleLeftView = (view: LeftView) => {
    if (!leftCollapsed && leftView === view) setLeftCollapsed(true);
    else {
      setLeftCollapsed(false);
      setLeftView(view);
    }
  };

  const commands: PaletteCommand[] = useMemo(
    () => [
      { id: "library", label: "显示文献库", run: () => { setLeftCollapsed(false); setLeftView("library"); } },
      { id: "files", label: "显示文件列表", hint: "Ctrl+[", run: () => { setLeftCollapsed(false); setLeftView("files"); } },
      { id: "search", label: "搜索", run: () => { setLeftCollapsed(false); setLeftView("search"); } },
      { id: "favorites", label: "显示收藏", run: () => { setLeftCollapsed(false); setLeftView("favorites"); } },
      { id: "new-note", label: "新建笔记", hint: "Ctrl+N", run: () => setNewNoteOpen(true) },
      { id: "edit", label: "切换 Live/源码", hint: "Ctrl+E", run: togglePageNoteMode },
      { id: "agent", label: "显示 Agent", run: () => { setRightCollapsedAnimated(false); setRightView("agent"); } },
      { id: "graph", label: "打开图谱", hint: "Ctrl+G", run: () => { setRightCollapsed(false); setRightView("graph"); } },
      { id: "ingest", label: "入库…", run: () => { setIngestFolderId(null); setIngestOpen(true); } },
      { id: "settings", label: "打开设置", run: () => setSettingsOpen(true) },
      { id: "theme", label: `切换界面配色（${PALETTE_META[colorPalette].label}）`, run: onCycleColorPalette },
      { id: "left", label: "折叠/展开左栏", hint: "Ctrl+[", run: () => setLeftCollapsed((v) => !v) },
      { id: "right", label: "折叠/展开右栏", hint: "Ctrl+]", run: () => setRightCollapsedAnimated(!rightCollapsed) },
    ],
    [onCycleColorPalette, colorPalette, activePageId, saveNote, rightCollapsed, setRightCollapsedAnimated, togglePageNoteMode],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === "Escape") {
        setPalette(null);
        setSettingsOpen(false);
        setIngestOpen(false);
        setIngestFolderId(null);
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
        togglePageNoteMode();
      } else if (key === "g") {
        e.preventDefault();
        setRightCollapsed(false);
        setRightView("graph");
      } else if (e.key === "[") {
        e.preventDefault();
        setLeftCollapsed((v) => !v);
      } else if (e.key === "]") {
        e.preventDefault();
        setRightCollapsedAnimated(!rightCollapsed);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activePageId, saveNote, rightCollapsed, setRightCollapsedAnimated]);

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
    <div
      className={`workspace${narrow ? " narrow" : ""}`}
      style={{
        "--idea-paper-rgb": ideaPalette.paper,
        "--idea-ink-rgb": ideaPalette.ink,
        "--idea-opacity": settings.ideaOpacity,
      } as CSSProperties}
    >
      <div className="workspace-body">
        <div
          className={[
            "workspace-panel-left",
            narrow
              ? leftCollapsed
                ? "narrow-left-collapsed"
                : "workspace-panel left-overlay-panel"
              : "workspace-panel",
          ].join(" ")}
        >
          <Ribbon
            leftView={leftView}
            leftCollapsed={leftCollapsed}
            agentOpen={agentOpen}
            graphOpen={graphOpen}
            busy={busy}
            onFiles={() => toggleLeftView("files")}
            onSearch={() => toggleLeftView("search")}
            onFavorites={() => toggleLeftView("favorites")}
            onLibrary={() => toggleLeftView("library")}
            onAgent={openAgent}
            onGraph={openGraph}
            onIngest={() => { setIngestFolderId(null); setIngestOpen(true); }}
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
          favoriteIds={favoriteIds}
          libraryFolders={libraryOrganization.folders}
          libraryAssignments={libraryOrganization.assignments}
          onFavorite={toggleFavorite}
          onCreateLibraryFolder={createLibraryFolderIn}
          onRenameLibraryFolder={renameLibraryFolderIn}
          onRenameLibraryPage={(pageId, name) => void renameEntry("page", pageId, name)}
          onDeleteLibraryPage={(pageId) => void deleteLibraryPage(pageId)}
          onDeleteLibraryFolder={deleteLibraryFolderIn}
          onMoveLibraryPages={moveLibraryPages}
          onAddToLibraryFolder={openLibraryImport}
          onPickLink={(toId) => {
            if (!linkPicker) return;
            void insertWikilink(linkPicker.fromId, toId, linkPicker.range);
            setLinkPicker(null);
          }}
          onCloseLinkPicker={() => setLinkPicker(null)}
          onError={onError}
            onResize={(dx) => setLeftWidth((w) => clamp(w + dx, LEFT_MIN, LEFT_MAX))}
          />
        </div>
        <section className="center-pane workspace-panel">
          <div className="center-header">
            <div className="page-history-controls" aria-label="页面浏览历史">
              <button type="button" title="后退" aria-label="后退" disabled={pageHistoryIndex <= 0} onClick={() => navigatePageHistory(-1)}>
                <ChevronLeft size={15} />
              </button>
              <button type="button" title="前进" aria-label="前进" disabled={pageHistoryIndex < 0 || pageHistoryIndex >= pageHistory.length - 1} onClick={() => navigatePageHistory(1)}>
                <ChevronRight size={15} />
              </button>
            </div>
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
                onClick={() => setRightCollapsedAnimated(false)}
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
                key={activePage.id}
                page={activePage}
                pages={pages}
                mode={activePageNoteMode}
                draft={noteDrafts[activePage.id] ?? activePage.raw}
                dirty={isDirty(activePage.id)}
                saving={noteSaving}
                favorite={favoriteIds.includes(activePage.id)}
                onFavorite={() => toggleFavorite(activePage.id)}
                onMode={setPageNoteMode}
                viewMemory={activeViewMemory}
                onViewMemoryChange={handleActiveViewMemoryChange}
                onDraft={(value) =>
                  setNoteDrafts((d) => ({ ...d, [activePage.id]: value }))
                }
                onSave={() => void saveNote(activePage.id)}
                onOpen={openPage}
                onLink={(range) => startLinkPicker(activePage.id, range)}
                assetRoot={settings.vaultPath}
                onUpdateTags={(tags) => updatePageTags(activePage.id, tags)}
                tagError={tagError}
                ideas={ideas.filter((idea) => idea.target.kind === "page" && idea.target.pageId === activePage.id)}
                ideasVisible={ideasVisible}
                onIdeasVisible={setIdeasVisible}
                onCreateIdea={createPageIdea}
                onUpdateIdea={updateIdea}
                onAddToChat={(text) => {
                  if (sessionId) updateAgentState(sessionId, { draft: appendSelectionToDraft(draft, text) });
                  else setDraftFallback(appendSelectionToDraft(draft, text));
                }}
                onRename={(name) => void renameEntry("page", activePage.id, name)}
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
           streamingPhase={streamingPhase}
          draft={draft}
          busy={agentBusy}
          pages={pages}
          sessions={sessions}
           sessionId={sessionId}
           openSessionIds={openSessionIds}
          outline={outline}
          pageId={activePageId}
          graph={graph}
          ideas={ideas}
          ideasVisible={ideasVisible}
          theme={graphTheme}
           onDraft={(value) => sessionId ? updateAgentState(sessionId, { draft: value }) : setDraftFallback(value)}
          onSend={() => void sendMessage()}
          onStop={() => void stopGeneration()}
          onOpen={openPage}
          onJump={jumpHeading}
          onResize={(dx) => setRightWidth((w) => clamp(w + dx, RIGHT_MIN, RIGHT_MAX))}
          onCollapse={() => setRightCollapsedAnimated(true)}
          headerCentaurShown={headerCentaurShown}
          ruezzCelebrate={ruezzCelebrate}
          ruezzWorkMode={ruezzWorkMode}
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
           onIdeasVisible={setIdeasVisible}
           onNavigateIdea={navigateIdea}
           onUpdateIdea={updateIdea}
           onDeleteIdea={deleteIdea}
           onCreateAgentIdea={createAgentIdea}
          />
      </div>
      <AgentFloatingIsland
        open={rightCollapsed && agentIslandOpen}
        onClose={() => setAgentIslandOpen(false)}
        messages={messages}
        pendingUser={pendingUser}
        streamingText={streamingText}
        streamingTools={streamingTools}
        streamingPhase={streamingPhase}
        draft={draft}
        busy={agentBusy}
        modelMissing={modelMissing}
        modelLabel={modelLabel}
        modelValue={modelValue}
        modelGroups={modelGroups}
        mock={settings.mock}
        pages={pages}
        ideas={ideas}
        ideasVisible={ideasVisible}
        onIdeasVisible={setIdeasVisible}
        sessionId={sessionId}
        onCreateIdea={createAgentIdea}
        onUpdateIdea={updateIdea}
        onDraft={(value) =>
          sessionId ? updateAgentState(sessionId, { draft: value }) : setDraftFallback(value)
        }
        onSend={() => void sendMessage()}
        onStop={() => void stopGeneration()}
        onOpen={openPage}
        onSwitchModel={(providerId, modelId) => void switchModel(providerId, modelId)}
        attachments={attachments}
        canAttachCurrent={Boolean(activePageId && !attachments.some((item) => item.id === activePageId))}
        currentPageLabel={activePageId ? titleFor(activePageId) : "未打开文件"}
        onAttachCurrent={() => void attachCurrentPage()}
        onDetach={(id) => void detachAttachment(id)}
        ruezzCelebrate={ruezzCelebrate}
        ruezzWorkMode={ruezzWorkMode}
      />
      <StatusBar
        vaultPath={settings.vaultPath}
        pageCount={pages.length}
        currentId={activePageId}
        busy={busy || agentBusy}
        notice={notice}
        dirty={activeDirty}
        saving={noteSaving}
        palette={colorPalette}
        onCyclePalette={onCycleColorPalette}
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
          palette={colorPalette}
          onPaletteChange={onColorPaletteChange}
          developerMode={developerMode}
          onDeveloperModeChange={(next) => {
            setDeveloperMode(next);
            savePref("developerMode", next);
          }}
          busy={busy}
          onClose={() => setSettingsOpen(false)}
          onSave={saveSettings}
        />
      </Presence>
      <Presence open={ingestOpen}>
        <IngestModal
          busy={busy}
          canPickFiles={isTauriRuntime()}
          developerMode={developerMode}
          destinationLabel={ingestFolderId ? libraryOrganization.folders.find((folder) => folder.id === ingestFolderId)?.name : undefined}
          onClose={() => { setIngestOpen(false); setIngestFolderId(null); }}
          onImportFiles={async () => {
            const files = await api.pickFiles();
            if (files.length > 0) await ingestFiles(files);
          }}
          onPaste={ingestPaste}
          onPreviewProgress={previewIngestAnimation}
        />
      </Presence>
      <IngestProgressHost runnerRef={ingestProgressRunnerRef} />
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
