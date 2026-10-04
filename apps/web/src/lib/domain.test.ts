import { defaultPlanState } from '@familienplan/engine';
import { describe, expect, it } from 'vitest';
import { AISLE_ORDER, dateOfWeekday, dayEvents, doseText, isoDate, mealBlocks, railPos, shoppingText, speedText, stackItems, toPublishItems, weekListId, qtyText, varomaCombo, weekdayOfDate } from './domain';
import { engine } from './engine';

const state = defaultPlanState();
const plan = engine.computePlan(state);
const shop = engine.computeShopping(plan, state);

describe('Zeitachse', () => {
  it('06:00 = 0 %, 22:00 = 100 %, 14:00 = 50 %; außerhalb wird geklemmt', () => {
    expect(railPos('06:00')).toBe(0);
    expect(railPos('22:00')).toBe(100);
    expect(railPos('14:00')).toBe(50);
    expect(railPos('05:00')).toBe(0);
    expect(railPos('23:30')).toBe(100);
  });
});

describe('Datum', () => {
  it('Sonntag gehört zur Woche, die am Montag davor beginnt', () => {
    const sunday = new Date(2026, 9, 4); // So 4. Oktober 2026
    expect(weekdayOfDate(sunday)).toBe('sun');
    expect(isoDate(dateOfWeekday(sunday, 'mon'))).toBe('2026-09-28');
    expect(isoDate(dateOfWeekday(sunday, 'sun'))).toBe('2026-10-04');
  });
  it('Montag ist sein eigener Wochenanfang; Monatswechsel wird korrekt überschritten', () => {
    const monday = new Date(2026, 9, 5);
    expect(isoDate(dateOfWeekday(monday, 'mon'))).toBe('2026-10-05');
    expect(isoDate(dateOfWeekday(monday, 'sun'))).toBe('2026-10-11');
    expect(isoDate(dateOfWeekday(new Date(2026, 10, 1), 'mon'))).toBe('2026-10-26');
  });
});

describe('Texte', () => {
  it('doseText', () => {
    expect(doseText(null)).toBe('nach Laborwert');
    expect(doseText({ min: 5, max: 5, unit: 'g' })).toBe('5 g');
    expect(doseText({ min: 2, max: 3, unit: 'g' })).toBe('2–3 g');
    expect(doseText({ min: 150, max: 150, unit: 'mg', elemental: true })).toBe('150 mg elementar');
    expect(doseText({ min: 50, max: 50, unit: 'ug' })).toBe('50 µg');
  });
  it('speedText: Zahlen werden zu „Stufe n“, Wörter bleiben, leer ist null', () => {
    expect(speedText('5')).toBe('Stufe 5');
    expect(speedText('Sanftrührstufe')).toBe('Sanftrührstufe');
    expect(speedText(null)).toBeNull();
  });
});

describe('Tagesablauf', () => {
  it('ist chronologisch, enthält Training, Mahlzeiten und Schlaf-Stack, und jede Mahlzeit verweist auf ihren Index', () => {
    for (const d of plan.days) {
      const ev = dayEvents(engine, d);
      const times = ev.map((e) => e.time);
      expect([...times].sort()).toEqual(times);
      expect(ev.filter((e) => e.mealIndex != null)).toHaveLength(d.mealViews.length);
      expect(ev.some((e) => e.kind === 'supp')).toBe(true);
      for (const e of ev) if (e.mealIndex != null) expect(d.mealViews[e.mealIndex]?.time).toBe(e.time);
    }
  });
  it('Montag (Trainingstag) enthält Calisthenics und Krafttraining; Sonntag-Brunch ist benannt', () => {
    const mon = dayEvents(engine, plan.days.find((d) => d.weekday === 'mon')!);
    expect(mon.map((e) => e.kind)).toEqual(expect.arrayContaining(['cal', 'str']));
    const sun = dayEvents(engine, plan.days.find((d) => d.weekday === 'sun')!);
    expect(sun.find((e) => e.kind === 'first')?.title).toBe('Brunch (Fastenbrechen)');
  });
});

describe('Mahlzeit-Tabelle', () => {
  it('Summe der Zeilen-Gramm je Rolle entspricht der Engine-Summe (keine Zutat geht verloren)', () => {
    for (const d of plan.days) {
      for (const mv of d.mealViews) {
        const blocks = mealBlocks(engine, mv);
        for (const role of ['father', 'mother', 'child'] as const) {
          const fromTable = blocks.flatMap((b) => b.lines).reduce((s, l) => s + (l.grams[role] ?? 0), 0);
          const fromEngine = mv.rows.reduce((s, r) => s + (r.calc[role]?.grams ?? 0), 0);
          expect(fromTable).toBeCloseTo(fromEngine, 6);
        }
      }
    }
  });
  it('Ersatz-Zutat wird angezeigt, wenn das Original nicht verfügbar ist', () => {
    const s = { ...state, unavailable: { lavraki: true } };
    const p = engine.computePlan(s);
    const lines = p.days.flatMap((d) => d.mealViews.flatMap((mv) => mealBlocks(engine, mv).flatMap((b) => b.lines)));
    expect(lines.some((l) => l.substituteFor === 'Lavraki')).toBe(true);
  });
});

