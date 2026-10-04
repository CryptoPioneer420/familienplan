# @familienplan/worker

Cloudflare-Worker mit Hono-API für den Familienplan (PRD v3, Abschnitte 4.1 bis 4.5, 5.2, Phase 1).
Der Worker bedient `/api/*`; alle anderen Pfade gehören den Static Assets (`run_worker_first: ["/api/*"]` in `../../wrangler.jsonc`).
Als Fallback leitet `app.all('*')` solche Pfade an das `ASSETS`-Binding weiter; den SPA-Fallback übernimmt die Assets-Konfiguration (`not_found_handling: single-page-application`).

Stand: Phase-1-Fundament (Auth-Schnittstelle, Mitgliederverwaltung, Owner-Bootstrap). Sync-Routen (`/api/sync`, `/api/items/:id`) folgen in Phase 3 und hängen sich an dieselbe Auth.

## Struktur

```
src/
  index.ts              default export { fetch }, export const app
  app.ts                createApp(deps): Middleware-Reihenfolge, Routen, Fallbacks
  env.ts                Env-Typ (Bindings + Variablen)
  types.ts              AppEnv (Hono), AppDeps (nur für Tests)
  version.ts            VERSION für /api/health
  auth/
    types.ts            AuthProvider-Interface, AuthConfigError, AuthUnavailableError
    access-jwt.ts       Provider: Cloudflare-Access-JWT (jose)
    dev.ts              Provider: X-Dev-Email (nur lokal)
    index.ts            selectAuthProvider(env): fail-closed
  db/members.ts         SQL für Mitglieder, Owner-Bootstrap (Zod-geprüfte Zeilen, kein ORM)
  middleware/           context (Request-ID, Header, Log), auth (requireMember/requireOwner), errors
  routes/               health, me, members
  lib/                  email, id (UUIDv7), errors, validation, log
test/                   Vitest im Workers-Runtime-Pool (echtes D1)
```

## Routen

| Methode | Pfad | Schutz | Antwort |
|---|---|---|---|
| GET | `/api/health` | öffentlich, kein DB-Zugriff | `{ ok: true, version }` |
| GET | `/api/me` | Mitglied | `{ memberId, householdId, role, displayName }` |
| GET | `/api/members` | Mitglied | `{ members: [{ id, email, role, displayName, createdAt }] }`, nur der eigene Haushalt |
| POST | `/api/members` | Owner | Body `{ email, displayName? }` => `200 { member }` |
| * | alles andere unter `/api/*` | | `404 { error: { code: "not_found", message } }` |

`POST /api/members`:

- Idempotent: derselbe Request zweimal liefert zweimal 200 mit demselben Member. Die E-Mail wird getrimmt und kleingeschrieben gespeichert; `Wife@Example.com` und `wife@example.com` sind derselbe Member.
- Ein mitgegebener `displayName` wird übernommen (auch bei bereits vorhandenem Member); ohne Angabe bleibt er unverändert.
- Neue Mitglieder haben immer die Rolle `member`. Es gibt keine API, die Rollen vergibt.
- Body ist `strictObject`: unbekannte Felder (z. B. `householdId`, `role`) ergeben 400. Der Haushalt kommt nie aus Body oder Query.
- Verlangt `Content-Type: application/json` (sonst 415). Das ist der CSRF-Schutz für Cookie-Sitzungen, weil ein fremdes Formular diesen Typ ohne CORS-Preflight nicht senden kann.
- Body größer als 16 KiB => 413.
- Gehört die E-Mail bereits zu einem anderen Haushalt (`UNIQUE(email)` in v1), antwortet die API 409 `conflict` ohne Details dieses Haushalts.

### Fehlerformat

```json
{ "error": { "code": "invalid_request", "message": "Request validation failed.",
             "fields": [{ "path": "email", "message": "Invalid email address" }] } }
```

