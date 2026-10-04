import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseSeedV2, ROLE_IDS, type Weekday } from '@familienplan/schema';
import { createEngine, type PlanState } from '../src';

const here = dirname(fileURLToPath(import.meta.url));
const seed = parseSeedV2(JSON.parse(readFileSync(resolve(here, '../../../content/seed.v2.json'), 'utf-8')));
const engine = createEngine(seed);

interface GoldenScenario {
  name: string;
  state: PlanState;
  plan: Record<string, number>;
  days: any[];
  shop: any[];
  findings: Array<{ kind: string; text: string }>;
}
const golden = JSON.parse(readFileSync(resolve(here, 'golden/v2-scenarios.json'), 'utf-8')) as { scenarios: GoldenScenario[] };

const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
const n6 = (n: { kcal: number; p: number; f: number; c: number; fib: number; grams: number }) => ({
  kcal: r6(n.kcal), p: r6(n.p), f: r6(n.f), c: r6(n.c), fib: r6(n.fib), grams: r6(n.grams),
});

/** Rekursiver Vergleich mit numerischer Toleranz (Rundung/Float-Reihenfolge). */
function expectClose(actual: unknown, expected: unknown, path = '$'): void {
  if (typeof expected === 'number') {
    expect(typeof actual, `${path} sollte eine Zahl sein`).toBe('number');
    expect(Math.abs((actual as number) - expected), `${path}: ${actual} vs ${expected}`).toBeLessThanOrEqual(2e-6);
    return;
  }
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), `${path} sollte Array sein`).toBe(true);
    expect((actual as unknown[]).length, `${path}.length`).toBe(expected.length);
    expected.forEach((e, i) => expectClose((actual as unknown[])[i], e, `${path}[${i}]`));
    return;
  }
  if (expected && typeof expected === 'object') {
    const a = actual as Record<string, unknown>;
    expect(a && typeof a === 'object', `${path} sollte Objekt sein`).toBe(true);
    expect(Object.keys(a).sort(), `${path} Schlüssel`).toEqual(Object.keys(expected).sort());
    for (const k of Object.keys(expected)) expectClose(a[k], (expected as Record<string, unknown>)[k], `${path}.${k}`);
    return;
  }
  expect(actual, path).toEqual(expected);
}

