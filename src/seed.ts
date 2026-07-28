// Runs the engine and writes its event log to Postgres. Run with: npm run seed
// (Run npm run db:migrate first so the tables exist.)

import { simulate } from "./engine";
import { persistEvents } from "./persist";
import { config } from "./config";
import { pool } from "./db";

async function main(): Promise<void> {
  const { events } = simulate(config);
  await persistEvents(events);
  console.log(
    `Persisted ${events.length} events to Postgres (seed ${config.seed}).`,
  );
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
