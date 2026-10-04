import type { Env } from '../env';
import { createAccessJwtProvider, normalizeTeamDomain, type AccessJwtOptions } from './access-jwt';
import { createDevProvider, isDevAuthAllowed } from './dev';
import { AuthConfigError, type AuthProvider } from './types';

export type AuthOptions = AccessJwtOptions;

/**
 * Wählt den AuthProvider anhand der Konfiguration. Fail-closed: Jede unvollständige oder
 * unzulässige Konfiguration wirft `AuthConfigError` (die App antwortet auf geschützten Routen
 * mit 503), es gibt nie einen stillen Fallback auf "offen".
 */
export function selectAuthProvider(env: Env, options: AuthOptions = {}): AuthProvider {
  const mode: string = env.AUTH_MODE;

  if (mode === 'access') {
    if (!normalizeTeamDomain(env.ACCESS_TEAM_DOMAIN) || !env.ACCESS_POLICY_AUD?.trim()) {
      throw new AuthConfigError(
        'Authentication is not configured: set ACCESS_TEAM_DOMAIN (e.g. "team.cloudflareaccess.com") and ACCESS_POLICY_AUD.',
      );
    }
    return createAccessJwtProvider(options);
  }

  if (mode === 'dev') {
    if (!isDevAuthAllowed(env)) {
      throw new AuthConfigError('AUTH_MODE "dev" is only allowed when ENVIRONMENT is set and not "production".');
    }
    return createDevProvider();
  }

  throw new AuthConfigError('AUTH_MODE must be "access" or "dev".');
}

export { AuthConfigError, AuthUnavailableError } from './types';
export type { AuthIdentity, AuthProvider } from './types';
