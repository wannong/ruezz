export const DEFAULT_RADIUS_GATEWAY = "https://radius.pi.dev";
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isRadiusGatewayModel(value) {
    return (isRecord(value) &&
        typeof value.id === "string" &&
        typeof value.name === "string" &&
        typeof value.reasoning === "boolean" &&
        Array.isArray(value.input) &&
        isRecord(value.cost) &&
        typeof value.contextWindow === "number" &&
        typeof value.maxTokens === "number");
}
function sanitizeRadiusGatewayConfig(config) {
    if (!isRecord(config) || typeof config.baseUrl !== "string" || !Array.isArray(config.models))
        return undefined;
    return {
        baseUrl: config.baseUrl,
        models: config.models.filter(isRadiusGatewayModel).map((model) => ({ ...model })),
    };
}
export function normalizeRadiusGatewayUrl(value) {
    const withScheme = /^https?:\/\//iu.test(value) ? value : `https://${value}`;
    return withScheme.replace(/\/+$/u, "");
}
export function getRadiusCredentialConfig(credential) {
    return sanitizeRadiusGatewayConfig(credential?.gatewayConfig);
}
export function getRadiusModelsFromConfig(providerId, config) {
    return config.models.map((model) => ({
        ...model,
        api: "pi-messages",
        provider: providerId,
        baseUrl: config.baseUrl,
    }));
}
export function getRadiusModels(providerId, credential) {
    const config = getRadiusCredentialConfig(credential);
    return config ? getRadiusModelsFromConfig(providerId, config) : [];
}
function truncateHttpBody(body) {
    const trimmed = body.trim();
    return trimmed.length > 512 ? `${trimmed.slice(0, 512)}…` : trimmed;
}
export async function loadRadiusGatewayConfig(gateway, apiKey, signal) {
    const headers = { accept: "application/json" };
    if (apiKey)
        headers.authorization = `Bearer ${apiKey}`;
    const response = await fetch(new URL("/v1/config", gateway), { headers, signal });
    if (!response.ok) {
        throw new Error(`Could not load Radius config from ${gateway}: ${response.status}: ${truncateHttpBody(await response.text())}`);
    }
    const config = sanitizeRadiusGatewayConfig(await response.json());
    if (!config)
        throw new Error(`Invalid Radius config from ${gateway}`);
    return config;
}
//# sourceMappingURL=radius-config.js.map