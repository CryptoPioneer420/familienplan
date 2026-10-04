import type { ComponentTag, RoleId, SlotId, SupplementSlotId, TmUseCase } from '@familienplan/schema';

export const TAG_LABEL: Record<ComponentTag, string> = {
  low_carb: 'Low-Carb',
  high_protein: 'Protein',
  complex_carb: 'Komplex-KH',
  fish: 'Fisch',
  red_meat: 'Rotfleisch',
  dairy_whey: 'Anari/Whey',
  egg: 'Ei',
  plant_protein: 'Pflanzlich',
  batch_cookable: 'Batch',
  no_cook: 'Ohne Kochen',
  contains_raw_grain: 'Rohes Getreide',
};

export const TM_LABEL: Record<TmUseCase, string> = {
  varoma_steam: 'Varoma',
  cook: 'Kochen/Schmoren',
  mill: 'Mahlen',
  blend: 'Mixen',
  combined: 'Kombi',
  none: '',
};

export const SLOT_LABEL: Record<SlotId, string> = {
  first_meal: 'Fastenbrechen',
  dinner: 'Abendessen',
  optional_snack: 'Spätsnack',
};

export const SUPP_SLOT_LABEL: Record<SupplementSlotId, string> = {
  with_first_meal: 'Fastenbrechen-Stack',
  with_dinner: 'Dinner-Stack',
  before_sleep: 'Schlaf-Stack',
};

export const SUPP_SLOT_HINT: Record<SupplementSlotId, string> = {
  with_first_meal: 'zum ersten Essen, mit Fett',
  with_dinner: 'zum Abendessen',
  before_sleep: '30–60 min vor dem Schlafen',
};

export const ROLE_LABEL: Record<RoleId, string> = { father: 'Vater', mother: 'Mutter', child: 'Kind' };
export const ROLE_ABBR: Record<RoleId, string> = { father: 'V', mother: 'M', child: 'K' };
export const UNIT_LABEL: Record<string, string> = { g: 'g', mg: 'mg', ug: 'µg', iu: 'IU' };

export const SEVERITY_LABEL = { critical: 'Kritisch', caution: 'Vorsicht', info: 'Hinweis' } as const;
