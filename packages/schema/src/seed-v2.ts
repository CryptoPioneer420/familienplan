import { z } from 'zod';

/**
 * Zod-Schema für Seed v2 (Inhalte aus Phase 1, Struktur unverändert gegenüber der Single-File-App).
 * `.strict()` ist Absicht: unbekannte Felder sollen im CI auffallen.
 * Das v3-Inhaltsschema (Quellen, Konfidenz, Status, Dial-Zutaten) folgt in Phase 2.
 */

export const ROLE_IDS = ['father', 'mother', 'child'] as const;
export const RoleId = z.enum(ROLE_IDS);
export type RoleId = z.infer<typeof RoleId>;

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export const Weekday = z.enum(WEEKDAYS);
export type Weekday = z.infer<typeof Weekday>;

const timeHHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Zeit muss HH:MM sein');
const confidence = z.enum(['sicher', 'wahrscheinlich', 'vermutung']);
const range = z.object({ min: z.number(), max: z.number() }).strict();

export const DayTypeId = z.enum(['training_day', 'rest_day']);
export type DayTypeId = z.infer<typeof DayTypeId>;

export const Per100g = z
  .object({
    kcal: z.number().nonnegative(),
    proteinG: z.number().nonnegative(),
    fatG: z.number().nonnegative(),
    carbsG: z.number().nonnegative(),
    fiberG: z.number().nonnegative(),
  })
  .strict();
export type Per100g = z.infer<typeof Per100g>;

export const IngredientCategory = z.enum([
  'egg', 'herb', 'tuber', 'fruit', 'protein_meat', 'vegetable', 'protein_fish',
  'fat_oil', 'grain', 'dairy', 'legume', 'nut_seed',
]);

export const Ingredient = z
  .object({
    id: z.string().min(1),
    nameDe: z.string().min(1),
    category: IngredientCategory,
    localCY: z.boolean(),
    userListedLocal: z.boolean(),
    per100g: Per100g,
    glycemicClass: z.enum(['high', 'medium', 'low', 'not_applicable']),
    allergens: z.array(z.string()),
    safetyNotes: z.array(z.string()),
  })
  .strict();
export type Ingredient = z.infer<typeof Ingredient>;

export const ComponentTag = z.enum([
  'no_cook', 'egg', 'low_carb', 'contains_raw_grain', 'complex_carb', 'dairy_whey',
  'plant_protein', 'high_protein', 'batch_cookable', 'fish', 'red_meat',
]);
export type ComponentTag = z.infer<typeof ComponentTag>;

export const TmUseCase = z.enum(['blend', 'varoma_steam', 'cook', 'mill', 'none', 'combined']);
export type TmUseCase = z.infer<typeof TmUseCase>;

export const ThermomixStep = z
  .object({
    order: z.number().int().positive(),
    action: z.string().min(1),
    temperatureC: z.number().nullable(),
    timeMin: z.number().nullable(),
    speed: z.string().nullable(),
  })
  .strict();

export const Component = z
  .object({
    id: z.string().min(1),
    nameDe: z.string().min(1),
    type: z.enum(['bowl', 'carb_complex', 'plate', 'protein', 'sauce_fat', 'snack', 'vegetable']),
    ingredients: z.array(z.object({ ingredientId: z.string().min(1), grams: z.number().positive() }).strict()).min(1),
    nutritionPerAdultPortion: Per100g, // gleiche Schlüssel, aber pro Portion; wird in v3 berechnet statt gespeichert
    childSplit: z
      .object({
        separable: z.boolean(),
        seasoningAfterSplit: z.boolean(),
        childNotes: z.array(z.string()),
      })
      .strict(),
    thermomix: z
      .object({
        useCase: TmUseCase,
        steps: z.array(ThermomixStep),
        tips: z.array(z.string()),
      })
      .strict(),
    tags: z.array(ComponentTag),
  })
  .strict();
export type Component = z.infer<typeof Component>;

export const SlotId = z.enum(['first_meal', 'dinner', 'optional_snack']);
export type SlotId = z.infer<typeof SlotId>;

