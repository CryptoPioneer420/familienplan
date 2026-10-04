import { mkdirSync } from 'node:fs';
import { test } from '@playwright/test';

/**
 * Sichtprüfung (keine Pixelvergleiche): legt Screenshots in test-results/screens ab.
 * Chromium kennt keine Safe-Area-Insets; für die Ansicht ersetzen wir sie durch die Werte des iPhone 15 Pro Max
 * (oben 59 pt Dynamic Island, unten 34 pt Home-Indikator).
 */
const OUT = 'test-results/screens';
mkdirSync(OUT, { recursive: true });

for (const scheme of ['light', 'dark'] as const) {
  test.describe(scheme, () => {
    test.use({ colorScheme: scheme });
    test(`Screens ${scheme}`, async ({ page }) => {
      await page.route('**/assets/style-*.css', async (route) => {
        const res = await route.fetch();
        const css = (await res.text()).replaceAll('env(safe-area-inset-top)', '59px').replaceAll('env(safe-area-inset-bottom)', '34px');
        await route.fulfill({ response: res, body: css });
      });
      await page.goto('/');
      const shot = (name: string, full = true) => page.screenshot({ path: `${OUT}/${scheme}-${name}.png`, fullPage: full });
      const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });

      await shot('1-woche');
      await page.getByRole('button', { name: /^Dienstag/ }).click();
      await shot('2-heute');
      const meals = page.locator('details').filter({ hasText: 'Fastenbrechen' });
      await meals.first().locator('summary').first().click();
      await shot('3-heute-mahlzeit');
      await nav.getByRole('button', { name: 'Einkauf' }).click();
      await shot('4-einkauf');
      await nav.getByRole('button', { name: 'Mehr' }).click();
      await shot('5-mehr');
    });
  });
}
