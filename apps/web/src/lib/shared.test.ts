import { describe, expect, it } from 'vitest';
import { loadKnownMe } from './me';
import {
  api,
  effectiveChecked,
  fetchCurrent,
  LIST_CACHE_KEY,
  loadCachedList,
  loadPending,
  patchChecked,
  PENDING_KEY,
  pendingKey,
  publishList,
  saveCachedList,
  savePending,
  type SharedList,
} from './shared';

const respond = (init: ResponseInit & { body?: string; type?: ResponseType }): typeof fetch =>
  (async () => {
    const r = new Response(init.body ?? '', init);
    if (init.type) Object.defineProperty(r, 'type', { value: init.type });
    return r;
  }) as typeof fetch;
const json = (status: number, body: unknown) => respond({ status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

function memStore(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    raw: m,
  };
}

const list: SharedList = {
  id: 'week-2026-09-28',
  rev: 3,
  updatedAt: 1,
  items: [
    { id: 'a', ingredientId: 'a', label: 'Anari', qty: 500, unit: 'g', aisle: 'dairy_eggs', note: null, checked: false, checkedByName: null, checkedAt: null },
    { id: 'b', ingredientId: 'b', label: 'Horta', qty: 800, unit: 'g', aisle: 'produce', note: null, checked: true, checkedByName: 'Anna', checkedAt: 2 },
  ],
};

describe('api()', () => {
  it('JSON 200 → ok', async () => expect(await api('/x', {}, json(200, { a: 1 }))).toEqual({ kind: 'ok', data: { a: 1 } }));
  it('HTML 200 (Login-Seite) → login-required, nie ok', async () => {
    expect(await api('/x', {}, respond({ status: 200, headers: { 'content-type': 'text/html' }, body: '<html/>' }))).toEqual({ kind: 'login-required' });
  });
  it('Redirect und 401 → login-required', async () => {
    expect(await api('/x', {}, respond({ status: 200, type: 'opaqueredirect' }))).toEqual({ kind: 'login-required' });
    expect(await api('/x', {}, json(401, {}))).toEqual({ kind: 'login-required' });
  });
  it('403 → forbidden, 404 → not-found, 500 → error mit Status', async () => {
    expect(await api('/x', {}, json(403, {}))).toEqual({ kind: 'forbidden' });
    expect(await api('/x', {}, json(404, {}))).toEqual({ kind: 'not-found' });
    expect(await api('/x', {}, json(500, {}))).toEqual({ kind: 'error', status: 500 });
  });
  it('Netzwerkfehler → error (Status null); Abbruch durch Timeout → offline', async () => {
    expect(await api('/x', {}, (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch)).toEqual({ kind: 'error', status: null });
    const hang = ((_u: string, init: RequestInit) => new Promise((_res, rej) => init.signal?.addEventListener('abort', () => rej(new DOMException('x', 'AbortError'))))) as unknown as typeof fetch;
    expect(await api('/x', {}, hang, 5)).toEqual({ kind: 'offline' });
  });
  it('sendet Methode, JSON-Body und redirect:manual', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const spy = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    await patchChecked('week-1', 'a b', true, spy);
    expect(seen!.url).toBe('/api/shopping-lists/week-1/items/a%20b');
    expect(seen!.init.method).toBe('PATCH');
    expect(seen!.init.redirect).toBe('manual');
    expect(seen!.init.body).toBe('{"checked":true}');
    await publishList('week-1', [], spy);
    expect(seen!.init.method).toBe('PUT');
    await fetchCurrent(7, spy);
    expect(seen!.url).toBe('/api/shopping-lists/current?rev=7');
    await fetchCurrent(null, spy);
    expect(seen!.url).toBe('/api/shopping-lists/current');
  });
});

describe('Warteschlange für Haken', () => {
  it('Roundtrip; leere Warteschlange entfernt den Eintrag', () => {
    const s = memStore();
    savePending(s, { [pendingKey('l', 'a')]: true });
    expect(loadPending(s)).toEqual({ 'l|a': true });
    savePending(s, {});
    expect(s.raw.has(PENDING_KEY)).toBe(false);
  });
  it('kaputte oder fremde Daten werden verworfen statt zu crashen', () => {
    expect(loadPending(memStore({ [PENDING_KEY]: '{kaputt' }))).toEqual({});
    expect(loadPending(memStore({ [PENDING_KEY]: '[1,2]' }))).toEqual({});
    expect(loadPending(memStore({ [PENDING_KEY]: JSON.stringify({ 'l|a': true, nokey: true, 'l|b': 'ja' }) }))).toEqual({ 'l|a': true });
    expect(loadPending(null)).toEqual({});
  });
  it('gesperrter Speicher wirft nicht', () => {
    const throwing = { setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('x'); } };
    expect(() => savePending(throwing, { 'l|a': true })).not.toThrow();
  });
  it('Warteschlange hat Vorrang vor dem Serverstand', () => {
    const [a, b] = list.items as [(typeof list.items)[0], (typeof list.items)[1]];
    expect(effectiveChecked(list, a, {})).toBe(false);
    expect(effectiveChecked(list, a, { [pendingKey(list.id, 'a')]: true })).toBe(true);
    expect(effectiveChecked(list, b, { [pendingKey(list.id, 'b')]: false })).toBe(false);
    expect(effectiveChecked(list, b, { [pendingKey('andere-liste', 'b')]: false })).toBe(true);
  });
});

describe('Listen-Zwischenspeicher', () => {
  it('Roundtrip', () => {
    const s = memStore();
    saveCachedList(s, list);
    expect(loadCachedList(s)).toEqual(list);
    saveCachedList(s, null);
    expect(s.raw.has(LIST_CACHE_KEY)).toBe(false);
  });
  it('ungültige Form → null', () => {
    expect(loadCachedList(memStore({ [LIST_CACHE_KEY]: '{"id":"x"}' }))).toBeNull();
    expect(loadCachedList(memStore({ [LIST_CACHE_KEY]: JSON.stringify({ id: 'x', rev: 1, items: [{ nope: 1 }] }) }))).toBeNull();
    expect(loadCachedList(memStore({ [LIST_CACHE_KEY]: 'nicht json' }))).toBeNull();
  });
});

describe('zuletzt bestätigte Mitgliedschaft', () => {
  it('liest gültige Daten, verwirft ungültige Rollen', () => {
    const ok = { memberId: 'm', householdId: 'h', role: 'member', displayName: 'Anna' };
    expect(loadKnownMe(memStore({ 'familienplan:me:v1': JSON.stringify(ok) }))).toEqual(ok);
    expect(loadKnownMe(memStore({ 'familienplan:me:v1': JSON.stringify({ ...ok, role: 'admin' }) }))).toBeNull();
    expect(loadKnownMe(memStore())).toBeNull();
  });
});
