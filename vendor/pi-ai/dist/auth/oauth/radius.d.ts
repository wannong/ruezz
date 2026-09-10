/**
 * Radius gateway OAuth flow.
 *
 * Radius is a pi-messages gateway. OAuth endpoints are discovered from the
 * gateway (`/v1/oauth`); model catalog loading is owned by the Radius provider.
 *
 * NOTE: This module uses node:http for the OAuth callback server.
 * It is only intended for CLI use, not browser environments.
 */
import type { OAuthAuth } from "../types.ts";
export interface RadiusOAuthOptions {
    name: string;
    gateway: string;
}
export declare function createRadiusOAuth(options: RadiusOAuthOptions): OAuthAuth;
//# sourceMappingURL=radius.d.ts.map