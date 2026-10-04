import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SeedV2 } from '@familienplan/schema';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const path = resolve(root, 'content/seed.v2.json');
const raw: unknown = JSON.parse(readFileSync(path, 'utf-8'));
const res = SeedV2.safeParse(raw);

if (!res.success) {
  console.error(`FEHLER: ${path} ist ungültig`);
  for (const issue of res.error.issues.slice(0, 50)) {
    console.error(`  - ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  }
  process.exit(1);
}

const s = res.data;
console.log(
  `OK: ${s.ingredients.length} Zutaten, ${s.components.length} Komponenten, ${s.meals.length} Mahlzeiten, ` +
    `${s.supplements.length} Supplemente, ${s.safetyRules.length} Sicherheitsregeln`,
);
