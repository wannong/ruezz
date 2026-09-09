import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export type VaultSettings = {
  vaultPath: string;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  mock: boolean;
};

export type PageSummary = {
  id: string;
  title?: string;
  type?: string;
  path?: string;
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

const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

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

export const api = {
  settingsGet: () => rpc<VaultSettings>("settings_get"),
  settingsSet: (patch: Partial<VaultSettings>) => rpc<VaultSettings>("settings_set", patch),
  vaultInit: (root: string) => rpc<{ root: string }>("vault_init", { root }),
  vaultIngestPath: (path: string) => rpc("vault_ingest", { path }),
  vaultIngestText: (title: string, text: string) => rpc("vault_ingest", { title, text }),
  vaultAsk: (question: string) => rpc<AskResult>("vault_ask", { question }),
  vaultListPages: () => rpc<PageSummary[]>("vault_list_pages"),
  vaultReadPage: (id: string) => rpc<PageContent | null>("vault_read_page", { id }),
  vaultLint: () => rpc("vault_lint"),
  pickFolder: async () => {
    if (!isTauri()) return null;
    const selected = await open({ directory: true, multiple: false });
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
