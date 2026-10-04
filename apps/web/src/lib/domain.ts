/**
 * Reine Darstellungslogik (kein React, kein DOM): wandelt das Engine-Ergebnis in Ansichtsmodelle.
 * Portiert aus der v2-Single-File-App (dayEvents, Varoma-Kombi, Kind-Box, Einkaufstext).
 */
import type { Engine, MealView, PlanDay, PlanState, Shopping, ShoppingItem } from '@familienplan/engine';
import { buyHint, buyText, g0, nf0, nf2, shortName, toMin } from '@familienplan/engine';
import type { Component, ComponentTag, Dose, RoleId, SupplementSlotId, Weekday } from '@familienplan/schema';
import { ROLE_IDS, WEEKDAYS } from '@familienplan/schema/constants';
import { SUPP_SLOT_LABEL, UNIT_LABEL } from './labels';

/* ---------- Zeit & Datum ---------- */

export const RAIL_START_MIN = 6 * 60;
export const RAIL_END_MIN = 22 * 60;
export const RAIL_TICKS = [6, 9, 12, 15, 18, 21] as const;

/** Position auf der gemeinsamen Zeitachse 06–22 Uhr in Prozent (0–100, geklemmt). */
export function railPos(time: string): number {
  const p = ((toMin(time) - RAIL_START_MIN) / (RAIL_END_MIN - RAIL_START_MIN)) * 100;
  return Math.min(100, Math.max(0, p));
}

const JS_DAY_TO_WEEKDAY: readonly Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function weekdayOfDate(d: Date): Weekday {
  return JS_DAY_TO_WEEKDAY[d.getDay()] as Weekday;
}

/** Lokales Datum als YYYY-MM-DD (ohne UTC-Verschiebung). */
export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Datum des gewünschten Wochentags in der Kalenderwoche (Mo–So) von `ref`. */
export function dateOfWeekday(ref: Date, weekday: Weekday): Date {
  const idx = WEEKDAYS.indexOf(weekday);
  const sinceMonday = (ref.getDay() + 6) % 7;
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - sinceMonday + idx);
  return d;
}

/* ---------- Supplemente ---------- */

export function doseText(dose: (Dose & { elemental?: boolean }) | null): string {
  if (!dose) return 'nach Laborwert';
  const u = UNIT_LABEL[dose.unit] ?? dose.unit;
  const el = dose.elemental ? ' elementar' : '';
  return dose.min === dose.max ? `${nf0.format(dose.min)} ${u}${el}` : `${nf0.format(dose.min)}–${nf0.format(dose.max)} ${u}${el}`;
}

export function stackNames(engine: Engine, slot: SupplementSlotId): string {
  const p = engine.seed.supplementProtocols.find((x) => x.slot === slot);
  return p ? p.items.map((i) => shortName(engine.supplement(i.supplementId).nameDe)).join(', ') : '';
}

export interface StackItem {
  key: string;
  nameDe: string;
  dose: string;
  labGuided: boolean;
  withFat: boolean;
  note: string | null;
  upper: string | null;
}

/** Einträge eines Slots in Protokollreihenfolge, mit Tracker-Schlüssel `protocolId:supplementId`. */
export function stackItems(engine: Engine, state: PlanState, slot: SupplementSlotId): StackItem[] {
  const out: StackItem[] = [];
  for (const p of engine.seed.supplementProtocols) {
    if (p.slot !== slot) continue;
    for (const it of p.items) {
      const s = engine.supplement(it.supplementId);
      const ul = s.upperIntakeReference;
      out.push({
        key: `${p.id}:${it.supplementId}`,
        nameDe: s.nameDe,
        dose: doseText(engine.effDose(state, it)),
        labGuided: s.dosePolicy === 'lab_guided',
        withFat: s.takeWith === 'fat_containing_meal',
        note: it.note ?? null,
        upper: ul ? `Obergrenze ${nf0.format(ul.value)} ${UNIT_LABEL[ul.unit] ?? ul.unit} (${ul.scope.split(';')[0]})` : null,
      });
    }
  }
  return out;
}

/* ---------- Tagesablauf ---------- */

export type EventKind = 'cal' | 'str' | 'first' | 'dinner' | 'snack' | 'supp';