| Status | `code` | Wann |
|---|---|---|
| 400 | `invalid_request` | Zod-Validierung oder kaputtes JSON (`fields` bei Validierung) |
| 401 | `unauthenticated` | kein oder ungültiges Token |
| 403 | `forbidden` | authentifiziert, aber kein Mitglied (immer dieselbe Antwort, keine Existenz-Informationen) oder Rolle `owner` fehlt |
| 404 | `not_found` | unbekannter Pfad unter `/api/*` |
| 409 | `conflict` | E-Mail gehört zu anderem Haushalt |
| 413 / 415 | `payload_too_large` / `unsupported_media_type` | |
| 500 | `internal_error` | unerwartet; Details nur im Log |
| 503 | `auth_not_configured` | Auth-Konfiguration unvollständig oder unzulässig (fail-closed) |
| 503 | `auth_unavailable` | Access-Schlüssel (JWKS) nicht ladbar |

### Header

Die Middleware setzt auf jeder Antwort des Workers `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Cache-Control: no-store` und `X-Request-Id`.
Ausnahme: Antworten, die der Fallback von `ASSETS` durchreicht, behalten ihr eigenes `Cache-Control`. (Mit `run_worker_first: ["/api/*"]` erreichen Asset-Requests den Worker normalerweise nie.)
`_headers` in `apps/web` greift nur für Static Assets, nicht für Worker-Antworten, deshalb setzt der Worker seine Header selbst. Kein CORS (Same-Origin); `OPTIONS` ergibt 404.

## Konfiguration

Variablen stehen in `../../wrangler.jsonc` (`vars`), der Worker liest sie aus `env`.

| Name | Bedeutung |
|---|---|
| `ENVIRONMENT` | `production` im Deployment. `AUTH_MODE=dev` ist nur erlaubt, wenn `ENVIRONMENT` gesetzt und nicht `production` ist (Vergleich ohne Groß-/Kleinschreibung) |
| `AUTH_MODE` | `access` (Standard) oder `dev`. Jeder andere Wert => 503 |
| `ACCESS_TEAM_DOMAIN` | Zero-Trust-Team-Domain, z. B. `meinteam.cloudflareaccess.com` (ohne Schema; ein führendes `https://` und ein `/` am Ende werden toleriert) |
| `ACCESS_POLICY_AUD` | AUD-Tag der Access-Application |
| `OWNER_EMAIL` | E-Mail des Owners für den Bootstrap beim ersten Login (Vergleich ohne Groß-/Kleinschreibung); leer => kein Bootstrap möglich |
| `DB` (D1) | Migration `../../migrations/0001_init.sql` |
| `ASSETS` | Static-Assets-Binding |

## Auth-Flow

```
Browser ──► Cloudflare Access (Login, OTP) ──► Worker  (Header Cf-Access-Jwt-Assertion)
                                                │
   requireMember: selectAuthProvider(env) ──► provider.authenticate(req, env) ──► { email } | null
                                                │
   findMemberByEmail(email) ── gefunden ───────►│── Member (id, householdId, role) im Kontext
        │ nicht gefunden
        ├─ email === OWNER_EMAIL und households leer ──► Bootstrap ──► Member
        └─ sonst ──► 403 forbidden
```

- Der Haushalt kommt IMMER aus der Mitgliedschaft des verifizierten Subjekts (`members.household_id`), nie aus Query, Body oder Headern. Alle Queries für Haushaltsdaten filtern über `household_id`.
- Der Provider liefert nur die Identität (E-Mail). Rolle und Haushalt kommen aus D1. Deshalb lässt sich der Provider austauschen (siehe unten).
- Geschützt wird pro Route mit `requireMember(rt)`, damit unbekannte Pfade auch ohne Login 404 liefern. `test/routes-protection.test.ts` iteriert über alle registrierten `/api`-Routen und verlangt, dass jede außer `GET /api/health` ohne Login 401 liefert. Wer eine Route vergisst abzusichern, bekommt einen roten Test.

### Fail-closed

`selectAuthProvider` wirft `AuthConfigError`, und die App antwortet auf geschützten Routen mit 503 `auth_not_configured` (klare Meldung), wenn

