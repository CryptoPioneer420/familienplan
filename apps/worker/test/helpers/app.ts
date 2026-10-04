import { env as workerEnv } from 'cloudflare:workers';
import { createApp } from '../../src/app';
import type { Env } from '../../src/env';
import type { AppDeps } from '../../src/types';
import { keySetFor, signAccessJwt, type TestKey } from './jwt';

/** Env mit den Test-Bindings (vitest.config.ts); einzelne Werte pro Test überschreibbar. */
export function testEnv(overrides: Partial<Env> = {}): Env {
  return { ...(workerEnv as Env), ...overrides };
}

export interface CallOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  /** Rohtext statt JSON-Serialisierung von `body`. */
  rawBody?: string;
  env?: Env;
}

export interface Api {
  app: ReturnType<typeof createApp>;
  call(path: string, options?: CallOptions): Promise<Response>;
  /** Wie `call`, aber mit gültigem Access-JWT für `email`. */
  asUser(email: string, path: string, options?: CallOptions): Promise<Response>;
}

/** App mit lokalem Schlüsselsatz (statt Remote-JWKS) und echter D1 aus den Test-Bindings. */
export function createTestApi(key: TestKey, deps: AppDeps = {}): Api {
  const app = createApp({ auth: { resolveKeySet: () => keySetFor(key) }, ...deps });

  const call: Api['call'] = (path, options = {}) => {
    const headers = new Headers(options.headers);
    let body: string | undefined = options.rawBody;
    if (body === undefined && options.body !== undefined) {
      body = JSON.stringify(options.body);
      if (!headers.has('content-type')) headers.set('content-type', 'application/json');
    }
    const init: RequestInit = { method: options.method ?? 'GET', headers };
    if (body !== undefined) init.body = body;
    return Promise.resolve(app.request(path, init, options.env ?? testEnv()));
  };

  const asUser: Api['asUser'] = async (email, path, options = {}) => {
    const token = await signAccessJwt({ email, key });
    return call(path, { ...options, headers: { 'Cf-Access-Jwt-Assertion': token, ...options.headers } });
  };

  return { app, call, asUser };
}