export interface DayEvent {
  time: string;
  kind: EventKind;
  title: string;
  detail: string;
  /** Index in `PlanDay.mealViews`, falls der Eintrag eine Mahlzeit ist. */
  mealIndex: number | null;
  /** Zugehöriger Supplement-Slot (Stack zur Mahlzeit bzw. Schlaf-Stack). */
  suppSlot: SupplementSlotId | null;
}

export function dayEvents(engine: Engine, day: PlanDay): DayEvent[] {
  const ev: DayEvent[] = [];
  for (const w of day.workouts) {
    const cal = w.type === 'calisthenics_morning';
    ev.push({
      time: w.startTime ?? (cal ? '06:30' : '12:30'),
      kind: cal ? 'cal' : 'str',
      title: cal ? 'Calisthenics' : 'Krafttraining',
      detail: `${w.durationMin} min${w.fasted ? ', nüchtern' : ''}`,
      mealIndex: null,
      suppSlot: null,
    });
  }
  day.mealViews.forEach((mv, i) => {
    const sun = day.weekday === 'sun' && mv.slot === 'first_meal';
    const title =
      mv.slot === 'first_meal'
        ? sun ? 'Brunch (Fastenbrechen)' : 'Fastenbrechen'
        : mv.slot === 'dinner'
          ? mv.mealId === engine.config.tavernaMealId ? 'Taverne' : 'Dinner'
          : 'Spätsnack';
    ev.push({
      time: mv.time,
      kind: mv.slot === 'first_meal' ? 'first' : mv.slot === 'dinner' ? 'dinner' : 'snack',
      title,
      detail: mv.meal.nameDe,
      mealIndex: i,
      suppSlot: mv.slot === 'first_meal' ? 'with_first_meal' : mv.slot === 'dinner' ? 'with_dinner' : null,
    });
  });
  const sleep = day.suppSlots.find((s) => s.slot === 'before_sleep');
  if (sleep) {
    ev.push({ time: sleep.targetTime, kind: 'supp', title: SUPP_SLOT_LABEL.before_sleep, detail: stackNames(engine, 'before_sleep'), mealIndex: null, suppSlot: 'before_sleep' });
  }
  // stabil: gleiche Uhrzeit behält die Einfügereihenfolge (Training vor Essen)
  return ev
    .map((e, i) => ({ e, i }))
    .sort((a, b) => toMin(a.e.time) - toMin(b.e.time) || a.i - b.i)
    .map((x) => x.e);
}

/* ---------- Mahlzeit-Tabelle (Zutaten je Rolle) ---------- */

export interface IngredientLine {
  name: string;
  substituteFor: string | null;
  missing: boolean;
  /** Nur Taverne: gegarte Menge bzw. ganzer Fisch (Richtwerte). */
  yieldNote: string | null;
  grams: Record<RoleId, number | null>;
}
export interface ComponentBlock {
  comp: Component;
  tags: ComponentTag[];
  hasThermomix: boolean;
  lines: IngredientLine[];
}

export function mealBlocks(engine: Engine, mv: MealView): ComponentBlock[] {
  const cfg = engine.config;
  const isTaverna = mv.mealId === cfg.tavernaMealId;
  return mv.rows.map((row) => {
    const firstCalc = ROLE_IDS.map((r) => row.calc[r]).find((c) => c != null) ?? null;
    const lines = row.comp.ingredients.map((it, i): IngredientLine => {
      const l = firstCalc?.lines[i];
      const id = l?.id ?? it.ingredientId;
      let yieldNote: string | null = null;
      const y = cfg.cookedYield[id];
      if (isTaverna && row.calc.father && y) {
        const raw = row.calc.father.lines[i]?.grams ?? 0;
        const whole = cfg.wholeFishYield[id];
        yieldNote = `Vater ≈ ${g0(raw * y)} gegart/essbar${whole ? `, ganzer Fisch ≈ ${g0(raw / whole)} bestellen` : ''}`;
      }
      const grams = { father: null, mother: null, child: null } as Record<RoleId, number | null>;
      for (const r of ROLE_IDS) grams[r] = row.calc[r]?.lines[i]?.grams ?? null;
      return {
        name: shortName(engine.ingredient(id).nameDe),
        substituteFor: l?.from ? shortName(engine.ingredient(l.from).nameDe) : null,
        missing: l?.missing ?? false,
        yieldNote,
        grams,
      };
    });
    return {
      comp: row.comp,
      tags: row.comp.tags.slice(0, 3),
      hasThermomix: row.comp.thermomix.useCase !== 'none',
      lines,
    };
  });
}

