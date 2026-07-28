// Small date helpers. The engine steps month by month; both the engine and the
// renderer need to talk about dates, so these live in their own file.

import type { ISODate } from "./types";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Returns a new Date on the 1st of the month, n months after the given date.
// Always the 1st, so we never trip over day-of-month rollover (e.g. Jan 31 + 1).
export function addMonths(date: Date, n: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + n, 1);
}

export function toISO(date: Date): ISODate {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// '2024-10-01' -> 'October 2024', the form used in the event sentences.
export function formatMonthYear(iso: ISODate): string {
  const [year, month] = iso.split("-").map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}
