// Applies db/schema.sql to the database in DATABASE_URL. Run with: npm run db:migrate
// (The schema drops and recreates the tables, so this is safe to re-run in dev.)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pool } from "./db";

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, "..", "db", "schema.sql");

async function main(): Promise<void> {
  const sql = readFileSync(schemaPath, "utf8");
  await pool.query(sql);
  console.log("Schema applied from db/schema.sql");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