- `AUTH_MODE=access` und `ACCESS_TEAM_DOMAIN` oder `ACCESS_POLICY_AUD` leer bzw. ungültig ist (so ist die Auslieferungskonfiguration von `wrangler.jsonc`, bis Access eingerichtet ist),
- `AUTH_MODE=dev` mit `ENVIRONMENT=production` (oder leerem `ENVIRONMENT`),
- `AUTH_MODE` einen unbekannten Wert hat.

Der Dev-Provider prüft die Bedingung zusätzlich selbst und liefert in Produktion nie eine Identität. `/api/health` und Assets bleiben erreichbar, nur die geschützten Routen sperren.

### Access-JWT prüfen (`src/auth/access-jwt.ts`)

1. Header `Cf-Access-Jwt-Assertion` lesen. Fehlt er, ist das 401. Das Cookie `CF_Authorization` wird bewusst nicht ausgewertet.
2. Mit `jose.jwtVerify` gegen `createRemoteJWKSet(https://<ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs)` prüfen:
   - Signatur (nur `RS256` und `ES256`; Access signiert mit RS256; `none` und HMAC werden abgelehnt),
   - `iss === https://<ACCESS_TEAM_DOMAIN>`,
   - `aud` enthält `ACCESS_POLICY_AUD`,
   - `exp` ist Pflicht und nicht überschritten (Clock-Tolerance 30 s).
3. Claim `email` ist Pflicht (Service-Tokens ohne E-Mail werden abgelehnt) und wird kleingeschrieben.
4. Jeder Fehler am Token ergibt `null` => 401. Der Ablehnungsgrund (nur der jose-Fehlercode, z. B. `ERR_JWT_EXPIRED:exp` oder `ERR_JWT_CLAIM_VALIDATION_FAILED:aud`) landet als `authReason` im Log, nie das Token.
5. Kann der Schlüsselsatz nicht geladen werden (Timeout, HTTP != 200, Netzwerk), ist das kein Token-Fehler: 503 `auth_unavailable`, nicht 401 und nicht offen.

Die Schlüsselquelle ist über `createApp({ auth: { resolveKeySet } })` injizierbar; die Tests nutzen damit einen lokal erzeugten Schlüssel (`createLocalJWKSet`).

Wo man die Werte findet: Team-Domain und AUD-Tag stehen im Zero-Trust-Dashboard (Team-Name in den Settings, AUD-Tag in der Access-Application auf dem Overview-Tab). Diese Fundstellen sind aus der Cloudflare-Dokumentation übernommen und nicht gegen das Dashboard verifiziert. Die Signaturschlüssel zeigt `curl https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`.

JWKS-Caching: pro Isolate ein `createRemoteJWKSet` je Team-Domain (Modul-Map). jose cached die Schlüssel 10 Minuten und ruft bei unbekannter `kid` höchstens alle 30 Sekunden neu ab. Beim Kaltstart kostet das einen Subrequest. jose verwirft in Workers bewusst ein laufendes Abruf-Promise anderer Requests, deshalb kann es bei parallelen Kaltstart-Requests mehrere Abrufe geben (bei 2 Nutzern irrelevant; Test: `test/jwks-concurrency.test.ts`).

### Owner-Bootstrap

Kennt die Datenbank die authentifizierte E-Mail nicht und ist sie gleich `OWNER_EMAIL` (case-insensitiv, nicht leer) und ist `households` leer, legt der Worker Haushalt (`name = "Familie"`) und Owner an (UUIDv7 als TEXT, Zeit in ms).
Das geschieht in einem `db.batch` (eine Transaktion) mit zwei `INSERT ... SELECT ... WHERE NOT EXISTS`; danach wird der Member neu gelesen. D1 serialisiert Schreibzugriffe, deshalb legen parallele Erstanfragen genau einen Haushalt an (Test mit 6 parallelen Requests; ohne die `NOT EXISTS`-Bedingung entstehen dort 6 Haushalte).
Jede andere unbekannte Identität bekommt 403 `forbidden`, unabhängig davon, ob schon ein Haushalt existiert.

### Logging

