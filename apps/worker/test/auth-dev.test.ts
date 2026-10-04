import { beforeAll, describe, expect, it } from 'vitest';
import { createDevProvider, isDevAuthAllowed } from '../src/auth/dev';
import { AuthConfigError, selectAuthProvider } from '../src/auth';
import { createTestApi, testEnv, type Api } from './helpers/app';
import { createTestKey } from './helpers/jwt';
import { count } from './helpers/db';
import { env } from 'cloudflare:workers';

const OWNER = 'owner@example.com';
let api: Api;

beforeAll(async () => {
  api = createTestApi(await createTestKey());
});

const devEnv = (overrides = {}) => testEnv({ AUTH_MODE: 'dev', ENVIRONMENT: 'development', ...overrides });

describe('Dev-Provider (X-Dev-Email)', () => {
  it('funktioniert mit AUTH_MODE=dev und ENVIRONMENT != production', async () => {
    const res = await api.call('/api/me', { env: devEnv(), headers: { 'X-Dev-Email': OWNER } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ role: 'owner' });
  });

  it('ohne Header => 401', async () => {
    const res = await api.call('/api/me', { env: devEnv() });
    expect(res.status).toBe(401);
  });

  it('wird im Modus production abgelehnt: 503, Header wirkt nicht, nichts wird angelegt', async () => {
    const res = await api.call('/api/me', {
      env: devEnv({ ENVIRONMENT: 'production' }),
      headers: { 'X-Dev-Email': OWNER },
    });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('auth_not_configured');
    expect(await count(env.DB, 'households')).toBe(0);
    expect(await count(env.DB, 'members')).toBe(0);
  });

  it.each(['Production', ' PRODUCTION ', '', '   '])('ENVIRONMENT=%j zählt nicht als erlaubt', async (environment) => {
    const res = await api.call('/api/me', {
      env: devEnv({ ENVIRONMENT: environment }),
      headers: { 'X-Dev-Email': OWNER },
    });
    expect(res.status).toBe(503);
  });

  it('unbekannter AUTH_MODE => 503 (kein stiller Fallback)', async () => {
    for (const mode of ['', 'none', 'ACCESS', 'off']) {
      const res = await api.call('/api/me', {
        env: testEnv({ AUTH_MODE: mode as 'access' }),
        headers: { 'X-Dev-Email': OWNER },
      });
      expect(res.status, `AUTH_MODE=${JSON.stringify(mode)}`).toBe(503);
    }
  });
});

describe('Dev-Provider: Sperren auf Factory- und Provider-Ebene', () => {
  it('isDevAuthAllowed', () => {
    expect(isDevAuthAllowed({ AUTH_MODE: 'dev', ENVIRONMENT: 'development' })).toBe(true);
    expect(isDevAuthAllowed({ AUTH_MODE: 'dev', ENVIRONMENT: 'staging' })).toBe(true);
    expect(isDevAuthAllowed({ AUTH_MODE: 'dev', ENVIRONMENT: 'production' })).toBe(false);
    expect(isDevAuthAllowed({ AUTH_MODE: 'access', ENVIRONMENT: 'development' })).toBe(false);
  });

  it('selectAuthProvider wirft AuthConfigError für dev + production', () => {
    expect(() => selectAuthProvider(devEnv({ ENVIRONMENT: 'production' }))).toThrow(AuthConfigError);
  });

  it('selectAuthProvider wirft AuthConfigError für access ohne Team-Domain oder AUD', () => {
    expect(() => selectAuthProvider(testEnv({ ACCESS_TEAM_DOMAIN: '' }))).toThrow(AuthConfigError);
    expect(() => selectAuthProvider(testEnv({ ACCESS_POLICY_AUD: '' }))).toThrow(AuthConfigError);
    expect(() => selectAuthProvider(testEnv())).not.toThrow();
  });

  it('der Dev-Provider liefert in Produktion auch bei direktem Aufruf nie eine Identität', async () => {
    const req = new Request('http://localhost/api/me', { headers: { 'X-Dev-Email': OWNER } });
    const provider = createDevProvider();
    expect(await provider.authenticate(req, devEnv({ ENVIRONMENT: 'production' }))).toBeNull();
    expect(await provider.authenticate(req, devEnv())).toEqual({ email: OWNER });
  });
});
