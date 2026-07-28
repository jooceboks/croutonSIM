// Entities and events for the organization simulator.
//
// Design note: entities hold STABLE IDENTITY ONLY. Anything that
// changes over time (a person's role, team, whether they still work here) lives in
// events, never as a mutable field on the entity. History is the product.

export type ISODate = string; // 'YYYY-MM-DD'

export type EmploymentType = "full-time" | "part-time";

// ----- Entities (identity only) -----

export interface Organization {
  id: string;
  name: string;
  foundedDate: ISODate;
  location: string;
  status: "active" | "shutdown";
}

export interface Person {
  id: string;
  name: string;
  // No role / team / status here on purpose. Those change over time -> events.
}

export interface Team {
  id: string;
  name: string;
  createdDate: ISODate;
}

// ----- Events (append-only, ordered by date) -----

export type EventType =
  | "ORG_FOUNDED"
  | "PERSON_JOINED"
  | "PERSON_LEFT"
  | "TEAM_FORMED"
  | "ROLE_CHANGED"
  | "RELOCATED"
  | "ORG_SHUTDOWN";

interface BaseEvent {
  id: string;
  date: ISODate;
  type: EventType;
}

export interface OrgFoundedEvent extends BaseEvent {
  type: "ORG_FOUNDED";
  payload: {
    orgId: string;
    orgName: string;
    location: string;
    founderId: string;
    founderName: string;
  };
}

export interface TeamFormedEvent extends BaseEvent {
  type: "TEAM_FORMED";
  payload: { teamId: string; name: string };
}

export interface PersonJoinedEvent extends BaseEvent {
  type: "PERSON_JOINED";
  payload: {
    personId: string;
    name: string;
    role: string;
    team: string;
    employmentType: EmploymentType;
    // Who this person reports to when hired. null only for the founder.
    managerId: string | null;
    managerName: string | null;
  };
}

export interface PersonLeftEvent extends BaseEvent {
  type: "PERSON_LEFT";
  payload: { personId: string; name: string };
}

export interface RelocatedEvent extends BaseEvent {
  type: "RELOCATED";
  payload: { from: string; to: string };
}

// A person's role and/or team changed over time (a promotion or a team move). This
// is the clearest demonstration of why we use events: the SAME person now has a
// different role, and the old value must not be lost. We carry both the old and new
// values so the log reads naturally ("promoted from X to Y").
export interface RoleChangedEvent extends BaseEvent {
  type: "ROLE_CHANGED";
  payload: {
    personId: string;
    name: string;
    fromRole: string;
    fromTeam: string;
    role: string; // new role
    team: string; // new team (may equal fromTeam for an in-place promotion)
  };
}

// The org wound down. Status becomes 'shutdown', everyone is folded out, and by
// invariant no event may occur after this one. This is the "conclusion" of the arc.
export interface OrgShutdownEvent extends BaseEvent {
  type: "ORG_SHUTDOWN";
  payload: { orgId: string; orgName: string };
}

// A single tagged union covers every event. The `type` field discriminates it,
// so render.ts can switch over it exhaustively.
export type OrgEvent =
  | OrgFoundedEvent
  | TeamFormedEvent
  | PersonJoinedEvent
  | PersonLeftEvent
  | RelocatedEvent
  | RoleChangedEvent
  | OrgShutdownEvent;
