// The simulation engine.
//
// It steps month by month, keeping a small "working state" (who is here, what teams
// exist, where the org is). It only ever emits an event that its working state says
// is legal, which is how the coherence rules are enforced BY CONSTRUCTION
// rather than checked after the fact.
//
// The engine returns an append-only OrgEvent[] ordered by date. Nothing here reads
// or mutates state OTHER than by walking forward in time.

import type { EmploymentType, OrgEvent } from "./types";
import type { DerivedState } from "./state";
import { Rng } from "./rng";
import { addMonths, toISO } from "./dates";
import { FIRST_NAMES, LOCATIONS, ORG_NAMES, TEAMS, type TeamDef } from "./data";

// ----- Tunable assumptions -----
// Every "how the org behaves" knob lives here so it is a one-line change to correct.
const HIRE_CHANCE_YEAR_ONE = 0.7; // chance we hire at all in a given month, year 1
const HIRE_CHANCE_LATER = 0.4; // ...and after the first 12 months
const MAX_HIRES_PER_MONTH = 2; // when we do hire, add 1..this many
const PART_TIME_CHANCE = 0.2; // a new hire is part-time this often
const NEW_TEAM_CHANCE = 0.35; // a hire spins up a brand-new team this often
const LEAVE_CHANCE = 0.12; // chance one non-founder leaves in a given month
const RELOCATE_CHANCE = 0.06; // chance the org relocates in a given month
const MAX_RELOCATIONS = 2; // cap so the org does not bounce around forever
const ROLE_CHANGE_CHANCE = 0.18; // chance someone is promoted or moves team in a month
const MOVE_TEAM_CHANCE = 0.4; // of those changes, how often it is a team move vs a promotion

export interface SimConfig {
  seed: number;
  months: number; // how many months to simulate after founding
  startYear: number;
  startMonth: number; // 1 = January ... 10 = October
  orgName?: string; // if omitted, a random name is picked (seeded, so reproducible)
  startLocation?: string; // if omitted, a random city is picked (seeded)
  shutdownAtEnd?: boolean; // if true, the org shuts down one month after the run
}

// Working record of a person while the sim runs. This is scaffolding, not the
// product: the engine keeps a running tally of who is here (and their current role,
// team, and hours) so it can make legal decisions and so we can cross-check the
// event log against it at the end. The events are the source of truth, not this.
interface WorkingPerson {
  id: string;
  name: string;
  isFounder: boolean;
  role: string;
  team: string | null;
  employmentType: EmploymentType;
  managerId: string | null; // who they report to (null for the founder)
  managerName: string | null;
}

interface WorkingTeam {
  id: string;
  name: string;
  roles: readonly string[];
}

// The engine returns the append-only log AND its own running snapshot of the final
// state. The snapshot exists only so the consistency check can confirm that replaying
// the log (getStateAt) reconstructs the exact org the engine simulated forward.
export interface SimResult {
  events: OrgEvent[];
  finalState: DerivedState;
}

