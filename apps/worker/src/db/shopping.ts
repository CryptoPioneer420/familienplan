import { z } from 'zod';

/**
 * Geteilte Einkaufsliste. Mandantentrennung: Die Datenbank-ID einer Liste ist `<householdId>:<clientListId>`,
 * die eines Artikels `<dbListId>:<clientItemId>`. Zwei Haushalte können daher dieselbe Client-ID nutzen,
 * und jede Abfrage filtert zusätzlich auf `household_id`.
 */

export const AISLES = ['produce', 'meat_fish', 'dairy_eggs', 'dry', 'frozen', 'other'] as const;
export type Aisle = (typeof AISLES)[number];

export interface PublishItem {
  id: string;
  ingredientId: string | null;
  label: string;
  qty: number | null;
  unit: string | null;
  aisle: Aisle;
  note: string | null;
}

export interface SharedItem extends PublishItem {
  checked: boolean;
  checkedByName: string | null;
  checkedAt: number | null;
}

export interface SharedList {
  id: string;
  rev: number;
  updatedAt: number;
  items: SharedItem[];
}

const listRow = z.object({ id: z.string(), rev: z.number(), updated_at: z.number() });
const itemRow = z.object({
  id: z.string(),
  ingredient_id: z.string().nullable(),
  label: z.string(),
  qty: z.number().nullable(),
  unit: z.string().nullable(),
  aisle: z.enum(AISLES),
  note: z.string().nullable(),
  checked: z.number(),
  checked_at: z.number().nullable(),
  checked_by_name: z.string().nullable(),
});

export const dbListId = (householdId: string, clientId: string): string => `${householdId}:${clientId}`;
export const dbItemId = (listDbId: string, clientId: string): string => `${listDbId}:${clientId}`;
const stripPrefix = (id: string, prefix: string): string => (id.startsWith(`${prefix}:`) ? id.slice(prefix.length + 1) : id);

