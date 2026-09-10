/**
 * Radius gateway OAuth flow.
 *
 * Radius is a pi-messages gateway. OAuth endpoints are discovered from the
 * gateway (`/v1/oauth`); model catalog loading is owned by the Radius provider.
 *
 * NOTE: This module uses node:http for the OAuth callback server.
 * It is only intended for CLI use, not browser environments.
 */
// NEVER convert to top-level imports - breaks browser/Vite builds
let _http = null;
if (typeof process !== "undefined" && (process.versions?.node || process.versions?.bun)) {
    import("node:http").then((m) => {
        _http = m;
    });
}
import { normalizeRadiusGatewayUrl } from "../../providers/radius-config.js";
import { pollOAuthDeviceCodeFlow } from "./device-code.js";
import { oauthErrorHtml, oauthSuccessHtml } from "./oauth-page.js";
import { generatePKCE } from "./pkce.js";
const CALLBACK_HOST = "127.0.0.1";
const CALLBACK_PORT = 1456;
const CALLBACK_PATH = "/oauth/callback";
const REDIRECT_URI = `http://${CALLBACK_HOST}:${CALLBACK_PORT}${CALLBACK_PATH}`;
const TOKEN_EXPIRY_SKEW_MS = 60_000;
const LOGIN_METHOD_BROWSER = "browser";
const LOGIN_METHOD_DEVICE_CODE = "device-code";
async function loadRadiusOAuthConfig(gateway) {
    const response = await fetch(new URL("/v1/oauth", gateway), {
        headers: { accept: "application/json" },
    });
    if (!response.ok) {
        throw new Error(`Could not load Radius OAuth config from ${gateway}: ${response.status} ${await response.text()}`);
    }
    return (await response.json());
}
class OAuthResponseError extends Error {
    status;
    oauthError;
    constructor(status, oauthError, description, message) {
        const detail = oauthError
            ? description
                ? `${oauthError}: ${description}`
                : oauthError
            : description || String(status);
        super(`${message}: ${detail}`);
        this.status = status;
        this.oauthError = oauthError;
    }
}
async function readOAuthResponseError(response, message) {
    const text = await response.text().catch(() => "");
    let oauthError;
    let description;
    if (text) {
        try {
            const data = JSON.parse(text);
            oauthError = typeof data.error === "string" ? data.error : undefined;
            description = typeof data.error_description === "string" ? data.error_description : undefined;
        }
        catch {
            description = text;
        }
    }
    return new OAuthResponseError(response.status, oauthError, description, message);
}
async function requestOAuthToken(oauth, body, signal) {
    let response;
    try {
        response = await fetch(oauth.tokenEndpoint, {
            method: "POST",
            headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
            body,
            signal,
        });
    }
    catch (error) {
        if (signal?.aborted) {
            throw new Error("Login cancelled");
        }
        throw error;
    }
    if (!response.ok) {
        throw await readOAuthResponseError(response, "Radius OAuth token request failed");
    }
    const data = (await response.json());
    return {
        type: "oauth",
        access: data.access_token,
        refresh: data.refresh_token,
        expires: Date.now() + data.expires_in * 1000 - TOKEN_EXPIRY_SKEW_MS,
        scope: data.scope,
    };
}
function startOAuthCallbackServer(expectedState, signal) {
    if (!_http) {
        throw new Error("Radius OAuth is only available in Node.js environments");
    }
    let settle = () => { };
    let settled = false;
    const wait = new Promise((resolve) => {
        settle = resolve;
    });
    const finish = (code) => {
        if (settled) {
            return;
        }
        settled = true;
        signal?.removeEventListener("abort", onAbort);
        settle(code);
    };
    const onAbort = () => finish(null);
    signal?.addEventListener("abort", onAbort, { once: true });
    const sendPage = (response, status, html) => {
        response.statusCode = status;
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.end(html);
    };
    const server = _http.createServer((request, response) => {
        const url = new URL(request.url ?? "/", REDIRECT_URI);
        if (url.pathname !== CALLBACK_PATH) {
            sendPage(response, 404, oauthErrorHtml("Callback route not found."));
            return;
        }
        if (url.searchParams.get("state") !== expectedState) {
            sendPage(response, 400, oauthErrorHtml("OAuth state mismatch."));
            return;
        }
        const error = url.searchParams.get("error");
        if (error) {
            sendPage(response, 400, oauthErrorHtml(url.searchParams.get("error_description") ?? error));
            finish(null);
            return;
        }
        const code = url.searchParams.get("code");
        if (!code) {
            sendPage(response, 400, oauthErrorHtml("Missing authorization code."));
            return;
        }
        sendPage(response, 200, oauthSuccessHtml("Signed in to Radius. You may now close this page."));
        finish(code);
    });
    return new Promise((resolve) => {
        server
            .listen(CALLBACK_PORT, CALLBACK_HOST, () => {
            resolve({
                waitForCode: () => wait,
                close: () => {
                    finish(null);
                    server.close();
                },
            });
        })
            .once("error", () => {
            finish(null);
            resolve({ waitForCode: async () => null, close: () => { } });
        });
    });
}
async function loginWithBrowser(oauth, interaction) {
    const { verifier, challenge } = await generatePKCE();
    const state = crypto.randomUUID();
    const authorizeUrl = new URL(oauth.authorizationEndpoint);
    authorizeUrl.search = new URLSearchParams({
        response_type: "code",
        client_id: oauth.clientId,
        redirect_uri: REDIRECT_URI,
        scope: oauth.scope,
        code_challenge: challenge,
        code_challenge_method: "S256",
        handoff: "url",
        state,
    }).toString();
    const callbackServer = await startOAuthCallbackServer(state, interaction.signal);
    interaction.notify({ type: "progress", message: `Listening for OAuth callback on ${REDIRECT_URI}` });
    interaction.notify({
        type: "auth_url",
        url: authorizeUrl.toString(),
        instructions: "Continue in your browser.",
    });
    try {
        const code = await callbackServer.waitForCode();
        if (!code) {
            if (interaction.signal?.aborted) {
                throw new Error("Login cancelled");
            }
            throw new Error("OAuth callback did not complete.");
        }
        return await requestOAuthToken(oauth, new URLSearchParams({
            grant_type: "authorization_code",
            client_id: oauth.clientId,
            redirect_uri: REDIRECT_URI,
            code,
            code_verifier: verifier,
        }), interaction.signal);
    }
    finally {
        callbackServer.close();
    }
}
async function requestDeviceAuthorization(oauth, signal) {
    let response;
    try {
        response = await fetch(oauth.deviceAuthorizationEndpoint, {
            method: "POST",
            headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ client_id: oauth.clientId, scope: oauth.scope }),
            signal,
        });
    }
    catch (error) {
        if (signal?.aborted) {
            throw new Error("Login cancelled");
        }
        throw error;
    }
    if (!response.ok) {
        throw await readOAuthResponseError(response, "Radius OAuth device authorization failed");
    }
    const data = (await response.json());
    if (!data.device_code || !data.user_code || !data.expires_in) {
        throw new Error("Radius OAuth device authorization response is missing required fields");
    }
    return {
        device_code: data.device_code,
        user_code: data.user_code,
        verification_uri: data.verification_uri,
        verification_uri_complete: data.verification_uri_complete,
        expires_in: data.expires_in,
        interval: data.interval,
    };
}
async function loginWithDeviceCode(oauth, interaction) {
    const device = await requestDeviceAuthorization(oauth, interaction.signal);
    interaction.notify({
        type: "device_code",
        userCode: device.user_code,
        verificationUri: device.verification_uri || oauth.verificationEndpoint,
        intervalSeconds: device.interval,
        expiresInSeconds: device.expires_in,
    });
    return pollOAuthDeviceCodeFlow({
        intervalSeconds: device.interval,
        expiresInSeconds: device.expires_in,
        signal: interaction.signal,
        poll: async () => {
            try {
                const credentials = await requestOAuthToken(oauth, new URLSearchParams({
                    grant_type: oauth.deviceCodeGrantType,
                    client_id: oauth.clientId,
                    device_code: device.device_code,
                }), interaction.signal);
                return { status: "complete", value: credentials };
            }
            catch (error) {
                if (!(error instanceof OAuthResponseError)) {
                    throw error;
                }
                switch (error.oauthError) {
                    case "authorization_pending":
                        return { status: "pending" };
                    case "slow_down":
                        return { status: "slow_down" };
                    case "expired_token":
                        return { status: "failed", message: "Device authorization expired." };
                    case "access_denied":
                        return { status: "failed", message: "Device authorization was denied." };
                    default:
                        throw error;
                }
            }
        },
    });
}
export function createRadiusOAuth(options) {
    const gateway = normalizeRadiusGatewayUrl(options.gateway);
    return {
        name: options.name,
        async login(interaction) {
            const oauth = await loadRadiusOAuthConfig(gateway);
            const loginMethod = await interaction.prompt({
                type: "select",
                message: `Sign in to ${options.name}:`,
                options: [
                    { id: LOGIN_METHOD_BROWSER, label: "Sign in with browser (recommended)" },
                    {
                        id: LOGIN_METHOD_DEVICE_CODE,
                        label: "Sign in with device code (when signing in from another device)",
                    },
                ],
            });
            let credential;
            if (loginMethod === LOGIN_METHOD_DEVICE_CODE) {
                credential = await loginWithDeviceCode(oauth, interaction);
            }
            else if (loginMethod === LOGIN_METHOD_BROWSER) {
                credential = await loginWithBrowser(oauth, interaction);
            }
            else {
                throw new Error(`Unknown ${options.name} sign-in method: ${loginMethod}`);
            }
            return credential;
        },
        async refresh(credential, signal) {
            const oauth = await loadRadiusOAuthConfig(gateway);
            const refreshed = await requestOAuthToken(oauth, new URLSearchParams({
                grant_type: "refresh_token",
                client_id: oauth.clientId,
                refresh_token: credential.refresh,
            }), signal);
            return refreshed;
        },
        async toAuth(credential) {
            return { apiKey: credential.access };
        },
    };
}
//# sourceMappingURL=radius.js.map