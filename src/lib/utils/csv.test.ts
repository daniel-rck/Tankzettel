import { describe, expect, it } from "vitest";
import { makeEntry } from "../../test/fixtures.ts";
import { entriesToCsv } from "./csv.ts";

describe("entriesToCsv", () => {
  it("starts with a UTF-8 BOM for German Excel", () => {
    expect(entriesToCsv([]).startsWith("\uFEFF")).toBe(true);
  });

  it("matches the snapshot", () => {
    const entries = [
      makeEntry({
        date: "2026-03-05",
        time: "08:15",
        station: "V-Markt",
        location: "Türkheim",
        fuelType: "Super E10",
        liters: 32.18,
        pricePerLiter: 1.699,
        total: 54.67,
        odometer: 123456,
      }),
      makeEntry({
        date: null,
        time: null,
        station: "Tank & Rast; Allgäu",
        location: "",
        fuelType: "",
        liters: null,
        pricePerLiter: null,
        total: 20,
        odometer: null,
      }),
    ];
    expect(entriesToCsv(entries)).toMatchSnapshot();
  });

  it("uses decimal commas and semicolons", () => {
    const csv = entriesToCsv([makeEntry({ liters: 32.18, pricePerLiter: 1.699, total: 54.67 })]);
    const dataLine = csv.split("\r\n")[1];
    expect(dataLine).toContain("32,18;1,699;54,67");
  });

  it("quotes fields containing semicolons", () => {
    const csv = entriesToCsv([makeEntry({ station: "Tank; Rast" })]);
    expect(csv).toContain('"Tank; Rast"');
  });
});