export function simulate(config: SimConfig): SimResult {
  const rng = new Rng(config.seed);
  const events: OrgEvent[] = [];

  // Monotonic id counters -> deterministic ids like p1, t1, e1.
  let eventCount = 0;
  let personCount = 0;
  let teamCount = 0;
  const nextEventId = () => `e${++eventCount}`;

  // ----- Working state (the only thing the engine reads to stay coherent) -----
  const orgId = "org1"; // one organization per simulation run
  // Resolve the org's name and starting city from config, or pick them from the seeded
  // pools if omitted, so each seed yields a different but reproducible company.
  const orgName = config.orgName ?? rng.pick(ORG_NAMES);
  let location = config.startLocation ?? rng.pick(LOCATIONS);
  let relocations = 0;
  let status: "active" | "shutdown" = "active";
  const teams: WorkingTeam[] = [];
  let active: WorkingPerson[] = [];
  const usedNames = new Set<string>();

  // Founding date is the 1st of the configured start month.
  const foundedDate = new Date(config.startYear, config.startMonth - 1, 1);
  let currentDate = foundedDate;

  // --- helpers that emit events (each also updates working state) ---

  function emit(event: OrgEvent): void {
    events.push(event);
  }

  function takeUnusedName(): string | null {
    const available = FIRST_NAMES.filter((n) => !usedNames.has(n));
    if (available.length === 0) return null; // pool exhausted -> stop hiring
    const name = rng.pick(available);
    usedNames.add(name);
    return name;
  }

  // ORG_FOUNDED is always the first event. The founder is a real person who joins
  // at founding, recorded here rather than via a separate PERSON_JOINED.
  function foundOrg(): void {
    const founderName = takeUnusedName() ?? "Founder";
    const founder: WorkingPerson = {
      id: `p${++personCount}`,
      name: founderName,
      isFounder: true,
      role: "founder",
      team: null,
      employmentType: "full-time",
      managerId: null, // the founder reports to no one
      managerName: null,
    };
    active.push(founder);
    emit({
      id: nextEventId(),
      date: toISO(currentDate),
      type: "ORG_FOUNDED",
      payload: {
        orgId,
        orgName,
        location,
        founderId: founder.id,
        founderName: founder.name,
      },
    });
  }

  function formTeam(): WorkingTeam {
    const alreadyFormed = new Set(teams.map((t) => t.name));
    const options = TEAMS.filter((t) => !alreadyFormed.has(t.name));
    const def: TeamDef = rng.pick(options);
    const team: WorkingTeam = {
      id: `t${++teamCount}`,
      name: def.name,
      roles: def.roles,
    };
    teams.push(team);
    emit({
      id: nextEventId(),
      date: toISO(currentDate),
      type: "TEAM_FORMED",
      payload: { teamId: team.id, name: team.name },
    });
    return team;
  }

  // A person can only join a team that already exists. If none exists yet, we form
  // one first; otherwise we sometimes form a new team, sometimes reuse an existing.
  function pickTeamToHireInto(): WorkingTeam {
    const noTeamsYet = teams.length === 0;
    const canFormMore = teams.length < TEAMS.length;
    if (noTeamsYet || (canFormMore && rng.chance(NEW_TEAM_CHANCE))) {
      return formTeam();
    }
    return rng.pick(teams);
  }

  // Who a new hire on `teamName` reports to. If teammates already exist, they report
  // to one (preferring a senior/lead). If they are the first on their team, they
  // report straight to the founder. This builds a real reporting hierarchy.
  function pickManager(teamName: string): { id: string; name: string } {
    const teammates = active.filter((p) => p.team === teamName);
    if (teammates.length > 0) {
      const seniors = teammates.filter(
        (p) =>
          p.role.includes("lead") ||
          p.role.startsWith("head of") ||
          p.role.startsWith("senior"),
      );
      const pool = seniors.length > 0 ? seniors : teammates;
      const m = rng.pick(pool);
      return { id: m.id, name: m.name };
    }
    const founder = active.find((p) => p.isFounder)!;
    return { id: founder.id, name: founder.name };
  }

  function hireOne(): void {
    const name = takeUnusedName();
    if (name === null) return; // out of names, skip

    const team = pickTeamToHireInto();
    const role = rng.pick(team.roles);
    const employmentType: EmploymentType = rng.chance(PART_TIME_CHANCE)
      ? "part-time"
      : "full-time";
    // Pick the manager BEFORE adding the new hire, so they cannot manage themselves.
    const manager = pickManager(team.name);

    const person: WorkingPerson = {
      id: `p${++personCount}`,
      name,
      isFounder: false,
      role,
      team: team.name,
      employmentType,
      managerId: manager.id,
      managerName: manager.name,
    };
    active.push(person);

    emit({
      id: nextEventId(),
      date: toISO(currentDate),
      type: "PERSON_JOINED",
      payload: {
        personId: person.id,
        name: person.name,
        role,
        team: team.name,
        employmentType,
        managerId: manager.id,
        managerName: manager.name,
      },
    });
  }

  // Someone can only LEAVE if they have JOINED and are still active. The founder
  // never leaves in MVP 0.
  function maybeDeparture(): void {
    const leavers = active.filter((p) => !p.isFounder);
    if (leavers.length === 0) return;
    if (!rng.chance(LEAVE_CHANCE)) return;

    const person = rng.pick(leavers);
    active = active.filter((p) => p.id !== person.id);
    emit({
      id: nextEventId(),
      date: toISO(currentDate),
      type: "PERSON_LEFT",
      payload: { personId: person.id, name: person.name },
    });
  }

  function maybeRelocate(): void {
    if (relocations >= MAX_RELOCATIONS) return;
    if (!rng.chance(RELOCATE_CHANCE)) return;

    const elsewhere = LOCATIONS.filter((c) => c !== location);
    const destination = rng.pick(elsewhere);
    emit({
      id: nextEventId(),
      date: toISO(currentDate),
      type: "RELOCATED",
      payload: { from: location, to: destination },
    });
    location = destination;
    relocations += 1;
  }

  // Someone active (not the founder) is promoted in place, or moves to another team.
  // This mutates an EXISTING person's role/team, which is exactly the kind of change
  // that would be lost if we stored role/team as a column instead of an event.
  function maybeRoleChange(): void {
    const candidates = active.filter((p) => !p.isFounder);
    if (candidates.length === 0) return;
    if (!rng.chance(ROLE_CHANGE_CHANCE)) return;

    const person = rng.pick(candidates);
    const fromRole = person.role;
    const fromTeam = person.team!; // non-founders always have a team

    const otherTeams = teams.filter((t) => t.name !== fromTeam);
    const moveTeam = otherTeams.length > 0 && rng.chance(MOVE_TEAM_CHANCE);

    if (moveTeam) {
      const team = rng.pick(otherTeams);
      person.team = team.name;
      person.role = rng.pick(team.roles);
    } else {
      person.role = promotedTitle(fromRole, fromTeam);
    }

    emit({
      id: nextEventId(),
      date: toISO(currentDate),
      type: "ROLE_CHANGED",
      payload: {
        personId: person.id,
        name: person.name,
        fromRole,
        fromTeam,
        role: person.role,
        team: person.team!,
      },
    });
  }

  // The org winds down. Everyone is folded out and the status flips. By invariant no
  // event happens after this, so it is always emitted last.
  function shutDown(): void {
    status = "shutdown";
    active = [];
    emit({
      id: nextEventId(),
      date: toISO(currentDate),
      type: "ORG_SHUTDOWN",
      payload: { orgId, orgName },
    });
  }

  // How many people (if any) join in the current month. Deliberately dumb: one roll
  // to decide if we hire at all, one to decide how many.
  function hiresThisMonth(monthIndex: number): number {
    const hireChance =
      monthIndex <= 12 ? HIRE_CHANCE_YEAR_ONE : HIRE_CHANCE_LATER;
    if (!rng.chance(hireChance)) return 0;
    return rng.int(1, MAX_HIRES_PER_MONTH);
  }

  // ----- The simulation itself -----

  foundOrg();

  for (let monthIndex = 1; monthIndex <= config.months; monthIndex++) {
    currentDate = addMonths(foundedDate, monthIndex);

    maybeRelocate();

    const hires = hiresThisMonth(monthIndex);
    for (let i = 0; i < hires; i++) {
      hireOne();
    }

    maybeRoleChange();
    maybeDeparture();
  }

  // Optionally end the arc with a shutdown, one month after the last active month,
  // so the timeline shows a clean conclusion.
  if (config.shutdownAtEnd) {
    currentDate = addMonths(foundedDate, config.months + 1);
    shutDown();
  }

  // The engine's own view of where things ended up, built from its running tally.
  // getStateAt() should reproduce this exactly by replaying the log instead.
  const finalState: DerivedState = {
    asOf: toISO(currentDate),
    org: {
      id: orgId,
      name: orgName,
      foundedDate: toISO(foundedDate),
      location,
      status,
    },
    teams: teams.map((t) => ({ id: t.id, name: t.name })),
    people: active.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      team: p.team,
      employmentType: p.employmentType,
      managerId: p.managerId,
      managerName: p.managerName,
    })),
  };

  return { events, finalState };
}

// A plausible next rung up the ladder for an in-place promotion. Kept simple and
// non-stacking so titles do not grow forever (e.g. "senior senior ...").
function promotedTitle(role: string, team: string): string {
  if (role.startsWith("senior ")) return `${team} lead`;
  if (role.endsWith(" lead") || role.startsWith("head of ")) {
    return `head of ${team}`;
  }
  return `senior ${role}`;
}
