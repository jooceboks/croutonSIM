// MVP 2: the HTTP API. Run with: npm run serve
//
// These endpoints ARE the simulated work system: the external source Crouton would
// sync against. The handlers are deliberately thin. /state, for example, is just
// getStateAt() sent as JSON. The API is a delivery mechanism over the same event log
// and the same fold; it adds HTTP and nothing else.

import express from "express";
import { pool } from "./db";
import { getStateAt } from "./projection";

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

// Index: lists the endpoints so the API is self-describing.
app.get("/", (_req, res) => {
  res.json({
    service: "organization simulator",
    endpoints: {
      "GET /events": "the raw append-only event log. filters: ?from=YYYY-MM-DD&to=YYYY-MM-DD&type=PERSON_JOINED",
      "GET /state": "the derived org snapshot at a date. ?date=YYYY-MM-DD (defaults to the latest event)",
      "GET /people": "the people identity records",
    },
  });
});

// GET /events -> the log itself, straight from the events table, in append order.
// This is the feed a sync product like Crouton would actually consume.
app.get("/events", async (req, res) => {
  try {
    const { from, to, type } = req.query;

    // Build the WHERE clause from whichever filters were provided. Every value is a
    // bound parameter, so this is injection-safe.
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (typeof from === "string") {
      params.push(from);
      conditions.push(`date >= $${params.length}`);
    }
    if (typeof to === "string") {
      params.push(to);
      conditions.push(`date <= $${params.length}`);
    }
    if (typeof type === "string") {
      params.push(type);
      conditions.push(`type = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await pool.query(
      `SELECT id, seq, date::text AS date, type, payload
       FROM events
       ${where}
       ORDER BY seq`,
      params,
    );

    res.json({ count: rows.length, events: rows });
  } catch (err) {
    sendError(res, err);
  }
});

// GET /state?date= -> the derived snapshot. Time travel over HTTP: this is a thin
// wrapper around getStateAt(), the exact fold used everywhere else.
app.get("/state", async (req, res) => {
  try {
    const date =
      typeof req.query.date === "string" ? req.query.date : await latestDate();

    if (date === null) {
      res.json({ asOf: null, org: null, teams: [], people: [] });
      return;
    }

    res.json(await getStateAt(date));
  } catch (err) {
    sendError(res, err);
  }
});

// GET /people -> the identity records (id + name only). The changing details (role,
// team, whether they are still here) are not here on purpose; ask /state for those.
app.get("/people", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name FROM people ORDER BY id`,
    );
    res.json({ count: rows.length, people: rows });
  } catch (err) {
    sendError(res, err);
  }
});

// The most recent event date, used as the default for /state so a bare request shows
// the org as it stands today.
async function latestDate(): Promise<string | null> {
  const { rows } = await pool.query<{ date: string }>(
    `SELECT max(date)::text AS date FROM events`,
  );
  return rows[0]?.date ?? null;
}

function sendError(res: express.Response, err: unknown): void {
  console.error(err);
  res.status(500).json({ error: "internal error" });
}

app.listen(PORT, () => {
  console.log(`Organization simulator API listening on http://localhost:${PORT}`);
});
