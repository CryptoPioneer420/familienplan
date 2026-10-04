/** Client für die geteilte Einkaufsliste (/api/shopping-lists). Nur Owner veröffentlicht; jedes Mitglied liest und hakt ab. */
export type Aisle = 'produce' | 'meat_fish' | 'dairy_eggs' | 'dry' | 'frozen' | 'other';

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

export type ApiResult<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'login-required' }
  | { kind: 'forbidden' }
  | { kind: 'not-found' }
  | { kind: 'offline' }
  | { kind: 'error'; status: number | null };

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 10_000,
): Promise<ApiResult<T>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { accept: 'application/json' };
    const req: RequestInit = { method: init.method ?? 'GET', redirect: 'manual', credentials: 'same-origin', cache: 'no-store', headers, signal: ctrl.signal };
    if (init.body !== undefined) {
      headers['content-type'] = 'application/json';
      req.body = JSON.stringify(init.body);
    }
    const res = await fetchImpl(path, req);
    if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400) || res.status === 401) return { kind: 'login-required' };
    if (res.status === 403) return { kind: 'forbidden' };
    if (res.status === 404) return { kind: 'not-found' };
    if (!res.ok) return { kind: 'error', status: res.status };
    if (!(res.headers.get('content-type') ?? '').includes('application/json')) return { kind: 'login-required' };
    return { kind: 'ok', data: (await res.json()) as T };
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === 'AbortError';
    if (timedOut || (typeof navigator !== 'undefined' && navigator.onLine === false)) return { kind: 'offline' };
    return { kind: 'error', status: null };
  } finally {
    clearTimeout(timer);
  }
}

export type CurrentResponse = { list: null } | { unchanged: true; list: { id: string; rev: number } } | { list: SharedList };

export const fetchCurrent = (knownRev: number | null, f?: typeof fetch) =>
  api<CurrentResponse>(`/api/shopping-lists/current${knownRev === null ? '' : `?rev=${knownRev}`}`, {}, f);
export const publishList = (listId: string, items: PublishItem[], f?: typeof fetch) =>
  api<{ id: string; rev: number }>(`/api/shopping-lists/${encodeURIComponent(listId)}`, { method: 'PUT', body: { items } }, f);
export const patchChecked = (listId: string, itemId: string, checked: boolean, f?: typeof fetch) =>
  api<{ ok: true }>(`/api/shopping-lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}`, { method: 'PATCH', body: { checked } }, f);
export const uncheckAllRemote = (listId: string, f?: typeof fetch) =>
  api<{ ok: true }>(`/api/shopping-lists/${encodeURIComponent(listId)}/uncheck-all`, { method: 'POST', body: {} }, f);

/* ---------- Offline-Warteschlange für Haken ---------- */

export const PENDING_KEY = 'familienplan:pending:v1';
export type Pending = Record<string, boolean>; // `${listId}|${itemId}` → gewünschter Zustand
export const pendingKey = (listId: string, itemId: string): string => `${listId}|${itemId}`;

export function loadPending(storage: Pick<Storage, 'getItem'> | null): Pending {
  try {
    const raw = storage?.getItem(PENDING_KEY);
    const v: unknown = raw ? JSON.parse(raw) : {};
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v).filter(([k, b]) => typeof b === 'boolean' && k.includes('|'))) as Pending;
  } catch {
    return {};
  }
}
export function savePending(storage: Pick<Storage, 'setItem' | 'removeItem'> | null, p: Pending): void {
  try {
    if (Object.keys(p).length) storage?.setItem(PENDING_KEY, JSON.stringify(p));
    else storage?.removeItem(PENDING_KEY);
  } catch {
    /* Speicher gesperrt: Warteschlange bleibt im Arbeitsspeicher */
  }
}

/** Gewünschter Zustand (Warteschlange) hat Vorrang vor dem Serverstand. */
export const effectiveChecked = (list: SharedList, item: SharedItem, pending: Pending): boolean => pending[pendingKey(list.id, item.id)] ?? item.checked;

/* ---------- Zwischenspeicher der letzten Liste (Einkauf im Laden hat oft schlechten Empfang) ---------- */

export const LIST_CACHE_KEY = 'familienplan:list:v1';

function isSharedList(v: unknown): v is SharedList {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o['id'] === 'string' && typeof o['rev'] === 'number' && Array.isArray(o['items']) && (o['items'] as unknown[]).every((i) => typeof i === 'object' && i !== null && typeof (i as Record<string, unknown>)['id'] === 'string' && typeof (i as Record<string, unknown>)['label'] === 'string');
}

export function loadCachedList(storage: Pick<Storage, 'getItem'> | null): SharedList | null {
  try {
    const raw = storage?.getItem(LIST_CACHE_KEY);
    const v: unknown = raw ? JSON.parse(raw) : null;
    return isSharedList(v) ? v : null;
  } catch {
    return null;
  }
}
export function saveCachedList(storage: Pick<Storage, 'setItem' | 'removeItem'> | null, list: SharedList | null): void {
  try {
    if (list) storage?.setItem(LIST_CACHE_KEY, JSON.stringify(list));
    else storage?.removeItem(LIST_CACHE_KEY);
  } catch {
    /* Speicher voll oder gesperrt: nur der Zwischenspeicher fehlt */
  }
}
