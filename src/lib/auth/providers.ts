/**
 * The upstream identity providers this app can federate to via the shared
 * **auth broker** (`GROK_AUTH_ISSUER`), which holds the real upstream
 * secrets so this app never has to. Since this app registered its own
 * direct Google OAuth client (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`,
 * `server.ts`'s `socialProviders`), production no longer uses the broker at
 * all -- this array now only feeds `server.ts`'s `genericOAuth` plugin
 * config (kept live so `account.trustedProviders` still recognizes it, and
 * as a documented fallback) and `client.ts`'s live-preview delegation
 * (`GROK_GOOGLE_PROVIDER_ID`), since only the broker's shared preview
 * client solves that sandbox iframe's partitioned cookies. Kept in its own
 * dependency-free module so the client can import it without pulling the
 * server-only Better Auth instance (and `pg`) into the browser bundle.
 *
 * To add an upstream to the broker path (e.g. GitHub, once the broker
 * supports it): add one entry here (`{ providerId: "grok-github", idp:
 * "github", label: "GitHub" }`). The `providerId` is this app's local id
 * and the broker's OAuth callback path segment (`/api/auth/oauth2/callback/
 * <providerId>`); `idp` is the hint the broker reads to pick the upstream.
 */
export type GrokProvider = {
  /** This app's local provider id; also the callback path segment. */
  providerId: string;
  /** Upstream hint the broker forwards to (Better Auth social id). */
  idp: string;
  /** Human label for the sign-in button. */
  label: string;
};

export const GROK_PROVIDERS: readonly GrokProvider[] = [
  { providerId: "grok-google", idp: "google", label: "Google" },
];
