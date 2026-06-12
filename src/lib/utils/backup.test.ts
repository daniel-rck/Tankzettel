import { describe, expect, it } from "vitest";
import { makeEntry } from "../../test/fixtures.ts";
import { createBackup, mergeEntries, parseBackup } from "./backup.ts";

describe("backup round-trip", () => {
  it("export → parse yields the same entries", () => {
    const entries = [makeEntry(), makeEntry({ date: null, liters: null })];
    expect(parseBackup(createBackup(entries))).toEqual(entries);
  });

  it("rejects invalid JSON and wrong versions", () => {
    expect(() => parseBackup("not json")).toThrow();
    expect(() => parseBackup(JSON.stringify({ version: 2, entries: [] }))).toThrow();
    expect(() => parseBackup(JSON.stringify({ entries: [] }))).toThrow();
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
    expect(toWrite.map((entry) => entry.id).sort()).toEqual(["a", "c"]);
    expect(toWrite.find((entry) => entry.id === "a")?.station).toBe("Neu");
  });
});
