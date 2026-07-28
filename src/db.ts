// Single Postgres connection pool, shared by persist.ts and projection.ts.
// Reads DATABASE_URL from the environment (see .env.example).

import { Pool } from "pg";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://localhost/crouton_sim";

export const pool = new Pool({ connectionString });
