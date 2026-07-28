// Unit tests for foldEvents, the function that replays the event log into the org's
// state at a given date. This is the heart of the whole project, so it is the thing
// most worth testing directly.
//
// Every test follows the same shape: build a small, hand-written event log, fold it,
// and assert on the state that comes out. Read as plain English, each test says
// "given these things happened, the org should look like this." That makes these tests
// double as documentation of the rules.
//
// These use Node's built-in test runner (node:test) and assert library, so there are
// no extra dependencies. Run them with: npm test
//
// Note: these are a complement to `npm run check`. The consistency check proves the
// engine's forward run and the log replay agree end to end; these tests pin down the
// behavior of each individual event type in isolation.

import { test } from "node:test";
import assert from "node:assert/strict";
import { foldEvents } from "./state";
import type { OrgEvent } from "./types";

// A founding event we reuse as the first event in most logs. ORG_FOUNDED is always
// first, and it also adds the founder as an active person with no team.
const FOUNDED: OrgEvent = {
  id: "e1",
  date: "2024-01-01",
  type: "ORG_FOUNDED",
  payload: {
    orgId: "org1",
    orgName: "Acme",
    location: "New York, NY",
    founderId: "p1",
    founderName: "Ada",
  },
};

test("founding creates the org and makes the founder active", () => {
  const state = foldEvents([FOUNDED], "2024-01-01");

  assert.equal(state.org?.name, "Acme");
  assert.equal(state.org?.location, "New York, NY");
  assert.equal(state.org?.status, "active");
  // The founder is the only person, has the 'founder' role, and reports to no one.
  assert.equal(state.people.length, 1);
  assert.equal(state.people[0].name, "Ada");
  assert.equal(state.people[0].role, "founder");
  assert.equal(state.people[0].team, null);
  assert.equal(state.people[0].managerId, null);
});

test("a hire adds a person with their role, team, and manager", () => {
  const events: OrgEvent[] = [
    FOUNDED,
    { id: "e2", date: "2024-02-01", type: "TEAM_FORMED", payload: { teamId: "t1", name: "Engineering" } },
    {
      id: "e3",
      date: "2024-02-01",
      type: "PERSON_JOINED",
      payload: {
        personId: "p2",
        name: "Ben",
        role: "engineer",
        team: "Engineering",
        employmentType: "full-time",
        managerId: "p1",
        managerName: "Ada",
      },
    },
  ];

  const state = foldEvents(events, "2024-02-01");

  assert.equal(state.teams.length, 1);
  assert.equal(state.people.length, 2); // founder + Ben
  const ben = state.people.find((p) => p.name === "Ben");
  assert.equal(ben?.role, "engineer");
  assert.equal(ben?.team, "Engineering");
  assert.equal(ben?.managerName, "Ada");
});

test("a departure removes the person from the active set", () => {
  const events: OrgEvent[] = [
    FOUNDED,
    { id: "e2", date: "2024-02-01", type: "TEAM_FORMED", payload: { teamId: "t1", name: "Engineering" } },
    {
      id: "e3",
      date: "2024-02-01",
      type: "PERSON_JOINED",
      payload: { personId: "p2", name: "Ben", role: "engineer", team: "Engineering", employmentType: "full-time", managerId: "p1", managerName: "Ada" },
    },
    { id: "e4", date: "2024-03-01", type: "PERSON_LEFT", payload: { personId: "p2", name: "Ben" } },
  ];

  const state = foldEvents(events, "2024-03-01");

  // Ben joined then left, so only the founder remains active.
  assert.equal(state.people.length, 1);
  assert.equal(state.people[0].name, "Ada");
});

test("a promotion overwrites the role but keeps the person and their other fields", () => {
  const events: OrgEvent[] = [
    FOUNDED,
    { id: "e2", date: "2024-02-01", type: "TEAM_FORMED", payload: { teamId: "t1", name: "Engineering" } },
    {
      id: "e3",
      date: "2024-02-01",
      type: "PERSON_JOINED",
      payload: { personId: "p2", name: "Ben", role: "engineer", team: "Engineering", employmentType: "full-time", managerId: "p1", managerName: "Ada" },
    },
    {
      id: "e4",
      date: "2024-04-01",
      type: "ROLE_CHANGED",
      payload: { personId: "p2", name: "Ben", fromRole: "engineer", fromTeam: "Engineering", role: "senior engineer", team: "Engineering" },
    },
  ];

  const state = foldEvents(events, "2024-04-01");

  const ben = state.people.find((p) => p.name === "Ben");
  assert.equal(ben?.role, "senior engineer"); // new role
  assert.equal(ben?.employmentType, "full-time"); // untouched
  assert.equal(ben?.managerName, "Ada"); // untouched
});

test("a relocation changes the org's location", () => {
  const events: OrgEvent[] = [
    FOUNDED,
    { id: "e2", date: "2024-05-01", type: "RELOCATED", payload: { from: "New York, NY", to: "Austin, TX" } },
  ];

  const state = foldEvents(events, "2024-05-01");

  assert.equal(state.org?.location, "Austin, TX");
});

test("shutdown clears everyone and flips the status", () => {
  const events: OrgEvent[] = [
    FOUNDED,
    { id: "e2", date: "2024-02-01", type: "TEAM_FORMED", payload: { teamId: "t1", name: "Engineering" } },
    {
      id: "e3",
      date: "2024-02-01",
      type: "PERSON_JOINED",
      payload: { personId: "p2", name: "Ben", role: "engineer", team: "Engineering", employmentType: "full-time", managerId: "p1", managerName: "Ada" },
    },
    { id: "e4", date: "2024-06-01", type: "ORG_SHUTDOWN", payload: { orgId: "org1", orgName: "Acme" } },
  ];

  const state = foldEvents(events, "2024-06-01");

  assert.equal(state.org?.status, "shutdown");
  assert.equal(state.people.length, 0); // everyone folded out
});

test("time travel: folding to an earlier date ignores later events", () => {
  const events: OrgEvent[] = [
    FOUNDED,
    { id: "e2", date: "2024-02-01", type: "TEAM_FORMED", payload: { teamId: "t1", name: "Engineering" } },
    {
      id: "e3",
      date: "2024-02-01",
      type: "PERSON_JOINED",
      payload: { personId: "p2", name: "Ben", role: "engineer", team: "Engineering", employmentType: "full-time", managerId: "p1", managerName: "Ada" },
    },
    { id: "e4", date: "2024-06-01", type: "PERSON_LEFT", payload: { personId: "p2", name: "Ben" } },
  ];

  // Fold only up to March: Ben has joined but not yet left, so he is still active.
  const march = foldEvents(events, "2024-03-01");
  assert.equal(march.people.some((p) => p.name === "Ben"), true);

  // Fold up to June: now his departure counts, so he is gone.
  const june = foldEvents(events, "2024-06-01");
  assert.equal(june.people.some((p) => p.name === "Ben"), false);
});

test("folding before the org exists yields no org", () => {
  // The founding is in 2024, but we ask for the state in 2023.
  const state = foldEvents([FOUNDED], "2023-01-01");
  assert.equal(state.org, null);
  assert.equal(state.people.length, 0);
});
