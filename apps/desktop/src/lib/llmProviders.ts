import type { LlmProvider, VaultSettings } from "../api";

export function newProviderId(): string {
  return `prov_${Math.random().toString(36).slice(2, 10)}`;
}

export function uniqueModelIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
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
  if (settings.providers?.length) {
    return settings.providers.map((provider) => ({
      ...provider,
      models: uniqueModelIds(provider.models),
    }));
  }
  return [defaultProviderFrom(settings)];
}

export function activeProviderIdOf(settings: VaultSettings, providers: LlmProvider[]): string {
  if (settings.activeProviderId && providers.some((provider) => provider.id === settings.activeProviderId)) {
    return settings.activeProviderId;
  }
  return providers[0]?.id ?? "";
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
