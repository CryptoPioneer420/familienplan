import { expect, test, type Page, type Route } from '@playwright/test';

/** Gemeinsame Einkaufsliste gegen einen Fake-Server (page.route). Die echte API ist im Worker-Paket getestet. */

interface Item {
  id: string;
  ingredientId: string | null;
  label: string;
  qty: number | null;
  unit: string | null;
  aisle: string;
  note: string | null;
  checked: boolean;
  checkedByName: string | null;
  checkedAt: number | null;
}

const base = (id: string, label: string, qty: number, aisle: string, note: string | null = null): Item => ({
  id, ingredientId: id, label, qty, unit: 'g', aisle, note, checked: false, checkedByName: null, checkedAt: null,
});

interface Fake {
  role: 'owner' | 'member';
  name: string;
  items: Item[] | null;
  rev: number;
  patches: Array<{ itemId: string; checked: boolean }>;
  puts: Array<{ listId: string; items: Array<Record<string, unknown>> }>;
  members: Array<{ id: string; email: string; role: 'owner' | 'member'; displayName: string | null; createdAt: number }>;
  posts: unknown[];
  down: boolean;
}

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function installFake(page: Page, over: Partial<Fake> = {}): Promise<Fake> {
  const f: Fake = {
    role: 'member',
    name: 'Anna',
    items: [base('anari', 'Anari', 500, 'dairy_eggs', 'ca. 2 Packungen'), base('horta', 'Horta', 800, 'produce'), base('lavraki', 'Lavraki', 1200, 'meat_fish')],
    rev: 1,
    patches: [],
    puts: [],
    members: [{ id: 'm1', email: 'peter@example.com', role: 'owner', displayName: 'Peter', createdAt: 1 }],
    posts: [],
    down: false,
    ...over,
  };
  await page.route('**/api/**', async (route) => {
    if (f.down) return route.abort('connectionrefused');
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    if (path === '/api/me') return json(route, { memberId: 'x', householdId: 'h', role: f.role, displayName: f.name });
    if (path === '/api/shopping-lists/current') {
      if (!f.items) return json(route, { list: null });
      const known = url.searchParams.get('rev');
      if (known !== null && Number(known) === f.rev) return json(route, { unchanged: true, list: { id: 'week-2026-09-28', rev: f.rev } });
      return json(route, { list: { id: 'week-2026-09-28', rev: f.rev, updatedAt: Date.UTC(2026, 9, 4, 8, 0), items: f.items } });
    }
    const patch = path.match(/^\/api\/shopping-lists\/([^/]+)\/items\/([^/]+)$/);
    if (patch && req.method() === 'PATCH') {
      const body = req.postDataJSON() as { checked: boolean };
      const itemId = decodeURIComponent(patch[2]!);
      f.patches.push({ itemId, checked: body.checked });
      const it = f.items?.find((i) => i.id === itemId);
      if (it) Object.assign(it, { checked: body.checked, checkedByName: body.checked ? f.name : null, checkedAt: body.checked ? 1 : null });
      f.rev += 1;
      return json(route, { ok: true });
    }
    const put = path.match(/^\/api\/shopping-lists\/([^/]+)$/);
    if (put && req.method() === 'PUT') {
      const body = req.postDataJSON() as { items: Array<Record<string, unknown>> };
      f.puts.push({ listId: decodeURIComponent(put[1]!), items: body.items });
      f.items = body.items.map((i) => ({ ...(i as unknown as Item), checked: false, checkedByName: null, checkedAt: null }));
      f.rev += 1;
      return json(route, { id: 'week-2026-09-28', rev: f.rev });
    }
    if (path.endsWith('/uncheck-all') && req.method() === 'POST') {
      f.items?.forEach((i) => Object.assign(i, { checked: false, checkedByName: null, checkedAt: null }));
      f.rev += 1;
      return json(route, { ok: true });
    }
    if (path === '/api/members' && req.method() === 'GET') return json(route, { members: f.members });
    if (path === '/api/members' && req.method() === 'POST') {
      const body = req.postDataJSON() as { email: string; displayName?: string };
      f.posts.push(body);
      f.members.push({ id: 'm2', email: body.email, role: 'member', displayName: body.displayName ?? null, createdAt: 2 });
      return json(route, { member: f.members.at(-1) });
    }
    return json(route, { error: { code: 'not_found' } }, 404);
  });
  return f;
}

const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name });
const errors = new WeakMap<Page, string[]>();

test.beforeEach(({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on('pageerror', (e) => list.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|ERR_CONNECTION_REFUSED|net::ERR/.test(m.text())) list.push(m.text());
  });
});
test.afterEach(({ page }) => {
  expect(errors.get(page) ?? [], 'Konsolenfehler').toEqual([]);
});

