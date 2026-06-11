import { getDB, notifyMutation } from "./db.ts";
import type { FuelEntry } from "./types.ts";

export async function getAllEntries(): Promise<FuelEntry[]> {
  const db = await getDB();
  return db.getAll("entries");
}

/** Entries sorted newest first (by date, falling back to createdAt). */
export function sortNewestFirst(entries: FuelEntry[]): FuelEntry[] {
  return [...entries].sort((a, b) => {
    const dateA = a.date ?? "";
    const dateB = b.date ?? "";
    if (dateA !== dateB) return dateB.localeCompare(dateA);
    return b.createdAt - a.createdAt;
  });
}

export async function addEntry(entry: FuelEntry): Promise<void> {
  const db = await getDB();
  const isFirst = (await db.count("entries")) === 0;
  await db.put("entries", entry);
  notifyMutation("entries");
  if (isFirst) {
    // Best-effort: ask the browser not to evict our IndexedDB data.
    navigator.storage?.persist?.().catch(() => {});
  }
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
