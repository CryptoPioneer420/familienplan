import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { Env } from '../env';
import { normalizeEmail } from '../lib/email';
import { AuthConfigError, AuthUnavailableError, type AuthProvider } from './types';

export const ACCESS_JWT_HEADER = 'Cf-Access-Jwt-Assertion';
export const CLOCK_TOLERANCE_SECONDS = 30;
/** Access signiert mit RS256. ES256 bleibt erlaubt; symmetrische Verfahren und "none" nie. */
export const ACCEPTED_ALGORITHMS = ['RS256', 'ES256'];

/** Liefert den Schlüsselsatz für eine Team-Domain. Injizierbar, damit Tests einen lokalen Schlüssel nutzen. */
export type KeySetResolver = (teamDomain: string) => JWTVerifyGetKey;

export interface AccessJwtOptions {
  resolveKeySet?: KeySetResolver;
  /** Wird mit einem kurzen Ablehnungs-Code aufgerufen (nie Token oder Claims), nur für Logs. */
  onReject?: (reason: string) => void;
}

const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

/**
 * Normalisiert `ACCESS_TEAM_DOMAIN` ("team.cloudflareaccess.com"; ein führendes "https://" und
 * ein abschließender "/" werden toleriert). Liefert `null`, wenn leer oder kein reiner Hostname.
 */
export function normalizeTeamDomain(raw: string | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw
    .trim()
    .toLowerCase()
    .replace(/^https:\/\//, '')
    .replace(/\/+$/, '');
  return HOSTNAME.test(value) ? value : null;
}

export function accessCertsUrl(teamDomain: string): URL {
  return new URL(`https://${teamDomain}/cdn-cgi/access/certs`);
}

export function accessIssuer(teamDomain: string): string {
  return `https://${teamDomain}`;
}

/**
 * Ein entfernter JWKS pro Team-Domain und Isolate. jose cached die Schlüssel (10 min) und
 * begrenzt Neuabrufe bei unbekannter `kid` (Cooldown 30 s).
 */
const remoteKeySets = new Map<string, JWTVerifyGetKey>();

export const defaultKeySetResolver: KeySetResolver = (teamDomain) => {
  let keySet = remoteKeySets.get(teamDomain);
  if (!keySet) {
    keySet = createRemoteJWKSet(accessCertsUrl(teamDomain));
    remoteKeySets.set(teamDomain, keySet);
  }
  return keySet;
};

/** Bleibt der Fehler beim Schlüsselabruf ein Problem der Infrastruktur (=> 503) statt des Tokens (=> 401)? */
function isKeySetInfrastructureError(err: unknown): boolean {
  if (!(err instanceof errors.JOSEError)) return true; // Netzwerk, TypeError, ...
  return (
    err.code === 'ERR_JWKS_TIMEOUT' ||
    err.code === 'ERR_JWKS_INVALID' ||
    err.code === 'ERR_JOSE_GENERIC' // z. B. HTTP != 200 vom certs-Endpunkt
  );
}

class KeySetUnavailable extends Error {
  constructor(cause: unknown) {
    super('Key set unavailable', { cause });
    this.name = 'KeySetUnavailable';
  }
}

function guardKeySet(keySet: JWTVerifyGetKey): JWTVerifyGetKey {
  return async (protectedHeader, token) => {
    try {
      return await keySet(protectedHeader, token);
    } catch (err) {
      if (isKeySetInfrastructureError(err)) throw new KeySetUnavailable(err);
      throw err; // JWKSNoMatchingKey & Co.: Token passt nicht zum Schlüsselsatz => 401
    }
  };
}

function rejectionReason(err: unknown): string {
  if (err instanceof errors.JWTClaimValidationFailed || err instanceof errors.JWTExpired) {
    return `${err.code}:${err.claim}`;
  }
  if (err instanceof errors.JOSEError) return err.code;
  return 'ERR_UNKNOWN';
}

export function createAccessJwtProvider(options: AccessJwtOptions = {}): AuthProvider {
  const resolveKeySet = options.resolveKeySet ?? defaultKeySetResolver;
  const reject = (reason: string): null => {
    options.onReject?.(reason);
    return null;
  };

  return {
    async authenticate(req: Request, env: Env) {
      const teamDomain = normalizeTeamDomain(env.ACCESS_TEAM_DOMAIN);
      const audience = env.ACCESS_POLICY_AUD?.trim();
      if (!teamDomain || !audience) {
        throw new AuthConfigError('ACCESS_TEAM_DOMAIN and ACCESS_POLICY_AUD must be set.');
      }

      const token = req.headers.get(ACCESS_JWT_HEADER);
      if (!token) return reject('missing_token');

      let payload;
      try {
        ({ payload } = await jwtVerify(token, guardKeySet(resolveKeySet(teamDomain)), {
          issuer: accessIssuer(teamDomain),
          audience,
          algorithms: ACCEPTED_ALGORITHMS,
          clockTolerance: CLOCK_TOLERANCE_SECONDS,
          requiredClaims: ['exp'],
        }));
      } catch (err) {
        if (err instanceof KeySetUnavailable) {
          throw new AuthUnavailableError('Could not load the Access signing keys.', { cause: err.cause });
        }
        return reject(rejectionReason(err));
      }

      const email = normalizeEmail(payload['email']);
      if (!email) return reject('missing_email_claim');
      return { email };
    },
  };
}
