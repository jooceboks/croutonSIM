// Prints the derived org state at a given date, straight from getStateAt().
// Run with: npm run state 2025-06-01   (date defaults to end of the simulation)
//
// Run it twice with different dates to see time travel: the same log, folded to two
// different cutoffs, gives two different orgs.

import { getStateAt } from "./projection";
import { pool } from "./db";

async function main(): Promise<void> {
  const date = process.argv[2] ?? "2026-10-01";
  const state = await getStateAt(date);

  console.log(`Org state as of ${date}:`);

  if (state.org) {
    console.log(
      `  ${state.org.name}, based in ${state.org.location} (${state.org.status}), ` +
        `founded ${state.org.foundedDate}`,
    );
  } else {
    console.log("  (the org did not exist yet on this date)");
  }

  console.log(
    `  Teams (${state.teams.length}): ${state.teams.map((t) => t.name).join(", ") || "none yet"}`,
  );

  console.log(`  Active people (${state.people.length}):`);
  for (const person of state.people) {
    const team = person.team ? ` on ${person.team}` : "";
    console.log(
      `    - ${person.name}: ${person.role}${team} (${person.employmentType})`,
    );
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
