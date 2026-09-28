import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  type AgentSession,
  type AgentSessionSummary,
  type IdeaSelector,
  type VaultSettings,
} from "../../api";
import { savePref, loadPref } from "../prefs";
import { activeProviderIdOf, modelSwitchKey, providersOf, syncSettings, uniqueModelIds } from "../llmProviders";
import { RUEZZ_CELEBRATE_MS } from "../centaur-character/activity";
import { emptyAgentState, type AgentUiState } from "./agentTypes";

type UseAgentSessionOptions = {
  settings: VaultSettings;
  onSettings: (next: VaultSettings) => void;
  onAgentTitle?: (title: string | null) => void;
  onError: (message: string) => void;
  setError: (message: string | null) => void;
  activePageId: string | null;
  titleFor: (id: string) => string;
  graphDepth: number;
  onVaultMutated?: () => Promise<void>;
};

function isAbortError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error && (error.name === "AbortError" || /abort/i.test(error.message))) {
    return true;
  }
  return false;
}

export function useAgentSession({
  settings,
  onSettings,
  onAgentTitle,
  onError,
  setError,
  activePageId,
  titleFor,
  graphDepth,
  onVaultMutated,
}: UseAgentSessionOptions) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [openSessionIds, setOpenSessionIds] = useState<string[]>([]);
  const [sessions, setSessions] = useState<AgentSessionSummary[]>([]);
  const [agentStates, setAgentStates] = useState<Record<string, AgentUiState>>({});
  const [draftFallback, setDraftFallback] = useState("");
  const [runnerProviders, setRunnerProviders] = useState<Array<{ name: string; models: string[] }>>([]);
  const [ruezzCelebrate, setRuezzCelebrate] = useState(false);
  const sendingRef = useRef(false);
  const abortingRef = useRef(false);
  const sessionLoadGen = useRef(0);
  const ruezzCelebrateTimer = useRef<number | undefined>(undefined);

  const activeAgentState = sessionId ? (agentStates[sessionId] ?? emptyAgentState()) : emptyAgentState();
  const { messages, attachments, pendingUser, streamingText, streamingTools, streamingPhase } = activeAgentState;
  const draft = sessionId ? activeAgentState.draft : draftFallback;
  const agentBusy = activeAgentState.busy;

  const updateAgentState = useCallback((id: string, update: Partial<AgentUiState> | ((state: AgentUiState) => AgentUiState)) => {
    setAgentStates((prev) => {
      const current = prev[id] ?? emptyAgentState();
      const next = typeof update === "function" ? update(current) : { ...current, ...update };
      return { ...prev, [id]: next };
    });
  }, []);

  const triggerRuezzCelebrate = useCallback(() => {
    setRuezzCelebrate(true);
    window.clearTimeout(ruezzCelebrateTimer.current);
    ruezzCelebrateTimer.current = window.setTimeout(() => setRuezzCelebrate(false), RUEZZ_CELEBRATE_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(ruezzCelebrateTimer.current), []);

  const modelProviders = providersOf(settings);
  const activeProviderId = activeProviderIdOf(settings, modelProviders);
  const modelGroups = (() => {
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
  })();
  const modelValue = modelSwitchKey(activeProviderId, settings.model);
  const modelMissing = !settings.mock && !settings.model.trim();
  const modelLabel = settings.mock
    ? "模型：Mock（不走 API）"
    : modelMissing
      ? "未选择模型 — 请在设置中填写 API 并拉取或输入模型名"
      : `模型：${settings.model}`;

  const applySession = useCallback(
    (session: AgentSession, activate = true) => {
      if (activate) {
        setSessionId(session.id);
        setOpenSessionIds((prev) => prev.includes(session.id) ? prev : [...prev, session.id].slice(-3));
      }
      updateAgentState(session.id, (state) => ({
        ...state,
        messages: session.messages,
        attachments: session.attachments ?? [],
        pendingUser: null,
        streamingText: "",
        streamingTools: [],
        streamingPhase: null,
        busy: false,
      }));
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
  }, [applySession, onAgentTitle, onError, refreshRunnerProviders, refreshSessions, settings.mock, settings.model, settings.vaultPath]);

  const reloadSession = useCallback(async (id: string) => {
    const { session } = await api.agentSessionGet(id);
    applySession(session, id === sessionId);
  }, [applySession, sessionId]);

  const selectSession = useCallback(async (id: string) => {
    if (id === sessionId) return;
    sessionLoadGen.current += 1;
    try {
      const { session } = await api.agentSessionGet(id);
      applySession(session);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }, [applySession, onError, sessionId]);

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

  const createAgentIdea = useCallback(async (messageId: string, selector: IdeaSelector, content: string) => {
    if (!sessionId) return null;
    try {
      const { idea } = await api.ideaCreate({
        content,
        target: { kind: "assistant", sessionId, messageId },
        selector,
      });
      return idea;
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [onError, sessionId]);

  const stopGeneration = useCallback(async () => {
    if (!agentBusy) return;
    abortingRef.current = true;
    try {
      await api.agentAbort();
    } catch {
      /* stop is best-effort */
    }
  }, [agentBusy]);

  const sendMessage = useCallback(async () => {
    const text = draft.trim();
    if (!text || agentBusy || sendingRef.current) return;
    sendingRef.current = true;
    abortingRef.current = false;
    setError(null);
    let id = sessionId;
    let succeeded = false;
    try {
      if (!id) {
        sessionLoadGen.current += 1;
        const created = await api.agentSessionCreate({
          currentPageId: activePageId ?? undefined,
        });
        id = created.session.id;
        applySession(created.session);
      }
      updateAgentState(id, { draft: "", pendingUser: text, streamingText: "", streamingTools: [], streamingPhase: "thinking", busy: true });
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
            updateAgentState(id!, (state) => ({
              ...state,
              streamingTools: state.streamingTools.some((tool) => tool.id === event.id)
                ? state.streamingTools
                : [...state.streamingTools, { id: event.id, name: event.name, status: "running" }],
            }));
          }
          if (event.type === "phase") updateAgentState(id!, { streamingPhase: event.phase });
          if (event.type === "tool_end") {
            updateAgentState(id!, (state) => ({
              ...state,
              streamingTools: state.streamingTools.map((tool) => tool.id === event.id ? { ...tool, status: event.isError ? "error" : "done" } : tool),
            }));
          }
        },
      );
      applySession(result.session, false);
      await refreshSessions();
      await onVaultMutated?.();
      succeeded = true;
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
      if (id) updateAgentState(id, { pendingUser: null, streamingText: "", streamingTools: [], streamingPhase: null, busy: false });
      if (succeeded && !abortingRef.current) triggerRuezzCelebrate();
      sendingRef.current = false;
      abortingRef.current = false;
    }
  }, [
    activePageId,
    agentBusy,
    applySession,
    draft,
    graphDepth,
    onError,
    onVaultMutated,
    refreshSessions,
    reloadSession,
    sessionId,
    setError,
    triggerRuezzCelebrate,
    updateAgentState,
  ]);

  const newChat = useCallback(async () => {
    if (Object.values(agentStates).some((state) => state.busy)) return;
    sessionLoadGen.current += 1;
    try {
      const created = await api.agentSessionCreate({ currentPageId: undefined });
      applySession(created.session);
      await refreshSessions();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }, [agentStates, applySession, onError, refreshSessions]);

  const attachCurrentPage = useCallback(async () => {
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
  }, [activePageId, applySession, onError, sessionId, titleFor]);

  const detachAttachment = useCallback(async (id: string) => {
    if (!sessionId) return;
    try {
      const { session } = await api.agentSessionDetach(sessionId, id);
      applySession(session);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }, [applySession, onError, sessionId]);

  const deleteAgentSession = useCallback(async (id: string) => {
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
  }, [agentStates, applySession, onAgentTitle, onError, refreshSessions, sessionId, settings.vaultPath]);

  const archiveAgentSession = useCallback(async (id: string, archived: boolean) => {
    if (agentStates[id]?.busy) return;
    try {
      await api.agentSessionArchive(id, archived);
      await refreshSessions();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }, [agentStates, onError, refreshSessions]);

  const switchModel = useCallback(async (providerId: string, modelId: string) => {
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
  }, [activeProviderId, modelProviders, onError, onSettings, refreshRunnerProviders, sessionId, settings]);

  return {
    sessionId,
    openSessionIds,
    sessions,
    agentStates,
    draftFallback,
    setDraftFallback,
    runnerProviders,
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
    triggerRuezzCelebrate,
    applySession,
    refreshSessions,
    refreshRunnerProviders,
    createAgentIdea,
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
    sessionLoadGen,
    sendingRef,
    abortingRef,
  };
}
