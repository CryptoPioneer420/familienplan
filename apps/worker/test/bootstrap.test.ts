import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestApi, testEnv, type Api } from './helpers/app';
import { count, seedHousehold } from './helpers/db';
import { createTestKey } from './helpers/jwt';

const OWNER = 'owner@example.com';
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let api: Api;
beforeAll(async () => {
  api = createTestApi(await createTestKey());
});

type Me = { memberId: string; householdId: string; role: string; displayName: string | null };

describe('Owner-Bootstrap', () => {
  it('legt beim ersten Login des Owners Haushalt + Owner an (UUIDv7, Zeit in ms)', async () => {
    const fixedNow = 1_760_000_000_123;
    const fixedApi = createTestApi(await createTestKey(), { now: () => fixedNow });
    const res = await fixedApi.asUser(OWNER, '/api/me');
    expect(res.status).toBe(200);
    const me = (await res.json()) as Me;
    expect(me.role).toBe('owner');
    expect(me.memberId).toMatch(UUID_V7);
    expect(me.householdId).toMatch(UUID_V7);

    const household = await env.DB.prepare('SELECT id, name, created_at FROM households').all<{
      id: string;
      name: string;
      created_at: number;
    }>();
    expect(household.results).toHaveLength(1);
    expect(household.results[0]).toMatchObject({ id: me.householdId, created_at: fixedNow });
    const member = await env.DB.prepare('SELECT * FROM members').all<{
      id: string;
      household_id: string;
      email: string;
      role: string;
      created_at: number;
    }>();
    expect(member.results).toEqual([
      expect.objectContaining({ id: me.memberId, household_id: me.householdId, email: OWNER, role: 'owner', created_at: fixedNow }),
    ]);
  });

  it('ist idempotent: weitere Logins legen nichts neu an', async () => {
    const first = (await (await api.asUser(OWNER, '/api/me')).json()) as Me;
    const second = (await (await api.asUser(OWNER, '/api/me')).json()) as Me;
    expect(second).toEqual(first);
    expect(await count(env.DB, 'households')).toBe(1);
    expect(await count(env.DB, 'members')).toBe(1);
  });

  it('legt bei parallelen Erstanfragen genau EINEN Haushalt und EINEN Member an', async () => {
    const responses = await Promise.all(Array.from({ length: 6 }, () => api.asUser(OWNER, '/api/me')));
    for (const res of responses) expect(res.status).toBe(200);
    const bodies = (await Promise.all(responses.map((r) => r.json()))) as Me[];
    expect(new Set(bodies.map((b) => b.memberId)).size).toBe(1);
    expect(new Set(bodies.map((b) => b.householdId)).size).toBe(1);
    expect(await count(env.DB, 'households')).toBe(1);
    expect(await count(env.DB, 'members')).toBe(1);
  });

  it('wirft für eine fremde E-Mail 403 und legt nichts an', async () => {
    const res = await api.asUser('stranger@example.com', '/api/me');
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: { code: 'forbidden', message: 'Access denied.' } });
    expect(await count(env.DB, 'households')).toBe(0);
    expect(await count(env.DB, 'members')).toBe(0);
  });

  it('fremde E-Mail bekommt vor und nach dem Bootstrap dieselbe 403-Antwort (keine Existenz-Informationen)', async () => {
    const before = await api.asUser('stranger@example.com', '/api/members');
    await api.asUser(OWNER, '/api/me'); // Bootstrap
    const after = await api.asUser('stranger@example.com', '/api/members');
    expect(before.status).toBe(403);
    expect(after.status).toBe(403);
    expect(await after.text()).toBe(await before.text());
  });

  it('ein Fremder kann den Bootstrap nicht auslösen, auch nicht parallel zum Owner', async () => {
    const [owner, stranger] = await Promise.all([
      api.asUser(OWNER, '/api/me'),
      api.asUser('stranger@example.com', '/api/me'),
    ]);
    expect(owner.status).toBe(200);
    expect(stranger.status).toBe(403);
    expect(await count(env.DB, 'members')).toBe(1);
  });

  it('OWNER_EMAIL wird case-insensitiv verglichen', async () => {
    const res = await api.asUser('owner@example.com', '/api/me', { env: testEnv({ OWNER_EMAIL: '  Owner@EXAMPLE.com ' }) });
    expect(res.status).toBe(200);
    expect(await count(env.DB, 'households')).toBe(1);
  });

  it('leere OWNER_EMAIL => niemand kann bootstrappen (403)', async () => {
    for (const email of [OWNER, 'a@b.c']) {
      const res = await api.asUser(email, '/api/me', { env: testEnv({ OWNER_EMAIL: '' }) });
      expect(res.status).toBe(403);
    }
    expect(await count(env.DB, 'households')).toBe(0);
  });

  it('legt keinen zweiten Haushalt an, wenn households nicht leer ist (Owner-E-Mail ohne Mitgliedschaft => 403)', async () => {
    await seedHousehold(env.DB, { id: 'h-existing' }, [{ id: 'm-existing', email: 'someone@example.com', role: 'owner' }]);
    const res = await api.asUser(OWNER, '/api/me');
    expect(res.status).toBe(403);
    expect(await count(env.DB, 'households')).toBe(1);
    expect(await count(env.DB, 'members')).toBe(1);
  });
});
