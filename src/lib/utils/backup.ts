import { getDB, notifyMutation } from "../db/db.ts";
import type { FuelEntry } from "../db/types.ts";

export const BACKUP_FILENAME = "tankzettel-backup.json";

export type BackupFile = {
  version: 1;
  exportedAt: string;
  entries: FuelEntry[];
};

export function createBackup(entries: FuelEntry[]): string {
  const backup: BackupFile = {
    version: 1,
    exportedAt: new Date().toISOString(),
    entries,
  };
  return JSON.stringify(backup, null, 2);
}

export function parseBackup(text: string): FuelEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Datei ist kein gültiges JSON.");
  }
  const obj = parsed as Partial<BackupFile> | null;
  if (obj?.version !== 1 || !Array.isArray(obj.entries)) {
    throw new Error("Kein gültiges Tankzettel-Backup (version 1 erwartet).");
  }
  return obj.entries.filter(
    (entry): entry is FuelEntry =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as FuelEntry).id === "string" &&
      typeof (entry as FuelEntry).createdAt === "number" &&
      typeof (entry as FuelEntry).updatedAt === "number",
  );
}

export type ImportReport = {
  added: number;
  updated: number;
  skipped: number;
};

/** Merge by `id`; the newer `updatedAt` wins (sync-compatible LWW). */
export function mergeEntries(
  existing: FuelEntry[],
  imported: FuelEntry[],
): { toWrite: FuelEntry[]; report: ImportReport } {
  const byId = new Map(existing.map((entry) => [entry.id, entry]));
  const toWrite: FuelEntry[] = [];
  const report: ImportReport = { added: 0, updated: 0, skipped: 0 };

  for (const entry of imported) {
    const current = byId.get(entry.id);
    if (!current) {
      toWrite.push(entry);
      report.added += 1;
    } else if (entry.updatedAt > current.updatedAt) {
      toWrite.push(entry);
      report.updated += 1;
    } else {
      report.skipped += 1;
    }
  }
  return { toWrite, report };
}

export async function importBackup(text: string): Promise<ImportReport> {
  const imported = parseBackup(text);
  const db = await getDB();
  const existing = await db.getAll("entries");
  const { toWrite, report } = mergeEntries(existing, imported);
  if (toWrite.length > 0) {
    const tx = db.transaction("entries", "readwrite");
    for (const entry of toWrite) {
      void tx.store.put(entry);
    }
    await tx.done;
    notifyMutation("entries");
  }
  return report;
}