export const Meal = z
  .object({
    id: z.string().min(1),
    nameDe: z.string().min(1),
    slot: SlotId,
    window: z.object({ start: timeHHMM, end: timeHHMM }).strict(),
    componentRefs: z
      .array(
        z
          .object({
            componentId: z.string().min(1),
            portionFactors: z
              .object({ father: z.number().nonnegative().optional(), mother: z.number().nonnegative().optional(), child: z.number().nonnegative().optional() })
              .strict(),
          })
          .strict(),
      )
      .min(1),
    dayTypeFit: z.array(DayTypeId).min(1),
    notes: z.array(z.string()),
  })
  .strict();
export type Meal = z.infer<typeof Meal>;

const Dose = z
  .object({ min: z.number(), max: z.number(), unit: z.enum(['g', 'mg', 'ug', 'iu']), elemental: z.boolean().optional() })
  .strict();
export type Dose = z.infer<typeof Dose>;

export const Supplement = z
  .object({
    id: z.string().min(1),
    nameDe: z.string().min(1),
    adultOnly: z.boolean(),
    dosePolicy: z.enum(['fixed_range', 'lab_guided']),
    dose: Dose.nullable(),
    takeWith: z.enum(['any_meal', 'before_sleep', 'fat_containing_meal', 'with_dinner']),
    rationale: z.object({ text: z.string(), confidence, references: z.array(z.string()).optional() }).strict(),
    upperIntakeReference: z
      .object({ value: z.number(), unit: z.enum(['g', 'mg', 'ug', 'iu']), authority: z.string(), scope: z.string() })
      .strict()
      .nullable(),
    interactions: z.array(z.string()),
    monitoring: z.array(z.string()),
    flags: z.array(z.object({ text: z.string(), confidence }).strict()),
  })
  .strict();
export type Supplement = z.infer<typeof Supplement>;

export const SupplementSlotId = z.enum(['with_first_meal', 'with_dinner', 'before_sleep']);
export type SupplementSlotId = z.infer<typeof SupplementSlotId>;

export const SupplementProtocol = z
  .object({
    id: z.string().min(1),
    nameDe: z.string().min(1),
    slot: SupplementSlotId,
    items: z.array(z.object({ supplementId: z.string().min(1), dose: Dose.nullable(), note: z.string().optional() }).strict()),
  })
  .strict();
export type SupplementProtocol = z.infer<typeof SupplementProtocol>;

export const DayTypeTargets = z
  .object({
    label: z.string(),
    proteinGPerKg: range,
    carbsGPerKg: range,
    fatGPerKg: range,
    energyBalancePercent: range,
    fiberGMin: z.number(),
    claims: z.array(z.object({ text: z.string(), confidence }).strict()),
  })
  .strict();
export type DayTypeTargets = z.infer<typeof DayTypeTargets>;

export const Workout = z
  .object({
    type: z.enum(['calisthenics_morning', 'strength_session']),
    timeOfDay: z.string(),
    startTime: timeHHMM.optional(),
    durationMin: z.number().positive(),
    fasted: z.boolean(),
    notes: z.array(z.string()),
  })
  .strict();
export type Workout = z.infer<typeof Workout>;

export const WeekDay = z
  .object({
    weekday: Weekday,
    dayType: DayTypeId,
    dayTypeIsAssumption: z.boolean().optional(),
    workouts: z.array(Workout),
    meals: z
      .array(z.object({ slot: SlotId, mealId: z.string().min(1), targetTime: timeHHMM, optional: z.boolean().optional() }).strict())
      .min(1),
    supplementSlots: z
      .array(z.object({ slot: SupplementSlotId, protocolId: z.string().min(1), targetTime: timeHHMM }).strict()),
  })
  .strict();
export type WeekDay = z.infer<typeof WeekDay>;

export const SafetyRule = z
  .object({
    id: z.string().min(1),
    severity: z.enum(['critical', 'caution', 'info']),
    appliesToRoles: z.array(RoleId).min(1),
    text: z.string(),
    confidence: z.enum(['sicher', 'wahrscheinlich']),
  })
  .strict();
export type SafetyRule = z.infer<typeof SafetyRule>;

