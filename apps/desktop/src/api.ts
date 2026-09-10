import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export type LlmProvider = {
  id: string;
  name: string;
  apiBaseUrl: string;
  apiKey: string;
  models: string[];
};

export type VaultSettings = {
  vaultPath: string;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  mock: boolean;
  providers: LlmProvider[];
  activeProviderId: string;
};

export type PageSummary = {
  id: string;
  title?: string;
  type?: string;
  path?: string;
  tags?: string[];
};

export type GraphNodeDto = {
  id: string;
  type: string;
  label: string;
  degree: number;
};

export type GraphEdgeDto = {
  source: string;
  target: string;
  relation: string;
};

export type GraphDto = {
  nodes: GraphNodeDto[];
  edges: GraphEdgeDto[];
  dataVersion: number;
};

export type PageContent = {
  id: string;
  path: string;
  title?: string;
  type?: string;
  body: string;
  raw: string;
};

export type AskResult = {
  answer: string;
  sources: string[];
};

export type AgentToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
};

export type AgentSessionMessage =
  | {
      role: "user";
      content: string;
      timestamp: number;
    }
  | {
      role: "assistant";
      content: string;
      timestamp: number;
      provider?: string;
      model?: string;
      toolCalls?: AgentToolCall[];
      sources?: string[];
      usage?: { input: number; output: number; totalTokens: number };
    }
  | {
      role: "toolResult";
      toolCallId: string;
      toolName: string;
      content: string;
      isError: boolean;
      timestamp: number;
    };

export type AgentSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  model: { provider: string; modelId: string };
  linkedPageIds: string[];
  messages: AgentSessionMessage[];
};

export type AgentSessionSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  model: { provider: string; modelId: string };
  messageCount: number;
  linkedPageIds: string[];
};

export type AgentPromptResult = {
  answer: string;
  sources: string[];
  linkedPageIds: string[];
  toolsUsed: string[];
  session: AgentSession;
};

export type AgentStreamEvent =
  | { type: "text"; text: string }
  | { type: "tool_start"; name: string; id: string }
  | { type: "tool_end"; name: string; id: string; isError?: boolean }
  | { type: "usage"; input: number; output: number; totalTokens: number };

export type AgentProviderCatalog = {
  providers: Array<{ name: string; models: string[] }>;
};

export const isTauriRuntime = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const isTauri = isTauriRuntime;

/** Dev fallback: talk to sidecar over HTTP if VITE_SIDECAR_HTTP is set. */
async function httpRpc<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const base = import.meta.env.VITE_SIDECAR_HTTP as string | undefined;
  if (!base) throw new Error("非 Tauri 环境且未配置 VITE_SIDECAR_HTTP");
  const res = await fetch(`${base.replace(/\/$/, "")}/rpc`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: Date.now(), method, params }),
  });
  const json = (await res.json()) as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result as T;
}

async function rpc<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  if (isTauri()) {
    return invoke<T>("rpc", { method, params });
  }
  return httpRpc<T>(method, params);
}

type StreamTransportEvent =
  | AgentStreamEvent
  | { type: "result"; result: AgentPromptResult }
  | { type: "error"; message: string };

async function readNdjsonStream(
  res: Response,
  onEvent: (event: AgentStreamEvent) => void,
): Promise<AgentPromptResult> {
  if (!res.body) throw new Error("sidecar stream has no body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let result: AgentPromptResult | undefined;
  let error: string | undefined;
  const consume = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const ev = JSON.parse(trimmed) as StreamTransportEvent;
    if (ev.type === "result") result = ev.result;
    else if (ev.type === "error") error = ev.message;
    else onEvent(ev);
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) consume(line);
  }
  buf += decoder.decode();
  if (buf.trim()) consume(buf);
  if (error) throw new Error(error);
  if (!result) throw new Error("流式响应没有返回结果");
  return result;
}

async function httpPromptStream(
  opts: Record<string, unknown>,
  onEvent: (event: AgentStreamEvent) => void,
  signal?: AbortSignal,
): Promise<AgentPromptResult> {
  const base = import.meta.env.VITE_SIDECAR_HTTP as string | undefined;
  if (!base) throw new Error("非 Tauri 环境且未配置 VITE_SIDECAR_HTTP");
  const res = await fetch(`${base.replace(/\/$/, "")}/rpc`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: Date.now(),
      method: "agent_prompt",
      params: { ...opts, stream: true },
    }),
    signal,
  });
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("ndjson")) {
    return readNdjsonStream(res, onEvent);
  }
  const json = (await res.json()) as { result?: AgentPromptResult; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  if (!json.result) throw new Error("agent_prompt 没有返回结果");
  return json.result;
}

