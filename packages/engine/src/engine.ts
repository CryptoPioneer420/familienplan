import type { Component, Dose, Ingredient, Meal, RoleId, SeedV2, Supplement, SupplementProtocol, WeekDay } from '@familienplan/schema';
import { ROLE_IDS } from '@familienplan/schema/constants';
import { DEFAULT_CONFIG } from './config';
import { clamp, mean, nf0, nf1, nf2, rngTxt, shortName } from './format';
import type {
  Calc,
  DayContext,
  DayEval,
  EngineConfig,
  Finding,
  MealRow,
  MealView,
  Nutrients,
  Plan,
  PlanDay,
  PlanState,
  PortionFactors,
  RangeStatus,
  ResolvedLine,
  Shopping,
  ShoppingItem,
  Totals,
} from './types';

function must<T>(map: ReadonlyMap<string, T>, id: string, label: string): T {
  const v = map.get(id);
  if (v === undefined) throw new Error(`Engine: ${label} "${id}" nicht im Dataset`);
  return v;
}

const zeroN = (): Nutrients => ({ kcal: 0, p: 0, f: 0, c: 0, fib: 0 });
const addN = (a: Nutrients, b: Nutrients, k = 1): Nutrients => {
  a.kcal += b.kcal * k;
  a.p += b.p * k;
  a.f += b.f * k;
  a.c += b.c * k;
  a.fib += b.fib * k;
  return a;
};

export function roundBuy(g: number): number {
  return g < 1000 ? Math.ceil(g / 10) * 10 : Math.ceil(g / 50) * 50;
}
export function buyText(e: { buy: number }): string {
  return e.buy >= 1000 ? `${nf2.format(e.buy / 1000)} kg` : `${nf0.format(e.buy)} g`;
}
export function buyHint(e: { id: string; grams: number }): string {
  if (e.id === 'ei') return `≈ ${Math.ceil(e.grams / 50)} Eier`;
  if (e.id === 'evoo') return `≈ ${nf0.format(Math.ceil(e.grams / 0.915 / 10) * 10)} ml`;
  if (e.id === 'zitronensaft') return `≈ ${Math.ceil(e.grams / 40)} Zitronen`;
  if (e.id === 'sauerteigbrot') return `≈ ${Math.ceil(e.grams / 40)} Scheiben`;
  return '';
}