Eine JSON-Zeile pro Request per `console.log`:
`{ ts, requestId, method, path, status, ms, memberId?, errorCode?, authReason?, bootstrap?, error? }`.
Keine E-Mail-Adressen, keine Tokens, keine Query-Strings (`path` ohne Query). `error` (Name, geschwärzte Meldung, Stack) steht nur bei 500 und 503 `auth_unavailable`; E-Mail-Muster und JWT-artige Strings werden dort zusätzlich geschwärzt.
`requestId` kommt auch als `X-Request-Id` in die Antwort. Unerwartete Fehler ergeben 500 `internal_error` ohne Details in der Antwort.

## Entwicklung

```sh
pnpm --filter @familienplan/worker typecheck
pnpm --filter @familienplan/worker test
pnpm --filter @familienplan/worker dev --var ENVIRONMENT:development --var AUTH_MODE:dev --var OWNER_EMAIL:dev@example.com
```

`dev` startet `wrangler dev -c ../../wrangler.jsonc`. Voraussetzungen und Stolpersteine:

- `apps/web/dist` muss existieren (`pnpm --filter @familienplan/web build`), sonst bricht wrangler mit "assets.directory does not exist" ab.
- Lokale D1 einmalig migrieren: `pnpm --filter @familienplan/worker exec wrangler d1 migrations apply familienplan --local -c ../../wrangler.jsonc`.
- Mit `AUTH_MODE=dev` setzt man die Identität per Header, z. B. `curl -H 'X-Dev-Email: dev@example.com' http://localhost:8787/api/me`. Ohne `--var` startet der Worker mit `AUTH_MODE=access` und leerer Access-Konfiguration und antwortet auf geschützten Routen 503.
- Das Compatibility-Datum in `wrangler.jsonc` (2026-10-04) setzt eine aktuelle workerd-Version voraus. Das gebündelte workerd von wrangler 4.147 akzeptiert es; das workerd im Test-Pool (Miniflare 5.20260815) nicht (siehe unten).

## Tests

Runner: Vitest 4 mit `@cloudflare/vitest-pool-workers` (0.22). Die Tests laufen in der echten Workers-Runtime (workerd) mit echtem D1 (Miniflare).
`vitest.config.ts` liest `../../migrations/*.sql` (`readD1Migrations`), `test/setup.ts` wendet sie vor jedem Testfile an und leert die Tabellen vor jedem Test. Es gibt keine DB-Mocks: das SQL aus der Migration und aus `src/db/members.ts` läuft unverändert.

| Datei | Inhalt |
|---|---|
| `health.test.ts` | öffentlich, kein DB-Zugriff, Default-Export |
| `auth-access.test.ts` | 401, 503 bei unvollständiger Config, JWT gültig/falsche Audience/abgelaufen/falscher Issuer/fremde Signatur/`none`/HS256/ohne `exp`/ohne E-Mail, Clock-Tolerance, JWKS ausgefallen, Remote-JWKS-Pfad mit gestubbtem `fetch` |
| `auth-dev.test.ts` | Dev-Provider, Ablehnung in `production`, unbekannter `AUTH_MODE` |
| `bootstrap.test.ts` | genau ein Haushalt (auch parallel), Fremde 403, case-insensitiver Owner-Vergleich |
| `members.test.ts` | Hinzufügen, Idempotenz, Normalisierung, Nicht-Owner 403, Validierung, 415/413 |
| `tenancy.test.ts` | zwei Haushalte in der DB, Trennung bei Lesen und Schreiben, Injektionsversuche |
| `http.test.ts` | Sicherheits-Header auf allen Antworttypen, 404-Format, 500 ohne Details, Asset-Fallback |
| `logging.test.ts` | Felder, keine E-Mail/Token im Log, Schwärzung |
| `routes-protection.test.ts` | Wächter: jede `/api`-Route außer `health` verlangt Login |
| `jwks-concurrency.test.ts` | getrennte Requests über `SELF` gegen den echten Einstieg |
| `unit.test.ts` | UUIDv7, E-Mail-/Domain-Normalisierung, Schwärzung |

