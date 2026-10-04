import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApi, type Api } from './helpers/app';
import { count } from './helpers/db';
import { createTestKey } from './helpers/jwt';

const OWNER = 'owner@example.com';
const WIFE = 'wife@example.com';

let api: Api;
beforeAll(async () => {
  api = createTestApi(await createTestKey());
});

type PublicMember = { id: string; email: string; role: string; displayName: string | null; createdAt: number };

async function postMember(email: string, body: Record<string, unknown> = {}, as = OWNER): Promise<Response> {
  return api.asUser(as, '/api/members', { method: 'POST', body: { email, ...body } });
}

beforeEach(async () => {
  // Owner-Bootstrap über die API (erster Login)
  expect((await api.asUser(OWNER, '/api/me')).status).toBe(200);
});

describe('GET /api/me', () => {
  it('liefert memberId, householdId, role, displayName', async () => {
    const me = (await (await api.asUser(OWNER, '/api/me')).json()) as Record<string, unknown>;
    expect(Object.keys(me).sort()).toEqual(['displayName', 'householdId', 'memberId', 'role']);
    expect(me.role).toBe('owner');
  });
});

describe('POST /api/members', () => {
  it('Owner fügt ein Mitglied hinzu; E-Mail wird kleingeschrieben gespeichert', async () => {
    const res = await postMember('  Wife@Example.COM ', { displayName: ' Anna ' });
    expect(res.status).toBe(200);
    const { member } = (await res.json()) as { member: PublicMember };
    expect(member).toMatchObject({ email: WIFE, role: 'member', displayName: 'Anna' });

    const row = await env.DB.prepare('SELECT email FROM members WHERE id = ?1').bind(member.id).first<{ email: string }>();
    expect(row?.email).toBe(WIFE);
  });

  it('ist idempotent: derselbe Request zweimal => zweimal 200, derselbe Member, keine Duplikate', async () => {
    const first = await postMember(WIFE, { displayName: 'Anna' });
    const second = await postMember(WIFE, { displayName: 'Anna' });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(await first.json());
    expect(await count(env.DB, 'members')).toBe(2); // Owner + Wife
  });

  it('erkennt dieselbe E-Mail in anderer Schreibweise als denselben Member', async () => {
    const a = (await (await postMember('wife@example.com')).json()) as { member: PublicMember };
    const b = (await (await postMember('WIFE@Example.com')).json()) as { member: PublicMember };
    expect(b.member.id).toBe(a.member.id);
    expect(await count(env.DB, 'members')).toBe(2);
  });

  it('parallele identische Requests erzeugen genau einen Member', async () => {
    const responses = await Promise.all(Array.from({ length: 5 }, () => postMember(WIFE)));
    for (const res of responses) expect(res.status).toBe(200);
    const ids = (await Promise.all(responses.map((r) => r.json()))) as Array<{ member: PublicMember }>;
    expect(new Set(ids.map((b) => b.member.id)).size).toBe(1);
    expect(await count(env.DB, 'members')).toBe(2);
  });

  it('übernimmt einen geänderten displayName, lässt ihn ohne Angabe unverändert', async () => {
    await postMember(WIFE, { displayName: 'Anna' });
    const renamed = (await (await postMember(WIFE, { displayName: 'Anna M.' })).json()) as { member: PublicMember };
    expect(renamed.member.displayName).toBe('Anna M.');
    const untouched = (await (await postMember(WIFE)).json()) as { member: PublicMember };
    expect(untouched.member.displayName).toBe('Anna M.');
  });

  it('das neue Mitglied kann sich anmelden (Rolle member, eigener displayName)', async () => {
    await postMember(WIFE, { displayName: 'Anna' });
    const me = (await (await api.asUser(WIFE, '/api/me')).json()) as Record<string, unknown>;
    expect(me).toMatchObject({ role: 'member', displayName: 'Anna' });
  });

  it('Nicht-Owner bekommt 403', async () => {
    await postMember(WIFE);
    const res = await postMember('third@example.com', {}, WIFE);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('forbidden');
    expect(await count(env.DB, 'members')).toBe(2);
  });

  it('der Owner kann keine Rolle vergeben (role im Body => 400)', async () => {
    const res = await postMember('x@example.com', { role: 'owner' });
    expect(res.status).toBe(400);
  });

  describe('Validierung', () => {
    const bad: Array<[string, unknown, string]> = [
      ['E-Mail fehlt', {}, 'email'],
      ['E-Mail ungültig', { email: 'not-an-email' }, 'email'],
      ['E-Mail kein String', { email: 42 }, 'email'],
      ['displayName leer', { email: 'a@example.com', displayName: '   ' }, 'displayName'],
      ['displayName zu lang', { email: 'a@example.com', displayName: 'x'.repeat(81) }, 'displayName'],
      ['unbekanntes Feld', { email: 'a@example.com', householdId: 'h-evil' }, 'householdId'],
    ];
    it.each(bad)('400 invalid_request mit Feldliste: %s', async (_name, body, field) => {
      const res = await api.asUser(OWNER, '/api/members', { method: 'POST', body });
      expect(res.status).toBe(400);
      const { error } = (await res.json()) as { error: { code: string; fields: Array<{ path: string; message: string }> } };
      expect(error.code).toBe('invalid_request');
      expect(error.fields.map((f) => f.path)).toContain(field);
      expect(await count(env.DB, 'members')).toBe(1);
    });

    it('400 bei kaputtem JSON', async () => {
      const res = await api.asUser(OWNER, '/api/members', {
        method: 'POST',
        rawBody: '{"email": ',
        headers: { 'content-type': 'application/json' },
      });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe('invalid_request');
    });

    it('400 bei Body, der kein Objekt ist', async () => {
      const res = await api.asUser(OWNER, '/api/members', { method: 'POST', body: ['a@example.com'] });
      expect(res.status).toBe(400);
    });

    it('415 ohne Content-Type: application/json (CSRF-Schutz)', async () => {
      const res = await api.asUser(OWNER, '/api/members', {
        method: 'POST',
        rawBody: JSON.stringify({ email: 'a@example.com' }),
        headers: { 'content-type': 'text/plain' },
      });
      expect(res.status).toBe(415);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe('unsupported_media_type');
      expect(await count(env.DB, 'members')).toBe(1);
    });

    it('413 bei zu großem Body', async () => {
      const res = await api.asUser(OWNER, '/api/members', {
        method: 'POST',
        body: { email: 'a@example.com', displayName: 'x'.repeat(20_000) },
      });
      expect(res.status).toBe(413);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe('payload_too_large');
    });
  });
});

describe('GET /api/members', () => {
  it('listet die Mitglieder des eigenen Haushalts, für Owner und Member', async () => {
    await postMember(WIFE, { displayName: 'Anna' });
    for (const who of [OWNER, WIFE]) {
      const res = await api.asUser(who, '/api/members');
      expect(res.status).toBe(200);
      const { members } = (await res.json()) as { members: PublicMember[] };
      expect(members.map((m) => m.email).sort()).toEqual([OWNER, WIFE]);
      expect(members.find((m) => m.email === OWNER)?.role).toBe('owner');
    }
  });
});
