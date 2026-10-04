# Familienplan

Wochenplan, Rezepte und gemeinsame Einkaufsliste für die Familie (Paphos, Zypern). Installierbare Web-App (PWA) für das iPhone, ein Cloudflare Worker für Zugang und Sync, Inhalte als JSON in Git.

Entscheidungen, Risiken und Phasen: [`docs/prd-v3-hosted-pwa.md`](docs/prd-v3-hosted-pwa.md). Recherche-Aufträge für Phase 2: [`docs/research-briefs-perplexity.md`](docs/research-briefs-perplexity.md).

## Aufbau

| Pfad | Inhalt |
|---|---|
| `content/seed.v2.json` | Inhalte (Zutaten, Komponenten, Mahlzeiten, Supplemente, Wochenplan). Quelle der Wahrheit, wird im Build gehasht ausgeliefert. |
| `packages/schema` | Zod-Schema der Inhalte und Konstanten. Läuft nur in CI und Tests, nicht im Browser. |
| `packages/engine` | Reine Berechnung: Protein-Solver, Einkauf, Plan-Check. Golden-Tests gegen die v2-Single-File-App. |
| `apps/web` | PWA (React 19, Vite 7, Tailwind 4, Service Worker). Plan, Heute, Einkauf, Mehr. |
| `apps/worker` | Hono-API (`/api/*`) hinter Cloudflare Access, D1-Zugriff, Mitgliederverwaltung. |
| `migrations/` | D1-Schema (SQL). |
| `wrangler.jsonc` | Ein Worker: statische Assets plus `/api/*`. |

Körperdaten (Gewicht, Erhaltungsbedarf) bleiben auf dem Gerät. Der Server kennt Haushalt, Mitglieder und (ab Phase 3) Plan und Einkaufsliste.

## Befehle

```sh
pnpm install
pnpm verify        # Inhalte validieren, Typen, alle Unit-Tests, Build
pnpm e2e           # Build + Browser-Tests (iPhone-15-Pro-Max-Emulation, Offline-Start)
pnpm --filter @familienplan/web dev                  # Oberfläche, Proxy /api → 127.0.0.1:8787
pnpm --filter @familienplan/worker dev               # Worker + lokale D1 (vorher Web bauen und Migration anwenden)
pnpm exec wrangler d1 migrations apply familienplan --local -c wrangler.jsonc
```

`E2E_BASE_URL=http://127.0.0.1:8787 pnpm e2e` führt die Browser-Tests gegen den echten Worker aus, inklusive `_headers` und CSP.

## Deploy (Cloudflare Workers mit Git-Anbindung)

Einmalig, im Cloudflare-Dashboard und nicht im Code:

1. D1-Datenbank `familienplan` anlegen und die `database_id` in `wrangler.jsonc` eintragen.
2. Workers-Build mit diesem Repo verbinden. Build-Befehl: `pnpm install --frozen-lockfile && pnpm --filter @familienplan/web build`. Deploy-Befehl: `pnpm exec wrangler d1 migrations apply familienplan --remote && pnpm exec wrangler deploy`.
3. Zero Trust: Organisation anlegen, **One-time PIN** als Identitätsanbieter hinzufügen, Access für die `workers.dev`-Adresse des Workers aktivieren (Richtlinie: nur die Haushalts-E-Mail-Adressen).
4. `ACCESS_TEAM_DOMAIN`, `ACCESS_POLICY_AUD` und `OWNER_EMAIL` in `wrangler.jsonc` unter `vars` eintragen und neu deployen. Solange sie fehlen, antwortet `/api` mit 503 (bewusst: kein offener Zugang).

Abnahme Phase 1 auf dem echten iPhone (Punkt 1 im PRD): in Safari öffnen, per OTP anmelden, „Zum Home-Bildschirm“, App starten, in „Mehr“ auf „Verbindung prüfen“ tippen. Läuft der Login in der Home-Screen-App nicht stabil, greift der Fallback aus dem PRD (Risiko R3).

## Qualitätsregeln

- Inhalte ändern sich nur über `content/` und müssen `pnpm validate-content` bestehen.
- Die Engine ändert sich nur mit grünen Golden-Tests (`packages/engine/test`).
- Neue `/api`-Routen sind standardmäßig geschützt; ein Test stellt sicher, dass jede Route außer `GET /api/health` ohne Login 401 liefert.
- Nährwerte sind Richtwerte aus Allgemeinwissen und noch nicht gegen BLS/USDA geprüft (Phase 2).
