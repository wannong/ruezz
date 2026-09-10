import { z } from "zod";

export const LlmProviderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  apiBaseUrl: z.string().default(""),
  apiKey: z.string().default(""),
  models: z.array(z.string()).default([]),
});

export type LlmProvider = z.infer<typeof LlmProviderSchema>;

export const VaultSettingsSchema = z.object({
  vaultPath: z.string().default(""),
  apiBaseUrl: z.string().default("https://api.openai.com/v1"),
  apiKey: z.string().default(""),
  model: z.string().default("gpt-4o-mini"),
  mock: z.boolean().default(false),
  providers: z.array(LlmProviderSchema).default([]),
  activeProviderId: z.string().default(""),
});

export type VaultSettings = z.infer<typeof VaultSettingsSchema>;

function uniqueModelIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function normalizeProviderBase(url: string): string {
  return url.trim().replace(/\/+$/, "").replace(/\/v1$/i, "").toLowerCase();
}

/** Built-in OpenAI-compatible vendors. Keep in sync with apps/desktop/src/lib/llmProviders.ts */
export const PRESET_LLM_PROVIDERS: LlmProvider[] = [
  { id: "openai", name: "OpenAI", apiBaseUrl: "https://api.openai.com/v1", apiKey: "", models: [] },
  { id: "deepseek", name: "DeepSeek", apiBaseUrl: "https://api.deepseek.com/v1", apiKey: "", models: [] },
  { id: "glm", name: "智谱 GLM", apiBaseUrl: "https://open.bigmodel.cn/api/paas/v4", apiKey: "", models: [] },
  { id: "kimi", name: "Kimi", apiBaseUrl: "https://api.moonshot.cn/v1", apiKey: "", models: [] },
];

export function isPresetProviderId(id: string): boolean {
  return PRESET_LLM_PROVIDERS.some((provider) => provider.id === id);
}

function adoptPresetIdentity(provider: LlmProvider): LlmProvider {
  const labeled = labelCustomProvider(provider);
  const match = PRESET_LLM_PROVIDERS.find(
    (preset) =>
      labeled.id === preset.id ||
      (labeled.apiBaseUrl.trim() &&
        normalizeProviderBase(labeled.apiBaseUrl) === normalizeProviderBase(preset.apiBaseUrl)),
  );
  if (!match) return labeled;
  const generic =
    labeled.id === "default" ||
    labeled.name === "OpenAI Compatible" ||
    labeled.name === "未命名" ||
    labeled.name === "自定义";
  return {
    ...labeled,
    id: generic || labeled.id === match.id ? match.id : labeled.id,
    name: generic ? match.name : labeled.name,
    apiBaseUrl: labeled.apiBaseUrl.trim() || match.apiBaseUrl,
  };
}

function keepProvider(provider: LlmProvider): boolean {
  if (!isPresetProviderId(provider.id)) return true;
  return Boolean(provider.apiKey.trim() || provider.models.length);
}

/** Keep configured vendors; drop unused empty presets. Do not inject missing catalog entries. */
export function mergePresetProviders(existing: LlmProvider[]): {
  providers: LlmProvider[];
  idMap: Map<string, string>;
} {
  const idMap = new Map<string, string>();
  const providers: LlmProvider[] = [];
  for (const raw of existing) {
    const next = adoptPresetIdentity({ ...raw, models: uniqueModelIds(raw.models) });
    if (next.id !== raw.id) idMap.set(raw.id, next.id);
    if (!keepProvider(next)) continue;
    if (providers.some((row) => row.id === next.id)) continue;
    providers.push(next);
  }
  return { providers, idMap };
}

function labelCustomProvider(provider: LlmProvider): LlmProvider {
  if (provider.id === "default" && (provider.name === "OpenAI Compatible" || provider.name === "未命名")) {
    return { ...provider, name: "自定义" };
  }
  return provider;
}

