// Types mirroring the API responses, plus the two fetch calls the UI needs.
// These shapes match src/state.ts and src/server.ts on the backend.

export interface DerivedPerson {
  id: string;
  name: string;
  role: string;
  team: string | null; // the founder has no team
  employmentType: "full-time" | "part-time";
  managerId: string | null; // who they report to (null for the founder)
  managerName: string | null;
}

export interface DerivedOrg {
  id: string;
  name: string;
  foundedDate: string;
  location: string;
  status: string;
}

export interface DerivedState {
  asOf: string | null;
  org: DerivedOrg | null;
  teams: { id: string; name: string }[];
  people: DerivedPerson[];
}

export interface LogEvent {
  id: string;
  seq: number;
  date: string;
  type: string;
  payload: Record<string, unknown>;
}

// The whole log, used once to work out the timeline's date range.
export async function fetchEvents(): Promise<LogEvent[]> {
  const res = await fetch("/events");
  const data = await res.json();
  return data.events as LogEvent[];
}

// The derived snapshot at a date. This is the call the scrubber makes on every move:
// it is time travel over HTTP, folding the log up to `date` on the server.
export async function fetchStateAt(date: string): Promise<DerivedState> {
  const res = await fetch(`/state?date=${date}`);
  return (await res.json()) as DerivedState;
}
