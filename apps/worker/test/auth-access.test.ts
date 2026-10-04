import { UnsecuredJWT, SignJWT } from 'jose';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { accessCertsUrl } from '../src/auth/access-jwt';
import { createTestApi, testEnv, type Api } from './helpers/app';
import {
  TEST_AUD,
  TEST_ISSUER,
  TEST_KID,
  createTestKey,
  keySetFor,
  signAccessJwt,
  type TestKey,
} from './helpers/jwt';

const JWT_HEADER = 'Cf-Access-Jwt-Assertion';
const OWNER = 'owner@example.com';

let key: TestKey;
let api: Api;

beforeAll(async () => {
  key = await createTestKey('RS256');
  api = createTestApi(key);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function expectError(res: Response, status: number, code: string): Promise<{ message: string }> {
  expect(res.status).toBe(status);
  const body = (await res.json()) as { error: { code: string; message: string } };
  expect(body.error.code).toBe(code);
  expect(typeof body.error.message).toBe('string');
  return body.error;
}

describe('ohne Zugangsdaten', () => {
  it('401 unauthenticated auf geschützten Routen', async () => {
    await expectError(await api.call('/api/me'), 401, 'unauthenticated');
    await expectError(await api.call('/api/members'), 401, 'unauthenticated');
  });

  it('401, wenn nur ein Dev-Header gesendet wird (Modus access ignoriert X-Dev-Email)', async () => {
    const res = await api.call('/api/me', { headers: { 'X-Dev-Email': OWNER } });
    await expectError(res, 401, 'unauthenticated');
  });

  it('401 bei Müll im Header', async () => {
    const res = await api.call('/api/me', { headers: { [JWT_HEADER]: 'not-a-jwt' } });
    await expectError(res, 401, 'unauthenticated');
  });
});

describe('unvollständige Access-Konfiguration (fail-closed)', () => {
  const brokenConfigs: Array<[string, Partial<Record<'ACCESS_TEAM_DOMAIN' | 'ACCESS_POLICY_AUD', string>>]> = [
    ['ACCESS_TEAM_DOMAIN leer', { ACCESS_TEAM_DOMAIN: '' }],
    ['ACCESS_POLICY_AUD leer', { ACCESS_POLICY_AUD: '' }],
    ['beide leer (Auslieferungszustand von wrangler.jsonc)', { ACCESS_TEAM_DOMAIN: '', ACCESS_POLICY_AUD: '' }],
    ['ACCESS_POLICY_AUD nur Leerraum', { ACCESS_POLICY_AUD: '   ' }],
    ['ACCESS_TEAM_DOMAIN kein Hostname', { ACCESS_TEAM_DOMAIN: 'https://evil.example.com/path?x=1' }],
  ];

  it.each(brokenConfigs)('503 auth_not_configured: %s', async (_name, overrides) => {
    const brokenEnv = testEnv(overrides);
    const token = await signAccessJwt({ key }); // selbst ein gültiges Token öffnet nichts

    for (const [path, method] of [
      ['/api/me', 'GET'],
      ['/api/members', 'GET'],
      ['/api/members', 'POST'],
    ] as const) {
      const res = await api.call(path, {
        method,
        env: brokenEnv,
        headers: { [JWT_HEADER]: token },
        ...(method === 'POST' ? { body: { email: 'x@example.com' } } : {}),
      });
      const error = await expectError(res, 503, 'auth_not_configured');
      expect(error.message).toMatch(/ACCESS_TEAM_DOMAIN/);
      expect(error.message).toMatch(/ACCESS_POLICY_AUD/);
    }
  });

  it('öffentliche Routen bleiben erreichbar', async () => {
    const res = await api.call('/api/health', { env: testEnv({ ACCESS_TEAM_DOMAIN: '', ACCESS_POLICY_AUD: '' }) });
    expect(res.status).toBe(200);
  });
});

describe('Access-JWT-Prüfung', () => {
  it('gültiges JWT => 200 (Owner-Bootstrap beim ersten Login)', async () => {
    const res = await api.asUser(OWNER, '/api/me');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ role: 'owner', displayName: null });
  });

  it('akzeptiert auch ES256', async () => {
    const es = await createTestKey('ES256', 'es-key');
    const esApi = createTestApi(es);
    const token = await signAccessJwt({ key: es, email: OWNER });
    const res = await esApi.call('/api/me', { headers: { [JWT_HEADER]: token } });
    expect(res.status).toBe(200);
  });

  it('E-Mail aus dem Claim wird kleingeschrieben', async () => {
    const res = await api.asUser('OWNER@Example.COM', '/api/me');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ role: 'owner' });
  });

  it('401 bei falscher Audience', async () => {
    const token = await signAccessJwt({ key, audience: 'another-application-aud' });
    await expectError(await api.call('/api/me', { headers: { [JWT_HEADER]: token } }), 401, 'unauthenticated');
  });

  it('401 bei falschem Issuer', async () => {
    const token = await signAccessJwt({ key, issuer: 'https://other-team.cloudflareaccess.com' });
    await expectError(await api.call('/api/me', { headers: { [JWT_HEADER]: token } }), 401, 'unauthenticated');
  });

  it('401 bei abgelaufenem Token (außerhalb der 30-s-Toleranz)', async () => {
    const token = await signAccessJwt({ key, expiresInSeconds: -120 });
    await expectError(await api.call('/api/me', { headers: { [JWT_HEADER]: token } }), 401, 'unauthenticated');
  });

  it('akzeptiert ein vor 10 s abgelaufenes Token (Clock-Tolerance 30 s), lehnt eines vor 60 s ab', async () => {
    const barelyExpired = await signAccessJwt({ key, expiresInSeconds: -10 });
    expect((await api.call('/api/me', { headers: { [JWT_HEADER]: barelyExpired } })).status).toBe(200);
    const clearlyExpired = await signAccessJwt({ key, expiresInSeconds: -60 });
    expect((await api.call('/api/me', { headers: { [JWT_HEADER]: clearlyExpired } })).status).toBe(401);
  });

  it('401 ohne exp-Claim', async () => {
    const token = await signAccessJwt({ key, expiresInSeconds: null });
    await expectError(await api.call('/api/me', { headers: { [JWT_HEADER]: token } }), 401, 'unauthenticated');
  });

  it('401 ohne email-Claim (z. B. Service-Token)', async () => {
    const token = await signAccessJwt({ key, email: null });
    await expectError(await api.call('/api/me', { headers: { [JWT_HEADER]: token } }), 401, 'unauthenticated');
  });

  it('401 bei Signatur eines fremden Schlüssels (gleiche kid)', async () => {
    const attacker = await createTestKey('RS256', TEST_KID);
    const token = await signAccessJwt({ key: attacker });
    await expectError(await api.call('/api/me', { headers: { [JWT_HEADER]: token } }), 401, 'unauthenticated');
  });

  it('401 bei unbekannter kid', async () => {
    const token = await signAccessJwt({ key, kid: 'does-not-exist' });
    await expectError(await api.call('/api/me', { headers: { [JWT_HEADER]: token } }), 401, 'unauthenticated');
  });

  it('401 bei unsigniertem Token (alg=none)', async () => {
    const token = new UnsecuredJWT({ email: OWNER })
      .setIssuer(TEST_ISSUER)
      .setAudience(TEST_AUD)
      .setExpirationTime('10m')
      .encode();
    await expectError(await api.call('/api/me', { headers: { [JWT_HEADER]: token } }), 401, 'unauthenticated');
  });

  it('401 bei HS256-Token (Algorithmus-Verwechslung)', async () => {
    const token = await new SignJWT({ email: OWNER })
      .setProtectedHeader({ alg: 'HS256', kid: TEST_KID })
      .setIssuer(TEST_ISSUER)
      .setAudience(TEST_AUD)
      .setExpirationTime('10m')
      .sign(new TextEncoder().encode('0123456789abcdef0123456789abcdef'));
    await expectError(await api.call('/api/me', { headers: { [JWT_HEADER]: token } }), 401, 'unauthenticated');
  });

  it('503 auth_unavailable, wenn der Schlüsselsatz nicht geladen werden kann (nicht 401, nicht offen)', async () => {
    const failing = createApp({
      auth: {
        resolveKeySet: () => () => {
          throw new TypeError('fetch failed');
        },
      },
    });
    const token = await signAccessJwt({ key });
    const res = await failing.request('/api/me', { headers: { [JWT_HEADER]: token } }, testEnv());
    await expectError(res, 503, 'auth_unavailable');
  });

  it('reicht die normalisierte Team-Domain an den Schlüssel-Resolver', async () => {
    const seen: string[] = [];
    const spyApp = createApp({
      auth: {
        resolveKeySet: (domain) => {
          seen.push(domain);
          return keySetFor(key);
        },
      },
    });
    const token = await signAccessJwt({ key });
    const res = await spyApp.request(
      '/api/me',
      { headers: { [JWT_HEADER]: token } },
      testEnv({ ACCESS_TEAM_DOMAIN: 'https://FamilienPlan-Test.cloudflareaccess.com/' }),
    );
    expect(res.status).toBe(200);
    expect(seen).toEqual(['familienplan-test.cloudflareaccess.com']);
  });
});

