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

function adoptPresetIdentity(provider: LlmProvider): LlmProvider {
  const labeled = labelCustomProvider(provider);
  const match = PRESET_PROVIDERS.find(
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

export function pruneEmptyPresets(providers: LlmProvider[]): LlmProvider[] {
  const seen = new Set<string>();
  const out: LlmProvider[] = [];
  for (const raw of providers) {
    const next = adoptPresetIdentity({ ...raw, models: uniqueModelIds(raw.models) });
    if (!keepProvider(next) || seen.has(next.id)) continue;
    seen.add(next.id);
    out.push(next);
  }
  return out;
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
    : settings.apiKey
      ? [defaultProviderFrom(settings)]
      : [];
  return existing.map((provider) =>
    adoptPresetIdentity({ ...provider, models: uniqueModelIds(provider.models) }),
  );
}

export function activeProviderIdOf(settings: VaultSettings, providers: LlmProvider[]): string {
  if (settings.activeProviderId && providers.some((provider) => provider.id === settings.activeProviderId)) {
    return settings.activeProviderId;
  }
  return providers.find((provider) => provider.apiKey.trim() || provider.models.length)?.id ?? providers[0]?.id ?? "";
}

export function hydrateProviders(settings: VaultSettings): VaultSettings {
  const providers = pruneEmptyPresets(providersOf(settings));
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
