import { beforeAll, describe, expect, it } from 'vitest';
import { createTestApi, type Api } from './helpers/app';
import { createTestKey } from './helpers/jwt';

/** Einzige Routen unter /api, die ohne Login erreichbar sein dürfen. */
const PUBLIC_ROUTES = new Set(['GET /api/health']);

let api: Api;
beforeAll(async () => {
  api = createTestApi(await createTestKey());
});

describe('Routenschutz (Regressionswächter für künftige Routen, z. B. /api/sync)', () => {
  const routesOf = () =>
    api.app.routes
      .filter((r) => r.method !== 'ALL' && (r.path === '/api' || r.path.startsWith('/api/')))
      .map((r) => ({ method: r.method, path: r.path, key: `${r.method} ${r.path}` }));

  it('kennt die erwarteten Routen (Wächter ist nicht leer)', () => {
    const keys = new Set(routesOf().map((r) => r.key));
    for (const expected of ['GET /api/health', 'GET /api/me', 'GET /api/members', 'POST /api/members']) {
      expect(keys.has(expected), expected).toBe(true);
    }
  });

  it('jede /api-Route außer der Allowlist verlangt Authentifizierung (401 ohne Login)', async () => {
    for (const route of routesOf()) {
      if (PUBLIC_ROUTES.has(route.key)) continue;
      const res = await api.call(route.path.replace(/:[^/]+/g, 'x'), { method: route.method });
      expect(res.status, route.key).toBe(401);
    }
  });
});
