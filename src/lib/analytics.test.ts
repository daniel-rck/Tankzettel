import { describe, expect, it } from "vitest";
import { makeEntry } from "../test/fixtures.ts";
import { computeConsumption, computeKpis, monthlyCosts, pricePoints } from "./analytics.ts";

describe("computeKpis", () => {
  it("sums liters and cost and weights the average price by liters", () => {
    const entries = [
      makeEntry({ liters: 40, pricePerLiter: 2.0, total: 80 }),
      makeEntry({ liters: 10, pricePerLiter: 1.0, total: 10 }),
    ];
    const kpis = computeKpis(entries);
    expect(kpis.count).toBe(2);
    expect(kpis.totalLiters).toBe(50);
    expect(kpis.totalCost).toBe(90);
    // Weighted: 90 / 50 = 1.8, not the naive (2.0 + 1.0) / 2.
    expect(kpis.avgPricePerLiter).toBeCloseTo(1.8, 6);
  });

  it("ignores null fields and tracks price extremes with dates", () => {
    const entries = [
      makeEntry({ date: "2026-01-02", pricePerLiter: 1.5, liters: null, total: null }),
      makeEntry({ date: "2026-02-03", pricePerLiter: 1.9, liters: 30, total: 57 }),
      makeEntry({ date: null, pricePerLiter: null, liters: 10, total: 20 }),
    ];
    const kpis = computeKpis(entries);
    expect(kpis.totalLiters).toBe(40);
    expect(kpis.totalCost).toBe(77);
    expect(kpis.cheapest).toEqual({ pricePerLiter: 1.5, date: "2026-01-02" });
    expect(kpis.mostExpensive).toEqual({ pricePerLiter: 1.9, date: "2026-02-03" });
  });

  it("returns null aggregates for empty input", () => {
    const kpis = computeKpis([]);
    expect(kpis.count).toBe(0);
    expect(kpis.avgPricePerLiter).toBeNull();
    expect(kpis.cheapest).toBeNull();
    expect(kpis.mostExpensive).toBeNull();
  });
});

describe("pricePoints", () => {
  it("keeps only dated, priced entries sorted ascending", () => {
    const entries = [
      makeEntry({ date: "2026-03-01", pricePerLiter: 1.8 }),
      makeEntry({ date: null, pricePerLiter: 1.5 }),
      makeEntry({ date: "2026-01-15", pricePerLiter: 1.6 }),
      makeEntry({ date: "2026-02-01", pricePerLiter: null }),
    ];
    expect(pricePoints(entries)).toEqual([
      { date: "2026-01-15", pricePerLiter: 1.6 },
      { date: "2026-03-01", pricePerLiter: 1.8 },
    ]);
  });
});

describe("monthlyCosts", () => {
  it("groups totals by month with German labels, ascending", () => {
    const entries = [
      makeEntry({ date: "2026-03-05", total: 50 }),
      makeEntry({ date: "2026-03-20", total: 30 }),
      makeEntry({ date: "2026-01-02", total: 40 }),
      makeEntry({ date: null, total: 99 }),
      makeEntry({ date: "2026-02-01", total: null }),
    ];
    expect(monthlyCosts(entries)).toEqual([
      { month: "2026-01", label: "Jan 26", total: 40 },
      { month: "2026-03", label: "Mär 26", total: 80 },
    ]);
  });
});

describe("computeConsumption", () => {
  it("computes l/100km from odometer range and all-but-first liters", () => {
    const entries = [
      makeEntry({ odometer: 10_000, liters: 40 }),
      makeEntry({ odometer: 10_500, liters: 35 }),
      makeEntry({ odometer: 11_000, liters: 45 }),
      makeEntry({ odometer: null, liters: 50 }), // ignored
    ];
    const consumption = computeConsumption(entries);
    expect(consumption).not.toBeNull();
    expect(consumption?.distanceKm).toBe(1000);
    expect(consumption?.liters).toBe(80);
    expect(consumption?.litersPer100Km).toBeCloseTo(8, 6);
  });

  it("sorts by odometer, not entry order", () => {
    const entries = [
      makeEntry({ odometer: 11_000, liters: 45 }),
      makeEntry({ odometer: 10_000, liters: 40 }),
    ];
    expect(computeConsumption(entries)?.liters).toBe(45);
  });

  it("returns null with fewer than two usable entries", () => {
    expect(computeConsumption([])).toBeNull();
    expect(computeConsumption([makeEntry({ odometer: 10_000, liters: 40 })])).toBeNull();
    expect(
      computeConsumption([
        makeEntry({ odometer: 10_000, liters: 40 }),
        makeEntry({ odometer: 10_500, liters: null }),
      ]),
    ).toBeNull();
  });

  it("returns null for zero distance", () => {
    const entries = [
      makeEntry({ odometer: 10_000, liters: 40 }),
      makeEntry({ odometer: 10_000, liters: 35 }),
    ];
    expect(computeConsumption(entries)).toBeNull();
  });
});
