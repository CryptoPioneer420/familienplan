import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { VERSION } from '../version';

/** Öffentlich, ohne DB-Zugriff und ohne interne Details. */
export const healthRoutes = new Hono<AppEnv>().get('/health', (c) => c.json({ ok: true, version: VERSION }));
