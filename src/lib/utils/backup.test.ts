import { describe, expect, it } from "vitest";
import { makeEntry } from "../../test/fixtures.ts";
import { backupFilename, createBackup, mergeEntries, parseBackup } from "./backup.ts";

describe("backup round-trip", () => {
  it("export → parse yields the same entries", () => {
    const entries = [makeEntry(), makeEntry({ date: null, liters: null })];
    expect(parseBackup(createBackup(entries))).toEqual({ entries, invalid: 0 });
  });

  it("drops and counts records with wrongly typed fields", () => {
    const good = makeEntry({ id: "good" });
    const text = JSON.stringify({
      version: 1,
      entries: [
        good,
        { ...makeEntry(), liters: "46,92" },
        { ...makeEntry(), date: "05.03.2026" },
        { ...makeEntry(), source: "sync" },
        { ...makeEntry(), total: { amount: 50 } },
        "not an object",
      ],
    });
    expect(parseBackup(text)).toEqual({ entries: [good], invalid: 5 });
  });

  it("fills omitted optional fields instead of storing undefined", () => {
    const { date: _date, odometer: _odometer, station: _station, ...rest } = makeEntry({ id: "x" });
    const [entry] = parseBackup(JSON.stringify({ version: 1, entries: [rest] })).entries;
    expect(entry).toMatchObject({ id: "x", date: null, odometer: null, station: "" });
  });

  it("rejects invalid JSON and wrong versions", () => {
    expect(() => parseBackup("not json")).toThrow("kein gültiges JSON");
    expect(() => parseBackup(JSON.stringify({ version: 2, entries: [] }))).toThrow(
      "version 1 erwartet",
    );
    expect(() => parseBackup(JSON.stringify({ entries: [] }))).toThrow("version 1 erwartet");
  });
});

describe("backupFilename", () => {
  it("carries the local date", () => {
    expect(backupFilename(new Date(2026, 8, 2, 23, 30))).toBe("tankzettel-backup-2026-09-02.json");
  });
});

describe("mergeEntries", () => {
  it("merges by id with newer updatedAt winning", () => {
    const existing = [
      makeEntry({ id: "a", updatedAt: 100 }),
      makeEntry({ id: "b", updatedAt: 100 }),
    ];
    const imported = [
      makeEntry({ id: "a", updatedAt: 200, station: "Neu" }), // newer → update
      makeEntry({ id: "b", updatedAt: 50 }), // older → skip
      makeEntry({ id: "c", updatedAt: 100 }), // unknown → add
    ];
    const { toWrite, report } = mergeEntries(existing, imported);
    expect(report).toEqual({ added: 1, updated: 1, skipped: 1 });
    expect(toWrite.map((entry) => entry.id).toSorted()).toEqual(["a", "c"]);
    expect(toWrite.find((entry) => entry.id === "a")?.station).toBe("Neu");
  });
});
