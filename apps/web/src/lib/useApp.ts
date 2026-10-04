import { useMemo, useSyncExternalStore } from 'react';
import { engine, knownIngredientIds } from './engine';
import { createAppStore, type AppState, type StorageLike } from './store';

function browserStorage(): StorageLike | null {
  try {
    const s = window.localStorage;
    s.getItem('familienplan:probe');
    return s;
  } catch {
    return null; // z. B. blockierter Speicher: App läuft weiter, nur ohne Persistenz
  }
}

export const store = createAppStore(browserStorage(), knownIngredientIds);

export function useAppState(): AppState {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

/** Plan, Einkaufsliste und Plan-Check; neu berechnet nur, wenn sich der Plan-Zustand ändert (Engine ist rein). */
export function useComputed() {
  const { plan: planState } = useAppState();
  return useMemo(() => {
    const plan = engine.computePlan(planState);
    return { planState, plan, shop: engine.computeShopping(plan, planState), findings: engine.findings(plan, planState) };
  }, [planState]);
}
