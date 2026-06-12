import type { FuelEntry } from "../db/types.ts";

export const PLAUSIBILITY_WARNING = "Liter × Preis ergibt nicht den Betrag — bitte prüfen.";
export const DUPLICATE_WARNING = "Möglicherweise schon erfasst.";

/** Non-blocking check: liters × pricePerLiter should match total within 5 ct. */
export function hasPlausibilityIssue(
  liters: number | null,
  pricePerLiter: number | null,
  total: number | null,
): boolean {
  if (liters === null || pricePerLiter === null || total === null) return false;
  // Compare in whole cents so float artifacts can't push an exact match
  // (e.g. 32.18 × 1.699) over the threshold.
  return Math.abs(Math.round(liters * pricePerLiter * 100) - Math.round(total * 100)) > 5;
}

/** Non-blocking check: same date and total within 1 ct of an existing entry. */
export function isLikelyDuplicate(
  candidate: { date: string | null; total: number | null },
  entries: FuelEntry[],
  excludeId?: string,
): boolean {
  const { date, total } = candidate;
  if (date === null || total === null) return false;
  return entries.some(
    (entry) =>
      entry.id !== excludeId &&
      entry.date === date &&
      entry.total !== null &&
      Math.abs(entry.total - total) < 0.01,
  );
}

/** Saving requires at least liters or total to be a valid number. */
export function canSave(liters: number | null, total: number | null): boolean {
  return liters !== null || total !== null;
}
