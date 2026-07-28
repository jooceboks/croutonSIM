// The consistency check. Run with: npm run check  (after db:migrate + seed)
//
// Two independent computations of "who is in the org and how is it structured":
//   1. the engine's running tally, built by simulating FORWARD month by month
//   2. getStateAt(), built by REPLAYING the event log out of Postgres
// They share no code. If they match, the event log is a complete, faithful history:
// everything the engine knew can be reconstructed from the log alone. That is the
// entire premise of event sourcing, demonstrated rather than asserted.

import { simulate } from "./engine";
import { getStateAt } from "./projection";
import { config } from "./config";
import { pool } from "./db";
import type { DerivedState } from "./state";

// The two paths may list people/teams in different orders, which does not matter.
// Sort by id so the comparison is about CONTENT, not incidental ordering.
function normalize(state: DerivedState, asOf: string): string {
  const ordered: DerivedState = {
    asOf,
    org: state.org,
    teams: [...state.teams].sort((a, b) => a.id.localeCompare(b.id)),
    people: [...state.people].sort((a, b) => a.id.localeCompare(b.id)),
  };
  return JSON.stringify(ordered, null, 2);
}

async function main(): Promise<void> {
  // Simulate a NON-shutdown variant so the final state is a full, living org (with
  // promotions and team moves applied), not an empty post-shutdown one. Folding the
  // seeded log to this same date must reproduce it. During the simulated months the
  // two runs are identical, so this is a fair comparison and it exercises the whole
  // fold (joins, leaves, role changes, relocations), which an empty state would not.
  const { finalState } = simulate({ ...config, shutdownAtEnd: false });
  const asOf = finalState.asOf; // last simulated month, before any shutdown

  const fromEngine = normalize(finalState, asOf);
  const fromLog = normalize(await getStateAt(asOf), asOf);

  if (fromEngine === fromLog) {
    const state = finalState;
    console.log(
      `PASS: engine forward-state matches getStateAt('${asOf}') replayed from Postgres.`,
    );
    console.log(
      `  ${state.people.length} active people, ${state.teams.length} teams, ` +
        `located in ${state.org?.location}.`,
    );
    console.log(
      "  The log fully reconstructs the org the engine simulated. History is intact.",
    );
  } else {
    console.error("FAIL: the two computations disagree.");
    console.error("--- from engine (forward) ---");
    console.error(fromEngine);
    console.error("--- from log (replay) ---");
    console.error(fromLog);
    process.exitCode = 1;
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
