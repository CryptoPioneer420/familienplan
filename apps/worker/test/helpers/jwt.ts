import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type CryptoKey,
  type JWK,
  type JWTVerifyGetKey,
} from 'jose';

export const TEST_TEAM_DOMAIN = 'familienplan-test.cloudflareaccess.com';
export const TEST_AUD = 'test-aud-tag';
export const TEST_ISSUER = `https://${TEST_TEAM_DOMAIN}`;
export const TEST_KID = 'test-key-1';

export interface TestKey {
  privateKey: CryptoKey;
  publicJwk: JWK;
  alg: 'RS256' | 'ES256';
  kid: string;
}

export async function createTestKey(alg: 'RS256' | 'ES256' = 'RS256', kid = TEST_KID): Promise<TestKey> {
  const { privateKey, publicKey } = await generateKeyPair(alg, { extractable: true });
  const publicJwk = { ...(await exportJWK(publicKey)), kid, alg, use: 'sig' };
  return { privateKey, publicJwk, alg, kid };
}

export function keySetFor(...keys: TestKey[]): JWTVerifyGetKey {
  return createLocalJWKSet({ keys: keys.map((k) => k.publicJwk) });
}

export interface SignOptions {
  email?: string | null;
  audience?: string;
  issuer?: string;
  /** Sekunden relativ zu jetzt. Standard: +10 min. `null` = kein exp-Claim. */
  expiresInSeconds?: number | null;
  key: TestKey;
  /** kid im Header überschreiben (z. B. um einen unbekannten Schlüssel zu simulieren). */
  kid?: string;
}

/** Erzeugt ein Access-ähnliches JWT. */
export async function signAccessJwt(options: SignOptions): Promise<string> {
  const { key } = options;
  const email = options.email === undefined ? 'owner@example.com' : options.email;
  const now = Math.floor(Date.now() / 1000);
  const jwt = new SignJWT(email === null ? {} : { email })
    .setProtectedHeader({ alg: key.alg, kid: options.kid ?? key.kid })
    .setIssuer(options.issuer ?? TEST_ISSUER)
    .setAudience(options.audience ?? TEST_AUD)
    .setSubject('user-1')
    .setIssuedAt(now - 5);
  if (options.expiresInSeconds !== null) jwt.setExpirationTime(now + (options.expiresInSeconds ?? 600));
  return jwt.sign(key.privateKey);
}
