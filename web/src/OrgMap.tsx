// The org-structure map. A hand-rolled SVG scene with fully deterministic positions,
// so nothing is a black box: team i sits at a fixed x, person j sits at a fixed y
// under its team. No physics engine, no layout library. As the derived state changes
// (because the scrubber moved), React adds and removes the person nodes, and CSS
// fades new ones in.

import type { DerivedState, DerivedPerson } from "./api";
import { TEAM_COLORS } from "./palette";

// Layout constants. Every coordinate below is derived from these.
const COL_W = 186; // horizontal space per team column
const ROLE_MAX = 26; // longest role text before we truncate it to fit the column
const MARGIN_X = 28;
const ORG_Y = 48; // vertical center of the org node
const ORG_W = 168;
const ORG_H = 46;
const TEAM_Y = 150; // baseline of the team label
const PERSON_START_Y = 196; // first person row
const ROW_H = 48; // vertical space per person
const BUS_Y = TEAM_Y - 40; // the horizontal "bus" the connectors bend along
const TEAM_TOP_Y = TEAM_Y - 16; // where a connector meets its team
const CORNER = 8; // rounded-corner radius on the elbows

// Builds an org-chart elbow connector from the org node (x0, y0) down to a team at tx:
// straight down, a rounded 90-degree turn, straight across, another rounded turn, then
// straight down into the team. If the team is directly below, it is just a straight line.
function connectorPath(x0: number, y0: number, tx: number): string {
  if (Math.abs(tx - x0) < 0.5) {
    return `M ${x0} ${y0} V ${TEAM_TOP_Y}`;
  }
  const dir = tx > x0 ? 1 : -1; // bend right or left
  return [
    `M ${x0} ${y0}`,
    `V ${BUS_Y - CORNER}`,
    `Q ${x0} ${BUS_Y} ${x0 + dir * CORNER} ${BUS_Y}`, // rounded corner into the bus
    `H ${tx - dir * CORNER}`,
    `Q ${tx} ${BUS_Y} ${tx} ${BUS_Y + CORNER}`, // rounded corner out of the bus
    `V ${TEAM_TOP_Y}`,
  ].join(" ");
}

// The role line for a person in the map. SVG text does not wrap or clip on its own,
// so we shorten "part-time" and hard-truncate anything longer than the column can hold,
// which keeps a long title from spilling into the next column.
function roleLabel(p: DerivedPerson): string {
  const full = p.employmentType === "part-time" ? `${p.role} (pt)` : p.role;
  return full.length > ROLE_MAX ? `${full.slice(0, ROLE_MAX - 1).trimEnd()}…` : full;
}

export function OrgMap({ state }: { state: DerivedState }) {
  const teams = state.teams;

  // Group the active people under their team. The founder (team === null) is shown
  // in the header, not here, so we only map teamed people.
  const byTeam = new Map<string, DerivedPerson[]>();
  for (const t of teams) byTeam.set(t.name, []);
  for (const p of state.people) {
    if (p.team === null) continue;
    if (!byTeam.has(p.team)) byTeam.set(p.team, []);
    byTeam.get(p.team)!.push(p);
  }

  const maxPeople = Math.max(
    1,
    ...teams.map((t) => byTeam.get(t.name)?.length ?? 0),
  );
  const width = Math.max(1, teams.length) * COL_W + MARGIN_X * 2;
  const height = PERSON_START_Y + maxPeople * ROW_H + 24;
  const colLeft = (i: number) => MARGIN_X + i * COL_W;
  const teamAnchor = (i: number) => colLeft(i) + 16; // where a connector meets team i

  // Center the org node (and its connector stem) over the SPAN of the teams, not the
  // raw SVG width, so the line drops straight down from the middle of the columns.
  const orgX =
    teams.length > 0
      ? (teamAnchor(0) + teamAnchor(teams.length - 1)) / 2
      : width / 2;

  return (
    <svg
      className="orgmap"
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      role="img"
      aria-label="Organization structure map"
    >
      {/* elbow connectors from the org node down to each team */}
      {teams.map((t, i) => (
        <path
          key={`link-${t.id}`}
          className="link"
          d={connectorPath(orgX, ORG_Y + ORG_H / 2, teamAnchor(i))}
        />
      ))}

      {/* the org node */}
      <g>
        <rect
          className="orgnode"
          x={orgX - ORG_W / 2}
          y={ORG_Y - ORG_H / 2}
          width={ORG_W}
          height={ORG_H}
          rx={11}
        />
        <text className="orgname" x={orgX} y={ORG_Y - 2} textAnchor="middle">
          {state.org?.name}
        </text>
        <text className="orgloc" x={orgX} y={ORG_Y + 15} textAnchor="middle">
          {state.org?.location}
        </text>
      </g>

      {/* one column per team, with its people stacked below */}
      {teams.map((t, i) => {
        const color = TEAM_COLORS[i % TEAM_COLORS.length];
        const people = byTeam.get(t.name) ?? [];
        const x = colLeft(i);
        return (
          <g key={t.id}>
            <text className="teamname" x={x + 16} y={TEAM_Y} fill={color}>
              {t.name}
            </text>
            {people.map((p, j) => {
              const y = PERSON_START_Y + j * ROW_H;
              return (
                // key = person id, so a person leaving unmounts and a person joining
                // mounts (and fades in via the .person CSS animation).
                <g key={p.id} className="person">
                  <circle cx={x + 16} cy={y} r={7} fill={color} />
                  <text className="pname" x={x + 32} y={y + 1}>
                    {p.name}
                  </text>
                  <text className="prole" x={x + 32} y={y + 16}>
                    {roleLabel(p)}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
