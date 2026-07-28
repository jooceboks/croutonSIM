// Writes an event log into Postgres.
//
// As it walks the log, it inserts the IDENTITY rows (org, person, team) into their
// thin tables the moment those entities first appear, then inserts the event row
// with foreign keys pointing at them. Because the FK row is written first, the
// event's foreign key always resolves. And because the columns are real foreign
// keys, Postgres itself would reject any event that named an entity we had not
// inserted. Coherence is enforced by the database, not just by our code.

import type { PoolClient } from "pg";
import type { OrgEvent } from "./types";
import { pool } from "./db";

interface EventFks {
  orgId: string | null;
  personId: string | null;
  teamId: string | null;
}

export async function persistEvents(events: OrgEvent[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Reproducible: clear everything, then replay the log from scratch. (This is a
    // dev-time reset, not production behavior. In production the log only grows.)
    await client.query(
      "TRUNCATE events, people, teams, organizations CASCADE",
    );

    // seq is a 1-based counter capturing the true append order of the log, so the
    // projection can order events even when their text ids would sort wrong.
    for (let i = 0; i < events.length; i++) {
      await writeEvent(client, events[i], i + 1);
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function writeEvent(
  client: PoolClient,
  event: OrgEvent,
  seq: number,
): Promise<void> {
  switch (event.type) {
    case "ORG_FOUNDED": {
      const p = event.payload;
      await client.query(
        `INSERT INTO organizations (id, name, founded_date, location, status)
         VALUES ($1, $2, $3, $4, 'active')`,
        [p.orgId, p.orgName, event.date, p.location],
      );
      await client.query(`INSERT INTO people (id, name) VALUES ($1, $2)`, [
        p.founderId,
        p.founderName,
      ]);
      await insertEvent(client, event, seq, {
        orgId: p.orgId,
        personId: p.founderId,
        teamId: null,
      });
      break;
    }

    case "TEAM_FORMED": {
      const p = event.payload;
      await client.query(
        `INSERT INTO teams (id, name, created_date) VALUES ($1, $2, $3)`,
        [p.teamId, p.name, event.date],
      );
      await insertEvent(client, event, seq, {
        orgId: null,
        personId: null,
        teamId: p.teamId,
      });
      break;
    }

    case "PERSON_JOINED": {
      const p = event.payload;
      await client.query(`INSERT INTO people (id, name) VALUES ($1, $2)`, [
        p.personId,
        p.name,
      ]);
      // The team already exists (the engine always forms it first). Resolve its id
      // by name so the event can foreign-key to the exact team row.
      const teamId = await teamIdByName(client, p.team);
      await insertEvent(client, event, seq, {
        orgId: null,
        personId: p.personId,
        teamId,
      });
      break;
    }

    case "PERSON_LEFT": {
      // The person already exists (they must have joined earlier). Just link the event.
      await insertEvent(client, event, seq, {
        orgId: null,
        personId: event.payload.personId,
        teamId: null,
      });
      break;
    }

    case "RELOCATED": {
      const orgId = await onlyOrgId(client);
      await insertEvent(client, event, seq, {
        orgId,
        personId: null,
        teamId: null,
      });
      break;
    }

    case "ROLE_CHANGED": {
      const p = event.payload;
      // The person already exists; link to them and to their new team.
      const teamId = await teamIdByName(client, p.team);
      await insertEvent(client, event, seq, {
        orgId: null,
        personId: p.personId,
        teamId,
      });
      break;
    }

    case "ORG_SHUTDOWN": {
      // Flip the org's stored status too, so the identity row agrees with the log.
      await client.query(
        `UPDATE organizations SET status = 'shutdown' WHERE id = $1`,
        [event.payload.orgId],
      );
      await insertEvent(client, event, seq, {
        orgId: event.payload.orgId,
        personId: null,
        teamId: null,
      });
      break;
    }
  }
}

async function insertEvent(
  client: PoolClient,
  event: OrgEvent,
  seq: number,
  fks: EventFks,
): Promise<void> {
  await client.query(
    `INSERT INTO events (id, seq, date, type, org_id, person_id, team_id, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      event.id,
      seq,
      event.date,
      event.type,
      fks.orgId,
      fks.personId,
      fks.teamId,
      JSON.stringify(event.payload),
    ],
  );
}

async function teamIdByName(
  client: PoolClient,
  name: string,
): Promise<string | null> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM teams WHERE name = $1`,
    [name],
  );
  return rows[0]?.id ?? null;
}

async function onlyOrgId(client: PoolClient): Promise<string | null> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM organizations LIMIT 1`,
  );
  return rows[0]?.id ?? null;
}
