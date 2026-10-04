import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestApi, testEnv, type Api } from './helpers/app';
import { createTestKey, signAccessJwt, type TestKey } from './helpers/jwt';

const OWNER = 'owner@example.com';
let key: TestKey;
let api: Api;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  key = await createTestKey();
  api = createTestApi(key);
});

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

type Line = Record<string, unknown>;

function loggedLines(): Line[] {
  return logSpy.mock.calls.map(([arg]: unknown[]) => JSON.parse(String(arg)) as Line);
}

describe('Logging', () => {
  it('schreibt genau eine JSON-Zeile pro Request mit den vorgesehenen Feldern', async () => {
    const res = await api.asUser(OWNER, '/api/me');
    const me = (await res.json()) as { memberId: string };

    const lines = loggedLines();
    expect(lines).toHaveLength(1);
    const line = lines[0] as Line;
    expect(Object.keys(line).sort()).toEqual(['bootstrap', 'memberId', 'method', 'ms', 'path', 'requestId', 'status', 'ts']);
    expect(line).toMatchObject({ method: 'GET', path: '/api/me', status: 200, memberId: me.memberId, bootstrap: true });
    expect(typeof line.ms).toBe('number');
    expect(new Date(String(line.ts)).toISOString()).toBe(line.ts);
    expect(String(line.requestId)).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers.get('x-request-id')).toBe(line.requestId);
  });

  it('zweiter Login: kein bootstrap-Flag, memberId bleibt', async () => {
    await api.asUser(OWNER, '/api/me');
    logSpy.mockClear();
    await api.asUser(OWNER, '/api/me');
    const line = loggedLines()[0] as Line;
    expect(line.bootstrap).toBeUndefined();
    expect(line.memberId).toBeDefined();
  });

  it('enthält weder E-Mail-Adressen noch Tokens noch Query-Strings', async () => {
    const token = await signAccessJwt({ key, email: OWNER });
    await api.call('/api/me?email=leak@example.com&token=abc', { headers: { 'Cf-Access-Jwt-Assertion': token } });
    await api.asUser('stranger@example.com', '/api/members');
    await api.call('/api/members', { method: 'POST', body: { email: 'victim@example.com' } });

    const raw = logSpy.mock.calls.map(([arg]: unknown[]) => String(arg)).join('\n');
    expect(loggedLines().length).toBeGreaterThanOrEqual(3);
    expect(raw).not.toMatch(/@/);
    expect(raw).not.toContain(token);
    expect(raw).not.toMatch(/eyJ/);
    expect(raw).not.toMatch(/leak|victim|stranger|owner/);
    expect(loggedLines().every((l) => l.path === '/api/me' || l.path === '/api/members')).toBe(true);
  });

  it('protokolliert Fehlercode und Ablehnungsgrund der Authentifizierung ohne Token', async () => {
    const expired = await signAccessJwt({ key, expiresInSeconds: -300 });
    const res = await api.call('/api/me', { headers: { 'Cf-Access-Jwt-Assertion': expired } });
    expect(res.status).toBe(401);
    const line = loggedLines()[0] as Line;
    expect(line).toMatchObject({ status: 401, errorCode: 'unauthenticated', authReason: 'ERR_JWT_EXPIRED:exp' });
    expect(line.memberId).toBeUndefined();
    expect(JSON.stringify(line)).not.toContain(expired);
  });

  it('403 wird mit errorCode, aber ohne memberId geloggt', async () => {
    await api.asUser('stranger@example.com', '/api/me');
    expect(loggedLines()[0]).toMatchObject({ status: 403, errorCode: 'forbidden' });
  });

  it('unerwartete Fehler: Details nur im Log, E-Mail-Adressen in der Fehlermeldung geschwärzt', async () => {
    const brokenDb = {
      prepare() {
        throw new Error('boom: cannot read row of secret.person@example.com with eyJhbGciOi.eyJzdWIi.c2ln');
      },
    } as unknown as D1Database;
    const res = await api.call('/api/me', {
      env: testEnv({ AUTH_MODE: 'dev', ENVIRONMENT: 'development', DB: brokenDb }),
      headers: { 'X-Dev-Email': OWNER },
    });
    expect(res.status).toBe(500);

    expect(loggedLines()).toHaveLength(1);
    const line = loggedLines()[0] as Line & { error: { name: string; message: string } };
    expect(line).toMatchObject({ status: 500, errorCode: 'internal_error' });
    expect(line.error.name).toBe('Error');
    expect(line.error.message).toContain('boom');
    const raw = JSON.stringify(line);
    expect(raw).not.toMatch(/secret\.person|@example\.com|eyJhbGci/);
  });
});
