import type { D1Migration } from 'cloudflare:test';
import type { Env as WorkerEnv } from '../src/env';

declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {
      /** Aus ../../migrations gelesen (vitest.config.ts), in test/setup.ts angewendet. */
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
