import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach } from 'vitest';
import { resetDb } from './helpers/db';

// Echte Migration (../../migrations/0001_init.sql) gegen echtes D1 (Miniflare/workerd).
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

beforeEach(async () => {
  await resetDb(env.DB);
});