export function createEngine(seed: SeedV2, config: EngineConfig = DEFAULT_CONFIG) {
  const ingIdx = new Map<string, Ingredient>(seed.ingredients.map((x) => [x.id, x]));
  const compIdx = new Map<string, Component>(seed.components.map((x) => [x.id, x]));
  const mealIdx = new Map<string, Meal>(seed.meals.map((x) => [x.id, x]));
  const supIdx = new Map<string, Supplement>(seed.supplements.map((x) => [x.id, x]));

  const ing = (id: string) => must(ingIdx, id, 'Zutat');
  const comp = (id: string) => must(compIdx, id, 'Komponente');
  const meal = (id: string) => must(mealIdx, id, 'Mahlzeit');

  function ingN(id: string, grams: number): Nutrients {
    const n = ing(id).per100g;
    const k = grams / 100;
    return { kcal: n.kcal * k, p: n.proteinG * k, f: n.fatG * k, c: n.carbsG * k, fib: n.fiberG * k };
  }

  /** Ersetzt nicht verfügbare Zutaten gemäß config.substitutions (Nährwert-gleich über `match`). */
  function resolveIng(state: PlanState, id: string, grams: number): Omit<ResolvedLine, 'baseId' | 'n'> {
    if (!state.unavailable[id]) return { id, grams, from: null, missing: false };
    for (const alt of config.substitutions[id] ?? []) {
      if (state.unavailable[alt.to] || !ingIdx.has(alt.to)) continue;
      const a = ing(id).per100g;
      const b = ing(alt.to).per100g;
      const key = ({ protein: 'proteinG', carbs: 'carbsG', fat: 'fatG' } as const)[alt.match as 'protein' | 'carbs' | 'fat'];
      const ratio = key ? a[key] / Math.max(b[key], 0.01) : 1;
      return { id: alt.to, grams: grams * ratio, from: id, ratio, missing: false };
    }
    return { id, grams, from: null, missing: true };
  }

  function compCalc(state: PlanState, c: Component, factor: number): Calc {
    const lines: ResolvedLine[] = c.ingredients.map((it) => {
      const r = resolveIng(state, it.ingredientId, it.grams * factor);
      return { baseId: it.ingredientId, ...r, n: ingN(r.id, r.grams) };
    });
    const n = zeroN();
    let grams = 0;
    for (const l of lines) {
      addN(n, l.n);
      grams += l.grams;
    }
    return { factor, lines, n, grams };
  }

  function buildMeal(state: PlanState, mealId: string, ctx: { restDerived: boolean }, scale: number): MealRow[] {
    const m = meal(mealId);
    const isSnack = m.slot === 'optional_snack';
    const rows: MealRow[] = m.componentRefs.map((ref) => {
      const c = comp(ref.componentId);
      const pf: PortionFactors = {
        father: ref.portionFactors.father ?? 0,
        mother: ref.portionFactors.mother ?? 0,
        child: ref.portionFactors.child ?? 0,
      };
      if (ctx.restDerived && c.tags.includes('complex_carb')) pf.father = 0;
      if (mealId === config.tavernaMealId) {
        // Ein Hauptgang für alle drei Rollen (Fisch ODER Lamm); Oktopus bleibt Meze
        const lamm = state.tavernaMain === 'lamm';
        if (c.id === config.tavernaLavrakiComponentId && lamm) pf.father = pf.mother = pf.child = 0;
        if (c.id === config.tavernaLammComponentId) {
          if (lamm) pf.father = 1.0;
          else pf.father = pf.mother = pf.child = 0;
        }
      }
      const calc = {} as Record<RoleId, Calc | null>;
      for (const r of ROLE_IDS) {
        const f = r === 'father' ? pf.father * (isSnack ? 1 : scale) : pf[r];
        calc[r] = f > 0 ? compCalc(state, c, f) : null;
      }
      return { comp: c, pf, calc };
    });
    // Komponenten ohne Portion (z. B. nicht gewählter Taverne-Hauptgang) ausblenden
    return rows.filter((row) => ROLE_IDS.some((r) => row.calc[r]));
  }

  function sumRole(rows: readonly MealRow[], role: RoleId): Totals {
    const n = zeroN();
    let grams = 0;
    for (const r of rows) {
      const c = r.calc[role];
      if (c) {
        addN(n, c.n);
        grams += c.grams;
      }
    }
    return { ...n, grams };
  }

  function buildDayCtx(state: PlanState, day: WeekDay): DayContext {
    const trainingWeekday = day.dayType === 'training_day';
    const restDerived = trainingWeekday && !state.training;
    const dayType = restDerived ? 'rest_day' : day.dayType;
    const meals: DayContext['meals'] = [];
    for (const ms of day.meals) {
      let mealId = ms.mealId;
      let time = ms.targetTime;
      if (ms.slot === 'first_meal' && restDerived) {
        mealId = config.restFallbackFirstMeal[day.weekday] ?? mealId;
        time = config.restFirstMealTime;
      }
      if (ms.slot === 'dinner' && state.taverna && day.weekday === config.tavernaDay) {
        mealId = config.tavernaMealId;
        time = config.tavernaTime;
      }
      if (ms.slot === 'optional_snack' && !state.snack) continue;
      meals.push({ slot: ms.slot, mealId, time });
    }
    const workouts = day.workouts.filter((w) => !(restDerived && w.type === 'strength_session'));
    const firstTime = meals.find((m) => m.slot === 'first_meal')?.time;
    const dinnerTime = meals.find((m) => m.slot === 'dinner')?.time;
    const suppSlots = day.supplementSlots.map((sl) => ({
      ...sl,
      targetTime: sl.slot === 'with_first_meal' ? (firstTime ?? sl.targetTime) : sl.slot === 'with_dinner' ? (dinnerTime ?? sl.targetTime) : sl.targetTime,
    }));
    return { weekday: day.weekday, dayType, baseDayType: day.dayType, restDerived, assumption: !!day.dayTypeIsAssumption, workouts, meals, suppSlots };
  }

  function evaluateDay(state: PlanState, c: DayContext, father: Totals): DayEval {
    const t = seed.dayTypes[c.dayType];
    const w = state.weightKg;
    const pk = father.p / w;
    const ck = father.c / w;
    const fk = father.f / w;
    const rng = (v: number, r: { min: number; max: number }): RangeStatus => (v < r.min * 0.98 ? 'low' : v > r.max * 1.02 ? 'high' : 'ok');
    const ev: DayEval = {
      pk,
      ck,
      fk,
      protein: rng(pk, t.proteinGPerKg),
      carbs: rng(ck, t.carbsGPerKg),
      fat: rng(fk, t.fatGPerKg),
      fiber: father.fib >= t.fiberGMin ? 'ok' : 'low',
      targets: t,
    };
    if (state.tdee) {
      ev.balance = (father.kcal / state.tdee - 1) * 100;
      ev.balanceStatus = rng(ev.balance, t.energyBalancePercent);
    }
    return ev;
  }

  /**
   * Tagesplan mit Protein-Solver: Faktor f = (Zielprotein − Snackprotein) / Basisprotein der Hauptmahlzeiten, geklemmt.
   * Verhalten identisch zu v2 (Golden-Tests). Der Dial-Solver (Phase 3) ersetzt dies erst nach grünen Golden-Tests.
   */
  function computePlan(state: PlanState): Plan {
    const target = state.weightKg * config.proteinPerKg;
    const [lo, hi] = config.factorLimits;
    const base = seed.weekPlan.days.map((d) => {
      const ctx = buildDayCtx(state, d);
      let baseP = 0;
      let snackP = 0;
      for (const m of ctx.meals) {
        const p = sumRole(buildMeal(state, m.mealId, ctx, 1), 'father').p;
        if (m.slot === 'optional_snack') snackP += p;
        else baseP += p;
      }
      return { ctx, baseProtein: baseP, snackProtein: snackP, autoRaw: baseP > 0 ? (target - snackP) / baseP : 1 };
    });
    const avgAuto = mean(base.map((b) => clamp(b.autoRaw, lo, hi)));
    const fixed = Math.round(avgAuto * 100) / 100;
    const days: PlanDay[] = base.map(({ ctx, baseProtein, snackProtein, autoRaw }) => {
      const raw = state.factorMode === 'fixed' ? fixed : autoRaw;
      const factor = clamp(raw, lo, hi);
      const limited = Math.abs(factor - raw) > 1e-9;
      const mealViews: MealView[] = ctx.meals.map((m) => ({ ...m, meal: meal(m.mealId), rows: buildMeal(state, m.mealId, ctx, factor) }));
      const totals = {} as Record<RoleId, Totals>;
      for (const r of ROLE_IDS) {
        const n = zeroN();
        let grams = 0;
        for (const mv of mealViews) {
          const s = sumRole(mv.rows, r);
          addN(n, s);
          grams += s.grams;
        }
        totals[r] = { ...n, grams };
      }
      return { ...ctx, baseProtein, snackProtein, autoRaw, factor, limited, mealViews, totals, eval: evaluateDay(state, ctx, totals.father) };
    });
    const fs = days.map((c) => c.factor);
    return {
      target,
      days,
      fixedFactor: fixed,
      avgFactor: mean(fs),
      minFactor: Math.min(...fs),
      maxFactor: Math.max(...fs),
      avgKcal: mean(days.map((c) => c.totals.father.kcal)),
      avgP: mean(days.map((c) => c.totals.father.p)),
    };
  }

  /* ---------- Supplemente ---------- */
  function effDose(state: PlanState, item: SupplementProtocol['items'][number]): (Dose & { elemental?: boolean }) | null {
    if (item.supplementId === 'magnesium-bisglycinate') return { min: state.mgPerSlot, max: state.mgPerSlot, unit: 'mg', elemental: true };
    return item.dose;
  }
  function mgTotal(state: PlanState): number {
    let t = 0;
    for (const p of seed.supplementProtocols) {
      for (const it of p.items) {
        if (it.supplementId === 'magnesium-bisglycinate') t += effDose(state, it)?.max ?? 0;
      }
    }
    return t;
  }

  /* ---------- Einkauf ---------- */
  function shopCat(id: string): string {
    const o = config.shopOverride[id];
    if (o) return o;
    const c = ing(id).category;
    if (c === 'protein_fish' || c === 'protein_meat') return 'meat';
    if (c === 'dairy' || c === 'egg') return 'fresh';
    if (c === 'vegetable' || c === 'tuber' || c === 'herb' || c === 'fruit') return 'veg';
    return 'pantry';
  }

  function computeShopping(plan: Plan, state: PlanState): Shopping {
    const map = new Map<string, { id: string; grams: number; perDay: ShoppingItem['perDay']; missing: boolean }>();
    for (const c of plan.days) {
      if (!state.activeDays[c.weekday]) continue;
      for (const mv of c.mealViews) {
        if (mv.mealId === config.tavernaMealId) continue; // Restaurant: kein Einkauf
        for (const row of mv.rows) {
          for (const r of ROLE_IDS) {
            const calc = row.calc[r];
            if (!calc) continue;
            for (const l of calc.lines) {
              const e = map.get(l.id) ?? { id: l.id, grams: 0, perDay: {}, missing: false };
              map.set(l.id, e);
              e.grams += l.grams;
              e.perDay[c.weekday] = (e.perDay[c.weekday] ?? 0) + l.grams;
              if (l.missing) e.missing = true;
            }
          }
        }
      }
    }
    const items: ShoppingItem[] = Array.from(map.values()).map((e) => ({ ...e, cat: shopCat(e.id), buy: roundBuy(e.grams) }));
    const cats = config.shopCats.map((cat) => ({
      cat,
      items: items.filter((i) => i.cat === cat.id).sort((a, b) => ing(a.id).nameDe.localeCompare(ing(b.id).nameDe, 'de')),
    }));
    return { items, cats };
  }

  /* ---------- Plan-Check ---------- */
  function findings(plan: Plan, state: PlanState): Finding[] {
    const f: Finding[] = [];
    const w = state.weightKg;
    const lim = plan.days.filter((c) => c.limited);
    if (lim.length) {
      f.push({ k: 'bad', t: `Solver an der Grenze (${config.factorLimits[0]}–${config.factorLimits[1]}): ${lim.map((c) => config.dayShort[c.weekday]).join(', ')}. Protein-Ziel dort nicht exakt erreichbar.` });
    } else {
      f.push({ k: 'ok', t: `Protein-Ziel ${nf0.format(plan.target)} g (${nf2.format(config.proteinPerKg)} g/kg) wird ${state.factorMode === 'auto' ? 'an jedem Tag exakt' : 'im Mittel'} erreicht. Portionsfaktor Vater Ø ${nf2.format(plan.avgFactor)} (${nf2.format(plan.minFactor)}–${nf2.format(plan.maxFactor)}).` });
    }
    for (const type of ['training_day', 'rest_day'] as const) {
      const ds = plan.days.filter((c) => c.dayType === type);
      if (!ds.length) continue;
      const t = seed.dayTypes[type];
      const ck = mean(ds.map((c) => c.eval.ck));
      const fk = mean(ds.map((c) => c.eval.fk));
      const label = type === 'training_day' ? 'Trainingstage' : 'Ruhetage';
      if (ck < t.carbsGPerKg.min * 0.98) {
        f.push({ k: 'warn', t: `${label}: Kohlenhydrate Ø ${nf1.format(ck)} g/kg statt Ziel ${rngTxt(t.carbsGPerKg)} g/kg (Lücke ca. ${nf0.format((t.carbsGPerKg.min - ck) * w)} g/Tag). Der Solver skaliert nur auf Protein.` });
      } else if (ck > t.carbsGPerKg.max * 1.02) {
        f.push({ k: 'warn', t: `${label}: Kohlenhydrate Ø ${nf1.format(ck)} g/kg über Ziel ${rngTxt(t.carbsGPerKg)} g/kg.` });
      }
      if (fk > t.fatGPerKg.max * 1.02) f.push({ k: 'warn', t: `${label}: Fett Ø ${nf1.format(fk)} g/kg über Ziel ${rngTxt(t.fatGPerKg)} g/kg.` });
      else if (fk < t.fatGPerKg.min * 0.98) f.push({ k: 'info', t: `${label}: Fett Ø ${nf1.format(fk)} g/kg unter Ziel ${rngTxt(t.fatGPerKg)} g/kg.` });
    }
    const mg = mgTotal(state);
    if (mg > config.mgEfsaMg) {
      f.push({ k: 'warn', t: `Magnesium ${nf0.format(mg)} mg elementar/Tag liegt über der EFSA-Orientierung von ${config.mgEfsaMg} mg aus Supplementen. Unter „Weitere Einstellungen" auf 125 mg je Slot umschalten.` });
    }
    let red = 0;
    let fish = 0;
    for (const c of plan.days) {
      let r = false;
      let fi = false;
      for (const mv of c.mealViews) {
        for (const row of mv.rows) {
          if (row.calc.father) {
            if (row.comp.tags.includes('red_meat')) r = true;
            if (row.comp.tags.includes('fish')) fi = true;
          }
        }
      }
      if (r) red++;
      if (fi) fish++;
    }
    if (red > config.redMeatMaxPerWeek) f.push({ k: 'warn', t: `Rotfleisch an ${red} Tagen (Orientierung maximal ${config.redMeatMaxPerWeek}).` });
    else f.push({ k: 'info', t: `Rotfleisch an ${red} Tagen, Fisch an ${fish} Tagen (Vater).` });

    const sub = new Map<string, number>();
    const miss = new Set<string>();
    for (const c of plan.days) {
      for (const mv of c.mealViews) {
        for (const row of mv.rows) {
          for (const r of ROLE_IDS) {
            const calc = row.calc[r];
            if (!calc) continue;
            for (const l of calc.lines) {
              if (l.from && l.ratio) sub.set(`${l.from}>${l.id}`, l.ratio);
              if (l.missing) miss.add(ing(l.id).nameDe);
            }
          }
        }
      }
    }
    for (const [k, q] of sub) {
      const [a, b] = k.split('>') as [string, string];
      if (q > 1.5 || q < 0.6) {
        f.push({ k: 'info', t: `Ersatz ${shortName(ing(a).nameDe)} → ${shortName(ing(b).nameDe)} (Protein-/Nährwert-gleich) ändert die Menge auf das ${nf1.format(q)}-Fache. Praktikabilität prüfen.` });
      }
    }
    if (miss.size) f.push({ k: 'bad', t: `Nicht verfügbar und ohne Ersatz im Inventar: ${Array.from(miss).map(shortName).join(', ')}.` });
    if (state.tdee) {
      const b = mean(plan.days.map((c) => c.eval.balance ?? 0));
      f.push({ k: 'info', t: `Energiebilanz gegenüber ${nf0.format(state.tdee)} kcal Erhaltungsbedarf: Ø ${b >= 0 ? '+' : ''}${nf1.format(b)} %.` });
    }
    return f;
  }

  return {
    config,
    seed,
    ingredient: ing,
    component: comp,
    meal,
    supplement: (id: string) => must(supIdx, id, 'Supplement'),
    computePlan,
    computeShopping,
    findings,
    effDose,
    mgTotal,
  };
}

export type Engine = ReturnType<typeof createEngine>;
