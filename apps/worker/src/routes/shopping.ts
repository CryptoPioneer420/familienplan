import { Hono } from 'hono';
import { z } from 'zod';
import { AISLES, getCurrentList, publishList, setChecked, uncheckAll } from '../db/shopping';
import { HttpError } from '../lib/errors';
import { parseJsonBody } from '../lib/validation';
import { getMember, requireMember, requireOwner } from '../middleware/auth';
import type { AppEnv, Runtime } from '../types';

const clientId = z.string().regex(/^[A-Za-z0-9_.-]{1,60}$/);
const itemId = z.string().regex(/^[A-Za-z0-9_.-]{1,80}$/);

const publishBody = z.strictObject({
  items: z
    .array(
      z.strictObject({
        id: itemId,
        ingredientId: z.string().min(1).max(80).nullable(),
        label: z.string().trim().min(1).max(120),
        qty: z.number().finite().nonnegative().max(1e7).nullable(),
        unit: z.string().trim().min(1).max(16).nullable(),
        aisle: z.enum(AISLES),
        note: z.string().trim().min(1).max(80).nullable(),
      }),
    )
    .max(150)
    .refine((items) => new Set(items.map((i) => i.id)).size === items.length, 'Duplicate item id.'),
});
const checkBody = z.strictObject({ checked: z.boolean() });

function param(value: string | undefined, schema: z.ZodString): string {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new HttpError(400, 'invalid_request', 'Invalid identifier.');
  return parsed.data;
}

/**
 * Nur der Owner veröffentlicht die Liste (sie wird auf seinem Gerät aus Plan und Körperdaten berechnet);
 * jedes Mitglied liest und hakt ab. Manuelle Artikel gibt es bewusst nicht.
 */
export function shoppingRoutes(rt: Runtime) {
  return new Hono<AppEnv>()
    .get('/shopping-lists/current', requireMember(rt), async (c) => {
      const { householdId } = getMember(c);
      const raw = c.req.query('rev');
      const rev = raw !== undefined && /^\d{1,12}$/.test(raw) ? Number(raw) : null;
      const { list, unchanged } = await getCurrentList(c.env.DB, householdId, rev);
      return c.json(list === null ? { list: null } : unchanged ? { unchanged: true, list: { id: list.id, rev: list.rev } } : { list });
    })
    .put('/shopping-lists/:listId', requireMember(rt), requireOwner, async (c) => {
      const { householdId } = getMember(c);
      const clientListId = param(c.req.param('listId'), clientId);
      const body = await parseJsonBody(c, publishBody);
      const { rev } = await publishList(c.env.DB, { householdId, clientListId, items: body.items, now: rt.now() });
      return c.json({ id: clientListId, rev });
    })
    .patch('/shopping-lists/:listId/items/:itemId', requireMember(rt), async (c) => {
      const member = getMember(c);
      const clientListId = param(c.req.param('listId'), clientId);
      const clientItemId = param(c.req.param('itemId'), itemId);
      const { checked } = await parseJsonBody(c, checkBody);
      const ok = await setChecked(c.env.DB, { householdId: member.householdId, clientListId, clientItemId, memberId: member.id, checked, now: rt.now() });
      if (!ok) throw new HttpError(404, 'not_found', 'Resource not found.');
      return c.json({ ok: true });
    })
    .post('/shopping-lists/:listId/uncheck-all', requireMember(rt), requireOwner, async (c) => {
      const { householdId } = getMember(c);
      const clientListId = param(c.req.param('listId'), clientId);
      if (!(await uncheckAll(c.env.DB, { householdId, clientListId, now: rt.now() }))) throw new HttpError(404, 'not_found', 'Resource not found.');
      return c.json({ ok: true });
    });
}
