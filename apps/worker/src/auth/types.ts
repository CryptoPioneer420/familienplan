import type { Env } from '../env';

export interface AuthIdentity {
  /** Kleingeschrieben und getrimmt. */
  email: string;
}

/**
 * Schnittstelle, hinter der die Authentifizierung austauschbar bleibt (Entscheidung D6).
 * Implementierungen: Cloudflare-Access-JWT (`access-jwt.ts`), Dev-Header (`dev.ts`).
 * Geplant, nicht gebaut: Haushalts-Link (Cookie gegen Hash in D1), siehe README.
 *
 * Vertrag:
 * - `null` = nicht authentifiziert (fehlende/ungültige Zugangsdaten) => 401.
 * - Konfigurations- oder Infrastrukturfehler werden als `AuthConfigError` bzw.
 *   `AuthUnavailableError` geworfen => 503, niemals als "offen".
 * - Die Implementierung liefert nur die Identität (E-Mail). Haushalt und Rolle kommen
 *   ausschließlich aus der Mitgliedschaft in D1.
 */
export interface AuthProvider {
  authenticate(req: Request, env: Env): Promise<AuthIdentity | null>;
}

/** Auth ist falsch oder unvollständig konfiguriert => alle geschützten Routen 503 (fail-closed). */
export class AuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthConfigError';
  }
}

/** Auth-Infrastruktur nicht erreichbar (z. B. JWKS-Abruf fehlgeschlagen) => 503. */
export class AuthUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AuthUnavailableError';
  }
}