async function tauriPromptStream(
  opts: Record<string, unknown>,
  onEvent: (event: AgentStreamEvent) => void,
): Promise<AgentPromptResult> {
  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen<AgentStreamEvent>("agent-event", (event) => {
    const payload = event.payload;
    if (!payload || typeof payload !== "object" || !("type" in payload)) return;
    if (payload.type === "text" || payload.type === "tool_start" || payload.type === "tool_end" || payload.type === "usage") {
      onEvent(payload);
    }
  });
  try {
    return await rpc<AgentPromptResult>("agent_prompt", opts);
  } finally {
    unlisten();
  }
}

export const api = {
  settingsGet: () => rpc<VaultSettings>("settings_get"),
  settingsSet: (patch: Partial<VaultSettings>) => rpc<VaultSettings>("settings_set", patch),
  vaultInit: (root: string) => rpc<{ root: string }>("vault_init", { root }),
  vaultIngestPath: (path: string) => rpc("vault_ingest", { path }),
  vaultIngestText: (title: string, text: string) => rpc("vault_ingest", { title, text }),
  vaultAsk: (question: string) => rpc<AskResult>("vault_ask", { question }),
  agentSessionList: () => rpc<{ sessions: AgentSessionSummary[] }>("agent_session_list"),
  agentSessionCreate: (opts?: { title?: string; currentPageId?: string }) =>
    rpc<{ session: AgentSession }>("agent_session_create", opts ?? {}),
  agentSessionGet: (id: string) => rpc<{ session: AgentSession }>("agent_session_get", { id }),
  agentSessionDelete: (id: string) => rpc<{ ok: boolean }>("agent_session_delete", { id }),
  agentPrompt: (opts: {
    sessionId: string;
    message: string;
    currentPageId?: string;
    graphDepth?: number;
  }) => rpc<AgentPromptResult>("agent_prompt", opts),
  agentPromptStream: (
    opts: { sessionId: string; message: string; currentPageId?: string; graphDepth?: number },
    onEvent: (event: AgentStreamEvent) => void,
    signal?: AbortSignal,
  ) =>
    isTauri()
      ? tauriPromptStream(opts, onEvent)
      : httpPromptStream(opts, onEvent, signal),
  agentAbort: () => rpc<{ ok: boolean }>("agent_abort"),
  agentSetModel: (opts: { sessionId: string; provider: string; model: string }) =>
    rpc<{ session: AgentSession }>("agent_set_model", opts),
  agentListProviders: () => rpc<AgentProviderCatalog>("agent_list_providers"),
  providerListModels: (opts?: { apiBaseUrl?: string; apiKey?: string }) =>
    rpc<{ models: string[] }>("provider_list_models", opts ?? {}),
  providerTest: (opts?: { apiBaseUrl?: string; apiKey?: string; model?: string }) =>
    rpc<{ ok: true; reply: string }>("provider_test", opts ?? {}),
  vaultListPages: () => rpc<PageSummary[]>("vault_list_pages"),
  vaultReadPage: (id: string) => rpc<PageContent | null>("vault_read_page", { id }),
  vaultWritePage: (id: string, raw: string) => rpc<PageContent>("vault_write_page", { id, raw }),
  vaultCreatePage: (id: string, title?: string) =>
    rpc<PageContent>("vault_create_page", title ? { id, title } : { id }),
  vaultCopyPage: (from: string, to: string) => rpc<PageContent>("vault_copy_page", { from, to }),
  vaultRenamePage: (from: string, to: string) => rpc<PageContent>("vault_rename_page", { from, to }),
  vaultListFolders: () => rpc<string[]>("vault_list_folders"),
  vaultCreateFolder: (id: string) => rpc<{ id: string }>("vault_create_folder", { id }),
  vaultCopyFolder: (from: string, to: string) => rpc<{ id: string }>("vault_copy_folder", { from, to }),
  vaultRenameFolder: (from: string, to: string) =>
    rpc<{ id: string }>("vault_rename_folder", { from, to }),
  vaultReveal: (opts?: { kind?: "root" | "page" | "folder"; id?: string; open?: boolean }) =>
    rpc<{ path: string }>("vault_reveal", opts ?? {}),
  vaultLint: () => rpc("vault_lint"),
  vaultSearch: (query: string) => rpc<PageSummary[]>("vault_search", { query }),
  vaultGraph: () => rpc<GraphDto>("vault_graph"),
  vaultBacklinks: (id: string) => rpc<PageSummary[]>("vault_backlinks", { id }),
  pickFolder: async (title?: string) => {
    if (!isTauri()) {
      const typed = window.prompt(title ?? "知识库文件夹路径");
      return typed?.trim() || null;
    }
    const selected = await open({ directory: true, multiple: false, title });
    return typeof selected === "string" ? selected : null;
  },
  pickFiles: async () => {
    if (!isTauri()) return [] as string[];
    const selected = await open({
      multiple: true,
      filters: [{ name: "Markdown/Text", extensions: ["md", "txt", "markdown"] }],
    });
    if (!selected) return [];
    return Array.isArray(selected) ? selected : [selected];
  },
};
