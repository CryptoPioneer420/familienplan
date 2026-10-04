import { z } from 'zod';

/** Zeile aus `members` (migrations/0001_init.sql), per Zod geprüft statt blind gecastet. */
const memberRowSchema = z.object({
  id: z.string(),
  household_id: z.string(),
  email: z.string(),
  role: z.enum(['owner', 'member']),
  display_name: z.string().nullable(),
  created_at: z.number(),
});

export type MemberRole = 'owner' | 'member';

export interface Member {
  id: string;
  householdId: string;
  email: string;
  role: MemberRole;
  displayName: string | null;
  createdAt: number;
}

const MEMBER_COLUMNS = 'id, household_id, email, role, display_name, created_at';

function toMember(raw: unknown): Member {
  const row = memberRowSchema.parse(raw);
  return {
    id: row.id,
    householdId: row.household_id,
    email: row.email,
    role: row.role,
    displayName: row.display_name,
    createdAt: row.created_at,
  };
}

export const DEFAULT_HOUSEHOLD_NAME = 'Familie';

/**
 * Löst die Mitgliedschaft des authentifizierten Subjekts auf. Das ist der EINZIGE Weg, auf dem
 * ein Haushalt in einen Request gelangt (E-Mail aus dem verifizierten Token => Member => household_id).
 * `email` muss normalisiert (kleingeschrieben) sein; die Spalte hat zusätzlich COLLATE NOCASE.
 */
export async function findMemberByEmail(db: D1Database, email: string): Promise<Member | null> {
  const row = await db
    .prepare(`SELECT ${MEMBER_COLUMNS} FROM members WHERE email = ?1`)
    .bind(email)
    .first<unknown>();
  return row ? toMember(row) : null;
}

export async function listHouseholdMembers(db: D1Database, householdId: string): Promise<Member[]> {
  const { results } = await db
    .prepare(`SELECT ${MEMBER_COLUMNS} FROM members WHERE household_id = ?1 ORDER BY created_at, id`)
    .bind(householdId)
    .all<unknown>();
  return results.map(toMember);
}

export interface Clock {
  now: () => number;
  newId: () => string;
}

/**
 * Owner-Bootstrap: legt Haushalt + Owner an, aber nur wenn `households` leer ist und die E-Mail
 * noch keinem Member gehört. Idempotent und race-sicher: beide INSERTs laufen in EINEM
 * `db.batch` (eine Transaktion) und schützen sich selbst per `WHERE NOT EXISTS`. Zwei parallele
 * Erstanfragen serialisieren in D1; die zweite findet den Haushalt bereits vor und fügt nichts ein.
 * Das Ergebnis wird danach immer neu gelesen (die Gewinner-Zeile kann von der parallelen Anfrage stammen);
 * `created` sagt, ob DIESER Aufruf den Owner angelegt hat. `null`: Haushalt existiert bereits, E-Mail ist kein Member.
 */
export async function bootstrapOwner(
  db: D1Database,
  email: string,
  clock: Clock,
): Promise<{ member: Member; created: boolean } | null> {
  const householdId = clock.newId();
  const memberId = clock.newId();
  const now = clock.now();

  await db.batch([
    db
      .prepare(
        `INSERT INTO households (id, name, created_at)
         SELECT ?1, ?2, ?3
         WHERE NOT EXISTS (SELECT 1 FROM households)`,
      )
      .bind(householdId, DEFAULT_HOUSEHOLD_NAME, now),
    db
      .prepare(
        `INSERT INTO members (id, household_id, email, role, display_name, created_at)
         SELECT ?1, ?2, ?3, 'owner', NULL, ?4
         WHERE EXISTS (SELECT 1 FROM households WHERE id = ?2)
           AND NOT EXISTS (SELECT 1 FROM members WHERE email = ?3)`,
      )
      .bind(memberId, householdId, email, now),
  ]);

  const member = await findMemberByEmail(db, email);
  return member ? { member, created: member.id === memberId } : null;
}

export type AddMemberResult = { kind: 'ok'; member: Member } | { kind: 'conflict' };

/**
 * Fügt ein Mitglied (Rolle immer "member") zum Haushalt hinzu. Idempotent: gleiche E-Mail im
 * selben Haushalt liefert die bestehende Zeile (ein mitgegebener `displayName` wird übernommen).
 * `ON CONFLICT(email) DO NOTHING` + anschließendes Lesen im selben Batch macht parallele
 * Aufrufe duplikatfrei. Gehört die E-Mail bereits einem ANDEREN Haushalt (UNIQUE(email) in v1),
 * wird `conflict` gemeldet, ohne Details dieses Haushalts preiszugeben.
 */
export async function addMember(
  db: D1Database,
  input: { householdId: string; email: string; displayName?: string },
  clock: Clock,
): Promise<AddMemberResult> {
  const [, selected] = await db.batch([
    db
      .prepare(
        `INSERT INTO members (id, household_id, email, role, display_name, created_at)
         VALUES (?1, ?2, ?3, 'member', ?4, ?5)
         ON CONFLICT(email) DO NOTHING`,
      )
      .bind(clock.newId(), input.householdId, input.email, input.displayName ?? null, clock.now()),
    db.prepare(`SELECT ${MEMBER_COLUMNS} FROM members WHERE email = ?1`).bind(input.email),
  ]);

  const raw = selected?.results[0];
  if (raw === undefined) throw new Error('members row missing after insert');
  const member = toMember(raw);
  if (member.householdId !== input.householdId) return { kind: 'conflict' };

  if (input.displayName !== undefined && input.displayName !== member.displayName) {
    await db
      .prepare(`UPDATE members SET display_name = ?1 WHERE id = ?2 AND household_id = ?3`)
      .bind(input.displayName, member.id, input.householdId)
      .run();
    return { kind: 'ok', member: { ...member, displayName: input.displayName } };
  }
  return { kind: 'ok', member };
}
