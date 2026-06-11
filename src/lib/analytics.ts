// Pure, unit-tested derivations over FuelEntry[] for the Auswertung page.
import type { FuelEntry } from "./db/types.ts";
import { formatMonthLabel } from "./utils/format.ts";

export type PriceExtreme = {
  pricePerLiter: number;
  date: string | null;
};

export type Kpis = {
  count: number;
  totalLiters: number;
  totalCost: number;
  /** Weighted average: Σtotal / Σliters over entries that have both. */
  avgPricePerLiter: number | null;
  cheapest: PriceExtreme | null;
  mostExpensive: PriceExtreme | null;
};

export function computeKpis(entries: FuelEntry[]): Kpis {
  let totalLiters = 0;
  let totalCost = 0;
  let weightedLiters = 0;
  let weightedCost = 0;
  let cheapest: PriceExtreme | null = null;
  let mostExpensive: PriceExtreme | null = null;

  for (const entry of entries) {
    if (entry.liters !== null) totalLiters += entry.liters;
    if (entry.total !== null) totalCost += entry.total;
    if (entry.liters !== null && entry.liters > 0 && entry.total !== null) {
      weightedLiters += entry.liters;
      weightedCost += entry.total;
    }
    if (entry.pricePerLiter !== null) {
      if (cheapest === null || entry.pricePerLiter < cheapest.pricePerLiter) {
        cheapest = { pricePerLiter: entry.pricePerLiter, date: entry.date };
      }
      if (mostExpensive === null || entry.pricePerLiter > mostExpensive.pricePerLiter) {
        mostExpensive = { pricePerLiter: entry.pricePerLiter, date: entry.date };
      }
    }
  }

  return {
    count: entries.length,
    totalLiters,
    totalCost,
    avgPricePerLiter: weightedLiters > 0 ? weightedCost / weightedLiters : null,
    cheapest,
    mostExpensive,
  };
}

export type PricePoint = {
  date: string;
  pricePerLiter: number;
};

/** Entries with both date and price, ascending by date (≥ 2 needed to chart). */
export function pricePoints(entries: FuelEntry[]): PricePoint[] {
  return entries
    .filter(
      (entry): entry is FuelEntry & { date: string; pricePerLiter: number } =>
        entry.date !== null && entry.pricePerLiter !== null,
    )
    .map((entry) => ({ date: entry.date, pricePerLiter: entry.pricePerLiter }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type MonthlyCost = {
  month: string; // "YYYY-MM"
  label: string; // "Mär 26"
  total: number;
};

/** Σ total grouped by month, ascending; entries need date and total. */
export function monthlyCosts(entries: FuelEntry[]): MonthlyCost[] {
  const byMonth = new Map<string, number>();
  for (const entry of entries) {
    if (entry.date === null || entry.total === null) continue;
    const month = entry.date.slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + entry.total);
  }
  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, total]) => ({ month, label: formatMonthLabel(month), total }));
}

export type Consumption = {
  distanceKm: number;
  liters: number;
  litersPer100Km: number;
};

/**
 * Ø consumption over entries with odometer *and* liters (assumes full tanks):
 * distance between first and last odometer, liters of all fills but the first.
 */
export function computeConsumption(entries: FuelEntry[]): Consumption | null {
  const usable = entries
    .filter(
      (entry): entry is FuelEntry & { odometer: number; liters: number } =>
        entry.odometer !== null && entry.liters !== null,
    )
    .sort((a, b) => a.odometer - b.odometer);

  if (usable.length < 2) return null;
  const first = usable[0];
  const last = usable[usable.length - 1];
  if (!first || !last) return null;

  const distanceKm = last.odometer - first.odometer;
  if (distanceKm <= 0) return null;

  const liters = usable.slice(1).reduce((sum, entry) => sum + entry.liters, 0);
  return { distanceKm, liters, litersPer100Km: (liters / distanceKm) * 100 };
}
