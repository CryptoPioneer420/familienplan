/**
 * Minimaler API-Client. Wichtig für die iOS-Home-Screen-App: Läuft die Access-Sitzung ab, antwortet Cloudflare
 * mit einem Redirect auf die Login-Seite (oder mit HTML). Das ist KEINE gültige API-Antwort und wird nie gecacht
 * oder als Erfolg gewertet (`redirect: 'manual'`, Content-Type-Prüfung).
 */
export interface Me {
  memberId: string;
  householdId: string;
  role: 'owner' | 'member';
  displayName: string | null;
}

export type MeResult =
  | { kind: 'ok'; me: Me }
  /** Login abgelaufen oder nicht vorhanden (401, Redirect oder HTML-Login-Seite). */
  | { kind: 'login-required' }
  /** Angemeldet, aber nicht im Haushalt eingetragen (403). */
  | { kind: 'not-a-member' }
  /** Server ist noch nicht für den Login eingerichtet (503). */
  | { kind: 'server-not-ready' }
  | { kind: 'offline' }
  | { kind: 'error'; status: number | null };

function isMe(v: unknown): v is Me {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o['memberId'] === 'string' && typeof o['householdId'] === 'string' && (o['role'] === 'owner' || o['role'] === 'member');
}

export async function fetchMe(fetchImpl: typeof fetch = fetch, timeoutMs = 10_000): Promise<MeResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl('/api/me', {
      redirect: 'manual',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) return { kind: 'login-required' };
    if (res.status === 401) return { kind: 'login-required' };
    if (res.status === 403) return { kind: 'not-a-member' };
    if (res.status === 503) return { kind: 'server-not-ready' };
    if (!res.ok) return { kind: 'error', status: res.status };
    if (!(res.headers.get('content-type') ?? '').includes('application/json')) return { kind: 'login-required' };
    const body: unknown = await res.json();
    return isMe(body) ? { kind: 'ok', me: body } : { kind: 'error', status: res.status };
  } catch (err) {
    // Netzwerkfehler, Timeout oder ein vom Browser blockierter Redirect (Access-Login auf anderer Domain).
    const timedOut = err instanceof DOMException && err.name === 'AbortError';
    if (timedOut || (typeof navigator !== 'undefined' && navigator.onLine === false)) return { kind: 'offline' };
    return { kind: 'error', status: null };
  } finally {
    clearTimeout(timer);
  }
}
