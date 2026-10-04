# PRD v3: Familienplan Zypern als gehostete PWA

Status: Draft 0.1 (Phase 0) · Stand: 2026-10-04 · Owner: Peter
Basis: v2 live unter `familienplan-zypern.pages.dev` (Single-File-App, 29 Komponenten, 15 Mahlzeiten, Seed v2)
Entscheidungen des Owners (gesetzt): gehostete PWA · live gemeinsame Einkaufsliste · Pilot 20, dann 80–100 Komponenten · Hybrid-Recherche

Konfidenz-Tags: **[Sicher]** belegt (Doku/Test), **[Wahrscheinlich]** starke Schlussfolgerung, **[Vermutung]** Lückenfüller, vor Nutzung prüfen.

---

## 0. Die unbequemen Punkte zuerst

1. **Der Engpass ist nicht der Code, sondern die Rezeptdaten und die Akzeptanz durch deine Frau.** 80–100 geprüfte Komponenten sind Rechercheaufwand, Validierung und Kochtests. Die App ist dagegen ein überschaubarer Bau. Ohne Frau-Interview vor dem UI-Entwurf bauen wir eine Einkaufsliste für jemanden, der sie nie geöffnet hat. [Wahrscheinlich]
2. **„Große Auswahl" ist nur dann ein Vorteil, wenn der Planer vorselektiert.** 100 Rezepte zum Durchblättern erzeugen Auswahllast. Ziel ist „Vorschlagen + Tauschen + Rotation", nicht „Browsen". [Wahrscheinlich]
3. **Die Architektur ändert sich gegenüber dem Plan:** Cloudflare empfiehlt für neue Projekte Workers Static Assets statt Pages (Pages läuft weiter, neue Features gehen in Workers). Access lässt sich bei Workers per Klick vor `workers.dev` schalten. Ich habe für die Produktions-URL `*.pages.dev` keinen entsprechenden Ein-Klick-Pfad in der Doku gefunden. [Sicher: Doku] / [Vermutung: Pages-Produktion nicht per Klick schützbar]. v3 wird deshalb als Worker gebaut, nicht als Pages-Projekt.
4. **Größtes technisches Risiko: Cloudflare-Access-Login innerhalb einer iOS-Home-Screen-PWA.** Der Login läuft über eine fremde Origin (`<team>.cloudflareaccess.com`). Bei installierten iOS-Web-Apps sind Cross-Origin-Redirects und Cookie-Übergabe bekannt fragil. [Vermutung] Das entscheiden wir per Spike auf deinem echten iPhone in Phase 1, nicht per Annahme.
5. **Das Kohlenhydrat-Defizit aus v2 ist ein Solver-Problem, kein Rezeptproblem.** Der Solver skaliert ganze Komponenten proportional zum Eiweißziel; Fett steigt mit, Carbs bleiben bei ca. 2,8 g/kg statt 4–5 g/kg an Trainingstagen. Mehr Rezepte lösen das nicht. Es braucht „Dial-Zutaten" (Abschnitt 7). [Sicher: aus Test v2]

---

## 1. Ziele, Nicht-Ziele, Erfolgskriterien

### Ziele
| ID | Ziel | Messbar |
|---|---|---|
| G1 | Woche am iPhone 15 Pro Max zusammenstellen (Hochformat, einhändig) | Wochenplan in ≤ 5 Min aus Vorschlägen; alle Kernaktionen ohne Zoom/Horizontal-Scroll |
| G2 | Große, geprüfte Rezeptbasis passend zum Lebensstil | Pilot 20 → Ausbau 80–100 Komponenten, jede mit Quelle, Status und berechneten Nährwerten |
| G3 | Frau sieht nach Fertigstellung der Woche, was einzukaufen ist, live synchron | Liste erscheint ≤ 10 s nach Freigabe auf ihrem Gerät; Abhaken ist bei beiden sichtbar |
| G4 | Offline nutzbar (Supermarkt, schlechter Empfang) | Installierte PWA startet im Flugmodus und zeigt Plan + Liste; Änderungen werden nachsynchronisiert |
| G5 | Nährwerte nachvollziehbar statt „vom LLM getippt" | Jede Zahl ist aus Zutatentabelle mit Quelle und Konfidenzklasse berechnet |

