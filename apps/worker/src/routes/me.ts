import { Hono } from 'hono';
import { getMember, requireMember } from '../middleware/auth';
import type { AppEnv, Runtime } from '../types';

export function meRoutes(rt: Runtime) {
  return new Hono<AppEnv>().get('/me', requireMember(rt), (c) => {
    const member = getMember(c);
    return c.json({
      memberId: member.id,
      householdId: member.householdId,
      role: member.role,
      displayName: member.displayName,
    });
  });
}
