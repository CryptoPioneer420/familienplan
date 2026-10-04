import { describe, expect, it } from 'vitest';
import { fetchMe } from './api';

const respond = (init: ResponseInit & { body?: string; type?: ResponseType }): typeof fetch =>
  (async () => {
    const r = new Response(init.body ?? '', init);
    if (init.type) Object.defineProperty(r, 'type', { value: init.type });
    return r;
  }) as typeof fetch;
const json = (status: number, body: unknown) => respond({ status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('fetchMe', () => {
  it('200 JSON → ok', async () => {
    const me = { memberId: 'm', householdId: 'h', role: 'owner', displayName: null };
    expect(await fetchMe(json(200, me))).toEqual({ kind: 'ok', me });
  });
  it('200 JSON mit falscher Form → error (kein blindes Vertrauen in die Antwort)', async () => {
    expect(await fetchMe(json(200, { foo: 1 }))).toEqual({ kind: 'error', status: 200 });
  });
  it('200 HTML (Access-Login-Seite) → login-required, nie ok', async () => {
    expect(await fetchMe(respond({ status: 200, headers: { 'content-type': 'text/html' }, body: '<html>Sign in</html>' }))).toEqual({ kind: 'login-required' });
  });
  it('Redirect (opaqueredirect oder 3xx) → login-required', async () => {
    expect(await fetchMe(respond({ status: 200, type: 'opaqueredirect' }))).toEqual({ kind: 'login-required' });
    expect(await fetchMe((async () => ({ type: 'basic', status: 302, ok: false, headers: new Headers() })) as unknown as typeof fetch)).toEqual({ kind: 'login-required' });
  });
  it('401 / 403 / 503 / 500 werden unterschieden', async () => {
    expect(await fetchMe(json(401, {}))).toEqual({ kind: 'login-required' });
    expect(await fetchMe(json(403, {}))).toEqual({ kind: 'not-a-member' });
    expect(await fetchMe(json(503, {}))).toEqual({ kind: 'server-not-ready' });
    expect(await fetchMe(json(500, {}))).toEqual({ kind: 'error', status: 500 });
  });
  it('Netzwerkfehler → error (Navigator-Status unbekannt) bzw. offline bei Timeout', async () => {
    const failing = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    expect((await fetchMe(failing)).kind).toBe('error');
    const hanging = ((_u: unknown, init?: RequestInit) =>
      new Promise((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))))) as typeof fetch;
    expect(await fetchMe(hanging, 20)).toEqual({ kind: 'offline' });
  });
  it('sendet redirect:manual und no-store', async () => {
    let seen: RequestInit | undefined;
    await fetchMe(((_u: unknown, init?: RequestInit) => {
      seen = init;
      return Promise.resolve(new Response('{}', { status: 401 }));
    }) as typeof fetch);
    expect(seen?.redirect).toBe('manual');
    expect(seen?.cache).toBe('no-store');
  });
});