### Nicht-Ziele (explizit)
- Native App / App Store.
- Öffentliches Multi-Haushalt-SaaS inkl. Onboarding und Billing. (Schema ist mandantenfähig, siehe Abschnitt 5, aber ohne Produktoberfläche dafür.)
- LLM-Aufrufe zur Laufzeit („Rezept generieren"). Inhalte entstehen offline in der Pipeline und werden geprüft.
- Kalorien-Tracking/Logging gegessener Mengen, Barcode-Scanner, Preisvergleich, Online-Bestellung.
- Realtime per WebSocket/Durable Objects (Begründung in Abschnitt 4.3).

---

## 2. Nutzer und Jobs-to-be-done

| Rolle | Job | Gerät |
|---|---|---|
| Peter (Planer) | Woche aus Vorschlägen zusammenstellen, Training/Taverne umschalten, Liste freigeben | iPhone 15 Pro Max, gelegentlich Desktop (Druckansicht A4 bleibt erhalten) |
| Frau (Köchin, Einkäuferin) | Liste im Laden abhaken, Rezept/Thermomix-Schritte beim Kochen lesen | **offen** (iPhone/Android?), siehe Interview, Anhang B |
| Tochter (4 J.) | kein Nutzer; wirkt über Portionsfaktoren, „deconstructed"-Regeln und Kindersicherheits-Validator | – |

---

## 3. Entscheidungsstand

### Gesetzt
| ID | Entscheidung | Kosten / Konsequenz |
|---|---|---|
| D1 | Gehostete PWA, Server-Sync, Home-Screen-App; Doppelklick-Datei entfällt | Build-Pipeline, Cloudflare-Abhängigkeit, Auth nötig |
| D2 | Live gemeinsame Einkaufsliste (D1-Backend + Zugriffsschutz) | Sync-Logik, Konfliktregeln, Offline-Queue |
| D3 | Pilot 20 Komponenten, danach 80–100 | Pilot dient als Messung des Aufwands pro Komponente |
| D4 | Hybrid-Recherche: Peter fährt Perplexity-Deep-Research für Zypern-Spezifika, ich recherchiere, strukturiere, validiere | Peter-Zeit ca. 1–2 h für die Briefs (Anhang A) [Vermutung] |

### Decision-Log Runde 2 (2026-10-04)
| ID | Entscheidung | Anmerkung |
|---|---|---|
| D5 (O4) | Privates GitHub-Repo + Git-Deploy (Cloudflare-Git-Integration), kein Token im Chat | **Blocker:** in der Sitzung ist keine GitHub-Integration verknüpft (`gh`-Token ungültig, keine Repos sichtbar). Peter legt das Repo an und verbindet GitHub; bis dahin wird lokal gebaut |
| D6 (O5) | **Direkt Access-OTP**, kein vorgeschalteter Spike | Abweichung von der Empfehlung. Risiko R3 bleibt offen. Risikominderung: Auth hinter `AuthProvider`-Schnittstelle im Worker (Access-JWT als eine Implementierung, Haushalts-Link als zweite, nicht gebaute). Der iPhone-Login-Test ist Abnahmepunkt 1 in Phase 1; fällt er durch, wird gewechselt, bevor die Sync-Schicht weiter ausgebaut wird |
| D7 (O8) | Carb-Lücke in Phase 3 mit Dial-Solver; v2 bleibt bis dahin unverändert live | Plan-Check zeigt die Lücke weiter an |
| D8 | Phase 1 und 2 parallel | Peter: Interview Frau + Perplexity-Briefs (`research-briefs-perplexity.md`) |
| O1 (teilweise) | Stadt: Paphos | Händler/Metzger/Fischhändler/Markt weiter offen, werden durch Brief A1 ermittelt |

### Weiterhin offen (siehe Abschnitt 12)
O2 Gerät der Frau · O3 Thermomix-Modell · O6 Custom-Domain ja/nein · O7 Wer vergibt „approved" bei Rezepten.

---

## 4. Architektur

### 4.1 Überblick

```
iPhone/Android (installierte PWA)                Cloudflare (ein Worker)
┌──────────────────────────────┐   HTTPS   ┌─────────────────────────────────────┐
│ React-UI (Vite, TS strict)   │──────────▶│ Static Assets (App-Shell, recipes.vN.json)
│ Engine (pure TS, Solver,     │           │ Worker /api/*  (Hono, Zod-validiert)
│  Einkaufsaggregation, Audit) │◀──────────│   └─ D1 (SQLite): Plan, Listen, Verfügbarkeit
│ Service Worker (Precache)    │  Polling  │ Access (vor workers.dev) → JWT-Prüfung im Worker
│ IndexedDB (Cache + Outbox)   │           │ Cron (wöchentlich): Backup-Dump → R2 (Phase 4)
└──────────────────────────────┘           └─────────────────────────────────────┘
```

Prinzipien:
- **Inhalte (Rezepte, Zutaten) liegen im Git-Repo als JSON**, werden in CI validiert und als gehashte Datei `recipes.<hash>.json` ausgeliefert. Kein DB-Read pro Rezeptaufruf, offline-fähig, Review per Pull Request.
- **Zustand des Haushalts (Plan, Listen, Verfügbarkeit) liegt in D1.** Der Server ist Source of Truth, IndexedDB ist nur Cache + Outbox.
- **Körperdaten bleiben auf dem Gerät** (Gewicht, g/kg-Ziele, Faktoren). Der Server speichert Auswahl und berechnete Listenmengen, nicht das Gewicht. Das ist Datenminimierung nach DSGVO-Logik (Gewicht ist gesundheitsnah). [Wahrscheinlich] Konsequenz: Die Einkaufsliste wird auf Peters Gerät berechnet und als Items synchronisiert; die Frau braucht keine Engine für die Mengen.
- **Engine ist ein eigenes Paket** (reines TypeScript, keine DOM-Abhängigkeit), mit Golden-Tests gegen die v2-Ergebnisse.

### 4.2 Decision-Score Technik

| Entscheidung | Score | Begründung / Kosten |
|---|---|---|
| Workers Static Assets statt Pages | **HANDELN** | Cloudflare-Empfehlung für Neuprojekte [Sicher]; Access per Klick; Kosten: einmalige Migration, neues Deploy-Kommando, neuer Token-Scope oder Git-Deploy |
| Cloudflare Access (OTP) als Auth | **Spike, dann entscheiden** | Null eigener Auth-Code, aber iOS-PWA-Risiko, Session-Ablauf, Setup im Zero-Trust-Dashboard |
| Eigener Haushalts-Link (Fallback) | **BEOBACHTEN** | Kein Cross-Origin-Redirect, dafür eigener Security-Code (Token-Hash, Rate-Limit, Rotation) |
| Polling statt WebSocket/Durable Objects | **HANDELN (Polling)** | 2 Nutzer; Last ≈ 2 × 6 Req/Min × aktive Minuten ≪ 100k Req/Tag; Durable Objects wären Mehrkomplexität ohne Nutzen. DO: **IGNORIEREN** |
| React + Vite + TypeScript strict | **HANDELN** | Dein Stack; Preact wäre via `preact/compat` später tauschbar. Kosten: ca. 45 KB gzip Framework, bei Precache irrelevant |
| Tailwind kompiliert (Vite-Plugin) statt CDN-Skript | **HANDELN** | CDN-Skript ist Laufzeit-JIT, offline unbrauchbar, in v2 nur Übergang |
| Zod als gemeinsame Schema-Quelle (Client, Worker, CI) | **HANDELN** | Ein Schema validiert Seed, API und Build; JSON Schema wird exportiert |
| ORM (Drizzle o. Ä.) | **IGNORIEREN** | 6–8 Tabellen; rohes SQL mit Zod-validierten Row-Typen reicht, weniger Lock-in |
| Vitest (Engine, Validator) + Playwright (UI, Chromium) | **HANDELN** | Golden-Tests sind der Regressionsschutz für den Solver |
| Web Push (iOS ab 16.4 für installierte Web-Apps möglich) | **BEOBACHTEN** | VAPID, Opt-in-Flow; Ersatz: „Liste teilen" per WhatsApp (Web Share) |
| LLM zur Laufzeit in der App | **IGNORIEREN** | Kosten, Nichtdeterminismus, Gesundheitsbezug |
| Perplexity-API-Automatisierung | **BEOBACHTEN** | Entscheidung D4 ist manuell; Automatisierung erst, wenn der Prozess stabil ist |

### 4.3 Realtime-Modell (Sync)
- `GET /api/sync?since=<server_ts>` liefert geänderte Zeilen (Plan, Listen, Items, Verfügbarkeit) plus neuen `server_ts`. Client pollt ca. alle 10 s im Vordergrund, sofort bei `visibilitychange` und `online`.
- Schreibzugriffe sind **idempotente Upserts mit clientseitiger UUID** (`PUT /api/items/:id`). Wiederholung nach Verbindungsabbruch ist ungefährlich.
- Konfliktregeln: Items = Last-Write-Wins pro Feld (`checked`, `note`, `qty`) mit **serverseitiger** Zeit und `rev`; Hinzufügen = Mengenvereinigung; Löschen = Tombstone (`deleted=1`). Plan = optimistische Nebenläufigkeit über `rev` (409 → Client zeigt Merge-Hinweis).
- Listengenerierung ist deterministisch: `list_id = hash(plan_id, plan_rev)`; erneutes Freigeben erzeugt keine Duplikate. Manuelle Items und Haken der Frau bleiben bei Neugenerierung erhalten (Match über `ingredient_id`).
- Offline: Outbox in IndexedDB, Replay in Reihenfolge nach Reconnect.
- Last: Workers Free erlaubt 100.000 Requests/Tag, 10 ms CPU pro Request; Static-Asset-Requests sind kostenfrei. [Sicher: Doku] Bei D1 sind seit 2026-09-01 die Free-Limits aktiv (5 Mio. Reads, 100k Writes pro Tag). [Sicher: aus früherer Recherche] Reserve ist ≥ 10×.

### 4.4 Security und Datenschutz
- **Access vor `workers.dev`** (Ein-Klick; Policy per E-Mail, E-Mail-Domain oder Cloudflare-Account-Mitgliedschaft). [Sicher: Doku]
- **Der Worker muss das JWT im Header `Cf-Access-Jwt-Assertion` selbst prüfen** (Signatur gegen die Team-JWKS, `aud`, `exp`). Ohne diese Prüfung ist Access nur Kulisse, falls der Worker anderweitig erreichbar bleibt. [Sicher: Doku weist darauf hin]
- Neue Zero-Trust-Organisationen starten mit „Cloudflare" als Identity Provider; **OTP wird nicht mehr automatisch angelegt**, sondern muss manuell hinzugefügt werden. [Sicher: Doku] Deine Frau bräuchte sonst ein Cloudflare-Konto.
- Freies Zero-Trust-Kontingent („bis 50 Nutzer"): per Doku-Suche **nicht bestätigt**. [Vermutung] Für 2 Personen vermutlich irrelevant, aber vor dem Verlassen darauf im Dashboard unter Plans prüfen.
- `_headers` gilt nur für Static Assets, **nicht** für vom Worker erzeugte Antworten. [Sicher: Doku] API-Antworten setzen `X-Content-Type-Options`, `Referrer-Policy`, `Cache-Control: no-store` selbst.
- Exakte CORS-Origins; da Same-Origin, kein CORS-Header nötig. Cookies `Secure; HttpOnly; SameSite=Lax`.
- DSGVO: private Familiennutzung fällt wahrscheinlich unter die Haushaltsausnahme (Art. 2 Abs. 2 lit. c). [Wahrscheinlich] Cloudflare bleibt Auftragsverarbeiter-Kette (USA/SCC). Datenminimierung: keine Körperdaten serverseitig, keine Klarnamen des Kindes, keine Freitext-Gesundheitsdaten. Offene Spezialistenfrage am Ende (Abschnitt 12).
- Token-Hygiene: Der Cloudflare-Token aus v2 wurde im Chat gepostet und sollte widerrufen werden. **Für v3: Git-Deploy statt Token im Chat** (O4).

### 4.5 Konfiguration (Skizze)

```jsonc
// wrangler.jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "familienplan",
  "main": "apps/worker/src/index.ts",
  "compatibility_date": "2026-10-04",
  "assets": {
    "directory": "./apps/web/dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  },
  "d1_databases": [
    { "binding": "DB", "database_name": "familienplan", "database_id": "<UUID>", "migrations_dir": "migrations" }
  ],
  "observability": { "enabled": true }
}
```

Repo (pnpm Workspaces, Node 20 LTS):

```
familienplan/
├─ apps/web        # Vite + React PWA (SW, Manifest, Icons)
├─ apps/worker     # Hono-API, JWT-Prüfung, D1-Zugriff
├─ packages/engine # Solver, Einkaufsaggregation, Audit (pure TS) + Golden-Tests
├─ packages/schema # Zod-Schemas, JSON-Schema-Export
├─ content/        # ingredients.json, recipes/*.json, research/*.md (Rohbriefs mit Quellen)
├─ migrations/     # 0001_init.sql, …
└─ scripts/        # validate-content, compute-nutrition, build-recipes
```

---

## 5. Datenmodell

### 5.1 Inhalts-Schema v3 (Delta zu Seed v2)

Seed v2 hat pro Zutat `per100g` ohne Quelle und pro Komponente ein **gespeichertes** `nutritionPerAdultPortion`. Beides wird geändert.

```jsonc
// ingredient (v3)
{
  "id": "anari",
  "nameDe": "Anari, frisch, ungesalzen",
  "nameEl": "Ανάρι",                       // Griechisch: für Metzger/Markt/Etiketten
  "category": "dairy",
  "state": "as_sold",                       // raw | cooked | as_sold  (Pflicht)
  "yield": { "rawToCooked": null },         // z. B. Reis 1 → 2,8; Hähnchenbrust 1 → 0,75
  "per100g": { "kcal": 150, "proteinG": 10, "fatG": 11, "carbsG": 3, "fiberG": 0 },
  "source": { "type": "label",              // usda_fdc | bls | off | label | manual
              "ref": "https://…", "retrievedAt": "2026-10-xx" },
  "confidence": "B",                        // A: Labor/Etikett; B: Datenbank, andere Sorte/Region; C: Schätzung
  "availability": { "cy": "supermarket", "months": null, "priceBand": "€€" },
  "allergens": ["milk"],
  "unit": { "gPerPiece": null },            // Ei = 55 g usw.
  "substitutes": [{ "id": "schafjoghurt", "ratio": 1.0, "reason": "…" }],
  "safetyNotes": []
}

// recipe/component (v3)
{
  "id": "bowl-frischkorn-anari-walnuss",
  "status": "draft",                        // draft | researched | validated | cooked | approved | retired
  "nameDe": "…", "type": "bowl",
  "tags": ["training-day", "cy-local", "<30min"],
  "season": null,                           // Monate 1–12 oder null (ganzjährig)
  "prep": { "activeMin": 15, "totalMin": 25 },
  "ingredients": [
    { "ingredientId": "anari", "grams": 250, "dial": null, "optional": false },
    { "ingredientId": "reis-vollkorn", "grams": 80, "dial": "carb" }
  ],
  "childSplit": { "separable": true, "seasoningAfterSplit": true, "childNotes": [] },
  "thermomix": { "model": ["TM6"], "steps": [ { "ord": 1, "speed": "4", "tempC": 100, "sec": 600, "text": "…" } ] },
  "source": { "kind": "original|adapted|traditional", "urls": [], "retrievedAt": "…" },
  "review": { "validatedAt": null, "cookedOn": null, "approvedBy": null, "notes": "" }
  // KEIN gespeichertes nutrition-Feld: wird beim Build berechnet und mit Generator-Hash in recipes.<hash>.json geschrieben
}
```

Wichtige Regeln:
- **Nährwerte werden berechnet, nie getippt.** Build-Schritt `compute-nutrition` summiert aus der Zutatentabelle.
- **Roh/gekocht ist Pflichtfeld.** Mengen in Rezepten beziehen sich auf den `state` der Zutat. Ohne das sind Reis, Nudeln, Fleisch und Hülsenfrüchte um Faktor 2–3 falsch. [Sicher: Standardproblem bei Nährwertdaten]
- Anzeige der Unsicherheit: Konfidenzklasse A ±5 %, B ±10 %, C ±20 % als Planungsband. [Vermutung: pauschale Bänder]

### 5.2 D1-Schema (Migration `0001_init.sql`)

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE households (
  id          TEXT PRIMARY KEY,                 -- UUIDv7
  name        TEXT NOT NULL,
  created_at  INTEGER NOT NULL                  -- unix ms
);

CREATE TABLE members (
  id            TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  email         TEXT NOT NULL COLLATE NOCASE,   -- aus Access-JWT-Claim
  role          TEXT NOT NULL CHECK (role IN ('owner','member')),
  display_name  TEXT,
  created_at    INTEGER NOT NULL,
  UNIQUE (email)                                -- v1: eine Mitgliedschaft pro E-Mail
);
CREATE INDEX idx_members_household ON members(household_id);

CREATE TABLE plans (
  id              TEXT PRIMARY KEY,
  household_id    TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  week_start      TEXT NOT NULL CHECK (week_start GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  selection_json  TEXT NOT NULL,                -- Tag → Slot → {recipeId, …}; KEINE Körperdaten
  content_version TEXT NOT NULL,                -- Hash der recipes.<hash>.json zum Planzeitpunkt
  rev             INTEGER NOT NULL DEFAULT 1,
  updated_at      INTEGER NOT NULL,
  updated_by      TEXT REFERENCES members(id),
  UNIQUE (household_id, week_start)
);

CREATE TABLE shopping_lists (
  id            TEXT PRIMARY KEY,               -- deterministisch: hash(plan_id, plan_rev)
  household_id  TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  plan_id       TEXT REFERENCES plans(id) ON DELETE SET NULL,
  plan_rev      INTEGER,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','archived')),
  created_at    INTEGER NOT NULL,
  rev           INTEGER NOT NULL DEFAULT 1,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX idx_lists_household ON shopping_lists(household_id, updated_at);

CREATE TABLE shopping_items (
  id            TEXT PRIMARY KEY,               -- Client-UUID → idempotenter Upsert
  list_id       TEXT NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  household_id  TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,  -- Mandantenprüfung ohne Join
  ingredient_id TEXT,                           -- NULL bei manuellen Items
  label         TEXT NOT NULL,
  qty           REAL,
  unit          TEXT,
  aisle         TEXT NOT NULL,                  -- produce | meat_fish | dairy_eggs | dry | frozen | other
  source        TEXT NOT NULL CHECK (source IN ('plan','manual')),
  checked       INTEGER NOT NULL DEFAULT 0 CHECK (checked IN (0,1)),
  checked_by    TEXT REFERENCES members(id),
  checked_at    INTEGER,
  note          TEXT,
  deleted       INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0,1)),   -- Tombstone für Sync
  rev           INTEGER NOT NULL DEFAULT 1,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX idx_items_list      ON shopping_items(list_id, aisle);
CREATE INDEX idx_items_household ON shopping_items(household_id, updated_at);

CREATE TABLE availability (                      -- ersetzt localStorage-„nicht verfügbar" aus v2
  household_id  TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  ingredient_id TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('available','unavailable','expensive')),
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (household_id, ingredient_id)
) WITHOUT ROWID;

-- Phase 4
CREATE TABLE recipe_prefs (
  household_id   TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  recipe_id      TEXT NOT NULL,
  rating         INTEGER CHECK (rating BETWEEN 1 AND 5),
  blocked        INTEGER NOT NULL DEFAULT 0 CHECK (blocked IN (0,1)),
  last_cooked_on TEXT,
  updated_at     INTEGER NOT NULL,
  PRIMARY KEY (household_id, recipe_id)
) WITHOUT ROWID;

CREATE TABLE pantry (
  household_id  TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  ingredient_id TEXT NOT NULL,
  have_g        REAL NOT NULL CHECK (have_g >= 0),
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (household_id, ingredient_id)
) WITHOUT ROWID;
```

Mandantenfähigkeit: jede Abfrage im Worker filtert über `household_id` aus der Mitgliedschaft des JWT-Subjekts, nie aus dem Request-Body. Test: automatisierter Cross-Household-Zugriffstest (Phase 3).

---

## 6. Rezept-Pipeline und Qualitätsgates

```
Research-Brief ─▶ Kandidaten (Quelle, Lizenz) ─▶ Strukturierung (Schema v3, Zutaten-IDs)
   ─▶ Nährwert-Build (Code) ─▶ Validator (CI) ─▶ Kochtest (Frau) ─▶ approved
   status:  draft → researched → validated → cooked → approved → (retired)
```

**Gates (alle automatisiert außer Kochtest/Freigabe):**
1. Schema + referenzielle Integrität (jede `ingredientId` existiert, jedes `substitutes.id` existiert).
2. Jede Zutat hat `source`, `confidence`, `state`. Fehlt eins: Build bricht ab.
3. **Atwater-Plausibilität:** kcal ≈ 4·P + 4·C + 9·F, Abweichung ≤ 12 % pro Zutat und pro Rezept. Fängt Tippfehler und Einheitenfehler. [Wahrscheinlich: Toleranz wegen Ballaststoffen/Alkohol; in Pilot kalibrieren]
4. Portionsplausibilität: 150–1.200 kcal pro Erwachsenenportion je nach Slot; Mengen innerhalb realistischer Bereiche je Zutatenkategorie.
5. **Kindersicherheits-Validator** (aus `safetyRules` v2 abgeleitet): keine ganzen Nüsse/Trauben/harte Rohkost ohne Zubereitungshinweis, kein rohes Ei/Fisch, Kolokasi nur durchgegart, Allergenkennzeichnung (EU-14) vollständig.
6. Thermomix-Schritte: Stufe, Temperatur, Zeit plausibel; Varoma-Kapazität nicht überschritten.
7. Jede Komponente hat mindestens eine Quelle (`original` ist erlaubt, wenn als solche markiert).
8. Status `approved` nur mit `cookedOn` und `approvedBy`.

**Quellen und Recht**
- Zutatenlisten und Mengen sind Fakten, Anleitungstexte sind urheberrechtlich geschützt. Wir übernehmen **keine fremden Anleitungstexte**; Anleitungen werden eigenständig formuliert, Quelle wird verlinkt. [Wahrscheinlich]
- **Kein Scraping von Cookidoo** (Vorwerk-Lizenz/ToS). Thermomix-Schritte entstehen aus eigener Übersetzung der Zubereitungslogik.
- Nährwertquellen: USDA FoodData Central als Primärquelle (nach meiner Kenntnis gemeinfrei/CC0 [Wahrscheinlich], vor Import prüfen); Open Food Facts nur mit ODbL-Prüfung (Share-Alike betrifft Datenbankableitungen); BLS (Max-Rubner-Institut) nur mit Lizenz; lokale Produkte (Anari, Halloumi, Schafjoghurt, Skyr-Marken) aus Herstellerangaben/Etikett (`source.type = label`, Konfidenz A).

**Aufwandsmessung im Pilot:** pro Komponente Stunden von „Kandidat" bis „validated" erfassen. Entscheidungsgate für den Ausbau (Abschnitt 11, Phase 2).

---

## 7. Planner / Engine (Phase 3)

**Problem aus v2:** Faktor f = (Zielprotein − Snackprotein) / Basisprotein der Hauptmahlzeiten, geklemmt auf [0,6; 2,0]. Protein stimmt exakt (171,0 g), Carbs und Fett laufen mit dem Faktor mit.

**Vorschlag: Dial-Zutaten.** Jede Komponente darf höchstens eine Eiweiß-Dial-Zutat (z. B. Hähnchenbrust, Fisch, Anari) und eine Kohlenhydrat-Dial-Zutat (Reis, Kartoffel, Bulgur, Haferflocken) markieren. Pro Tag wird ein kleines lineares Gleichungssystem gelöst:

- Unbekannte: Eiweiß-Dial-Menge `x_p`, Carb-Dial-Menge `x_c` (Summe über die flexiblen Slots).
- Gleichungen: Tageseiweiß = 1,8 g/kg · Gewicht; Tagescarbs im Zielband (Trainingstag 4–5 g/kg, Ruhetag niedriger, Werte aus CONFIG v2).
- Klemmen auf realistische Mengen je Zutat; wenn geklemmt, **Hinweis im UI** statt stillem Abschneiden.
- Fett wird nicht gelöst, sondern geprüft (Plan-Check, wie in v2).

Kosten: Rezepte werden weniger „authentisch" in den Mengen; Kinder- und Mutterportion bleiben proportional (Faktor), die Dials betreffen nur den Vater. Risiko: Unlösbare Tage bei zu wenig Dial-Zutaten in der Auswahl. [Wahrscheinlich]

**Vorschlagen statt Browsen:**
- Filter: Tag-Typ (Training/Ruhe/Taverne), Zeitbudget, Thermomix/Varoma, Saison, Verfügbarkeit, Kindertauglich.
- Rotation: kein Rezept doppelt in 7 Tagen (Ausnahme Meal-Prep markiert), max. 3 Tage rotes Fleisch pro Woche (v2: Taverne mit Lamm ergibt 4 Tage, das ist ein bekannter Verstoß), Fisch ≥ 2 Tage.
- Vorschlagsliste je Slot: 3 Kandidaten mit Score aus Zielerfüllung, Rotation, Saison, Bewertung.
- Plan-Check bleibt aus v2 (Carbs/Fett g/kg, Ballaststoffe, rotes Fleisch, Magnesium vs. EFSA-Orientierung 250 mg).

**Regressionsschutz:** Golden-Tests reproduzieren das v2-Verhalten (7 Tage × 171,0 g Eiweiß; Taverne-Fall: Mutter und Kind erhalten genau ein Hauptgericht statt Fisch plus Lamm, der Fehler, der in v2 bei 111 g Mutter-Eiweiß auffiel; Substitution Anari → Schafjoghurt mit Mengenhinweis bei Abweichung > 1,5×). Der Solver wird erst ersetzt, wenn die Tests auf dem alten Verhalten grün waren und die neuen Zielbänder zusätzlich geprüft werden.

---

## 8. Einkaufsflow (Frau)

1. Peter schließt die Woche ab (Plan-Check grün oder bewusst übersteuert) und tippt **„Liste freigeben"**.
2. Engine (auf Peters Gerät) aggregiert Mengen über alle Rollen, rechnet Rohgewicht/Stückzahl/Packungsgröße, gruppiert nach Gang (Obst/Gemüse, Fleisch/Fisch, Milch/Eier, Trockenwaren, Tiefkühl, Sonstiges) und sendet Items per Upsert.
3. Frau öffnet die PWA: Liste nach Gang sortiert, große Abhak-Flächen, **Offline-fähig**, Haken sind für Peter sofort sichtbar (Polling).
4. Manuelle Zusatzitems („Windeln") und „habe ich schon" (Phase 4: Vorrat).
5. Wenn Peter den Plan danach ändert: Diff-Banner „3 Positionen neu, 1 entfernt" statt stillem Überschreiben; abgehakte Items bleiben abgehakt.
6. **Fallback ohne App:** „Als Text teilen" (Web Share API, WhatsApp). Wenn Sync oder Login hakt, ist der Einkauf trotzdem gerettet.
7. Verfügbarkeit: „im Laden nicht gefunden" → Item markieren → Substitutionsvorschlag aus `substitutes` (v2-Engine, jetzt mit Mengenhinweis).

Offen: ob die Frau nur abhaken oder auch Gerichte tauschen darf, entscheidet das Interview.

---

## 9. UI/UX für iPhone 15 Pro Max

- Viewport 430 × 932 CSS-Punkte, 3× [Sicher]. Safe Areas lesen über `env(safe-area-inset-*)` (Dynamic Island oben ca. 59 pt, Home-Indikator unten ca. 34 pt [Wahrscheinlich]); `viewport-fit=cover`.
- **Bottom-Tab-Bar** (Daumenzone): Woche · Heute · Rezepte · Einkauf · Mehr. Desktop-Layout bleibt als responsive Erweiterung; A4-Druckansicht bleibt (2 Seiten, Auto-Fit aus v2).
- Touch-Ziele ≥ 44 pt, Inputs ≥ 16 px (sonst Auto-Zoom in Safari), `100dvh` statt `100vh`, kein Hover-Zwang, Pull-to-Refresh nicht blockieren.
- „Heute"-Ansicht: nächste Mahlzeit, Portion Vater/Mutter/Kind, Thermomix-Schritte in Kochmodus (Bildschirm bleibt an per Wake-Lock-API, wo unterstützt [Wahrscheinlich]).
- PWA-Pflichtbausteine: Manifest, `apple-touch-icon` 180×180, `apple-mobile-web-app-capable`, Statusleistenstil, Install-Hinweis im UI (iOS bietet kein `beforeinstallprompt`), Update-Banner bei neuer Version (Service-Worker `waiting`).
- **Speicher-Eigenheiten iOS:** Websitedaten nicht installierter Web-Apps können nach ca. 7 Tagen ohne Nutzung gelöscht werden; installierte Home-Screen-Apps sind davon nach meinem Kenntnisstand ausgenommen. Die installierte App hat **getrennten Speicher** von Safari-Tabs, also ein erneuter Login in der PWA. [Wahrscheinlich] Konsequenz: IndexedDB ist Cache, nie Wahrheit.
- Sessionablauf: API-Antwort ist HTML/Redirect statt JSON → Client erkennt „Login nötig", zeigt Banner, verwirft die Antwort (nie in den Cache schreiben).
- Tests: Playwright mit Chromium und Mobile-Emulation (430×932) in CI; WebKit/Safari-Verhalten nur auf echtem Gerät (Anhang C), mein Sandbox-Setup hat kein WebKit.

---

## 10. Pre-Development Audit: Risiken und MVP-Killer

| # | Risiko | Warum es killt | Konf. | Gegenmaßnahme | Phase |
|---|---|---|---|---|---|
| R1 | Frau nicht eingebunden | Liste/Planer ungenutzt, Projektnutzen null | [Wahrscheinlich] | 30-Min-Interview (Anhang B) vor UI-Entwurf; sie testet Prototyp der Liste früh | 0/1 |
| R2 | Content-Aufwand 80–100 Komponenten | Zeit ist die knappe Ressource, nicht Rechenleistung | [Wahrscheinlich] | Pilot misst Std./Komponente; Gate bei > 45 Min oder < 70 % „würde ich wieder kochen" → Scope auf 50–60 kürzen | 2 |
| R3 | Access-Login in iOS-Home-Screen-PWA | Login-Schleife oder verlorene Session auf iPhone | [Vermutung] | Direkt Access-OTP (D6), aber `AuthProvider`-Schnittstelle + Login-Test auf echtem iPhone als Abnahmepunkt 1; Fallback Haushalts-Link (First-Party-Cookie) | 1 |
| R4 | Nährwerte nicht vertrauenswürdig | Falsche Eiweißsteuerung; Vertrauensverlust | [Wahrscheinlich] | Berechnung aus Quellen-Tabelle, Konfidenzbänder, Atwater-Gate, keine LLM-Zahlen | 2 |
| R5 | Roh/gekocht vermischt | Faktor 2–3 Fehler bei Reis/Nudeln/Fleisch | [Sicher] | `state` + `yield` Pflicht, Validator | 2 |
| R6 | Vier Systeme gleichzeitig (PWA, Sync, Content, Planner) | Nichts wird fertig | [Wahrscheinlich] | Phasen mit Abnahme; Phase 1 und 2 parallel, 3 erst nach Gates | alle |
| R7 | Token/Secret-Hygiene | Token lag im Chat (v2) | [Sicher] | Widerruf; Git-Deploy ohne Token im Chat | 0/1 |
| R8 | Session-Ablauf bei Offline-First | API liefert Login-HTML, App zeigt Fehler oder cached Müll | [Wahrscheinlich] | Antwortklassifikation, Auth-Banner, Outbox bleibt erhalten | 1/3 |
| R9 | Rezeptrecht/Cookidoo | Abmahn-/ToS-Risiko | [Wahrscheinlich] | Nur Fakten übernehmen, eigene Texte, kein Cookidoo-Scraping | 2 |
| R10 | Cloudflare als Single Point | Konto weg = Daten weg | [Wahrscheinlich] | Wöchentlicher Dump nach R2 (Cron, Free: 5 Cron-Trigger pro Konto [Sicher]); D1-Time-Travel-Dauer **nicht verifiziert** [Vermutung] | 4 |
| R11 | Carb-Lücke und Fettüberschuss im Solver | Plan verfehlt Trainingsziel systematisch | [Sicher: v2-Test] | Dial-Zutaten, Golden-Tests mit Zielbändern | 3 |
| R12 | Rotes Fleisch bis 4 Tage/Woche mit Taverne-Lamm | Verstößt gegen eigenen Plan-Check | [Sicher: v2-Test] | Rotationsregel im Planer | 3 |
| R13 | Gesundheitsnahe Daten (Gewicht, Kind) auf US-Infrastruktur | DSGVO/Art.-9-Nähe | [Wahrscheinlich] | Körperdaten lokal, keine Kinder-Klarnamen, Haushaltsausnahme prüfen lassen | 1 |
| R14 | Magnesium-Stack 2 × 150 mg > EFSA-Orientierung 250 mg | Supplement-Hinweise inkonsistent | [Sicher: v2-Test] | Schalter 125 mg bleibt; Standard im Review mit Arzt/Labor klären | 3 |
| R15 | Kindersicherheit (4 J.) bei neuen Rezepten | Erstickungs-/Allergierisiko | [Wahrscheinlich] | Kindersicherheits-Validator als hartes Gate | 2 |
| R16 | iOS-Speicherlöschung und getrennter PWA-Speicher | Daten „weg", Doppel-Login | [Wahrscheinlich] | Server = Wahrheit, Cache nur Beschleuniger | 1 |
| R17 | Wartbarkeit: Code liegt nur in Chat-Sessions | Kontextverlust zwischen Sessions | [Sicher] | Privates Git-Repo, PRD und Entscheidungen im Projekt | 1 |
| R18 | Choice Overload | Große DB wird nicht genutzt | [Wahrscheinlich] | Vorschlags-/Rotationslogik statt Katalog | 3 |

---

## 11. Phasen und Abnahmekriterien

Eine Phase nach der anderen, Freigabe durch dich zwischen den Phasen. Phase 1 und 2 laufen teilweise parallel, weil deine Perplexity-Läufe Kalenderzeit brauchen.

### Phase 0: Entscheiden (jetzt)
Lieferung: dieses PRD. Peter: Entscheidungen O1–O8, Frau-Interview (30 Min), Perplexity-Briefs A1–A5 anstoßen, alten Cloudflare-Token widerrufen.
Abnahme: O1–O8 beantwortet, Interviewnotizen vorhanden.

### Phase 1: Fundament und Spikes (Größe M)
1. Privates Repo, CI (Typecheck, Vitest, Content-Validator), Worker-Skelett: Static Assets + `/api/health` + D1-Migration `0001`, Deploy per Git.
2. Engine aus v2-Template herausgelöst, Golden-Tests grün.
3. PWA-Shell: Manifest, Icons, Service Worker, Offline-Start, Safe Areas, Install-Hinweis; v2-Wochenplan lesend.
4. **Access-OTP-Login auf echtem iPhone 15 Pro Max (Abnahmepunkt 1):** Login in installierter PWA, Session-Test nach App-Kill und nach 24 h. Auth läuft hinter einer `AuthProvider`-Schnittstelle; schlägt der Test fehl, wird auf Haushalts-Link gewechselt, bevor die Sync-Schicht weiter ausgebaut wird (D6).

Abnahme: (a) iPhone-Login-Test bestanden oder Wechsel vollzogen; (b) `pnpm test` grün, 7 × 171,0 g Eiweiß; (c) installierte PWA startet im Flugmodus mit Wochenplan; (d) Deploy per Git, ohne Token im Chat.

### Phase 2: Content-Pilot, 20 Komponenten (Größe M–L, parallel zu 1)
Brief-Ergebnisse einlesen, Zutatentabelle v3 mit Quellen aufbauen, 20 Komponenten strukturieren (Schwerpunkt: Trainingstags-Carb-Komponenten, Taverne-Alternativen, Meal-Prep, Kinder-Dekonstruktion), Pipeline-Gates automatisieren.

Abnahme: alle 20 `validated`; alle Zutaten mit Quelle + Konfidenz; ≥ 80 % Konfidenz A/B; Atwater- und Kinder-Validator grün; ≥ 8 von 20 von der Frau gekocht; Aufwand je Komponente gemessen.
Gate Ausbau (vorgeschlagen): ≤ 45 Min Ø je Komponente und ≥ 70 % „würde ich wieder kochen". [Vermutung: Schwellen, anpassbar]

### Phase 3: Planner + Mobile-UI + Live-Einkaufsliste (Größe L)
Dial-Solver, Vorschlag/Rotation, Wochenzusammenstellung am Handy, Listengenerierung, Sync, Offline-Outbox, Diff-Banner, Text-Export.

Abnahme: (a) Trainingstag liegt in den Zielbändern für Eiweiß **und** Carbs ohne Fettverstoß (Golden-Tests); (b) Frau erledigt einen echten Einkauf mit zwei gleichzeitigen Geräten, Haken synchron ≤ 10 s; (c) Flugmodus-Test: Änderungen werden nach Reconnect ohne Duplikate repliziert; (d) Cross-Household-Test grün; (e) iPhone-Checkliste (Anhang C) bestanden.

### Phase 4: Ausbau auf 80–100 Komponenten + Betrieb (Größe L, fortlaufend)
Content in Tranchen à 15–20, Bewertungen/Rotation (`recipe_prefs`), Vorrat (`pantry`), wöchentlicher Backup-Dump nach R2, Wiederherstellungstest, Löschen des alten Pages-Projekts.

Abnahme: ≥ 80 Komponenten `approved`, Restore-Test erfolgreich, v2-Pages-Projekt entfernt.

Spätere Kandidaten (BEOBACHTEN): Web Push, Preise, mehrere Händler.

---

## 12. Offene Fragen (konkret)

1. **O1:** Stadt ist Paphos. Bei welchen Händlern (Supermarkt, Metzger, Fischhändler, Markt) kauft ihr tatsächlich ein? (Brief A1 liefert die Landschaft, deine Realität zählt mehr.)
2. **O2:** iPhone oder Android bei deiner Frau? Nutzt sie WhatsApp als Hauptkanal?
3. **O3:** Welches Thermomix-Modell (TM5/TM6/TM7)? Nutzt sie Cookidoo aktiv?
4. ~~O4~~ entschieden (D5): GitHub-Repo + Git-Deploy; **GitHub-Anbindung der Sitzung fehlt noch.**
5. ~~O5~~ entschieden (D6): direkt Access-OTP mit `AuthProvider`-Schnittstelle.
6. **O6:** Eigene Domain für die App (z. B. Subdomain) oder `workers.dev` belassen? Eigene Domain bringt Access-Branding und stabile URL, aber DNS-Pflege.
7. **O7:** Wer vergibt „approved": nur du, oder deine Frau nach dem Kochtest? (Empfehlung: Frau setzt `cooked`, du `approved`.)
8. ~~O8~~ entschieden (D7): Dial-Solver in Phase 3.

Spezialistenfragen (nicht blockierend): DSGVO-Einordnung der Haushaltsausnahme bei Cloudflare-Hosting; Magnesium-Dosierung mit Arzt/Labor.

---

## Anhang A: Perplexity-Deep-Research-Briefs (Hybrid-Recherche)

**Standard-Vorspann für jeden Lauf (kopieren):**
> Antworte auf Deutsch. Region: Zypern, Stadt: **Paphos**. Liefere jede Aussage mit Quellen-URL und Abrufdatum. Wenn du etwas nicht findest, schreibe „nicht gefunden" statt zu schätzen. Keine Nährwerte aus dem Gedächtnis; Nährwerte nur mit Quelle (Hersteller, Etikett, USDA, nationale Datenbank). Gib am Ende zusätzlich einen JSON-Block im unten genannten Format aus. Maximal 40 Zeilen pro Lauf; bei mehr Material bitte nach Kategorien in mehrere Läufe teilen.

**A1 Händler und Verfügbarkeit.** Welche Supermarktketten, Metzger, Fischhändler und Wochenmärkte gibt es in [Stadt], welche Marktanteile/Reichweite? Prüfe für diese Zutatenliste, ob verfügbar (ja/nein/saisonal), wo, lokaler Produktname, griechische Bezeichnung, Preisband in €/kg: Anari, Halloumi (auch fettreduziert), Schafjoghurt, Ziegenjoghurt, Skyr, Magerquark, Hüttenkäse, Hähnchenbrust, Pute, mageres Rinderhack, Lamm, Ziege, Lavraki, Tsipoura, Oktopus, Thunfisch (Dose), Sardinen, Eier, Tofu, Kichererbsen, Linsen, Hafer, Vollkornreis, Bulgur, Kartoffel, Süßkartoffel, Kolokasi, Walnüsse, TK-Beeren. JSON: `{ingredient, available, where, productNameLocal, nameEl, priceBandEurPerKg, sourceUrl, retrievedAt}`.

**A2 Saisonkalender.** Obst, Gemüse, Kräuter und Fisch auf Zypern, Monat 1–12, mit lokalen Namen (DE/EN/EL), Hinweis auf Zucht vs. Wildfang bei Fisch. JSON: `{item, nameEl, months:[1..12], note, sourceUrl}`.

**A3 Traditionelle zypriotische Gerichte als Kandidaten.** 30 Gerichte (Souvla, Kleftiko, Afelia, Fasolada, Louvi, Koupepia, Kolokasi-Gerichte, Fisch vom Grill, Meze-Komponenten usw.) mit typischer Zutatenliste inkl. Mengen pro Portion, Zubereitungsart, typischer Eiweiß-/Fettstruktur, Anpassbarkeit (eiweißreich, kindgerecht, Thermomix/Varoma), Quelle. **Keine Anleitungstexte wörtlich übernehmen**, nur Zutaten und Eckdaten. JSON: `{dish, ingredientsPerPortion:[{name, grams|pieces}], method, adaptNotes, sourceUrl}`.

**A4 Einkaufs-Vokabular.** Metzger- und Fischhändler-Begriffe auf Griechisch (Schnitte, Teilstücke, Fischarten, Zubereitungswünsche), damit deine Frau präzise bestellen kann. JSON: `{termEl, transliteration, de, usage, sourceUrl}`.

**A5 Etiketten lokaler Produkte.** Nährwertangaben pro 100 g von Herstellerseiten oder Händlershops für die in A1 gefundenen lokalen Produkte (Anari, Halloumi-Varianten, Schafjoghurt, Skyr/Quark-Marken, Proteinprodukte). JSON: `{product, brand, per100g:{kcal, proteinG, fatG, carbsG, fiberG}, sourceUrl, retrievedAt}`.

Rückgabe: Ergebnisse als Markdown/JSON in den Chat oder als Datei in den Projektordner. Ich importiere nach `content/research/` und mappe auf Zutaten-IDs; Zahlen ohne URL werden verworfen.

Ich recherchiere selbst: Kinder-Ernährungsleitlinien (4 J.), EFSA/DGE-Referenzwerte, Sportler-Referenzen, Allergen-/Sicherheitsregeln, USDA-Daten für Basiszutaten.

## Anhang B: Interview Frau (30 Min, Notizen an mich)
1. Welches Smartphone, wie viel WhatsApp? Würde sie eine App auf den Home-Screen legen?
2. Wie plant und kauft sie heute (Zettel, Notizen-App, Apps)? Wie oft, wo?
3. Was nervt am aktuellen Ablauf am meisten?
4. Soll sie nur abhaken und lesen oder auch Gerichte tauschen/vorschlagen dürfen?
5. Was isst die Tochter gern, was nie? Allergien/No-Gos? Wie funktioniert „dekonstruiert" im Alltag?
6. Thermomix-Modell, Cookidoo-Nutzung, Lieblingsgerichte, Kochzeitbudget werktags, Meal-Prep-Tag?
7. Wo kauft sie Fisch/Fleisch, was ist dort regelmäßig nicht verfügbar?
8. Was würde sie an der App nie nutzen?

## Anhang C: iPhone-Testcheckliste (echtes Gerät, Safari + installierte PWA)
1. Installation über „Zum Home-Bildschirm"; Icon, Name, Statusleiste korrekt.
2. Start im Flugmodus: Plan und Liste sichtbar.
3. Safe Areas: nichts unter Dynamic Island oder Home-Indikator.
4. Alle Eingabefelder ohne Auto-Zoom; keine horizontale Scrollbar.
5. Login in installierter PWA, App-Kill, Neustart: Session noch gültig?
6. Zwei Geräte: Haken wird synchronisiert; Flugmodus-Änderung wird nachgesendet.
7. Update: neue Version erscheint als Banner, kein Weißbildschirm.
8. Tastatur öffnet: Bottom-Bar und aktive Eingabe bleiben nutzbar.
9. WhatsApp-Export der Liste öffnet das Share-Sheet.
10. Wake-Lock im Kochmodus (wenn verfügbar).

## Anhang D: Verifizierte Cloudflare-Fakten (Doku-Suche, 2026-10-04)
- Workers Static Assets sind der empfohlene Weg für neue Projekte; Pages läuft weiter, neue Features gehen an Workers. (developers.cloudflare.com/workers/best-practices/workers-best-practices)
- Statische Asset-Requests auf Workers sind kostenfrei; Pages-Functions-Aufrufe werden wie Workers abgerechnet. (…/static-assets/migration-guides/migrate-from-pages)
- `run_worker_first` als Pfadliste (`/api/*`) plus `not_found_handling = single-page-application`. (…/static-assets/routing)
- `_headers` gilt nicht für Worker-generierte Antworten. (…/static-assets/headers)
- Access per Klick für `workers.dev` und Preview-URLs; Policy per E-Mail, E-Mail-Domain oder Cloudflare-Account-Mitgliedschaft; JWT im Worker prüfen. (Changelog 2025-10-03, 2026-08-14)
- Neue Zero-Trust-Organisationen: Cloudflare als Standard-IdP, OTP muss manuell hinzugefügt werden; OTP-PIN gültig 10 Minuten. (…/identity-providers/one-time-pin)
- Workers Free: 100.000 Requests/Tag, 10 ms CPU, 50 externe Subrequests, 20.000 Asset-Dateien, 5 Cron-Trigger pro Konto. (…/workers/platform/limits)
- D1: Binding per `d1_databases`, Migrationen via `migrations_dir`. (…/d1/reference/migrations)
- **Nicht bestätigt:** Zero-Trust-Free „bis 50 Nutzer"; D1-Time-Travel-Aufbewahrung; Zugriffsschutz für Pages-Produktionsdomain `*.pages.dev`.
