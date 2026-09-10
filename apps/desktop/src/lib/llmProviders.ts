import type { LlmProvider, VaultSettings } from "../api";

export function newProviderId(): string {
  return `prov_${Math.random().toString(36).slice(2, 10)}`;
}

export function uniqueModelIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function normalizeProviderBase(url: string): string {
  return url.trim().replace(/\/+$/, "").replace(/\/v1$/i, "").toLowerCase();
}

/** Keep in sync with packages/engine-api PRESET_LLM_PROVIDERS. */
export const PRESET_PROVIDERS: LlmProvider[] = [
  { id: "openai", name: "OpenAI", apiBaseUrl: "https://api.openai.com/v1", apiKey: "", models: [] },
  { id: "deepseek", name: "DeepSeek", apiBaseUrl: "https://api.deepseek.com/v1", apiKey: "", models: [] },
  { id: "glm", name: "智谱 GLM", apiBaseUrl: "https://open.bigmodel.cn/api/paas/v4", apiKey: "", models: [] },
  { id: "kimi", name: "Kimi", apiBaseUrl: "https://api.moonshot.cn/v1", apiKey: "", models: [] },
];

export function isPresetProviderId(id: string): boolean {
  return PRESET_PROVIDERS.some((provider) => provider.id === id);
}

export function mergePresetProviders(existing: LlmProvider[]): LlmProvider[] {
  const remaining = existing.map((provider) => ({
    ...provider,
    models: uniqueModelIds(provider.models),
  }));

  const presets = PRESET_PROVIDERS.map((preset) => {
    const byId = remaining.findIndex((row) => row.id === preset.id);
    const byUrl = remaining.findIndex(
      (row) => row.apiBaseUrl.trim() && normalizeProviderBase(row.apiBaseUrl) === normalizeProviderBase(preset.apiBaseUrl),
    );
    const idx = byId >= 0 ? byId : byUrl;
    if (idx < 0) return { ...preset };
    const found = remaining.splice(idx, 1)[0];
    const genericName = found.name === "OpenAI Compatible" || found.name === "未命名";
    return {
      ...preset,
      name: genericName ? preset.name : found.name,
      apiBaseUrl: found.apiBaseUrl.trim() || preset.apiBaseUrl,
      apiKey: found.apiKey,
      models: uniqueModelIds(found.models),
    };
  });

  return [...presets, ...remaining.map(labelCustomProvider)];
}

function labelCustomProvider(provider: LlmProvider): LlmProvider {
  if (provider.id === "default" && (provider.name === "OpenAI Compatible" || provider.name === "未命名")) {
    return { ...provider, name: "自定义" };
  }
  return provider;
}

export function defaultProviderFrom(settings: Pick<VaultSettings, "apiBaseUrl" | "apiKey" | "model">): LlmProvider {
  return {
    id: "default",
    name: "OpenAI Compatible",
    apiBaseUrl: settings.apiBaseUrl,
    apiKey: settings.apiKey,
    models: uniqueModelIds([settings.model]),
  };
}

export function providersOf(settings: VaultSettings): LlmProvider[] {
  const existing = settings.providers?.length
    ? settings.providers
    : settings.apiBaseUrl || settings.apiKey
      ? [defaultProviderFrom(settings)]
      : [];
  return mergePresetProviders(existing);
}

export function activeProviderIdOf(settings: VaultSettings, providers: LlmProvider[]): string {
  if (settings.activeProviderId && providers.some((provider) => provider.id === settings.activeProviderId)) {
    return settings.activeProviderId;
  }
  return providers.find((provider) => provider.apiKey.trim() || provider.models.length)?.id ?? providers[0]?.id ?? "";
}

export function hydrateProviders(settings: VaultSettings): VaultSettings {
  const providers = providersOf(settings);
  return syncSettings(settings, providers, activeProviderIdOf(settings, providers), settings.model);
}

export function syncSettings(
  settings: VaultSettings,
  providers: LlmProvider[],
  activeProviderId: string,
  model = settings.model,
): VaultSettings {
  const active = providers.find((provider) => provider.id === activeProviderId) ?? providers[0];
  const nextModel = model.trim();
  const nextProviders = active
    ? providers.map((provider) =>
        provider.id === active.id
          ? { ...provider, models: uniqueModelIds([nextModel, ...provider.models]) }
          : provider,
      )
    : providers;
  return {
    ...settings,
    providers: nextProviders,
    activeProviderId: active?.id ?? "",
    apiBaseUrl: active?.apiBaseUrl ?? settings.apiBaseUrl,
    apiKey: active?.apiKey ?? settings.apiKey,
    model: nextModel,
  };
}

export function modelSwitchKey(providerId: string, modelId: string): string {
  return `${providerId}::${modelId}`;
}

export function parseModelSwitchKey(value: string): { providerId: string; modelId: string } | null {
  const sep = value.indexOf("::");
  if (sep <= 0) return null;
  return { providerId: value.slice(0, sep), modelId: value.slice(sep + 2) };
}
