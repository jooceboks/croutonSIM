// getStateAt(date): the Postgres-backed projection.
//
// It reads the events up to `date` out of the log and folds them into a snapshot of
// the org at that date. It stores NOTHING. Ask for a different date and it recomputes
// from the same log. This is the time-travel the whole project is about.

import type { ISODate, OrgEvent } from "./types";
import { foldEvents, type DerivedState } from "./state";
import { pool } from "./db";

interface EventRow {
  id: string;
  date: string;
  type: OrgEvent["type"];
  payload: OrgEvent["payload"];
}

export async function getStateAt(date: ISODate): Promise<DerivedState> {
  // Pull the slice of the log we care about, in true append order (by seq).
  const { rows } = await pool.query<EventRow>(
    `SELECT id, date::text AS date, type, payload
     FROM events
     WHERE date <= $1
     ORDER BY seq`,
    [date],
  );

  // Rebuild OrgEvent objects from the rows, then reuse the exact same fold the
  // in-memory path uses. One definition of "how state is derived", two callers.
  const events = rows.map(rowToEvent);
  return foldEvents(events, date);
}

function rowToEvent(row: EventRow): OrgEvent {
  return {
    id: row.id,
    date: row.date,
    type: row.type,
    payload: row.payload,
  } as OrgEvent;
}
