import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchMe, type Me, type MeResult } from './api';

const KNOWN_KEY = 'familienplan:me:v1';

const storage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export function loadKnownMe(s: Pick<Storage, 'getItem'> | null): Me | null {
  try {
    const raw = s?.getItem(KNOWN_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (typeof v['memberId'] !== 'string' || typeof v['householdId'] !== 'string' || (v['role'] !== 'owner' && v['role'] !== 'member')) return null;
    return {
      memberId: v['memberId'],
      householdId: v['householdId'],
      role: v['role'],
      displayName: typeof v['displayName'] === 'string' ? v['displayName'] : null,
    };
  } catch {
    return null;
  }
}

function saveKnownMe(s: Pick<Storage, 'setItem' | 'removeItem'> | null, me: Me | null): void {
  try {
    if (me) s?.setItem(KNOWN_KEY, JSON.stringify(me));
    else s?.removeItem(KNOWN_KEY);
  } catch {
    /* Speicher gesperrt: dann eben ohne Zwischenspeicher */
  }
}

interface MeState {
  /** Letztes Ergebnis von /api/me. */
  me: MeResult | 'loading';
  /**
   * Zuletzt bestätigte Mitgliedschaft (auch offline oder bei abgelaufener Sitzung). Damit zeigt die App die zuletzt
   * geladene gemeinsame Liste weiter an, statt im Laden ohne Netz auf den lokalen Plan zurückzufallen.
   */
  known: Me | null;
  refresh: () => Promise<void>;
}
const Ctx = createContext<MeState>({ me: 'loading', known: null, refresh: async () => undefined });

/** Prüft beim Start (und beim Zurückkehren in die App) einmal, ob wir angemeldet sind. Plan und Einkaufsliste brauchen das nicht. */
export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResult | 'loading'>('loading');
  const [known, setKnown] = useState<Me | null>(() => loadKnownMe(storage()));
  const refresh = useCallback(async () => {
    const result = await fetchMe();
    setMe(result);
    if (result.kind === 'ok') {
      setKnown(result.me);
      saveKnownMe(storage(), result.me);
    } else if (result.kind === 'not-a-member') {
      setKnown(null);
      saveKnownMe(storage(), null);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);
  const value = useMemo(() => ({ me, known, refresh }), [me, known, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useMe = (): MeState => useContext(Ctx);
