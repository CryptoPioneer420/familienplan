/**
 * Worker bindings and variables (siehe ../../wrangler.jsonc).
 * `AUTH_MODE` ist zur Laufzeit ein beliebiger String aus der Konfiguration; `selectAuthProvider`
 * validiert ihn und verweigert unbekannte Werte (fail-closed).
 */
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** "production" | "staging" | "development" | ... */
  ENVIRONMENT: string;
  AUTH_MODE: 'access' | 'dev';
  /** Zero-Trust-Team-Domain, z. B. "meinteam.cloudflareaccess.com" (ohne Schema). */
  ACCESS_TEAM_DOMAIN: string;
  /** AUD-Tag der Access-Application. */
  ACCESS_POLICY_AUD: string;
  /** E-Mail des Haushalts-Owners (Bootstrap beim ersten Login). */
  OWNER_EMAIL: string;
}
