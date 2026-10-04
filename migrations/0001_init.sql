-- 0001_init.sql: Haushalts-Zustand (Plan, Listen, Verfügbarkeit). Inhalte (Rezepte) liegen NICHT in D1, sondern im Git-Repo.
-- Keine Körperdaten (Gewicht, Ziele) serverseitig, siehe PRD Abschnitt 4.1/4.4.
-- Quelle der Wahrheit: docs/prd-v3-hosted-pwa.md Abschnitt 5.2

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
