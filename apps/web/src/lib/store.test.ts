import { describe, expect, it } from 'vitest';
import { createAppStore, sanitizeState, STORAGE_KEY, type StorageLike } from './store';

const known = new Set(['lavraki', 'anari', 'ei']);
const NOW = new Date(2026, 9, 4);

function memoryStorage(initial?: string): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(STORAGE_KEY, initial);
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

describe('sanitizeState', () => {
  it('fällt bei Müll auf Defaults zurück statt zu crashen', () => {
    for (const junk of [null, 42, 'x', [], undefined, { plan: 'kaputt', tracker: 7, shopChecked: [] }]) {
      const s = sanitizeState(junk, known, NOW);
      expect(s.plan.weightKg).toBe(95);
      expect(s.plan.activeDays.mon).toBe(true);
      expect(s.shopChecked).toEqual({});
    }
  });
  it('klemmt Gewicht und TDEE, verwirft unbekannte Zutaten und falsche Typen', () => {
    const s = sanitizeState(
      { plan: { weightKg: 500, tdee: 12, training: 'ja', tavernaMain: 'lamm', factorMode: 'x', unavailable: { lavraki: true, gibtsnicht: true, anari: 'ja' }, mgPerSlot: -5 }, shopChecked: { ei: true, zzz: true } },
      known,
      NOW,
    );
    expect(s.plan.weightKg).toBe(115);
    expect(s.plan.tdee).toBe(1000);
    expect(s.plan.training).toBe(true);
    expect(s.plan.tavernaMain).toBe('lamm');
    expect(s.plan.factorMode).toBe('auto');
    expect(s.plan.mgPerSlot).toBe(0);
    expect(s.plan.unavailable).toEqual({ lavraki: true });
    expect(s.shopChecked).toEqual({ ei: true });
  });
  it('Tracker: Einträge älter als 90 Tage und ungültige Datumsschlüssel werden entfernt', () => {
    const s = sanitizeState({ tracker: { '2026-10-01': { 'a:b': true }, '2026-05-01': { 'a:b': true }, gestern: { 'a:b': true }, '2026-10-02': { 'a:b': false } } }, known, NOW);
    expect(Object.keys(s.tracker)).toEqual(['2026-10-01']);
  });
});

describe('AppStore', () => {
  it('speichert jede Änderung und stellt sie beim nächsten Start wieder her', () => {
    const storage = memoryStorage();
    const a = createAppStore(storage, known, () => NOW);
    a.setPlan({ weightKg: 88 });
    a.toggleShop('ei');
    a.toggleUnavailable('lavraki');
    a.toggleActiveDay('sat');
    a.toggleTracker('2026-10-04', 'p:s');
    const b = createAppStore(storage, known, () => NOW);
    expect(b.get().plan.weightKg).toBe(88);
    expect(b.get().shopChecked).toEqual({ ei: true });
    expect(b.get().plan.unavailable).toEqual({ lavraki: true });
    expect(b.get().plan.activeDays.sat).toBe(false);
    expect(b.get().tracker['2026-10-04']).toEqual({ 'p:s': true });
  });
  it('Toggle ist umkehrbar und räumt leere Tracker-Tage auf', () => {
    const s = createAppStore(memoryStorage(), known, () => NOW);
    s.toggleTracker('2026-10-04', 'k');
    s.toggleTracker('2026-10-04', 'k');
    expect(s.get().tracker).toEqual({});
    s.toggleShop('ei');
    s.toggleShop('ei');
    expect(s.get().shopChecked).toEqual({});
  });
  it('unbekannte Zutat lässt sich nicht als nicht verfügbar markieren', () => {
    const s = createAppStore(memoryStorage(), known, () => NOW);
    s.toggleUnavailable('gibtsnicht');
    expect(s.get().plan.unavailable).toEqual({});
  });
  it('benachrichtigt Abonnenten und lässt sich abmelden', () => {
    const s = createAppStore(memoryStorage(), known, () => NOW);
    let n = 0;
    const off = s.subscribe(() => n++);
    s.setPlan({ snack: false });
    off();
    s.setPlan({ snack: true });
    expect(n).toBe(1);
  });
  it('Schreibfehler (Speicher voll/gesperrt) werfen nie; isPersistent meldet es', () => {
    const broken: StorageLike = { getItem: () => null, setItem: () => { throw new DOMException('Quota', 'QuotaExceededError'); }, removeItem: () => undefined };
    const s = createAppStore(broken, known, () => NOW);
    expect(() => s.setPlan({ weightKg: 70 })).not.toThrow();
    expect(s.get().plan.weightKg).toBe(70);
    expect(s.isPersistent()).toBe(false);
  });
  it('ohne Speicher (null) läuft die App im Arbeitsspeicher', () => {
    const s = createAppStore(null, known, () => NOW);
    s.setPlan({ weightKg: 70 });
    expect(s.get().plan.weightKg).toBe(70);
    expect(s.isPersistent()).toBe(false);
  });
  it('kaputtes JSON im Speicher führt zu Defaults', () => {
    const s = createAppStore(memoryStorage('{nicht json'), known, () => NOW);
    expect(s.get().plan.weightKg).toBe(95);
  });
  it('resetAll stellt Defaults her', () => {
    const storage = memoryStorage();
    const s = createAppStore(storage, known, () => NOW);
    s.setPlan({ weightKg: 70 });
    s.toggleShop('ei');
    s.resetAll();
    expect(s.get().plan.weightKg).toBe(95);
    expect(s.get().shopChecked).toEqual({});
    expect(createAppStore(storage, known, () => NOW).get().plan.weightKg).toBe(95);
  });
});
