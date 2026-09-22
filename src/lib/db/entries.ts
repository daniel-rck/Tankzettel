import { compareChronologically } from "../utils/sort.ts";
import { getDB, notifyMutation } from "./db.ts";
import type { FuelEntry } from "./types.ts";

export async function getAllEntries(): Promise<FuelEntry[]> {
  const db = await getDB();
  return db.getAll("entries");
}

/**
 * Entries newest first. Undated entries (usually incomplete, just captured)
 * lead the list, where they are easy to spot and complete.
 */
export function sortNewestFirst(entries: FuelEntry[]): FuelEntry[] {
  return entries.toSorted((a, b) => {
    if ((a.date === null) !== (b.date === null)) return a.date === null ? -1 : 1;
    return compareChronologically(b, a);
  });
}

/** Best-effort: ask the browser not to evict our IndexedDB data. */
export function requestPersistentStorage(): void {
  navigator.storage?.persist?.().catch(() => {});
}

export async function addEntry(entry: FuelEntry): Promise<void> {
  const db = await getDB();
  const isFirst = (await db.count("entries")) === 0;
  await db.put("entries", entry);
  notifyMutation("entries");
  if (isFirst) requestPersistentStorage();
}

export async function updateEntry(entry: FuelEntry): Promise<void> {
  const db = await getDB();
  await db.put("entries", { ...entry, updatedAt: Date.now() });
  notifyMutation("entries");
}

export async function deleteEntry(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("entries", id);
  notifyMutation("entries");
}

export async function deleteAllEntries(): Promise<void> {
  const db = await getDB();
  await db.clear("entries");
  notifyMutation("entries");
}
