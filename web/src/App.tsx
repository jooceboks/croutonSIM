// The app: a scrubber over the org's lifetime, with two views of the same data.
//
//   Timeline (default): the whole history as Gantt bars, built from GET /events.
//   Map (toggle):       the org structure at the scrubbed date, from GET /state.
//
// The scrubber always fetches /state?date= for the "as of" summary in the header, so
// the event-sourcing story (fold the log to a date) stays front and center in both views.

import { useEffect, useMemo, useState } from "react";
import {
  fetchEvents,
  fetchStateAt,
  type DerivedState,
  type LogEvent,
} from "./api";
import { monthsBetween, formatMonthYear } from "./dates";
import { SplitView } from "./SplitView";
import { OrgMap } from "./OrgMap";

type View = "timeline" | "map";

export function App() {
  const [events, setEvents] = useState<LogEvent[] | null>(null);
  const [months, setMonths] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [state, setState] = useState<DerivedState | null>(null);
  const [view, setView] = useState<View>("timeline");

  // On load: get the log, derive the timeline range, and open on the last month that
  // still has a living org (the month before any shutdown), so the first thing you see
  // is a thriving org rather than an empty shut-down one. Scrub the final notch to see
  // the shutdown.
  useEffect(() => {
    fetchEvents().then((evs) => {
      setEvents(evs);
      const range = monthsBetween(evs[0].date, evs[evs.length - 1].date);
      setMonths(range);

      const lastLively = [...evs]
        .reverse()
        .find((e) => e.type !== "ORG_SHUTDOWN");
      const openDate = lastLively ? lastLively.date : evs[evs.length - 1].date;
      setIndex(Math.max(0, range.indexOf(openDate)));
    });
  }, []);

  const currentDate = months[index];

  // Jump the scrubber to a specific date (used when you click an event in the log).
  const jumpTo = (date: string) => {
    const i = months.indexOf(date);
    if (i >= 0) setIndex(i);
  };

  // Whenever the scrubbed month changes, refold the log up to that date on the server.
  useEffect(() => {
    if (!currentDate) return;
    fetchStateAt(currentDate).then(setState);
  }, [currentDate]);

  // The events in the currently scrubbed month, so a change on screen can be tied to
  // the event that caused it.
  const eventsThisMonth = useMemo(
    () =>
      events && currentDate
        ? events.filter((e) => e.date === currentDate)
        : [],
    [events, currentDate],
  );

  if (!events || !state || !currentDate) {
    return <div className="loading">Loading Crouton...</div>;
  }

  const founder = state.people.find((p) => p.team === null);
  const headcount = state.people.length;

  return (
    <div className="app">
      <header className="header">
        <div className="titles">
          <div>
            <h1>{state.org?.name ?? "Organization"}</h1>
            <div className="sub">
              {state.org?.location} &middot; founded{" "}
              {state.org ? formatMonthYear(state.org.foundedDate) : ""}
            </div>
          </div>
        </div>
        <div className="stats">
          <Stat num={headcount} label="people" />
          <Stat num={state.teams.length} label="teams" />
          <Stat num={founder?.name ?? "?"} label="founder" />
        </div>
      </header>

      <section className="controls">
        <div className="scrubber">
          <input
            type="range"
            min={0}
            max={months.length - 1}
            value={index}
            onChange={(e) => setIndex(Number(e.target.value))}
          />
          <div className="scrubline">
            <span className="asof">{formatMonthYear(currentDate)}</span>
            <span className="caption">
              {eventsThisMonth.length === 0
                ? "no changes this month"
                : eventsThisMonth.map((e) => describe(e)).join("   ·   ")}
            </span>
          </div>
        </div>

        <div className="viewtoggle">
          <button
            className={view === "timeline" ? "tab active" : "tab"}
            onClick={() => setView("timeline")}
          >
            Timeline
          </button>
          <button
            className={view === "map" ? "tab active" : "tab"}
            onClick={() => setView("map")}
          >
            Map
          </button>
        </div>
      </section>

      <main className={view === "map" ? "stage stage-map" : "stage"}>
        {view === "timeline" ? (
          <SplitView
            events={events}
            state={state}
            currentDate={currentDate}
            onJumpTo={jumpTo}
          />
        ) : (
          <OrgMap state={state} />
        )}
      </main>
    </div>
  );
}

function Stat({ num, label }: { num: string | number; label: string }) {
  return (
    <div className="stat">
      <span className="num">{num}</span>
      <span className="lbl">{label}</span>
    </div>
  );
}

// A short label for an event, for the month caption.
function describe(e: LogEvent): string {
  const p = e.payload as Record<string, string>;
  switch (e.type) {
    case "ORG_FOUNDED":
      return `founded by ${p.founderName}`;
    case "TEAM_FORMED":
      return `${p.name} team formed`;
    case "PERSON_JOINED":
      return `${p.name} joined ${p.team}`;
    case "PERSON_LEFT":
      return `${p.name} left`;
    case "RELOCATED":
      return `moved to ${p.to}`;
    case "ROLE_CHANGED":
      return p.team !== p.fromTeam
        ? `${p.name} moved to ${p.team}`
        : `${p.name} promoted to ${p.role}`;
    case "ORG_SHUTDOWN":
      return `${p.orgName} shut down`;
    default:
      return e.type;
  }
}
