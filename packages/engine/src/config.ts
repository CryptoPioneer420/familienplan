import type { EngineConfig } from './types';

/** App-Logik-Konfiguration (nicht im Dataset). Werte 1:1 aus v2, damit die Golden-Tests grün sind. */
export const DEFAULT_CONFIG: EngineConfig = {
  proteinPerKg: 1.8,
  weight: { min: 65, max: 115, def: 95 },
  days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  dayShort: { mon: 'Mo', tue: 'Di', wed: 'Mi', thu: 'Do', fri: 'Fr', sat: 'Sa', sun: 'So' },
  dayLong: { mon: 'Montag', tue: 'Dienstag', wed: 'Mittwoch', thu: 'Donnerstag', fri: 'Freitag', sat: 'Samstag', sun: 'Sonntag' },
  restFirstMealTime: '13:00',
  restFallbackFirstMeal: { mon: 'first-r-eier-horta', wed: 'first-r-anari-lowcarb', fri: 'first-r-eier-horta' },
  tavernaDay: 'sat',
  tavernaMealId: 'dinner-sat-taverna',
  tavernaTime: '19:30',
  tavernaLavrakiComponentId: 'taverna-lavraki-grill',
  tavernaLammComponentId: 'taverna-lamm-kotelett',
  factorLimits: [0.6, 2.0],
  mgEfsaMg: 250,
  redMeatMaxPerWeek: 3,
  inventory: [
    { group: 'Fisch', ids: ['tsipoura', 'lavraki'] },
    { group: 'Fleisch', ids: ['lamm-keule', 'ziege'] },
    { group: 'Frischetheke', ids: ['anari', 'schafjoghurt', 'ei'] },
    { group: 'Knollen', ids: ['kartoffel', 'kolokasi'] },
    { group: 'Gemüse & Frisches', ids: ['horta', 'brokkoli', 'zucchini', 'aubergine', 'tomate', 'gurke', 'avocado'] },
  ],
  substitutions: {
    lavraki: [{ to: 'tsipoura', match: 'protein' }, { to: 'ziege', match: 'protein' }, { to: 'lamm-keule', match: 'protein' }],
    tsipoura: [{ to: 'lavraki', match: 'protein' }, { to: 'ziege', match: 'protein' }, { to: 'lamm-keule', match: 'protein' }],
    'lamm-keule': [{ to: 'ziege', match: 'protein' }],
    ziege: [{ to: 'lamm-keule', match: 'protein' }],
    kolokasi: [{ to: 'kartoffel', match: 'carbs' }, { to: 'bulgur-trocken', match: 'carbs' }],
    kartoffel: [{ to: 'kolokasi', match: 'carbs' }, { to: 'bulgur-trocken', match: 'carbs' }],
    anari: [{ to: 'schafjoghurt', match: 'protein' }],
    schafjoghurt: [{ to: 'anari', match: 'protein' }],
    ei: [{ to: 'anari', match: 'protein' }],
    horta: [{ to: 'brokkoli', match: 'mass' }, { to: 'zucchini', match: 'mass' }],
    brokkoli: [{ to: 'zucchini', match: 'mass' }, { to: 'horta', match: 'mass' }],
    zucchini: [{ to: 'aubergine', match: 'mass' }, { to: 'horta', match: 'mass' }],
    aubergine: [{ to: 'zucchini', match: 'mass' }],
    tomate: [{ to: 'gurke', match: 'mass' }],
    gurke: [{ to: 'tomate', match: 'mass' }],
    avocado: [{ to: 'evoo', match: 'fat' }],
  },
  shopCats: [
    { id: 'meat', label: 'Fisch & Fleisch' },
    { id: 'fresh', label: 'Frischetheke, Anari & Bäckerei' },
    { id: 'veg', label: 'Markt-Gemüse & Frisches' },
    { id: 'pantry', label: 'Vorrat' },
  ],
  shopOverride: { 'blaubeere-tk': 'pantry', sauerteigbrot: 'fresh', zitronensaft: 'veg' },
  cookedYield: { lavraki: 0.75, oktopus: 0.55, 'lamm-kotelett': 0.62 },
  wholeFishYield: { lavraki: 0.45 },
};

export function defaultPlanState(config: EngineConfig = DEFAULT_CONFIG) {
  return {
    weightKg: config.weight.def,
    training: true,
    snack: true,
    taverna: false,
    tavernaMain: 'lavraki' as const,
    factorMode: 'auto' as const,
    mgPerSlot: 150,
    tdee: null as number | null,
    unavailable: {} as Record<string, boolean>,
    activeDays: Object.fromEntries(config.days.map((d) => [d, true])) as Record<(typeof config.days)[number], boolean>,
  };
}
