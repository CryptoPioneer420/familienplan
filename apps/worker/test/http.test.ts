import { beforeAll, describe, expect, it } from 'vitest';
import type { Env } from '../src/env';
import { createTestApi, testEnv, type Api } from './helpers/app';
import { createTestKey } from './helpers/jwt';

const OWNER = 'owner@example.com';
let api: Api;

beforeAll(async () => {
  api = createTestApi(await createTestKey());
});

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
  'x-frame-options': 'DENY',
} as const;

function expectSecurityHeaders(res: Response, label: string): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    expect(res.headers.get(name), `${label}: ${name}`).toBe(value);
  }
  expect(res.headers.has('access-control-allow-origin'), `${label}: kein CORS`).toBe(false);
  expect(res.headers.get('x-request-id'), `${label}: x-request-id`).toMatch(/^[0-9a-f-]{36}$/);
}

/** DB, die bei jedem Zugriff mit einer PII-haltigen Meldung wirft (löst einen unerwarteten Fehler aus). */
const brokenDb = {
  prepare() {
    throw new Error('boom: cannot read row of secret.person@example.com');
  },
} as unknown as D1Database;

describe('Sicherheits-Header', () => {
  it('stehen auf Erfolgs- und Fehlerantworten des Workers', async () => {
    const cases: Array<[string, () => Promise<Response>]> = [
      ['200 health', () => api.call('/api/health')],
      ['200 me', () => api.asUser(OWNER, '/api/me')],
      ['401', () => api.call('/api/me')],
      ['403', () => api.asUser('stranger@example.com', '/api/members')],
      ['400', () => api.asUser(OWNER, '/api/members', { method: 'POST', body: {} })],
      ['404', () => api.call('/api/does-not-exist')],
      ['503', () => api.call('/api/me', { env: testEnv({ ACCESS_POLICY_AUD: '' }) })],
      [
        '500',
        () =>
          api.call('/api/me', {
            env: testEnv({ AUTH_MODE: 'dev', ENVIRONMENT: 'development', DB: brokenDb }),
            headers: { 'X-Dev-Email': OWNER },
          }),
      ],
    ];
    for (const [label, run] of cases) expectSecurityHeaders(await run(), label);
  });

  it('Asset-Fallback: Sicherheits-Header gesetzt, eigenes Cache-Control der Assets bleibt erhalten', async () => {
    const withCaching = {
      fetch: async () => new Response('asset', { headers: { 'cache-control': 'public, max-age=31536000, immutable' } }),
    } as unknown as Fetcher;
    const res = await api.call('/assets/app.js', { env: testEnv({ ASSETS: withCaching } satisfies Partial<Env>) });
    expect(res.status).toBe(200);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });
});

describe('Fehlerformat', () => {
  it('unbekannter /api-Pfad => JSON-404 (mit und ohne Login)', async () => {
    for (const res of [await api.call('/api/does-not-exist'), await api.asUser(OWNER, '/api/does/not/exist')]) {
      expect(res.status).toBe(404);
      expect(res.headers.get('content-type')).toMatch(/application\/json/);
      expect(await res.json()).toEqual({ error: { code: 'not_found', message: 'Resource not found.' } });
    }
  });

  it('nicht unterstützte Methode auf bekanntem Pfad => JSON-404, kein CORS-Preflight', async () => {
    for (const method of ['DELETE', 'PUT', 'PATCH', 'OPTIONS']) {
      const res = await api.call('/api/members', { method });
      expect(res.status, method).toBe(404);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe('not_found');
      expect(res.headers.has('access-control-allow-origin')).toBe(false);
    }
  });

  it('/api selbst und /api/health/extra sind JSON-404', async () => {
    for (const path of ['/api', '/api/health/extra']) {
      const res = await api.call(path);
      expect(res.status, path).toBe(404);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe('not_found');
    }
  });

  it('unerwarteter Fehler => 500 internal_error, ohne Details in der Antwort', async () => {
    const res = await api.call('/api/me', {
      env: testEnv({ AUTH_MODE: 'dev', ENVIRONMENT: 'development', DB: brokenDb }),
      headers: { 'X-Dev-Email': OWNER },
    });
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: { code: 'internal_error', message: 'Internal server error.' } });
    expect(text).not.toMatch(/boom|secret|person@/);
  });
});

describe('Static-Assets-Fallback', () => {
  it('Nicht-/api-Pfade gehen an das ASSETS-Binding', async () => {
    const res = await api.call('/wochenplan/2026-10-05');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('asset-stub');
    expect(res.headers.get('cache-control')).toBe('no-store'); // Stub liefert keins
  });
});