Hinweis zum Compatibility-Datum der Tests: `vitest.config.ts` nutzt `2026-08-01` statt des Datums aus `wrangler.jsonc`, weil das workerd des Test-Pools höchstens `2026-08-22` kennt und bei `2026-10-04` mit "newest date supported by this server binary" abbricht. Wird `@cloudflare/vitest-pool-workers` aktualisiert, kann das Datum angeglichen werden.

`@cloudflare/vitest-pool-workers` 0.22 verlangt Vitest `^4.1`; das Root-`package.json` führt Vitest 3. Beide Versionen koexistieren, weil dieses Paket seine eigene Vitest-Version in `apps/worker/node_modules` bekommt; `vitest` im Skript löst dorthin auf.

## Wechsel auf einen Haushalts-Link (nur beschrieben, nicht gebaut)

Falls der iPhone-Login-Test mit Access scheitert (Entscheidung D6, Phase 1 Abnahmepunkt 1), ist der Wechsel eine zweite `AuthProvider`-Implementierung. Alles oberhalb der Auth-Schicht (Mitgliedschaft, Haushalt, Rollen, Routen) bleibt unverändert, weil der Provider nur `{ email }` liefert. Aufwand: unter einem Tag.

1. **Migration `0002_household_links.sql`**: `household_links(id, member_id REFERENCES members(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE, created_at, expires_at, revoked_at, last_used_at)`. Gespeichert wird nur der SHA-256-Hash eines zufälligen 256-Bit-Tokens, nie das Token selbst.
2. **Einlösen**: `GET /api/auth/redeem?t=<token>` (öffentlich, einziger neuer ungeschützter Pfad, in `PUBLIC_ROUTES` des Routenschutz-Tests aufnehmen). Prüft den Hash, setzt `Set-Cookie: fp_session=<token>; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=...` und leitet auf `/` um. Das Token verschwindet dabei aus der URL; `Referrer-Policy: no-referrer` ist bereits gesetzt. Rate-Limit gegen Raten (Cloudflare-Rate-Limiting-Regel oder Zähler in D1).
3. **Provider `src/auth/household-link.ts`**: liest das Cookie `fp_session`, hasht es per WebCrypto, sucht eine nicht widerrufene, nicht abgelaufene Zeile, joint `members.email` und liefert `{ email }`; sonst `null`. `last_used_at` kann gedrosselt aktualisiert werden.
4. **Factory**: in `selectAuthProvider` einen Zweig für `AUTH_MODE === 'link'` ergänzen und `'link'` im Typ `Env['AUTH_MODE']` zulassen. Wie bei `access` fail-closed.
5. **Verwaltung**: Owner-Routen zum Erzeugen (Token einmalig anzeigen), Widerrufen und Rotieren eines Links pro Mitglied; Logout löscht Cookie und Zeile.
6. **Tests**: gleiche Struktur wie `auth-access.test.ts` (gültig, abgelaufen, widerrufen, falsches Token, kein Cookie).

Offener Punkt: `members.email` ist `NOT NULL UNIQUE`. Auch bei Haushalts-Links müsste der Owner beim Einladen eine E-Mail (oder einen Platzhalter) angeben. Der Cookie-Ansatz braucht zudem CSRF-Schutz; der Pflicht-Header `Content-Type: application/json` plus `SameSite=Lax` deckt das für JSON-Routen ab.

## Bekannte Grenzen

- Die Remote-JWKS-Auflösung und das Verhalten hinter echtem Access sind mit gestubbtem `fetch` getestet, nicht gegen eine echte Access-Application.
- `/api/members` gibt E-Mail-Adressen der Haushaltsmitglieder an Mitglieder desselben Haushalts zurück (nötig für die Verwaltung); sie stehen in keinem Log.
- v1 kennt genau einen Haushalt (`UNIQUE(email)`; Bootstrap nur bei leerer Tabelle). Mehrere Haushalte sind im Schema und in den Queries vorbereitet, aber es gibt keinen API-Weg, einen zweiten anzulegen.
