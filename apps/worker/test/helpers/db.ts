const TABLES_CHILDREN_FIRST = [
  'shopping_items',
  'shopping_lists',
  'plans',
  'availability',
  'recipe_prefs',
  'pantry',
  'members',
  'households',
] as const;

export async function resetDb(db: D1Database): Promise<void> {
  await db.batch(TABLES_CHILDREN_FIRST.map((table) => db.prepare(`DELETE FROM ${table}`)));
}

export interface SeedMember {
  id: string;
  email: string;
  role?: 'owner' | 'member';
  displayName?: string | null;
}

/** Legt einen Haushalt samt Mitgliedern direkt per SQL an (am API-Bootstrap vorbei). */
export async function seedHousehold(
  db: D1Database,
  household: { id: string; name?: string },
  members: SeedMember[],
): Promise<void> {
  await db.batch([
    db
      .prepare('INSERT INTO households (id, name, created_at) VALUES (?1, ?2, ?3)')
      .bind(household.id, household.name ?? 'Seed', 1_700_000_000_000),
    ...members.map((m) =>
      db
        .prepare(
          'INSERT INTO members (id, household_id, email, role, display_name, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
        )
        .bind(m.id, household.id, m.email, m.role ?? 'member', m.displayName ?? null, 1_700_000_000_000),
    ),
  ]);
}

export async function count(db: D1Database, table: 'households' | 'members'): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>();
  return row?.n ?? 0;
}
