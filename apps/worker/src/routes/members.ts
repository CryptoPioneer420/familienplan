import { Hono } from 'hono';
import { z } from 'zod';
import { addMember, listHouseholdMembers, type Member } from '../db/members';
import { HttpError } from '../lib/errors';
import { parseJsonBody } from '../lib/validation';
import { getMember, requireMember, requireOwner } from '../middleware/auth';
import type { AppEnv, Runtime } from '../types';

/**
 * `strictObject`: unbekannte Felder (z. B. ein eingeschmuggeltes `householdId`) => 400.
 * Der Haushalt kommt nie aus dem Body, sondern aus der Mitgliedschaft des Aufrufers.
 */
const addMemberBody = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  displayName: z.string().trim().min(1).max(80).optional(),
});

function toPublicMember(member: Member) {
  return {
    id: member.id,
    email: member.email,
    role: member.role,
    displayName: member.displayName,
    createdAt: member.createdAt,
  };
}

export function memberRoutes(rt: Runtime) {
  return new Hono<AppEnv>()
    .get('/members', requireMember(rt), async (c) => {
      const { householdId } = getMember(c);
      const members = await listHouseholdMembers(c.env.DB, householdId);
      return c.json({ members: members.map(toPublicMember) });
    })
    .post('/members', requireMember(rt), requireOwner, async (c) => {
      const { householdId } = getMember(c);
      const body = await parseJsonBody(c, addMemberBody);
      const result = await addMember(
        c.env.DB,
        {
          householdId,
          email: body.email,
          ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
        },
        rt,
      );
      if (result.kind === 'conflict') {
        throw new HttpError(409, 'conflict', 'This email address cannot be added.');
      }
      return c.json({ member: toPublicMember(result.member) });
    });
}
