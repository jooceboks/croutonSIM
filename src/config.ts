// The single simulation config, shared by every entry point (main, seed, check) so
// they all produce the SAME org. The consistency check depends on this: it compares
// a fresh simulation against what was seeded, which only works if the config matches.

import type { SimConfig } from "./engine";

export const config: SimConfig = {
  seed: 9,
  months: 24,
  startYear: 2024,
  startMonth: 10,
  // orgName and startLocation are intentionally omitted: the engine picks them from
  // the seeded pools, so each seed generates a different but reproducible company.
  // Change the seed to generate a different org.
  shutdownAtEnd: true, // end the arc with a shutdown so the timeline has a conclusion
};
