import type { WorkspaceNotionRow } from "../lib/types";

export function romeToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function actionDate(row: WorkspaceNotionRow): string | null {
  const raw = row.properties["Do Date"];
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(raw)) return null;
  const value = new Date(raw.length === 10 ? `${raw}T12:00:00Z` : raw);
  if (Number.isNaN(value.getTime())) return null;
  if (raw.length === 10) return value.toISOString().slice(0, 10) === raw ? raw : null;
  return romeToday(value);
}

export function monthCells(month: string): (string | null)[] {
  const first = new Date(`${month}-01T12:00:00Z`);
  const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return [...Array((first.getUTCDay() + 6) % 7).fill(null), ...Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
}
