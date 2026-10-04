import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { uuidv7 } from './lib/id';
import { requestContext } from './middleware/context';
import { errorResponse, notFound, onError } from './middleware/errors';
import { healthRoutes } from './routes/health';
import { memberRoutes } from './routes/members';
import { meRoutes } from './routes/me';
import { shoppingRoutes } from './routes/shopping';
import type { AppDeps, AppEnv, Runtime } from './types';

const MAX_BODY_BYTES = 16 * 1024;

/**
 * Baut die Hono-App. `deps` existiert für Tests (lokaler JWKS, feste Uhr/IDs); Produktion nutzt die Defaults.
 *
 * Routenschutz ist explizit pro Route (`requireMember(rt)`), damit unbekannte /api-Pfade auch ohne
 * Login ein JSON-404 liefern. Ein Test (`routes-protection.test.ts`) stellt sicher, dass jede
 * künftige /api-Route außer der Allowlist (`GET /api/health`) ohne Login 401 liefert.
 */
export function createApp(deps: AppDeps = {}) {
  const rt: Runtime = {
    auth: deps.auth ?? {},
    now: deps.now ?? Date.now,
    newId: deps.newId ?? (() => uuidv7()),
  };

  const app = new Hono<AppEnv>();

  app.use('*', requestContext(rt));
  app.use(
    '/api/*',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => errorResponse(c, 413, 'payload_too_large', 'Request body is too large.'),
    }),
  );

  app.route('/api', healthRoutes);
  app.route('/api', meRoutes(rt));
  app.route('/api', memberRoutes(rt));
  app.route('/api', shoppingRoutes(rt));

  // Unbekannte /api-Pfade (und Methoden): JSON-404, nie die SPA.
  app.all('/api/*', notFound);

  // Alles andere gehört den Static Assets. Mit `run_worker_first: ["/api/*"]` erreicht das den Worker
  // normalerweise nie; der SPA-Fallback bleibt Sache der Assets-Konfiguration.
  app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

  app.notFound(notFound);
  app.onError(onError);
  return app;
}

export type App = ReturnType<typeof createApp>;
