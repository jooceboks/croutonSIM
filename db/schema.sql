-- Schema for the organization simulator.
--
-- The `events` table is the source of truth (append-only log). The three identity
-- tables (organizations, people, teams) hold STABLE IDENTITY ONLY. Nothing that
-- changes over time (a person's role, team, or status) lives on those rows; that all
-- lives in events and is DERIVED by folding.
--
-- The foreign keys on `events` are the point: Postgres will physically reject an
-- event that references a person, team, or org that was never inserted. Coherence
-- for free.

-- Rebuild from scratch each time so migrations are reproducible in dev.
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS people CASCADE;
DROP TABLE IF EXISTS teams CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;

-- ----- Identity tables (who/what exists, not their changing state) -----

CREATE TABLE organizations (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  founded_date DATE NOT NULL,
  location     TEXT NOT NULL,          -- founding location; later moves live in RELOCATED events
  status       TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE people (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL
  -- No role / team / status columns on purpose. Those change over time -> events.
);

CREATE TABLE teams (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  created_date DATE NOT NULL
);

-- ----- The event log (append-only, ordered by date) -----

CREATE TABLE events (
  id        TEXT PRIMARY KEY,
  seq       INTEGER NOT NULL,          -- emission order; the true append order of the log
  date      DATE NOT NULL,
  type      TEXT NOT NULL,
  -- Optional foreign keys. They are what make coherence structural: an event that
  -- names a person/team/org must reference one that already exists in its table.
  org_id    TEXT REFERENCES organizations(id),
  person_id TEXT REFERENCES people(id),
  team_id   TEXT REFERENCES teams(id),
  -- Everything type-specific (role, employment type, from/to location) goes here.
  payload   JSONB NOT NULL
);

-- getStateAt(date) filters and orders by date constantly, so index it.
CREATE INDEX idx_events_date ON events (date);
