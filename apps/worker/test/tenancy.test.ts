import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApi, type Api } from './helpers/app';
import { seedHousehold } from './helpers/db';
import { createTestKey } from './helpers/jwt';

const A1 = 'a1@example.com'; // Owner Haushalt A
const A2 = 'a2@example.com'; // Member Haushalt A
const B1 = 'b1@example.com'; // Owner Haushalt B

let api: Api;
beforeAll(async () => {
  api = createTestApi(await createTestKey());
});

beforeEach(async () => {
  await seedHousehold(env.DB, { id: 'household-a', name: 'A' }, [
    { id: 'member-a1', email: A1, role: 'owner', displayName: 'Alice' },
    { id: 'member-a2', email: A2, role: 'member', displayName: 'Alex' },
  ]);
  await seedHousehold(env.DB, { id: 'household-b', name: 'B' }, [
    { id: 'member-b1', email: B1, role: 'owner', displayName: 'Bea' },
  ]);
});

type Members = { members: Array<{ id: string; email: string }> };

describe('Mandantentrennung', () => {
  it('jeder Haushalt sieht nur die eigenen Mitglieder', async () => {
    const a = (await (await api.asUser(A1, '/api/members')).json()) as Members;
    const a2 = (await (await api.asUser(A2, '/api/members')).json()) as Members;
    const b = (await (await api.asUser(B1, '/api/members')).json()) as Members;
    expect(a.members.map((m) => m.id).sort()).toEqual(['member-a1', 'member-a2']);
    expect(a2.members.map((m) => m.id).sort()).toEqual(['member-a1', 'member-a2']);
    expect(b.members.map((m) => m.id)).toEqual(['member-b1']);
  });

  it('/api/me liefert den Haushalt aus der Mitgliedschaft', async () => {
    expect(await (await api.asUser(A2, '/api/me')).json()).toEqual({
      memberId: 'member-a2',
      householdId: 'household-a',
      role: 'member',
      displayName: 'Alex',
    });
    expect(await (await api.asUser(B1, '/api/me')).json()).toMatchObject({ householdId: 'household-b' });
  });

  it('ignoriert Haushalts-IDs aus Query und Headern', async () => {
    const res = await api.asUser(A1, '/api/members?householdId=household-b&household_id=household-b', {
      headers: { 'X-Household-Id': 'household-b' },
    });
    const { members } = (await res.json()) as Members;
    expect(members.map((m) => m.id).sort()).toEqual(['member-a1', 'member-a2']);
  });

  it('akzeptiert keine Haushalts-ID im Body (400), auch nicht für den Owner', async () => {
    const res = await api.asUser(A1, '/api/members', {
      method: 'POST',
      body: { email: 'new@example.com', householdId: 'household-b' },
    });
    expect(res.status).toBe(400);
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM members WHERE household_id = ?1')
      .bind('household-b')
      .first<{ n: number }>();
    expect(count?.n).toBe(1);
  });

  it('neue Mitglieder landen im Haushalt des Aufrufers und sind für den anderen Haushalt unsichtbar', async () => {
    const res = await api.asUser(A1, '/api/members', { method: 'POST', body: { email: 'new@example.com' } });
    expect(res.status).toBe(200);
    const row = await env.DB.prepare('SELECT household_id FROM members WHERE email = ?1')
      .bind('new@example.com')
      .first<{ household_id: string }>();
    expect(row?.household_id).toBe('household-a');

    const b = (await (await api.asUser(B1, '/api/members')).json()) as Members;
    expect(b.members.map((m) => m.email)).toEqual([B1]);
  });

  it('eine E-Mail, die zu einem anderen Haushalt gehört, wird nicht übernommen (409) und bleibt dort unverändert', async () => {
    const res = await api.asUser(A1, '/api/members', {
      method: 'POST',
      body: { email: B1, displayName: 'Hijack' },
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('conflict');
    expect(JSON.stringify(body)).not.toMatch(/household-b|Bea|member-b1/);

    const row = await env.DB.prepare('SELECT household_id, display_name, role FROM members WHERE id = ?1')
      .bind('member-b1')
      .first<{ household_id: string; display_name: string; role: string }>();
    expect(row).toEqual({ household_id: 'household-b', display_name: 'Bea', role: 'owner' });
  });

  it('Owner von Haushalt A ist in Haushalt B nicht Owner: ein Member von B kann nicht hinzufügen', async () => {
    await env.DB.prepare('INSERT INTO members (id, household_id, email, role, created_at) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind('member-b2', 'household-b', 'b2@example.com', 'member', 1)
      .run();
    const res = await api.asUser('b2@example.com', '/api/members', { method: 'POST', body: { email: 'x@example.com' } });
    expect(res.status).toBe(403);
  });
});
