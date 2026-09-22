import { getDB, notifyMutation } from "../db/db.ts";
import { requestPersistentStorage } from "../db/entries.ts";
import type { FuelEntry } from "../db/types.ts";

const pad = (n: number) => String(n).padStart(2, "0");

/** Dated, so repeated backups don't overwrite each other or become "(1)". */
export function backupFilename(now: Date = new Date()): string {
  return `tankzettel-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function nullableNumber(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function nullablePattern(value: unknown, pattern: RegExp): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" && pattern.test(value) ? value : undefined;
}

function optionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : undefined;
}

/**
 * Rebuild one imported record as a clean FuelEntry, or return null when a
 * field has the wrong shape. A string where a number belongs would otherwise
 * be concatenated in the KPIs, and a missing date would crash the charts.
 */
export function normalizeEntry(raw: unknown): FuelEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const { id, createdAt, updatedAt, source } = obj;
  if (typeof id !== "string" || id === "") return null;
  if (typeof createdAt !== "number" || !Number.isFinite(createdAt)) return null;
  if (typeof updatedAt !== "number" || !Number.isFinite(updatedAt)) return null;
  if (source !== "scan" && source !== "manual") return null;

  const date = nullablePattern(obj.date, DATE_RE);
  const time = nullablePattern(obj.time, TIME_RE);
  const station = optionalString(obj.station);
  const location = optionalString(obj.location);
  const fuelType = optionalString(obj.fuelType);
  const liters = nullableNumber(obj.liters);
  const pricePerLiter = nullableNumber(obj.pricePerLiter);
  const total = nullableNumber(obj.total);
  const odometer = nullableNumber(obj.odometer);
  if (
    date === undefined ||
    time === undefined ||
    station === undefined ||
    location === undefined ||
    fuelType === undefined ||
    liters === undefined ||
    pricePerLiter === undefined ||
    total === undefined ||
    odometer === undefined
  ) {
    return null;
  }
  return {
    id,
    date,
    time,
    station,
    location,
    fuelType,
    liters,
    pricePerLiter,
    total,
    odometer,
    source,
    createdAt,
    updatedAt,
  };
}

export type ParsedBackup = {
  entries: FuelEntry[];
  /** Records dropped because a field had the wrong shape. */
  invalid: number;
};

export function parseBackup(text: string): ParsedBackup {
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
  const entries: FuelEntry[] = [];
  let invalid = 0;
  for (const raw of obj.entries as unknown[]) {
    const entry = normalizeEntry(raw);
    if (entry) entries.push(entry);
    else invalid += 1;
  }
  return { entries, invalid };
}

export type ImportReport = {
  added: number;
  updated: number;
  skipped: number;
  invalid: number;
};

/** Merge by `id`; the newer `updatedAt` wins (sync-compatible LWW). */
export function mergeEntries(
  existing: FuelEntry[],
  imported: FuelEntry[],
): { toWrite: FuelEntry[]; report: Omit<ImportReport, "invalid"> } {
  const byId = new Map(existing.map((entry) => [entry.id, entry]));
  const toWrite: FuelEntry[] = [];
  const report = { added: 0, updated: 0, skipped: 0 };

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
  const { entries: imported, invalid } = parseBackup(text);
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
    // An import can be the first time data lands on this device.
    if (existing.length === 0) requestPersistentStorage();
  }
  return { ...report, invalid };
}
