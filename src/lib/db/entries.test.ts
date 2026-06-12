import { beforeEach, describe, expect, it } from "vitest";
import { makeEntry } from "../../test/fixtures.ts";
import { addEntry, updateEntry } from "./entries.ts";
import { clearAll, getDB } from "./index.ts";

beforeEach(async () => {
  await clearAll();
});

describe("updateEntry", () => {
  it("persists changed fields under the same id without adding an entry", async () => {
    const entry = makeEntry({ id: "a", station: "V-Markt" });
    await addEntry(entry);

    await updateEntry({ ...entry, station: "Feneberg" });

    const db = await getDB();
    expect(await db.count("entries")).toBe(1);
    expect((await db.get("entries", "a"))?.station).toBe("Feneberg");
  });

  it("bumps updatedAt and keeps createdAt", async () => {
    const entry = makeEntry({ id: "a", createdAt: 1000, updatedAt: 1000 });
    await addEntry(entry);

    await updateEntry(entry);

    const updated = await getDB().then((db) => db.get("entries", "a"));
    expect(updated?.createdAt).toBe(1000);
    expect(updated?.updatedAt).toBeGreaterThan(1000);
  });
});