test('Frau (Mitglied): sieht die geteilte Liste nach Bereichen, kann nur abhaken, nichts hinzufügen', async ({ page }) => {
  const fake = await installFake(page);
  await page.goto('/#einkauf');
  await expect(page.getByRole('heading', { name: 'Einkauf', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Fisch & Fleisch/ })).toBeVisible();
  await expect(page.getByText('Anari', { exact: true })).toBeVisible();
  await expect(page.getByText('1,20 kg')).toBeVisible();
  await expect(page.getByText('ca. 2 Packungen')).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(3);
  // Keine Bearbeitungs- und Veröffentlichungsfunktionen
  await expect(page.getByRole('button', { name: /veröffentlichen/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Haken für alle zurücksetzen/ })).toHaveCount(0);
  await expect(page.locator('input[type="text"], input.field')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Plan (Vorschau)' })).toHaveCount(0);

  // Reihenfolge nach Bereichen: Fisch & Fleisch (Lavraki) steht oben
  await page.getByRole('checkbox', { name: /^Anari/ }).check();
  await expect.poll(() => fake.patches.length).toBe(1);
  expect(fake.patches[0]).toEqual({ itemId: 'anari', checked: true });
  await expect(page.getByText(/^1 von 3 erledigt/)).toBeVisible();
  await expect(page.getByText('abgehakt von Anna')).toBeVisible();
});

test('Frau: Haken ohne Netz werden nachgereicht, sobald die Verbindung zurück ist', async ({ page, context }) => {
  const fake = await installFake(page);
  await page.goto('/#einkauf');
  await expect(page.getByRole('checkbox')).toHaveCount(3);
  // page.route beantwortet Anfragen vor dem Netzwerk: Offline-Modus allein würde sie nicht blockieren.
  fake.down = true;
  await context.setOffline(true);
  await page.getByRole('checkbox', { name: /^Horta/ }).check();
  await expect(page.getByText(/1 Haken warten auf Verbindung/)).toBeVisible();
  expect(fake.patches).toHaveLength(0);
  fake.down = false;
  await context.setOffline(false);
  await expect.poll(() => fake.patches.length, { timeout: 20_000 }).toBe(1);
  expect(fake.patches[0]).toEqual({ itemId: 'horta', checked: true });
  await expect(page.getByText(/Haken warten auf Verbindung/)).toHaveCount(0);
});

test('Frau: Server nicht erreichbar → zuletzt geladene Liste bleibt sichtbar', async ({ page }) => {
  const fake = await installFake(page);
  await page.goto('/#einkauf');
  await expect(page.getByRole('checkbox')).toHaveCount(3);
  fake.down = true;
  await page.reload();
  await expect(page.getByRole('checkbox')).toHaveCount(3);
  await expect(page.getByText(/(Letzter|letzten) Stand/)).toBeVisible();
});

test('Frau: noch keine Liste veröffentlicht → verständlicher Leerzustand', async ({ page }) => {
  await installFake(page, { items: null });
  await page.goto('/#einkauf');
  await expect(page.getByText(/Noch keine Liste da/)).toBeVisible();
});

test('Owner: veröffentlicht den Plan, ohne Körperdaten zu senden, und sieht danach die geteilte Liste', async ({ page }) => {
  const fake = await installFake(page, { role: 'owner', name: 'Peter', items: null });
  await page.goto('/#einkauf');
  await expect(page.getByText(/Noch keine Liste veröffentlicht/)).toBeVisible();
  await page.getByRole('button', { name: 'Plan (Vorschau)' }).click();
  await page.getByRole('button', { name: 'Für die Familie veröffentlichen' }).click();
  await expect.poll(() => fake.puts.length).toBe(1);
  const put = fake.puts[0]!;
  expect(put.listId).toMatch(/^week-\d{4}-\d{2}-\d{2}$/);
  expect(put.items.length).toBeGreaterThan(5);
  for (const it of put.items) {
    expect(Object.keys(it).sort()).toEqual(['aisle', 'id', 'ingredientId', 'label', 'note', 'qty', 'unit']);
    expect(String(it['id'])).toMatch(/^[A-Za-z0-9_.-]{1,80}$/);
  }
  // Wechsel zurück in die geteilte Ansicht mit allen Artikeln
  await expect(page.getByRole('button', { name: 'Haken für alle zurücksetzen' })).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(put.items.length);
});

test('Owner: Haken für alle zurücksetzen', async ({ page }) => {
  const fake = await installFake(page, { role: 'owner', name: 'Peter' });
  fake.items![0]!.checked = true;
  fake.items![0]!.checkedByName = 'Anna';
  await page.goto('/#einkauf');
  await expect(page.getByText(/^1 von 3 erledigt/)).toBeVisible();
  await page.getByRole('button', { name: 'Haken für alle zurücksetzen' }).click();
  await expect(page.getByText(/^0 von 3 erledigt/)).toBeVisible();
});

test('Owner: Familie in „Mehr“ – Mitglieder sehen und hinzufügen; Mitglied sieht den Abschnitt nicht', async ({ page }) => {
  const fake = await installFake(page, { role: 'owner', name: 'Peter' });
  await page.goto('/#mehr');
  await expect(page.getByRole('heading', { name: 'Familie' })).toBeVisible();
  await expect(page.getByText('peter@example.com')).toBeVisible();
  await page.getByLabel('E-Mail-Adresse').fill('Anna@Example.com');
  await page.getByLabel('Anzeigename (optional)').fill('Anna');
  await page.getByRole('button', { name: 'Mitglied hinzufügen' }).click();
  await expect.poll(() => fake.posts.length).toBe(1);
  expect(fake.posts[0]).toEqual({ email: 'anna@example.com', displayName: 'Anna' });
  await expect(page.getByText(/Cloudflare-Access-Richtlinie/)).toBeVisible();
});

test('Mitglied sieht in „Mehr“ keine Familien-Verwaltung', async ({ page }) => {
  await installFake(page);
  await page.goto('/#mehr');
  await expect(page.getByRole('heading', { name: 'Meine Werte' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Familie' })).toHaveCount(0);
});

test('Ohne Anmeldung (Server nicht eingerichtet) bleibt die lokale Liste', async ({ page }) => {
  await page.route('**/api/**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"code":"auth_not_configured","message":"x"}}' }));
  await page.goto('/#einkauf');
  expect(await page.getByRole('checkbox').count()).toBeGreaterThan(10);
  await expect(page.getByText(/Mit Anmeldung gibt es eine gemeinsame Liste/)).toBeVisible();
});