describe('Varoma-Kombi', () => {
  it('alle Schritte enden gemeinsam nach totalMin; der längste startet bei Minute 0 im Varoma-Behälter', () => {
    const combos = plan.days.flatMap((d) => d.mealViews.map(varomaCombo)).filter((c) => c != null);
    expect(combos.length, 'der Seed enthält mindestens eine Varoma-Kombi').toBeGreaterThan(0);
    for (const c of combos) {
      expect(c.steps[0]?.startMinute).toBe(0);
      expect(c.steps[0]?.tier).toBe('varoma');
      for (const s of c.steps) expect(s.startMinute + s.minutes).toBe(c.totalMin);
    }
  });
});

describe('Supplement-Stacks', () => {
  it('Magnesium folgt dem Slot-Wert aus dem Plan-Zustand', () => {
    const items = (['with_first_meal', 'with_dinner', 'before_sleep'] as const).flatMap((s) => stackItems(engine, { ...state, mgPerSlot: 125 }, s));
    const mg = items.filter((i) => i.nameDe.toLowerCase().includes('magnesium'));
    expect(mg.length).toBeGreaterThan(0);
    for (const m of mg) expect(m.dose).toBe('125 mg elementar');
  });
  it('Tracker-Schlüssel sind eindeutig', () => {
    const keys = (['with_first_meal', 'with_dinner', 'before_sleep'] as const).flatMap((s) => stackItems(engine, state, s).map((i) => i.key));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('Einkaufstext', () => {
  it('„nur offene“ lässt abgehakte Artikel weg, „alle“ markiert sie', () => {
    const first = shop.items[0]!;
    const open = shoppingText(engine, shop, { [first.id]: true }, true);
    const all = shoppingText(engine, shop, { [first.id]: true }, false);
    const name = engine.ingredient(first.id).nameDe.split(',')[0]!.split('(')[0]!.trim();
    expect(open).not.toContain(`${name}:`);
    expect(all).toContain(`[x] ${name}:`);
    expect(open.startsWith('Einkauf Familienplan')).toBe(true);
  });
  it('leere Liste liefert „Nichts zu kaufen“', () => {
    const none = engine.computeShopping(plan, { ...state, activeDays: { mon: false, tue: false, wed: false, thu: false, fri: false, sat: false, sun: false } });
    expect(shoppingText(engine, none, {}, false)).toContain('Nichts zu kaufen');
  });
});

describe('Geteilte Liste', () => {
  const items = toPublishItems(engine, shop);
  it('Standardplan ergibt Artikel, höchstens 150, mit eindeutigen IDs', () => {
    expect(items.length).toBeGreaterThan(5);
    expect(items.length).toBeLessThanOrEqual(150);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  });
  it('alle Zutaten-IDs des Seeds erfüllen das ID-Muster des Servers', () => {
    for (const ing of engine.seed.ingredients) expect(ing.id, ing.id).toMatch(/^[A-Za-z0-9_.-]{1,80}$/);
  });
  it('Menge ist positiv, Einheit g, Bereich bekannt, Label nicht leer', () => {
    for (const it of items) {
      expect(it.qty, it.id).toBeGreaterThan(0);
      expect(it.unit).toBe('g');
      expect(AISLE_ORDER).toContain(it.aisle);
      expect(it.label.length).toBeGreaterThan(0);
      expect(it.label.length).toBeLessThanOrEqual(120);
    }
  });
  it('Körperdaten stecken nicht im Payload (nur Artikel, Mengen, Hinweise)', () => {
    expect(Object.keys(items[0] ?? {}).sort()).toEqual(['aisle', 'id', 'ingredientId', 'label', 'note', 'qty', 'unit']);
  });
  it('Listen-ID ist der Montag der Woche', () => {
    expect(weekListId(new Date(2026, 9, 4))).toBe('week-2026-09-28');
    expect(weekListId(new Date(2026, 9, 5))).toBe('week-2026-10-05');
  });
  it('Mengenanzeige: ab 1000 g in kg, deutsches Format', () => {
    expect(qtyText(500, 'g')).toBe('500 g');
    expect(qtyText(1500, 'g')).toBe('1,50 kg');
    expect(qtyText(null, null)).toBe('');
  });
});
