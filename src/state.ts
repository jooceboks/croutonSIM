// Derived state and the fold that produces it.
//
// This is the core of the whole event-sourcing idea: current state is NOT stored,
// it is COMPUTED by replaying (folding) the event log up to a chosen date. Fold the
// log to Feb 2026 and you see the org as it was in Feb 2026. Fold it to today and
// you see it now. Same log, different cutoff.

import type { EmploymentType, ISODate, OrgEvent } from "./types";

export interface DerivedPerson {
  id: string;
  name: string;
  role: string;
  team: string | null; // the founder has no team
  employmentType: EmploymentType;
  managerId: string | null; // who they report to (null for the founder)
  managerName: string | null;
}

export interface DerivedOrg {
  id: string;
  name: string;
  foundedDate: ISODate;
  location: string;
  status: "active" | "shutdown";
}

export interface DerivedState {
  asOf: ISODate;
  org: DerivedOrg | null;
  teams: { id: string; name: string }[];
  people: DerivedPerson[]; // ACTIVE people only (those who left are folded out)
}

// Replay events up to and including `date` into a snapshot of the org at that date.
// Pure function: same events + same date always give the same state. Used by both
// the in-memory path and the Postgres-backed getStateAt().
export function foldEvents(events: OrgEvent[], date: ISODate): DerivedState {
  let org: DerivedOrg | null = null;
  const teams = new Map<string, { id: string; name: string }>();
  const people = new Map<string, DerivedPerson>();

  for (const event of events) {
    if (event.date > date) break; // events are ordered; nothing past the cutoff counts

    switch (event.type) {
      case "ORG_FOUNDED": {
        const p = event.payload;
        org = {
          id: p.orgId,
          name: p.orgName,
          foundedDate: event.date,
          location: p.location,
          status: "active",
        };
        // The founder joins at founding, with no team and no manager.
        people.set(p.founderId, {
          id: p.founderId,
          name: p.founderName,
          role: "founder",
          team: null,
          employmentType: "full-time",
          managerId: null,
          managerName: null,
        });
        break;
      }

      case "TEAM_FORMED": {
        teams.set(event.payload.teamId, {
          id: event.payload.teamId,
          name: event.payload.name,
        });
        break;
      }

      case "PERSON_JOINED": {
        const p = event.payload;
        people.set(p.personId, {
          id: p.personId,
          name: p.name,
          role: p.role,
          team: p.team,
          employmentType: p.employmentType,
          managerId: p.managerId,
          managerName: p.managerName,
        });
        break;
      }

      case "PERSON_LEFT": {
        people.delete(event.payload.personId); // no longer active
        break;
      }

      case "RELOCATED": {
        if (org) org.location = event.payload.to;
        break;
      }

      case "ROLE_CHANGED": {
        // Overwrite the existing person's role and team, keeping everything else
        // (id, name, employment). The old values live on in the earlier events.
        const p = event.payload;
        const existing = people.get(p.personId);
        if (existing) {
          people.set(p.personId, { ...existing, role: p.role, team: p.team });
        }
        break;
      }

      case "ORG_SHUTDOWN": {
        // The org is gone: no one is active anymore and the status flips.
        if (org) org.status = "shutdown";
        people.clear();
        break;
      }
    }
  }

  return {
    asOf: date,
    org,
    teams: [...teams.values()],
    people: [...people.values()],
  };
}
