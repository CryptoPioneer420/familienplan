import type { Env } from '../env';
import { normalizeEmail } from '../lib/email';
import type { AuthProvider } from './types';

export const DEV_EMAIL_HEADER = 'X-Dev-Email';

/**
 * Dev-Auth ist nur erlaubt, wenn AUTH_MODE === "dev" UND ENVIRONMENT explizit gesetzt und nicht
 * "production" ist. Eine fehlende/leere ENVIRONMENT zählt als nicht erlaubt (fail-closed).
 */
export function isDevAuthAllowed(env: Pick<Env, 'AUTH_MODE' | 'ENVIRONMENT'>): boolean {
  if (env.AUTH_MODE !== 'dev') return false;
  const environment = (env.ENVIRONMENT ?? '').trim().toLowerCase();
  return environment !== '' && environment !== 'production';
}

/** Nur für lokale Entwicklung und Tests: Identität aus dem Header `X-Dev-Email`. */
export function createDevProvider(): AuthProvider {
  return {
    async authenticate(req: Request, env: Env) {
      // Zweite Sperre: auch wenn jemand die Factory umgeht, liefert Dev-Auth in Produktion nie eine Identität.
      if (!isDevAuthAllowed(env)) return null;
      const email = normalizeEmail(req.headers.get(DEV_EMAIL_HEADER));
      return email ? { email } : null;
    },
  };
}
