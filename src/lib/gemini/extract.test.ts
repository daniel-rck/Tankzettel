import { describe, expect, it } from "vitest";
import { normalizeDate, normalizeResult, normalizeTime } from "./extract.ts";

describe("normalizeDate", () => {
  it("keeps ISO dates and pads single digits", () => {
    expect(normalizeDate("2026-09-22")).toBe("2026-09-22");
    expect(normalizeDate("2026-9-2")).toBe("2026-09-02");
  });

  it("converts German dates", () => {
    expect(normalizeDate("22.09.2026")).toBe("2026-09-22");
    expect(normalizeDate("2.9.26")).toBe("2026-09-02");
  });

  it("drops impossible or unknown formats", () => {
    expect(normalizeDate("31.02.2026")).toBeNull();
    expect(normalizeDate("2026-13-01")).toBeNull();
    expect(normalizeDate("09/22/2026")).toBeNull();
    expect(normalizeDate("gestern")).toBeNull();
    expect(normalizeDate(20260922)).toBeNull();
  });
});

describe("normalizeTime", () => {
  it("normalizes to HH:MM", () => {
    expect(normalizeTime("09:30")).toBe("09:30");
    expect(normalizeTime("9:30")).toBe("09:30");
    expect(normalizeTime("14.32")).toBe("14:32");
    expect(normalizeTime("14:32:15")).toBe("14:32");
  });

  it("drops invalid times", () => {
    expect(normalizeTime("25:00")).toBeNull();
    expect(normalizeTime("09:30:99")).toBeNull();
    expect(normalizeTime("2:32 PM")).toBeNull();
    expect(normalizeTime("")).toBeNull();
  });
});

describe("normalizeResult", () => {
  it("nulls out wrong types instead of passing them through", () => {
    expect(
      normalizeResult({
        date: "22.09.2026",
        time: "7:05",
        liters: "40",
        total: 50,
        station: " Aral ",
      }),
    ).toEqual({
      date: "2026-09-22",
      time: "07:05",
      station: "Aral",
      location: null,
      fuelType: null,
      liters: null,
      pricePerLiter: null,
      total: 50,
    });
  });
});
