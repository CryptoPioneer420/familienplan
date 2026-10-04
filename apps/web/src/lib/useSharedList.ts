import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchCurrent, loadCachedList, loadPending, patchChecked, pendingKey, saveCachedList, savePending, type Pending, type SharedList } from './shared';

const POLL_MS = 15_000;
const storage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export type ListStatus = 'loading' | 'ready' | 'offline' | 'login-required' | 'error';

/**
 * Lädt die geteilte Liste, fragt sie solange die Seite sichtbar ist alle 15 s ab (Revision ohne Änderung kostet fast nichts)
 * und sendet Haken mit Warteschlange: Ohne Netz im Laden bleiben sie lokal und gehen beim nächsten Abgleich raus.
 */
export function useSharedList(enabled: boolean) {
  const [list, setList] = useState<SharedList | null>(() => loadCachedList(storage()));
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [status, setStatus] = useState<ListStatus>('loading');
  const [pending, setPending] = useState<Pending>(() => loadPending(storage()));
  const pendingRef = useRef(pending);
  const revRef = useRef<number | null>(null);
  const idRef = useRef<string | null>(list?.id ?? null);
  const busy = useRef(false);

  const updatePending = useCallback((next: Pending) => {
    pendingRef.current = next;
    setPending(next);
    savePending(storage(), next);
  }, []);

  const sync = useCallback(async () => {
    if (!enabled || busy.current) return;
    busy.current = true;
    try {
      // 1) Warteschlange abarbeiten
      let q = pendingRef.current;
      for (const [key, checked] of Object.entries(q)) {
        const [listId, itemId] = key.split('|') as [string, string];
        const r = await patchChecked(listId, itemId, checked);
        if (r.kind === 'ok' || r.kind === 'not-found') {
          const { [key]: _done, ...rest } = pendingRef.current;
          q = rest;
          updatePending(rest);
          revRef.current = null; // Stand der Gegenseite neu laden
        } else if (r.kind === 'login-required') return void setStatus('login-required');
        else return void setStatus(r.kind === 'offline' ? 'offline' : 'error');
      }
      // 2) Stand holen
      let res = await fetchCurrent(revRef.current);
      // Revisionen zählen je Liste. Eine neue Liste kann dieselbe Nummer haben wie die alte: dann vollständig nachladen.
      if (res.kind === 'ok' && 'unchanged' in res.data && res.data.list.id !== idRef.current) res = await fetchCurrent(null);
      if (res.kind !== 'ok') return void setStatus(res.kind === 'login-required' ? 'login-required' : res.kind === 'offline' ? 'offline' : 'error');
      const d = res.data;
      setSyncedAt(Date.now());
      if ('unchanged' in d) {
        setStatus('ready');
        return;
      }
      revRef.current = d.list?.rev ?? null;
      idRef.current = d.list?.id ?? null;
      setList(d.list);
      saveCachedList(storage(), d.list);
      setStatus('ready');
    } finally {
      busy.current = false;
    }
  }, [enabled, updatePending]);

  useEffect(() => {
    if (!enabled) return;
    void sync();
    const tick = () => {
      if (document.visibilityState === 'visible') void sync();
    };
    const id = window.setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('online', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('online', tick);
    };
  }, [enabled, sync]);

  const setChecked = useCallback(
    (itemId: string, checked: boolean) => {
      if (!list) return;
      updatePending({ ...pendingRef.current, [pendingKey(list.id, itemId)]: checked });
      void sync();
    },
    [list, sync, updatePending],
  );

  return { list, status, pending, syncedAt, setChecked, refresh: () => { revRef.current = null; return sync(); } };
}
