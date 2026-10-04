import { createExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import pkg from '../package.json';
import worker from '../src/index';
import type { Env } from '../src/env';
import { createTestApi, testEnv, type Api } from './helpers/app';
import { createTestKey } from './helpers/jwt';

let api: Api;
beforeAll(async () => {
  api = createTestApi(await createTestKey());
});

describe('GET /api/health', () => {
  it('ist öffentlich und liefert ok + version', async () => {
    const res = await api.call('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: pkg.version });
  });

  it('greift nicht auf die Datenbank zu', async () => {
    const forbiddenDb = new Proxy({}, {
      get() {
        throw new Error('DB must not be touched by /api/health');
      },
    }) as unknown as D1Database;
    const res = await api.call('/api/health', { env: testEnv({ DB: forbiddenDb }) });
    expect(res.status).toBe(200);
  });

  it('funktioniert auch bei unvollständiger Auth-Konfiguration', async () => {
    const res = await api.call('/api/health', { env: testEnv({ ACCESS_TEAM_DOMAIN: '', ACCESS_POLICY_AUD: '' }) });
    expect(res.status).toBe(200);
  });

  it('wird über den echten Default-Export (src/index.ts) bedient', async () => {
    const res = await worker.fetch(new Request('http://localhost/api/health'), env as Env, createExecutionContext());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: pkg.version });
  });
});
