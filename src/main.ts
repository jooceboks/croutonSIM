// MVP 0 entry point: run the engine in memory and print the event log as sentences.
// No database involved. Run with: npm start

import { simulate } from "./engine";
import { renderEvents } from "./render";
import { config } from "./config";

const { events } = simulate(config);
const lines = renderEvents(events);

for (const line of lines) {
  console.log(line);
}

console.log(
  `\n${events.length} events over ${config.months} months (seed ${config.seed}).`,
);
