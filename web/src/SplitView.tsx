// The split view: the event log on the left, the derived state on the right.
//
// This is the clearest picture of event sourcing. The LEFT panel is the whole
// append-only log, always fully visible, with events up to the scrubber date shown
// solid and future ones dimmed. The RIGHT panel is what that log folds to at the
// scrubber date (from GET /state). Drag the scrubber: the log never changes, the
// snapshot on the right recomputes. History on the left, derived state on the right.

import type { DerivedState, DerivedPerson, LogEvent } from "./api";
import { formatMonthYear } from "./dates";
import { teamColor, FOUNDER_COLOR } from "./palette";

export function SplitView({
  events,
  state,
  currentDate,
  onJumpTo,
}: {
  events: LogEvent[];
  state: DerivedState;
  currentDate: string;
  onJumpTo: (date: string) => void;
}) {
  return (
    <div className="split">
      <div className="panel">
        <div className="panel-title">Event log &middot; click an event to jump there</div>
        <div className="log">
          {/* newest first: copy then reverse so the source array stays in log order */}
          {[...events].reverse().map((e) => {
            const isFuture = e.date > currentDate;
            const isNow = e.date === currentDate;
            const cls = `logitem${isFuture ? " future" : ""}${isNow ? " now" : ""}`;
            // Clicking an event moves the scrubber to that event's month.
            return (
              <div
                key={e.id}
                className={cls}
                onClick={() => onJumpTo(e.date)}
                title="Jump to this date"
              >
                <span className="logdate">{formatMonthYear(e.date)}</span>
                <span className="logtext">{sentence(e)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">
          State as of {formatMonthYear(currentDate)} &middot; folded from the log
        </div>
        <Snapshot state={state} />
      </div>
    </div>
  );
}

function Snapshot({ state }: { state: DerivedState }) {
  const founder = state.people.filter((p) => p.team === null);
  // Who is currently active, so we only show a manager if they still work here.
  const activeIds = new Set(state.people.map((p) => p.id));

  return (
    <div className="snapshot">
      <div className="snaprow">
        <span>Location</span>
        <b>{state.org?.location ?? "-"}</b>
      </div>
      <div className="snaprow">
        <span>Status</span>
        <b>{state.org?.status ?? "-"}</b>
      </div>
      <div className="snaprow">
        <span>Headcount</span>
        <b>{state.people.length}</b>
      </div>
      <div className="snaprow">
        <span>Teams</span>
        <b>{state.teams.length}</b>
      </div>

      {/* founder first, then each team in the order it was formed */}
      <PeopleGroup
        label="Founder"
        color={FOUNDER_COLOR}
        people={founder}
        activeIds={activeIds}
      />
      {state.teams.map((t, i) => (
        <PeopleGroup
          key={t.id}
          label={t.name}
          color={teamColor(i)}
          people={state.people.filter((p) => p.team === t.name)}
          activeIds={activeIds}
        />
      ))}
    </div>
  );
}

function PeopleGroup({
  label,
  color,
  people,
  activeIds,
}: {
  label: string;
  color: string;
  people: DerivedPerson[];
  activeIds: Set<string>;
}) {
  if (people.length === 0) return null;
  return (
    <div className="people-group">
      <div className="people-team" style={{ color }}>
        {label}
      </div>
      {people.map((p) => {
        // Only show the manager if that person is still at the company.
        const showManager =
          p.managerId !== null && activeIds.has(p.managerId);
        return (
          <div key={p.id} className="person-item">
            <span className="dot" style={{ background: color }} />
            <span className="pn">{p.name}</span>
            <span className="pr">
              {p.role}
              {p.employmentType === "part-time" ? " (part-time)" : ""}
              {showManager ? ` · reports to ${p.managerName}` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// One event as a sentence (the date is shown separately in its own column).
function sentence(e: LogEvent): string {
  const p = e.payload as Record<string, string>;
  switch (e.type) {
    case "ORG_FOUNDED":
      return `${p.orgName} was founded in ${p.location}. ${p.founderName} is the founder.`;
    case "TEAM_FORMED":
      return `The ${p.name} team was formed.`;
    case "PERSON_JOINED":
      return p.employmentType === "part-time"
        ? `${p.name} started as a ${p.role} part-time on the ${p.team} team.`
        : `${p.name} was hired as a ${p.role} to the ${p.team} team.`;
    case "PERSON_LEFT":
      return `${p.name} left the company.`;
    case "RELOCATED":
      return `The company relocated from ${p.from} to ${p.to}.`;
    case "ROLE_CHANGED":
      return p.team !== p.fromTeam
        ? `${p.name} moved from the ${p.fromTeam} team to the ${p.team} team as a ${p.role}.`
        : `${p.name} was promoted from ${p.fromRole} to ${p.role}.`;
    case "ORG_SHUTDOWN":
      return `${p.orgName} shut down.`;
    default:
      return e.type;
  }
}
