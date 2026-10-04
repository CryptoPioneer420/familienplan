import { expect, test, type Page } from '@playwright/test';

const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name });

const consoleErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  consoleErrors.set(page, errors);
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  // CSP-Verstöße (z. B. blockierte Skripte/Schriften) erscheinen als Konsolenfehler.
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource.*(401|403|503|404)/.test(m.text())) errors.push(m.text());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Woche', level: 1 })).toBeVisible();
});

test('Woche: sieben Tage, Vater erreicht an jedem Tag 171 g Protein (95 kg × 1,8)', async ({ page }) => {
  const rows = page.getByRole('list').first().getByRole('button');
  await expect(rows).toHaveCount(7);
  for (let i = 0; i < 7; i++) await expect(rows.nth(i)).toContainText('171');
});

test('Navigation: Woche → Tag → Heute zeigt Zutaten je Rolle, Kind-Box und Thermomix', async ({ page }) => {
  await page.getByRole('button', { name: /^Montag/ }).click();
  await expect(page.getByRole('heading', { name: 'Montag', level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/#heute$/);
  const first = page.locator('details').filter({ hasText: 'Fastenbrechen' }).first();
  await first.locator('summary').first().click();
  await expect(first.getByText('Gramm, roh')).toBeVisible();
  await expect(first.getByText('Kind (4 Jahre): Baukasten-Trennung')).toBeVisible();
});

test('Einkauf: Haken bleiben nach Neuladen erhalten, Zurücksetzen löscht sie', async ({ page }) => {
  await tab(page, 'Einkauf').click();
  const boxes = page.getByRole('checkbox');
  expect(await boxes.count()).toBeGreaterThan(10);
  await boxes.first().check();
  await expect(page.getByText(/^1 von \d+ erledigt$/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/^1 von \d+ erledigt$/)).toBeVisible();
  await page.getByRole('button', { name: 'Haken zurücksetzen' }).click();
  await expect(page.getByText(/^0 von \d+ erledigt$/)).toBeVisible();
});

test('Einkauf: abgewählter Tag verkleinert die Liste', async ({ page }) => {
  await tab(page, 'Einkauf').click();
  const before = await page.getByRole('checkbox').count();
  await page.getByRole('button', { name: 'Montag', exact: true }).click();
  await page.getByRole('button', { name: 'Dienstag', exact: true }).click();
  await page.getByRole('button', { name: 'Mittwoch', exact: true }).click();
  expect(await page.getByRole('checkbox').count()).toBeLessThan(before);
});

test('Mehr: Gewicht ändert das Protein-Ziel in der Woche', async ({ page }) => {
  await tab(page, 'Mehr').click();
  await page.getByLabel('Körpergewicht').fill('65');
  await tab(page, 'Woche').click();
  await expect(page.getByRole('list').first().getByRole('button').first()).toContainText('117'); // 65 × 1,8
});

test('Mehr: Verbindung prüfen wertet eine HTML-Antwort (abgelaufene Access-Sitzung) als „Anmeldung nötig“', async ({ page }) => {
  // Access beantwortet abgelaufene Sitzungen mit einer Login-Seite (HTML) statt JSON.
  await page.route('**/api/me', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<html>Sign in</html>' }));
  await tab(page, 'Mehr').click();
  await page.getByRole('button', { name: 'Verbindung prüfen' }).click();
  await expect(page.getByText(/Nicht angemeldet oder die Sitzung ist abgelaufen/)).toBeVisible();
});

test('Mehr: Verbindung prüfen zeigt Rolle bei gültiger Anmeldung', async ({ page }) => {
  await page.route('**/api/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ memberId: 'm1', householdId: 'h1', role: 'owner', displayName: 'Peter' }) }),
  );
  await tab(page, 'Mehr').click();
  await page.getByRole('button', { name: 'Verbindung prüfen' }).click();
  await expect(page.getByText('Angemeldet als Peter, Rolle: Owner.')).toBeVisible();
});

test('Mehr: Verbindung prüfen meldet 503 als „Server noch nicht eingerichtet“', async ({ page }) => {
  await page.route('**/api/me', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"code":"auth_not_configured","message":"x"}}' }));
  await tab(page, 'Mehr').click();
  await page.getByRole('button', { name: 'Verbindung prüfen' }).click();
  await expect(page.getByText(/noch nicht für die Anmeldung eingerichtet/)).toBeVisible();
});

test('Mehr: Zurücksetzen verlangt eine zweite Bestätigung', async ({ page }) => {
  await tab(page, 'Mehr').click();
  await page.getByLabel('Körpergewicht').fill('70');
  await page.getByRole('button', { name: 'Lokale Einstellungen zurücksetzen' }).click();
  await page.getByRole('button', { name: 'Zurücksetzen', exact: true }).click();
  await expect(page.getByText('95 kg', { exact: true })).toBeVisible();
});

for (const name of ['Woche', 'Heute', 'Einkauf', 'Mehr']) {
  test(`Layout ${name}: kein horizontales Scrollen, Tippflächen ≥ 44 pt, Eingabefelder ≥ 16 px`, async ({ page }) => {
    await tab(page, name).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'horizontaler Überlauf in px').toBeLessThanOrEqual(0);

    const small = await page.evaluate(() => {
      const bad: string[] = [];
      const els = document.querySelectorAll<HTMLElement>('button, summary, label:has(input), input[type=range]');
      els.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        if (r.height < 43.5) bad.push(`${el.tagName} "${(el.textContent ?? '').trim().slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
      });
      return bad;
    });
    expect(small, 'zu kleine Tippflächen').toEqual([]);

    const tiny = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLInputElement>('input.field')).filter((i) => parseFloat(getComputedStyle(i).fontSize) < 16).length);
    expect(tiny).toBe(0);
  });
}

test('Offline: nach der ersten Ladung startet die App ohne Netz mit Plan und Einkaufsliste', async ({ page, context }) => {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Service Worker muss die Seite kontrollieren, bevor wir offline gehen
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Woche', level: 1 })).toBeVisible();
  await tab(page, 'Einkauf').click();
  expect(await page.getByRole('checkbox').count()).toBeGreaterThan(10);
  await context.setOffline(false);
});

test.afterEach(async ({ page }) => {
  expect(consoleErrors.get(page) ?? [], 'Konsolenfehler (inkl. CSP-Verstöße)').toEqual([]);
});
