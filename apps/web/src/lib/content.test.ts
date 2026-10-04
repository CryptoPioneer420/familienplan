import { parseSeedV2 } from '@familienplan/schema';
import { describe, expect, it } from 'vitest';
import seedJson from '@content/seed.v2.json';
import { engine, knownIngredientIds, seed } from './engine';

describe('Inhalte im Client-Bundle', () => {
  it('seed.v2.json besteht die Schema-Validierung (Zod läuft nur hier, nicht im Browser)', () => {
    expect(() => parseSeedV2(seedJson)).not.toThrow();
  });
  it('Engine und bekannte Zutaten sind aus demselben Seed gebaut', () => {
    expect(knownIngredientIds.size).toBe(seed.ingredients.length);
    expect(engine.seed).toBe(seed);
  });
});
