import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import type { FuelEntry, ScanJob } from "./types.ts";

export interface TankzettelSchema extends DBSchema {
  entries: {
    key: string;
    value: FuelEntry;
    indexes: { byDate: string };
  };
  scanQueue: {
    key: string;
    value: ScanJob;
  };
}

const DB_NAME = "tankzettel";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<TankzettelSchema>> | null = null;

export function getDB(): Promise<IDBPDatabase<TankzettelSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<TankzettelSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("entries")) {
          const store = db.createObjectStore("entries", { keyPath: "id" });
          store.createIndex("byDate", "date");
        }
        if (!db.objectStoreNames.contains("scanQueue")) {
          db.createObjectStore("scanQueue", { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

/** Test helper: wipe all stores in the current DB. */
export async function clearAll(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(Array.from(db.objectStoreNames), "readwrite");
  await Promise.all(Array.from(db.objectStoreNames).map((name) => tx.objectStore(name).clear()));
  await tx.done;
  notifyMutation("*");
}

/** Notify subscribers of mutations. Channels are per-store. */
export function notifyMutation(storeName: string): void {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(`db:${storeName}`);
  channel.postMessage({ type: "mutation", at: Date.now() });
  channel.close();
}