describe('Standard-Schlüsselquelle (Remote-JWKS)', () => {
  it('JWKS-URL ist https://<team>/cdn-cgi/access/certs', () => {
    expect(accessCertsUrl('team.cloudflareaccess.com').href).toBe(
      'https://team.cloudflareaccess.com/cdn-cgi/access/certs',
    );
  });

  it('lädt den Schlüsselsatz von dort, cached ihn und akzeptiert Tokens dieses Teams', async () => {
    const domain = 'remote-jwks-ok.cloudflareaccess.com';
    const certsUrl = `https://${domain}/cdn-cgi/access/certs`;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      return url === certsUrl
        ? Response.json({ keys: [key.publicJwk], public_cert: {}, public_certs: [] })
        : new Response('unexpected request', { status: 500 });
    });

    const realApp = createApp(); // keine Injektion: echter createRemoteJWKSet-Pfad
    const env = testEnv({ ACCESS_TEAM_DOMAIN: domain });
    const token = await signAccessJwt({ key, issuer: `https://${domain}` });

    for (let i = 0; i < 2; i++) {
      const res = await realApp.request('/api/me', { headers: { [JWT_HEADER]: token } }, env);
      expect(res.status).toBe(200);
    }
    const certCalls = fetchSpy.mock.calls.filter(([input]) => String(input) === certsUrl);
    expect(certCalls).toHaveLength(1);
  });

  it('503 auth_unavailable, wenn der certs-Endpunkt nicht 200 liefert', async () => {
    const domain = 'remote-jwks-down.cloudflareaccess.com';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('bad gateway', { status: 502 }));

    const realApp = createApp();
    const token = await signAccessJwt({ key, issuer: `https://${domain}` });
    const res = await realApp.request(
      '/api/me',
      { headers: { [JWT_HEADER]: token } },
      testEnv({ ACCESS_TEAM_DOMAIN: domain }),
    );
    await expectError(res, 503, 'auth_unavailable');
  });
});
