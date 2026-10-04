import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      // Die ECHTE Migration aus dem Repo-Root wird in der Test-D1 angewendet (test/setup.ts).
      const migrations = await readD1Migrations(path.resolve(here, '../../migrations'));
      return {
        main: './src/index.ts',
        miniflare: {
          // Bewusst NICHT das Datum aus ../../wrangler.jsonc (2026-10-04): die lokal installierte workerd-Version
          // (via miniflare der Test-Pool) unterstützt höchstens 2026-08-22 und bricht bei neueren Daten ab.
          compatibilityDate: '2026-08-01',
          compatibilityFlags: ['nodejs_compat'],
          d1Databases: ['DB'],
          // Static-Assets-Stub: im echten Deployment ist das das Assets-Binding.
          serviceBindings: {
            ASSETS: async () => new Response('asset-stub', { headers: { 'content-type': 'text/plain' } }),
          },
          bindings: {
            ENVIRONMENT: 'test',
            AUTH_MODE: 'access',
            ACCESS_TEAM_DOMAIN: 'familienplan-test.cloudflareaccess.com',
            ACCESS_POLICY_AUD: 'test-aud-tag',
            OWNER_EMAIL: 'owner@example.com',
            TEST_MIGRATIONS: migrations,
          },
        },
      };
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    // Die JSON-Request-Logzeilen der App würden die Testausgabe fluten; test/logging.test.ts prüft sie gezielt.
    onConsoleLog: (log) => (log.startsWith('{"ts":') ? false : undefined),
  },
});
