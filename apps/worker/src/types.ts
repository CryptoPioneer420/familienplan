import type { AuthOptions } from './auth';
import type { Member } from './db/members';
import type { Env } from './env';
import type { RequestLogLine } from './lib/log';

export interface Variables {
  requestId: string;
  /** Gesetzt von `requireMember`; Haushalt und Rolle stammen ausschließlich hieraus. */
  member?: Member;
  /** Nur für die Logzeile. */
  errorCode?: string;
  authReason?: string;
  bootstrapped?: true;
  errorInfo?: RequestLogLine['error'];
}

export type AppEnv = { Bindings: Env; Variables: Variables };

/** Abhängigkeiten, die Tests ersetzen können. Standardwerte siehe `createApp`. */
export interface AppDeps {
  /** Nur `resolveKeySet` ist von außen injizierbar (lokaler Schlüsselsatz in Tests). */
  auth?: Pick<AuthOptions, 'resolveKeySet'>;
  now?: () => number;
  newId?: () => string;
}

export interface Runtime {
  auth: Pick<AuthOptions, 'resolveKeySet'>;
  now: () => number;
  newId: () => string;
}