export async function publishList(
  db: D1Database,
  input: { householdId: string; clientListId: string; items: PublishItem[]; now: number },
): Promise<{ rev: number }> {
  const { householdId, clientListId, items, now } = input;
  const listId = dbListId(householdId, clientListId);

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO shopping_lists (id, household_id, status, created_at, rev, updated_at)
         VALUES (?1, ?2, 'open', ?3, 1, ?3)
         ON CONFLICT(id) DO UPDATE SET status = 'open', rev = rev + 1, updated_at = ?3
         WHERE household_id = ?2`,
      )
      .bind(listId, householdId, now),
    // Alle Artikel zunächst als gelöscht markieren, die Upserts unten beleben die aktuellen wieder.
    // Abgehakt-Status bleibt dabei erhalten (gleiche Artikel-ID = gleicher Haken).
    db
      .prepare(`UPDATE shopping_items SET deleted = 1, updated_at = ?3 WHERE list_id = ?1 AND household_id = ?2 AND deleted = 0`)
      .bind(listId, householdId, now),
    ...items.map((it) =>
      db
        .prepare(
          `INSERT INTO shopping_items (id, list_id, household_id, ingredient_id, label, qty, unit, aisle, note, source, checked, deleted, rev, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?10, 'plan', 0, 0, 1, ?9)
           ON CONFLICT(id) DO UPDATE SET ingredient_id = ?4, label = ?5, qty = ?6, unit = ?7, aisle = ?8, note = ?10,
             deleted = 0, rev = rev + 1, updated_at = ?9
           WHERE household_id = ?3`,
        )
        .bind(dbItemId(listId, it.id), listId, householdId, it.ingredientId, it.label, it.qty, it.unit, it.aisle, now, it.note),
    ),
    db
      .prepare(`UPDATE shopping_lists SET status = 'archived', updated_at = ?3 WHERE household_id = ?1 AND id <> ?2 AND status = 'open'`)
      .bind(householdId, listId, now),
    db.prepare(`SELECT rev FROM shopping_lists WHERE id = ?1 AND household_id = ?2`).bind(listId, householdId),
  ];
  const results = await db.batch(statements);
  const rev = (results[results.length - 1]?.results[0] as { rev?: number } | undefined)?.rev;
  if (typeof rev !== 'number') throw new Error('shopping list missing after publish');
  return { rev };
}

/** Neueste offene Liste des Haushalts. Mit `knownRev` und unverändertem Stand entfällt die Artikelliste. */
export async function getCurrentList(
  db: D1Database,
  householdId: string,
  knownRev: number | null,
): Promise<{ list: SharedList | null; unchanged: boolean }> {
  const raw = await db
    .prepare(`SELECT id, rev, updated_at FROM shopping_lists WHERE household_id = ?1 AND status = 'open' ORDER BY updated_at DESC, id LIMIT 1`)
    .bind(householdId)
    .first<unknown>();
  if (!raw) return { list: null, unchanged: false };
  const head = listRow.parse(raw);
  const id = stripPrefix(head.id, householdId);
  if (knownRev !== null && knownRev === head.rev) return { list: { id, rev: head.rev, updatedAt: head.updated_at, items: [] }, unchanged: true };

  const { results } = await db
    .prepare(
      `SELECT i.id, i.ingredient_id, i.label, i.qty, i.unit, i.aisle, i.note, i.checked, i.checked_at, m.display_name AS checked_by_name
       FROM shopping_items i LEFT JOIN members m ON m.id = i.checked_by
       WHERE i.list_id = ?1 AND i.household_id = ?2 AND i.deleted = 0
       ORDER BY i.aisle, i.label, i.id`,
    )
    .bind(head.id, householdId)
    .all<unknown>();
  const items = results.map((r): SharedItem => {
    const row = itemRow.parse(r);
    return {
      id: stripPrefix(row.id, head.id),
      ingredientId: row.ingredient_id,
      label: row.label,
      qty: row.qty,
      unit: row.unit,
      aisle: row.aisle,
      note: row.note,
      checked: row.checked === 1,
      checkedByName: row.checked_by_name,
      checkedAt: row.checked_at,
    };
  });
  return { list: { id, rev: head.rev, updatedAt: head.updated_at, items }, unchanged: false };
}

/** Setzt den Haken idempotent. `false`: Artikel existiert im Haushalt nicht (oder ist gelöscht). */
export async function setChecked(
  db: D1Database,
  input: { householdId: string; clientListId: string; clientItemId: string; memberId: string; checked: boolean; now: number },
): Promise<boolean> {
  const listId = dbListId(input.householdId, input.clientListId);
  const itemId = dbItemId(listId, input.clientItemId);
  const exists = await db
    .prepare(`SELECT 1 AS x FROM shopping_items WHERE id = ?1 AND list_id = ?2 AND household_id = ?3 AND deleted = 0`)
    .bind(itemId, listId, input.householdId)
    .first<unknown>();
  if (!exists) return false;
  const c = input.checked ? 1 : 0;
  await db.batch([
    db
      .prepare(
        `UPDATE shopping_items SET checked = ?4, checked_by = ?5, checked_at = ?6, rev = rev + 1, updated_at = ?6
         WHERE id = ?1 AND list_id = ?2 AND household_id = ?3 AND checked <> ?4`,
      )
      .bind(itemId, listId, input.householdId, c, c ? input.memberId : null, input.now),
    // Listen-Revision immer erhöhen: Wiederholungen kosten nur einen zusätzlichen Abgleich der Gegenseite.
    db.prepare(`UPDATE shopping_lists SET rev = rev + 1, updated_at = ?3 WHERE id = ?1 AND household_id = ?2`).bind(listId, input.householdId, input.now),
  ]);
  return true;
}

export async function uncheckAll(db: D1Database, input: { householdId: string; clientListId: string; now: number }): Promise<boolean> {
  const listId = dbListId(input.householdId, input.clientListId);
  const list = await db.prepare(`SELECT 1 AS x FROM shopping_lists WHERE id = ?1 AND household_id = ?2`).bind(listId, input.householdId).first<unknown>();
  if (!list) return false;
  await db.batch([
    db
      .prepare(`UPDATE shopping_items SET checked = 0, checked_by = NULL, checked_at = NULL, rev = rev + 1, updated_at = ?3 WHERE list_id = ?1 AND household_id = ?2 AND checked = 1`)
      .bind(listId, input.householdId, input.now),
    db.prepare(`UPDATE shopping_lists SET rev = rev + 1, updated_at = ?3 WHERE id = ?1 AND household_id = ?2`).bind(listId, input.householdId, input.now),
  ]);
  return true;
}
