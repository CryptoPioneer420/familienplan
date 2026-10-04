import { createEngine } from '@familienplan/engine';
import type { SeedV2 } from '@familienplan/schema';
import seedJson from '@content/seed.v2.json';

/**
 * Inhalte kommen als statische, im Build gehashte Datei (Git ist die Quelle der Wahrheit).
 * Die Schema-Validierung läuft im CI (`pnpm validate-content`) und im Test `content.test.ts`, nicht im Browser:
 * so landet Zod nicht im Client-Bundle.
 */
export const seed = seedJson as unknown as SeedV2;
export const engine = createEngine(seed);
export const knownIngredientIds: ReadonlySet<string> = new Set(seed.ingredients.map((i) => i.id));
