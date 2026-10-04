import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApi, type Api } from './helpers/app';
import { resetDb, seedHousehold } from './helpers/db';
import { createTestKey } from './helpers/jwt';

const OWNER = 'owner@example.com';
const WIFE = 'wife@example.com';
const OTHER = 'other@example.com';

let api: Api;
beforeAll(async () => {
  api = createTestApi(await createTestKey());
});

const item = (id: string, label = id, aisle = 'produce') => ({ id, ingredientId: id, label, qty: 500, unit: 'g', aisle, note: null });
const put = (as: string, items: unknown[], list = 'week-2026-10-05') => api.asUser(as, `/api/shopping-lists/${list}`, { method: 'PUT', body: { items } });
const current = async (as: string, q = '') => (await api.asUser(as, `/api/shopping-lists/current${q}`)).json() as Promise<any>;

beforeEach(async () => {
  await resetDb(env.DB);
  await seedHousehold(env.DB, { id: 'h1' }, [
    { id: 'm-owner', email: OWNER, role: 'owner', displayName: 'Peter' },
    { id: 'm-wife', email: WIFE, displayName: 'Anna' },
  ]);
  await seedHousehold(env.DB, { id: 'h2' }, [{ id: 'm-other', email: OTHER, role: 'owner' }]);
});

describe('Veröffentlichen', () => {
  it('nur der Owner darf veröffentlichen', async () => {
    expect((await put(WIFE, [item('ei')])).status).toBe(403);
    expect((await put(OWNER, [item('ei')])).status).toBe(200);
  });

  it('beide Mitglieder sehen die Liste; ohne Liste kommt list:null', async () => {
    expect((await current(WIFE)).list).toBeNull();
    await put(OWNER, [item('ei', 'Eier'), item('anari', 'Anari', 'dairy_eggs')]);
    const wife = await current(WIFE);
    expect(wife.list.id).toBe('week-2026-10-05');
    expect(wife.list.items.map((i: any) => i.id).sort()).toEqual(['anari', 'ei']);
  });

  it('erneutes Veröffentlichen ist idempotent und erhält Haken; entfernte Artikel verschwinden', async () => {
    await put(OWNER, [item('ei'), item('anari')]);
    await api.asUser(WIFE, '/api/shopping-lists/week-2026-10-05/items/ei', { method: 'PATCH', body: { checked: true } });
    await put(OWNER, [item('ei', 'Eier neu'), item('lamm')]);
    const l = (await current(OWNER)).list;
    expect(l.items.map((i: any) => i.id).sort()).toEqual(['ei', 'lamm']);
    const ei = l.items.find((i: any) => i.id === 'ei');
    expect(ei).toMatchObject({ label: 'Eier neu', checked: true, checkedByName: 'Anna' });
    expect(l.items.find((i: any) => i.id === 'lamm').checked).toBe(false);
  });

  it('eine neue Liste archiviert die alte; current liefert die neueste', async () => {
    await put(OWNER, [item('ei')], 'week-2026-10-05');
    await put(OWNER, [item('anari')], 'week-2026-10-12');
    expect((await current(OWNER)).list.id).toBe('week-2026-10-12');
  });

  it('validiert strikt: unbekannte Felder, doppelte IDs, falsche Gänge, zu viele Artikel', async () => {
    expect((await put(OWNER, [{ ...item('ei'), householdId: 'h2' }])).status).toBe(400);
    expect((await put(OWNER, [item('ei'), item('ei')])).status).toBe(400);
    expect((await put(OWNER, [item('ei', 'x', 'bogus')])).status).toBe(400);
    expect((await put(OWNER, Array.from({ length: 151 }, (_, i) => item(`i${i}`)))).status).toBe(400);
    expect((await put(OWNER, [item('ei')], 'bad id!')).status).toBe(400);
  });
});

describe('Abhaken', () => {
  beforeEach(async () => {
    await put(OWNER, [item('ei', 'Eier'), item('anari')]);
  });
  const patch = (as: string, id: string, checked: boolean) =>
    api.asUser(as, `/api/shopping-lists/week-2026-10-05/items/${id}`, { method: 'PATCH', body: { checked } });

  it('Haken wird gesetzt, ist idempotent und von der Gegenseite sichtbar; Revision steigt', async () => {
    const r0 = (await current(OWNER)).list.rev;
    expect((await patch(WIFE, 'ei', true)).status).toBe(200);
    expect((await patch(WIFE, 'ei', true)).status).toBe(200);
    const l = (await current(OWNER)).list;
    expect(l.rev).toBeGreaterThan(r0);
    expect(l.items.find((i: any) => i.id === 'ei')).toMatchObject({ checked: true, checkedByName: 'Anna' });
    await patch(OWNER, 'ei', false);
    expect((await current(WIFE)).list.items.find((i: any) => i.id === 'ei').checked).toBe(false);
  });

  it('unbekannter Artikel => 404, ungültiger Body => 400', async () => {
    expect((await patch(WIFE, 'gibtsnicht', true)).status).toBe(404);
    const bad = await api.asUser(WIFE, '/api/shopping-lists/week-2026-10-05/items/ei', { method: 'PATCH', body: { checked: 'ja' } });
    expect(bad.status).toBe(400);
  });

  it('?rev= mit aktuellem Stand liefert unchanged ohne Artikel', async () => {
    const rev = (await current(OWNER)).list.rev;
    const same = await current(WIFE, `?rev=${rev}`);
    expect(same).toEqual({ unchanged: true, list: { id: 'week-2026-10-05', rev } });
    await patch(WIFE, 'ei', true);
    expect((await current(OWNER, `?rev=${rev}`)).list.items).toHaveLength(2);
  });

  it('alles zurücksetzen: nur Owner', async () => {
    await patch(WIFE, 'ei', true);
    const url = '/api/shopping-lists/week-2026-10-05/uncheck-all';
    expect((await api.asUser(WIFE, url, { method: 'POST' })).status).toBe(403);
    expect((await api.asUser(OWNER, url, { method: 'POST' })).status).toBe(200);
    expect((await current(WIFE)).list.items.every((i: any) => !i.checked)).toBe(true);
  });
});

describe('Mandantentrennung', () => {
  it('derselbe Listenname in zwei Haushalten kollidiert nicht und ist gegenseitig unsichtbar', async () => {
    await put(OWNER, [item('ei', 'Eier h1')]);
    await put(OTHER, [item('ei', 'Eier h2')]);
    expect((await current(OWNER)).list.items[0].label).toBe('Eier h1');
    expect((await current(OTHER)).list.items[0].label).toBe('Eier h2');
  });

  it('fremder Haushalt kann Haken nicht setzen (404) und nichts verändern', async () => {
    await put(OWNER, [item('ei')]);
    const res = await api.asUser(OTHER, '/api/shopping-lists/week-2026-10-05/items/ei', { method: 'PATCH', body: { checked: true } });
    expect(res.status).toBe(404);
    expect((await current(OWNER)).list.items[0].checked).toBe(false);
  });

  it('ohne Login 401', async () => {
    expect((await api.call('/api/shopping-lists/current')).status).toBe(401);
  });
});
