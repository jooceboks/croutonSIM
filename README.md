# Organization Simulator

A mock "work system" that generates a coherent organizational history and exposes it
the way an external system would, so a product like Crouton has realistic, internally
consistent data to sync against and reconstruct an org over time.

You can run the program and view a timeline of events representing the org's
**formation, changes, and conclusion**: people joining and leaving, teams forming,
promotions and team moves, relocations, and eventually a shutdown.

## The core idea: event sourcing

**History is the product, so state is never stored, only derived.**

An append-only **event log** is the single source of truth. The current state of the
org (who is on which team, where it is based, whether it is still running) is never
stored as mutable fields. It is **derived** by folding the events up to a chosen date.

Why this matters: the moment you store someone's current role as a column and update
it, the old value is gone and you can no longer answer "what did the org look like last
February." Keeping every change as an event means the past is never overwritten and any
point in time can be reconstructed. This mirrors how Crouton itself works: rebuild an
org's structure from a stream of changes.

## How it flows

```text
  Engine            Event log             getStateAt          API           React UI
 (invents     -->  (Postgres,       -->  (folds the    -->  (/events, --> (timeline +
  a coherent        append-only            log up to          /state)       org map)
  history)          source of truth)       a date)
```

Read left to right: the engine invents a coherent history as a stream of events; the
events are stored in an append-only log (the source of truth); `getStateAt(date)`
derives the org's state at any date by folding that log; the API serves both the raw
log and the derived state; and the UI shows the history alongside the derived snapshot.

## Data model

Two kinds of tables:

- **Identity tables** (`organizations`, `people`, `teams`) hold only stable identity.
  `people` has just `id` and `name`; role, team, and status are NOT columns because
  they change over time.
- **The event log** (`events`) is append-only: `id`, `seq`, `date`, `type`, a `jsonb`
  `payload`, and foreign keys (`org_id`, `person_id`, `team_id`). The foreign keys make
  coherence structural: Postgres will not store an event referencing an entity that was
  never created.

Event types: `ORG_FOUNDED`, `TEAM_FORMED`, `PERSON_JOINED`, `PERSON_LEFT`,
`ROLE_CHANGED` (promotions and team moves), `RELOCATED`, `ORG_SHUTDOWN`.

Each hire also records who they report to (their manager), so the reporting hierarchy
is part of the org structure and can be reconstructed at any date. The detail panel
shows "reports to X" for each person.

## Stack

TypeScript end to end, Postgres for storage (raw SQL via `pg`, no ORM, for legibility),
React (Vite) for the UI. Deterministic: a seeded RNG means the same seed always produces
the same org.

## Running it

Prerequisites: Node 18+ and a local Postgres.

```bash
# 1. install and create the database
npm install
createdb crouton_sim
export DATABASE_URL=postgres://localhost/crouton_sim   # or your own connection string

# 2. MVP 0: run the engine in memory, print the log as sentences (no DB needed)
npm start

# 3. MVP 1: create the schema, generate an org, and persist the event log
npm run db:migrate
npm run seed

# 4. verify coherence: the engine's forward state must equal the log replayed from DB
npm run check

# unit tests for the fold (no database needed)
npm test

# 5. inspect the derived state at any date (time travel)
npm run state 2025-06-01
npm run state 2026-10-01

# 6. MVP 2: start the API (the simulated work system)
npm run serve        # http://localhost:3000

# 7. MVP 3: start the UI (separate terminal); it proxies to the API
cd web
npm install
npm run dev          # http://localhost:5173
```

To see the full UI: run `npm run serve` in the root and `npm run dev` in `web/`, then
open http://localhost:5173.

## The API (the "work system")

- `GET /events` the raw append-only log. Filters: `?from=YYYY-MM-DD&to=YYYY-MM-DD&type=`
- `GET /state?date=YYYY-MM-DD` the derived org snapshot at a date (defaults to latest)
- `GET /people` the people identity records

## The UI

- **Timeline (default):** the event log on the left (the whole history, past solid,
  future dimmed) and the derived state on the right (folded from the log at the scrubber
  date). Drag the scrubber: the log never changes, the snapshot recomputes. That
  contrast is event sourcing.
- **Map (toggle):** the org structure at the scrubbed date as a node diagram.

## Build order

Built in strict MVP order:

- **MVP 0** simulation engine in plain TypeScript, no DB, no UI.
- **MVP 1** persist events to Postgres, plus `getStateAt(date)` and the consistency check.
- **MVP 2** the HTTP API.
- **MVP 3** the React timeline + org map.
- **MVP 4** richer events: promotions / team moves (`ROLE_CHANGED`), the shutdown arc,
  and reporting relationships (who reports to whom).

## Correctness

Two independent checks guard the core:

- **`npm run check`** builds the final org two ways that share no code, the engine's
  forward run and the log replayed from Postgres, and asserts they match. If the log
  can reconstruct the exact org the engine simulated, the log is a complete history.
- **`npm test`** unit-tests the fold (`foldEvents`) directly: given a hand-written
  event log, it asserts the exact derived state for each event type (join, leave,
  promote, relocate, shutdown, and time travel).

## Notes

- `npm run seed` truncates and reloads for reproducibility. This is a development reset;
  in production the log only ever grows.
- The data is intentionally coherent, not realistic (roles are not correlated to company
  stage, departures are random). The goal is a believable, internally consistent history
  to test against.