/** Fill providers from the legacy single endpoint, and keep active URL/key/model in sync. */
export function ensureLlmProviders(settings: VaultSettings): VaultSettings {
  const seed =
    settings.providers.length > 0
      ? settings.providers
      : settings.apiBaseUrl || settings.apiKey
        ? [
            {
              id: "default",
              name: "OpenAI Compatible",
              apiBaseUrl: settings.apiBaseUrl,
              apiKey: settings.apiKey,
              models: uniqueModelIds([settings.model]),
            },
          ]
        : [];
  let { providers, idMap } = mergePresetProviders(seed);
  if (
    providers.length === 0 &&
    (settings.apiBaseUrl.trim() || settings.apiKey.trim()) &&
    settings.providers.length > 0
  ) {
    const fallback = mergePresetProviders([
      {
        id: "default",
        name: "OpenAI Compatible",
        apiBaseUrl: settings.apiBaseUrl,
        apiKey: settings.apiKey,
        models: uniqueModelIds([settings.model]),
      },
    ]);
    providers = fallback.providers;
    fallback.idMap.forEach((value, key) => idMap.set(key, value));
  }

  const activeProviderId = providers.some((provider) => provider.id === settings.activeProviderId)
    ? settings.activeProviderId
    : idMap.get(settings.activeProviderId) ||
      providers.find((provider) => provider.apiKey.trim() || provider.models.length)?.id ||
      providers[0]?.id ||
      "";
  const active = providers.find((provider) => provider.id === activeProviderId) ?? providers[0];
  if (!active) {
    return { ...settings, providers, activeProviderId };
  }

  const model = settings.model.trim() || active.models[0] || "";
  const models = uniqueModelIds([model, ...active.models]);
  const nextProviders = providers.map((provider) =>
    provider.id === active.id ? { ...provider, models } : provider,
  );

  return {
    ...settings,
    providers: nextProviders,
    activeProviderId: active.id,
    apiBaseUrl: active.apiBaseUrl,
    apiKey: active.apiKey,
    model,
  };
}

export const PageSummarySchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  type: z.string().optional(),
  path: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export type PageSummary = z.infer<typeof PageSummarySchema>;

export const PageContentSchema = z.object({
  id: z.string(),
  path: z.string(),
  title: z.string().optional(),
  type: z.string().optional(),
  body: z.string(),
  raw: z.string(),
});

export type PageContent = z.infer<typeof PageContentSchema>;

export const LintIssueSchema = z.object({
  pageId: z.string(),
  severity: z.enum(["error", "warn", "info"]),
  rule: z.string(),
  message: z.string(),
  autoFixable: z.boolean().default(false),
});

export type LintIssue = z.infer<typeof LintIssueSchema>;

export const IngestResultSchema = z.object({
  files: z.array(z.string()),
  reviews: z.number().optional(),
  sourcePath: z.string().optional(),
});

export type IngestResult = z.infer<typeof IngestResultSchema>;

export const AskResultSchema = z.object({
  answer: z.string(),
  sources: z.array(z.string()).default([]),
});

export type AskResult = z.infer<typeof AskResultSchema>;

export const GraphNodeDtoSchema = z.object({
  id: z.string(),
  type: z.string(),
  label: z.string(),
  degree: z.number(),
});

export const GraphEdgeDtoSchema = z.object({
  source: z.string(),
  target: z.string(),
  relation: z.string(),
});

export const GraphDtoSchema = z.object({
  nodes: z.array(GraphNodeDtoSchema),
  edges: z.array(GraphEdgeDtoSchema),
  dataVersion: z.number(),
});

export type GraphNodeDto = z.infer<typeof GraphNodeDtoSchema>;
export type GraphEdgeDto = z.infer<typeof GraphEdgeDtoSchema>;
export type GraphDto = z.infer<typeof GraphDtoSchema>;

/** Stable engine surface. Implement this to swap backends. */
export interface WikiEngine {
  initVault(root: string): Promise<void>;
  ingestFile(root: string, filePath: string): Promise<IngestResult>;
  ingestText(root: string, title: string, body: string): Promise<IngestResult>;
  readIndex(root: string): Promise<string>;
  findPages(root: string, query: string): Promise<PageSummary[]>;
  listPages(root: string): Promise<PageSummary[]>;
  readPage(root: string, idOrPath: string): Promise<PageContent | null>;
  writePage(root: string, idOrPath: string, raw: string): Promise<PageContent>;
  createPage(root: string, id: string, title?: string): Promise<PageContent>;
  copyPage(root: string, fromId: string, toId: string): Promise<PageContent>;
  renamePage(root: string, fromId: string, toId: string): Promise<PageContent>;
  listFolders(root: string): Promise<string[]>;
  createFolder(root: string, id: string): Promise<{ id: string }>;
  copyFolder(root: string, fromId: string, toId: string): Promise<{ id: string }>;
  renameFolder(root: string, fromId: string, toId: string): Promise<{ id: string }>;
  lint(root: string): Promise<LintIssue[]>;
  ask(root: string, question: string): Promise<AskResult>;
  getGraph(root: string): Promise<GraphDto>;
  backlinks(root: string, pageId: string): Promise<PageSummary[]>;
  close?(root?: string): void;
}
