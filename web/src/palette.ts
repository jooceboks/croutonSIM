// Muted, Crouton-flavored team colors, shared by the timeline bars and the org map so
// a given team is always the same color in both views. Deliberately desaturated to
// match the warm, minimal brand look.

export const TEAM_COLORS = [
  "#d17a46", // terracotta (the Crouton orange)
  "#9c968d", // warm gray
  "#c9a06a", // tan / gold
  "#a99bc4", // lavender
  "#8faa86", // sage
  "#8ca7b8", // dusty blue
];

// The founder / leadership sits above the teams and gets the deep Crouton brown.
export const FOUNDER_COLOR = "#6b4a34";

// Look up a team's color by its position in the order teams were formed.
export function teamColor(teamOrderIndex: number): string {
  return TEAM_COLORS[teamOrderIndex % TEAM_COLORS.length];
}