function project(state: PlanState) {
  const plan = engine.computePlan(state);
  const shop = engine.computeShopping(plan, state);
  const calc = (c: { factor: number; grams: number; n: any; lines: any[] } | null) =>
    c
      ? {
          factor: r6(c.factor),
          grams: r6(c.grams),
          n: n6({ ...c.n, grams: c.grams }),
          lines: c.lines.map((l) => ({ baseId: l.baseId, id: l.id, grams: r6(l.grams), from: l.from, ratio: l.ratio == null ? null : r6(l.ratio), missing: l.missing })),
        }
      : null;
  return {
    plan: {
      target: r6(plan.target), fixedFactor: r6(plan.fixedFactor), avgFactor: r6(plan.avgFactor),
      minFactor: r6(plan.minFactor), maxFactor: r6(plan.maxFactor), avgKcal: r6(plan.avgKcal), avgP: r6(plan.avgP),
    },
    days: plan.days.map((d) => ({
      weekday: d.weekday, dayType: d.dayType, restDerived: d.restDerived, assumption: d.assumption,
      factor: r6(d.factor), limited: d.limited, autoRaw: r6(d.autoRaw), baseProtein: r6(d.baseProtein), snackProtein: r6(d.snackProtein),
      totals: { father: n6(d.totals.father), mother: n6(d.totals.mother), child: n6(d.totals.child) },
      eval: {
        pk: r6(d.eval.pk), ck: r6(d.eval.ck), fk: r6(d.eval.fk), protein: d.eval.protein, carbs: d.eval.carbs, fat: d.eval.fat, fiber: d.eval.fiber,
        balance: d.eval.balance == null ? null : r6(d.eval.balance), balanceStatus: d.eval.balanceStatus ?? null,
      },
      workouts: d.workouts.map((w) => w.type),
      suppTimes: d.suppSlots.map((s) => `${s.slot}@${s.targetTime}`),
      meals: d.mealViews.map((mv) => ({
        slot: mv.slot, mealId: mv.mealId, time: mv.time,
        rows: mv.rows.map((r) => ({ componentId: r.comp.id, pf: r.pf, father: calc(r.calc.father), mother: calc(r.calc.mother), child: calc(r.calc.child) })),
      })),
    })),
    shop: shop.items
      .map((i) => ({
        id: i.id, grams: r6(i.grams), buy: i.buy, cat: i.cat, missing: i.missing,
        perDay: Object.fromEntries(Object.entries(i.perDay).map(([k, v]) => [k, r6(v as number)])),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    findings: engine.findings(plan, state).map((f) => ({ kind: f.k, text: f.t })),
  };
}

describe('Engine reproduziert v2 (Golden-Fixtures aus der Single-File-App)', () => {
  it('Fixture ist vollständig', () => {
    expect(golden.scenarios.length).toBeGreaterThanOrEqual(13);
  });

  for (const sc of golden.scenarios) {
    describe(sc.name, () => {
      const got = project(sc.state);
      it('Planaggregate', () => expectClose(got.plan, sc.plan));
      it('Tage, Mahlzeiten, Portionen je Rolle', () => expectClose(got.days, sc.days));
      it('Einkaufsliste', () => expectClose(got.shop, sc.shop));
      it('Plan-Check-Texte (Reihenfolge, Art, Wortlaut)', () => expect(got.findings).toEqual(sc.findings));
    });
  }
});

describe('Invarianten der Engine', () => {
  it('Default: Vater-Eiweiß beträgt an jedem der 7 Tage 1,8 g/kg (171 g bei 95 kg)', () => {
    const state = golden.scenarios.find((s) => s.name === 'default-95kg')!.state;
    const plan = engine.computePlan(state);
    expect(plan.days).toHaveLength(7);
    for (const d of plan.days) expect(d.totals.father.p).toBeCloseTo(171, 1);
  });

  it('Taverne: Mutter und Kind erhalten genau einen Hauptgang (nie Fisch UND Lamm)', () => {
    const base = golden.scenarios.find((s) => s.name === 'taverna-lamm')!.state;
    for (const main of ['lavraki', 'lamm'] as const) {
      const plan = engine.computePlan({ ...base, taverna: true, tavernaMain: main });
      const sat = plan.days.find((d) => d.weekday === ('sat' as Weekday))!;
      const tav = sat.mealViews.find((m) => m.mealId === 'dinner-sat-taverna')!;
      for (const role of ROLE_IDS) {
        const mains = tav.rows.filter((r) => r.calc[role] && ['taverna-lavraki-grill', 'taverna-lamm-kotelett'].includes(r.comp.id));
        expect(mains.length, `${role} / ${main}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('Taverne wird nicht eingekauft', () => {
    const state = { ...golden.scenarios.find((s) => s.name === 'taverna-lavraki')!.state };
    const plan = engine.computePlan(state);
    const shopOn = engine.computeShopping(plan, state);
    const shopOff = engine.computeShopping(engine.computePlan({ ...state, taverna: false }), { ...state, taverna: false });
    const sum = (s: typeof shopOn) => s.items.reduce((a, i) => a + i.grams, 0);
    expect(sum(shopOn)).toBeLessThan(sum(shopOff));
  });

  it('Unbekannte Zutat führt zu klarem Fehler statt stillem NaN', () => {
    const broken = JSON.parse(JSON.stringify(seed)) as typeof seed;
    broken.components[0]!.ingredients[0]!.ingredientId = 'gibt-es-nicht';
    const e = createEngine(broken);
    const st = golden.scenarios[0]!.state;
    expect(() => e.computePlan(st)).toThrow(/gibt-es-nicht/);
  });
});
