// The "content" pools the engine draws from. Kept apart from the engine logic so
// the engine stays about RULES, and this stays about FLAVOR. Edit freely.

// A fixed name pool, sampled without replacement (each person is unique). If the
// pool runs out, the engine simply stops hiring rather than reusing a name.
export const FIRST_NAMES: readonly string[] = [
  "Adam", "Breno", "Griffin", "Priya", "Mateo", "Nadia", "Owen", "Sofia",
  "Liam", "Yuki", "Hana", "Diego", "Aisha", "Noah", "Zara", "Ethan",
  "Maya", "Kofi", "Ines", "Ravi", "Elena", "Theo", "Amara", "Jonas",
  "Leila", "Marco", "Nina", "Omar", "Talia", "Victor", "Wren", "Xavier",
  "Yara", "Zoe", "Caleb", "Dara", "Freya", "Gus", "Ivy", "Jae",
];

export interface TeamDef {
  name: string;
  roles: readonly string[];
}

// The teams an org can form, each with the roles someone can be hired into.
export const TEAMS: readonly TeamDef[] = [
  {
    name: "Engineering",
    roles: ["founding engineer", "software engineer", "backend engineer", "frontend engineer"],
  },
  {
    name: "Design",
    roles: ["founding designer", "product designer", "brand designer"],
  },
  {
    name: "GTM",
    roles: ["growth strategist", "sales lead", "marketing manager"],
  },
  {
    name: "Product",
    roles: ["product manager", "product lead"],
  },
  {
    name: "Operations",
    roles: ["operations manager", "recruiter", "people ops lead"],
  },
];

// Cities the org can be founded in / relocate to.
export const LOCATIONS: readonly string[] = [
  "Charlotte, NC",
  "New York, NY",
  "San Francisco, CA",
  "Austin, TX",
  "Denver, CO",
  "Seattle, WA",
];

// Names a generated org can have. Picked from with the seeded RNG so each seed yields
// a different (but reproducible) company, rather than hardcoding one.
export const ORG_NAMES: readonly string[] = [
  "Nimbus",
  "Juniper",
  "Halcyon",
  "Cobalt",
  "Meridian",
  "Saffron",
  "Lumen",
  "Marrow",
  "Verdant",
  "Sundial",
  "Anvil",
  "Mosaic",
  "Kindling",
  "Cortex",
  "Otter",
];
