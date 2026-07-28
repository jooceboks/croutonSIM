// Turns the event log into human sentences, matching a consistent format.
// Pure formatting only: no logic, no state. Given the same events it always prints
// the same lines.

import type { OrgEvent } from "./types";
import { formatMonthYear } from "./dates";

export function renderEvents(events: OrgEvent[]): string[] {
  // The org name is only in the ORG_FOUNDED payload, so grab it once for the
  // relocation sentence.
  const founding = events.find((e) => e.type === "ORG_FOUNDED");
  const orgName =
    founding && founding.type === "ORG_FOUNDED"
      ? founding.payload.orgName
      : "The company";

  return events.map((event) => renderEvent(event, orgName));
}

function renderEvent(event: OrgEvent, orgName: string): string {
  const when = formatMonthYear(event.date);

  switch (event.type) {
    case "ORG_FOUNDED": {
      const { orgName: name, location, founderName } = event.payload;
      return `${name} formed in ${when} in ${location}. ${founderName} is the founder.`;
    }

    case "TEAM_FORMED": {
      return `In ${when}, the ${event.payload.name} team was formed.`;
    }

    case "PERSON_JOINED": {
      const { name, role, team, employmentType, managerName } = event.payload;
      const reportsTo = managerName ? `, reporting to ${managerName}` : "";
      if (employmentType === "part-time") {
        return `In ${when}, ${name} started working as a ${role} part-time on the ${team} team${reportsTo}.`;
      }
      return `In ${when}, ${name} was hired as a ${role} to the ${team} team${reportsTo}.`;
    }

    case "PERSON_LEFT": {
      return `In ${when}, ${event.payload.name} left the company.`;
    }

    case "RELOCATED": {
      const { from, to } = event.payload;
      return `In ${when}, ${orgName} re-located from ${from} to ${to}.`;
    }

    case "ROLE_CHANGED": {
      const { name, fromRole, fromTeam, role, team } = event.payload;
      if (team !== fromTeam) {
        return `In ${when}, ${name} moved from the ${fromTeam} team to the ${team} team as a ${role}.`;
      }
      return `In ${when}, ${name} was promoted from ${fromRole} to ${role} on the ${team} team.`;
    }

    case "ORG_SHUTDOWN": {
      return `In ${when}, ${orgName} shut down.`;
    }
  }
}
