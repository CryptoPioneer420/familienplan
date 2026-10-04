import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { selectAuthProvider } from '../auth';
import { bootstrapOwner, findMemberByEmail, type Member } from '../db/members';
import { forbidden, unauthenticated } from '../lib/errors';
import type { AppEnv, Runtime } from '../types';

function isOwnerEmail(email: string, ownerEmail: string | undefined): boolean {
  const owner = (ownerEmail ?? '').trim().toLowerCase();
  return owner !== '' && owner === email;
}

/**
 * Schützt eine Route: authentifiziert über den konfigurierten AuthProvider, löst die Mitgliedschaft auf
 * (ggf. Owner-Bootstrap) und legt den Member in den Kontext. Der Haushalt kommt ausschließlich von hier.
 *
 * - kein/ungültiges Token => 401 `unauthenticated`
 * - authentifiziert, aber kein Member (und nicht Owner-Bootstrap) => 403 `forbidden`
 *   (gleiche Antwort für jede unbekannte Identität: keine Existenz-Informationen)
 * - Auth-Konfiguration unvollständig => 503 (siehe `selectAuthProvider`)
 */
export function requireMember(rt: Runtime) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const provider = selectAuthProvider(c.env, {
      resolveKeySet: rt.auth.resolveKeySet,
      onReject: (reason) => c.set('authReason', reason),
    });

    const identity = await provider.authenticate(c.req.raw, c.env);
    if (!identity) throw unauthenticated();

    let member = await findMemberByEmail(c.env.DB, identity.email);
    if (!member && isOwnerEmail(identity.email, c.env.OWNER_EMAIL)) {
      const result = await bootstrapOwner(c.env.DB, identity.email, rt);
      if (result) {
        member = result.member;
        if (result.created) c.set('bootstrapped', true);
      }
    }
    if (!member) throw forbidden();

    c.set('member', member);
    await next();
  });
}

/** Nur für Routen hinter `requireMember`. Fehlt der Member, ist das ein Programmierfehler => 500. */
export function getMember(c: Context<AppEnv>): Member {
  const member = c.get('member');
  if (!member) throw new Error('getMember called on a route without requireMember');
  return member;
}

export const requireOwner = createMiddleware<AppEnv>(async (c, next) => {
  if (getMember(c).role !== 'owner') throw forbidden('Owner role required.');
  await next();
});
