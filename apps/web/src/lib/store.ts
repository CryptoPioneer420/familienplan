import { DEFAULT_CONFIG, defaultPlanState, type PlanState, type TavernaMain } from '@familienplan/engine';
import type { Weekday } from '@familienplan/schema';
import { WEEKDAYS } from '@familienplan/schema/constants';

/**
 * Lokaler Zustand dieses Geräts. Körperdaten (Gewicht, Erhaltungsbedarf) liegen ausschließlich hier
 * und werden nie an den Server gesendet (siehe PRD, Datenschutz).
 * Die geteilte Einkaufsliste kommt in Phase 3 als Sync; bis dahin sind Haken lokal.
 */
export interface AppState {
  plan: PlanState;
  shopChecked: Record<string, boolean>;
  /** ISO-Datum → Tracker-Schlüssel → erledigt */
  tracker: Record<string, Record<string, boolean>>;
  installHintDismissed: boolean;
}

export const STORAGE_KEY = 'familienplan:v1';
const TRACKER_KEEP_DAYS = 90;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function defaultAppState(): AppState {
  return { plan: defaultPlanState(), shopChecked: {}, tracker: {}, installHintDismissed: false };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, lo: number, hi: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

function boolMap(v: unknown, keep: (k: string) => boolean): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (!isRecord(v)) return out;
  for (const [k, val] of Object.entries(v)) if (val === true && keep(k)) out[k] = true;
  return out;
}

/** Defensive Wiederherstellung: unbekannte oder kaputte Felder fallen auf Defaults zurück, nie auf einen Absturz. */
export function sanitizePlan(raw: unknown, knownIngredientIds: ReadonlySet<string>): PlanState {
  const d = defaultPlanState();
  if (!isRecord(raw)) return d;
  const w = DEFAULT_CONFIG.weight;
  const activeDays = {} as Record<Weekday, boolean>;
  const rawDays = isRecord(raw['activeDays']) ? raw['activeDays'] : {};
  for (const day of WEEKDAYS) activeDays[day] = bool(rawDays[day], true);
  const tdee = raw['tdee'];
  return {
    weightKg: num(raw['weightKg'], w.min, w.max, d.weightKg),
    training: bool(raw['training'], d.training),
    snack: bool(raw['snack'], d.snack),
    taverna: bool(raw['taverna'], d.taverna),
    tavernaMain: (raw['tavernaMain'] === 'lamm' ? 'lamm' : 'lavraki') satisfies TavernaMain,
    factorMode: raw['factorMode'] === 'fixed' ? 'fixed' : 'auto',
    mgPerSlot: num(raw['mgPerSlot'], 0, 500, d.mgPerSlot),
    tdee: typeof tdee === 'number' && Number.isFinite(tdee) ? Math.min(8000, Math.max(1000, tdee)) : null,
    unavailable: boolMap(raw['unavailable'], (k) => knownIngredientIds.has(k)),
    activeDays,
  };
}

export function sanitizeState(raw: unknown, knownIngredientIds: ReadonlySet<string>, now: Date): AppState {
  if (!isRecord(raw)) return defaultAppState();
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - TRACKER_KEEP_DAYS);
  const p = (n: number) => String(n).padStart(2, '0');
  const cutoffIso = `${cutoff.getFullYear()}-${p(cutoff.getMonth() + 1)}-${p(cutoff.getDate())}`;
  const tracker: AppState['tracker'] = {};
  if (isRecord(raw['tracker'])) {
    for (const [iso, v] of Object.entries(raw['tracker'])) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || iso < cutoffIso) continue;
      const m = boolMap(v, () => true);
      if (Object.keys(m).length) tracker[iso] = m;
    }
  }
  return {
    plan: sanitizePlan(raw['plan'], knownIngredientIds),
    shopChecked: boolMap(raw['shopChecked'], (k) => knownIngredientIds.has(k)),
    tracker,
    installHintDismissed: bool(raw['installHintDismissed'], false),
  };
}

export interface AppStore {
  get(): AppState;
  subscribe(listener: () => void): () => void;
  /** false, sobald ein Schreibzugriff scheiterte (z. B. privater Modus, Speicher voll). */
  isPersistent(): boolean;
  setPlan(patch: Partial<PlanState>): void;
  toggleUnavailable(id: string): void;
  toggleActiveDay(day: Weekday): void;
  toggleShop(id: string): void;
  clearShopChecks(): void;
  toggleTracker(iso: string, key: string): void;
  dismissInstallHint(): void;
  resetAll(): void;
}

export function createAppStore(storage: StorageLike | null, knownIngredientIds: ReadonlySet<string>, now: () => Date = () => new Date()): AppStore {
  let persistent = storage !== null;
  let state: AppState;
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    state = raw ? sanitizeState(JSON.parse(raw), knownIngredientIds, now()) : defaultAppState();
  } catch {
    state = defaultAppState();
  }
  const listeners = new Set<() => void>();

  const commit = (next: AppState): void => {
    state = next;
    if (storage) {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(state));
        persistent = true;
      } catch {
        persistent = false;
      }
    }
    listeners.forEach((l) => l());
  };
  const flip = (m: Record<string, boolean>, key: string): Record<string, boolean> => {
    const next = { ...m };
    if (next[key]) delete next[key];
    else next[key] = true;
    return next;
  };

  return {
    get: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    isPersistent: () => persistent,
    setPlan: (patch) => commit({ ...state, plan: sanitizePlan({ ...state.plan, ...patch }, knownIngredientIds) }),
    toggleUnavailable: (id) => {
      if (knownIngredientIds.has(id)) commit({ ...state, plan: { ...state.plan, unavailable: flip(state.plan.unavailable, id) } });
    },
    toggleActiveDay: (day) => commit({ ...state, plan: { ...state.plan, activeDays: { ...state.plan.activeDays, [day]: !state.plan.activeDays[day] } } }),
    toggleShop: (id) => commit({ ...state, shopChecked: flip(state.shopChecked, id) }),
    clearShopChecks: () => commit({ ...state, shopChecked: {} }),
    toggleTracker(iso, key) {
      const day = flip(state.tracker[iso] ?? {}, key);
      const tracker = { ...state.tracker };
      if (Object.keys(day).length) tracker[iso] = day;
      else delete tracker[iso];
      commit({ ...state, tracker });
    },
    dismissInstallHint: () => commit({ ...state, installHintDismissed: true }),
    resetAll() {
      try {
        storage?.removeItem(STORAGE_KEY);
      } catch {
        /* nichts zu tun */
      }
      commit(defaultAppState());
    },
  };
}
