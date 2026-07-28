// Two tiny date helpers for the scrubber. The slider moves over a list of months,
// so we need to build that list and label a month nicely.

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Every month-start ISO date from `minIso` to `maxIso`, inclusive. This is the set
// of positions the scrubber can stop at.
export function monthsBetween(minIso: string, maxIso: string): string[] {
  const [minY, minM] = minIso.split("-").map(Number);
  const [maxY, maxM] = maxIso.split("-").map(Number);

  const months: string[] = [];
  let year = minY;
  let month = minM; // 1-based
  while (year < maxY || (year === maxY && month <= maxM)) {
    months.push(`${year}-${String(month).padStart(2, "0")}-01`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

export function formatMonthYear(iso: string): string {
  const [year, month] = iso.split("-").map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

// Compact label for the timeline axis, e.g. "Oct '24".
export function shortMonthYear(iso: string): string {
  const [year, month] = iso.split("-").map(Number);
  return `${MONTH_NAMES[month - 1].slice(0, 3)} '${String(year).slice(2)}`;
}
