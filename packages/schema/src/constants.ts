/** Konstanten ohne Zod-Abhängigkeit, damit Client-Bundles (Engine, UI) Zod nicht mitladen. */
export const ROLE_IDS = ['father', 'mother', 'child'] as const;
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