/* ---------- Kind-Box ---------- */

export interface ChildBox {
  separateBeforeSeasoning: string[];
  nutsGroundOnly: boolean;
  notes: string[];
  notForChild: string[];
  adultsOnly: boolean;
}

export function childBox(engine: Engine, mv: MealView): ChildBox {
  const childRows = mv.rows.filter((r) => r.calc.child);
  return {
    separateBeforeSeasoning: childRows.filter((r) => r.comp.childSplit.separable && r.comp.childSplit.seasoningAfterSplit).map((r) => shortName(r.comp.nameDe)),
    nutsGroundOnly: childRows.some((r) => r.comp.ingredients.some((it) => engine.ingredient(it.ingredientId).allergens.includes('tree_nuts'))),
    notes: Array.from(new Set(childRows.flatMap((r) => r.comp.childSplit.childNotes))),
    notForChild: mv.rows.filter((r) => !r.calc.child).map((r) => shortName(r.comp.nameDe)),
    adultsOnly: childRows.length === 0,
  };
}

/* ---------- Thermomix ---------- */

export function varomaTime(comp: Component): number | null {
  const steps = comp.thermomix.steps.filter((s) => s.temperatureC === 120 && s.timeMin);
  return steps.length ? (steps[steps.length - 1]?.timeMin ?? null) : null;
}

export interface VaromaCombo {
  totalMin: number;
  steps: Array<{ startMinute: number; name: string; minutes: number; tier: 'varoma' | 'einlegeboden' }>;
}

/** Mehrere Varoma-Komponenten einer Mahlzeit so staffeln, dass alles gleichzeitig fertig wird. */
export function varomaCombo(mv: MealView): VaromaCombo | null {
  const items = mv.rows
    .filter((r) => r.comp.thermomix.useCase === 'varoma_steam')
    .map((r) => ({ name: shortName(r.comp.nameDe), minutes: varomaTime(r.comp) }))
    .filter((x): x is { name: string; minutes: number } => x.minutes != null)
    .sort((a, b) => b.minutes - a.minutes);
  if (items.length < 2) return null;
  const end = items[0]?.minutes ?? 0;
  return {
    totalMin: end,
    steps: items.map((x, i) => ({ startMinute: end - x.minutes, name: x.name, minutes: x.minutes, tier: i === 0 ? 'varoma' : 'einlegeboden' })),
  };
}

/* ---------- Einkauf ---------- */

export function shopItemDays(engine: Engine, item: ShoppingItem): string {
  return engine.config.days
    .filter((d) => item.perDay[d])
    .map((d) => `${engine.config.dayShort[d]} ${nf0.format(Math.round(item.perDay[d] ?? 0))}`)
    .join(' · ');
}

/** Einkaufsliste als Klartext (für Teilen/Zwischenablage). Abgehakte Artikel fehlen, wenn `onlyOpen`. */
export function shoppingText(engine: Engine, shop: Shopping, checked: Readonly<Record<string, boolean>>, onlyOpen: boolean): string {
  const blocks: string[] = [];
  for (const { cat, items } of shop.cats) {
    const rows = items.filter((i) => !(onlyOpen && checked[i.id]));
    if (!rows.length) continue;
    const lines = rows.map((i) => {
      const hint = buyHint(i);
      return `${checked[i.id] ? '[x]' : '[ ]'} ${shortName(engine.ingredient(i.id).nameDe)}: ${buyText(i)}${hint ? ` (${hint})` : ''}`;
    });
    blocks.push(`${cat.label}\n${lines.join('\n')}`);
  }
  return blocks.length ? `Einkauf Familienplan\n\n${blocks.join('\n\n')}` : 'Einkauf Familienplan\n\nNichts zu kaufen.';
}

export const factorText = (f: number): string => `× ${nf2.format(f)}`;

export function speedText(speed: string | null): string | null {
  if (!speed) return null;
  return /^\d+$/.test(speed) ? `Stufe ${speed}` : speed;
}
