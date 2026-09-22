import type { FuelEntry } from "../db/types.ts";

/**
 * Chronological order: date, then time, then createdAt. Undated entries sort
 * before every dated one ("" < "2026-…").
 */
export function compareChronologically(
  a: Pick<FuelEntry, "date" | "time" | "createdAt">,
  b: Pick<FuelEntry, "date" | "time" | "createdAt">,
): number {
  const dateA = a.date ?? "";
  const dateB = b.date ?? "";
  if (dateA !== dateB) return dateA.localeCompare(dateB);
  const timeA = a.time ?? "";
  const timeB = b.time ?? "";
  if (timeA !== timeB) return timeA.localeCompare(timeB);
  return a.createdAt - b.createdAt;
}
