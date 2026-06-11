import type { FuelEntry } from "../lib/db/types.ts";

let counter = 0;

export function makeEntry(overrides: Partial<FuelEntry> = {}): FuelEntry {
  counter += 1;
  return {
    id: `entry-${counter}`,
    date: "2026-03-05",
    time: "08:15",
    station: "V-Markt",
    location: "Türkheim",
    fuelType: "Super E10",
    liters: 32.18,
    pricePerLiter: 1.699,
    total: 54.67,
    odometer: null,
    source: "scan",
    createdAt: 1000 + counter,
    updatedAt: 1000 + counter,
    ...overrides,
  };
}