export const OpenDecision = z
  .object({ id: z.string(), question: z.string(), status: z.enum(['open', 'decided']), seedDefault: z.string() })
  .strict();

export const SeedV2 = z
  .object({
    schemaVersion: z.string(),
    meta: z
      .object({
        title: z.string(),
        locale: z.string(),
        region: z.string(),
        createdAt: z.string(),
        nutritionDataStatus: z.string(),
        notes: z.array(z.string()),
      })
      .strict(),
    household: z
      .object({
        members: z.array(
          z
            .object({
              id: RoleId,
              role: RoleId,
              displayName: z.string(),
              ageYears: z.number().nullable(),
              bodyWeightKg: z.number().nullable(),
              goal: z.string(),
              supplementsAllowed: z.boolean(),
              isPlaceholder: z.boolean(),
              notes: z.array(z.string()),
            })
            .strict(),
        ),
      })
      .strict(),
    dayTypes: z.object({ training_day: DayTypeTargets, rest_day: DayTypeTargets }).strict(),
    ingredients: z.array(Ingredient).min(1),
    components: z.array(Component).min(1),
    meals: z.array(Meal).min(1),
    supplements: z.array(Supplement),
    supplementProtocols: z.array(SupplementProtocol),
    weekPlan: z.object({ days: z.array(WeekDay).length(7) }).strict(),
    safetyRules: z.array(SafetyRule),
    openDecisions: z.array(OpenDecision),
  })
  .strict()
  .superRefine((seed, ctx) => {
    // Referenzielle Integrität (die v2-Validatorlogik in TypeScript)
    const ing = new Set(seed.ingredients.map((i) => i.id));
    const comp = new Set(seed.components.map((c) => c.id));
    const meal = new Set(seed.meals.map((m) => m.id));
    const sup = new Set(seed.supplements.map((s) => s.id));
    const proto = new Set(seed.supplementProtocols.map((p) => p.id));
    const dupes = (label: string, ids: string[]) => {
      const seen = new Set<string>();
      ids.forEach((id) => {
        if (seen.has(id)) ctx.addIssue({ code: 'custom', message: `${label}: doppelte id "${id}"` });
        seen.add(id);
      });
    };
    dupes('ingredients', seed.ingredients.map((i) => i.id));
    dupes('components', seed.components.map((c) => c.id));
    dupes('meals', seed.meals.map((m) => m.id));
    dupes('supplements', seed.supplements.map((s) => s.id));
    seed.components.forEach((c) =>
      c.ingredients.forEach((it) => {
        if (!ing.has(it.ingredientId)) ctx.addIssue({ code: 'custom', message: `component ${c.id}: unbekannte Zutat ${it.ingredientId}` });
      }),
    );
    seed.meals.forEach((m) =>
      m.componentRefs.forEach((r) => {
        if (!comp.has(r.componentId)) ctx.addIssue({ code: 'custom', message: `meal ${m.id}: unbekannte Komponente ${r.componentId}` });
      }),
    );
    seed.supplementProtocols.forEach((p) =>
      p.items.forEach((it) => {
        if (!sup.has(it.supplementId)) ctx.addIssue({ code: 'custom', message: `protocol ${p.id}: unbekanntes Supplement ${it.supplementId}` });
      }),
    );
    seed.weekPlan.days.forEach((d) => {
      d.meals.forEach((m) => {
        if (!meal.has(m.mealId)) ctx.addIssue({ code: 'custom', message: `weekPlan ${d.weekday}: unbekannte Mahlzeit ${m.mealId}` });
      });
      d.supplementSlots.forEach((s) => {
        if (!proto.has(s.protocolId)) ctx.addIssue({ code: 'custom', message: `weekPlan ${d.weekday}: unbekanntes Protokoll ${s.protocolId}` });
      });
    });
    const days = seed.weekPlan.days.map((d) => d.weekday);
    if (new Set(days).size !== 7) ctx.addIssue({ code: 'custom', message: 'weekPlan: jeder Wochentag genau einmal' });
  });
export type SeedV2 = z.infer<typeof SeedV2>;

export function parseSeedV2(json: unknown): SeedV2 {
  return SeedV2.parse(json);
}
