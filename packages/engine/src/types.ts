import type { Component, DayTypeId, DayTypeTargets, Meal, RoleId, SlotId, SupplementSlotId, Weekday, Workout } from '@familienplan/schema';

export type TavernaMain = 'lavraki' | 'lamm';
export type FactorMode = 'auto' | 'fixed';

/** Alles, was die Berechnung beeinflusst. Körperdaten (weightKg, tdee) bleiben auf dem Gerät und werden nie synchronisiert. */
export interface PlanState {
  weightKg: number;
  training: boolean;
  snack: boolean;
  taverna: boolean;
  tavernaMain: TavernaMain;
  factorMode: FactorMode;
  mgPerSlot: number;
  tdee: number | null;
  unavailable: Record<string, boolean>;
  activeDays: Record<Weekday, boolean>;
}

export interface Nutrients {
  kcal: number;
  p: number;
  f: number;
  c: number;
  fib: number;
}
export interface Totals extends Nutrients {
  grams: number;
}

export type SubstitutionMatch = 'protein' | 'carbs' | 'fat' | 'mass';

export interface ResolvedLine {
  baseId: string;
  id: string;
  grams: number;
  from: string | null;
  ratio?: number;
  missing: boolean;
  n: Nutrients;
}

export interface Calc {
  factor: number;
  lines: ResolvedLine[];
  n: Nutrients;
  grams: number;
}

export type PortionFactors = Record<RoleId, number>;

export interface MealRow {
  comp: Component;
  pf: PortionFactors;
  calc: Record<RoleId, Calc | null>;
}

export interface DayContext {
  weekday: Weekday;
  dayType: DayTypeId;
  baseDayType: DayTypeId;
  restDerived: boolean;
  assumption: boolean;
  workouts: Workout[];
  meals: Array<{ slot: SlotId; mealId: string; time: string }>;
  suppSlots: Array<{ slot: SupplementSlotId; protocolId: string; targetTime: string }>;
}

export interface MealView {
  slot: SlotId;
  mealId: string;
  time: string;
  meal: Meal;
  rows: MealRow[];
}

export type RangeStatus = 'low' | 'ok' | 'high';

export interface DayEval {
  pk: number;
  ck: number;
  fk: number;
  protein: RangeStatus;
  carbs: RangeStatus;
  fat: RangeStatus;
  fiber: 'ok' | 'low';
  targets: DayTypeTargets;
  balance?: number;
  balanceStatus?: RangeStatus;
}

export interface PlanDay extends DayContext {
  baseProtein: number;
  snackProtein: number;
  autoRaw: number;
  factor: number;
  limited: boolean;
  mealViews: MealView[];
  totals: Record<RoleId, Totals>;
  eval: DayEval;
}

export interface Plan {
  target: number;
  days: PlanDay[];
  fixedFactor: number;
  avgFactor: number;
  minFactor: number;
  maxFactor: number;
  avgKcal: number;
  avgP: number;
}

export interface ShoppingItem {
  id: string;
  grams: number;
  perDay: Partial<Record<Weekday, number>>;
  missing: boolean;
  cat: string;
  buy: number;
}
export interface ShoppingCategory {
  cat: { id: string; label: string };
  items: ShoppingItem[];
}
export interface Shopping {
  items: ShoppingItem[];
  cats: ShoppingCategory[];
}

export type FindingKind = 'ok' | 'warn' | 'bad' | 'info';
export interface Finding {
  k: FindingKind;
  t: string;
}

export interface EngineConfig {
  proteinPerKg: number;
  weight: { min: number; max: number; def: number };
  days: readonly Weekday[];
  dayShort: Record<Weekday, string>;
  dayLong: Record<Weekday, string>;
  restFirstMealTime: string;
  restFallbackFirstMeal: Partial<Record<Weekday, string>>;
  tavernaDay: Weekday;
  tavernaMealId: string;
  tavernaTime: string;
  tavernaLavrakiComponentId: string;
  tavernaLammComponentId: string;
  factorLimits: readonly [number, number];
  mgEfsaMg: number;
  redMeatMaxPerWeek: number;
  inventory: ReadonlyArray<{ group: string; ids: readonly string[] }>;
  substitutions: Record<string, ReadonlyArray<{ to: string; match: SubstitutionMatch }>>;
  shopCats: ReadonlyArray<{ id: string; label: string }>;
  shopOverride: Record<string, string>;
  cookedYield: Record<string, number>;
  wholeFishYield: Record<string, number>;
}
