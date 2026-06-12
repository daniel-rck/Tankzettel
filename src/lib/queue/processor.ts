import { getDB, notifyMutation } from "../db/db.ts";
import type { ScanJob } from "../db/types.ts";
import { downscale } from "../gemini/downscale.ts";
import { ExtractionError, isRetryable } from "../gemini/errors.ts";
import { extractReceipt } from "../gemini/extract.ts";
import { getApiKey, getModel } from "../settings.ts";

const MAX_ATTEMPTS = 5;
// Network blips (onLine true but fetch failing) retry gently instead of
// hot-looping; real offline is handled by the `online` event.
const NETWORK_RETRY_MS = 30_000;

// Backoff bookkeeping is in-memory on purpose: the ScanJob schema stays
// sync-compatible, and after an app restart jobs are simply eligible again.
const eligibleAt = new Map<string, number>();
let currentDrain: Promise<void> | null = null;
let rerunRequested = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;

function backoffMs(attempts: number): number {
  return Math.min(2 ** attempts, 8) * 60_000;
}

function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

/** Enqueue a photo: downscale, persist, kick the processor. */
export async function enqueueScan(file: Blob): Promise<void> {
  await enqueueJob(await downscale(file));
}

/** Enqueue an already-downscaled image (separated for testability). */
export async function enqueueJob(image: Blob): Promise<void> {
  const job: ScanJob = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    image,
    status: "pending",
    attempts: 0,
    lastError: null,
    result: null,
  };
  const db = await getDB();
  await db.put("scanQueue", job);
  notifyMutation("scanQueue");
  void drainQueue();
}

/** Reset a failed job so the queue picks it up again ("Erneut versuchen"). */
export async function retryJob(id: string): Promise<void> {
  const db = await getDB();
  const job = await db.get("scanQueue", id);
  if (!job) return;
  eligibleAt.delete(id);
  await db.put("scanQueue", { ...job, status: "pending", attempts: 0, lastError: null });
  notifyMutation("scanQueue");
  void drainQueue();
}

export async function deleteJob(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("scanQueue", id);
  eligibleAt.delete(id);
  notifyMutation("scanQueue");
}

async function nextEligibleJob(): Promise<ScanJob | null> {
  const db = await getDB();
  const jobs = await db.getAll("scanQueue");
  const now = Date.now();
  const pending = jobs
    .filter((job) => job.status === "pending" && (eligibleAt.get(job.id) ?? 0) <= now)
    .sort((a, b) => a.createdAt - b.createdAt);
  return pending[0] ?? null;
}

function scheduleRetryTimer(): void {
  if (retryTimer !== null) return;
  const now = Date.now();
  const future = Array.from(eligibleAt.values()).filter((at) => at > now);
  if (future.length === 0) return;
  const delay = Math.min(...future) - now;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void drainQueue();
  }, delay);
}

async function processJob(job: ScanJob): Promise<void> {
  const db = await getDB();
  await db.put("scanQueue", { ...job, status: "processing" });
  notifyMutation("scanQueue");

  let update: Partial<ScanJob>;
  try {
    const result = await extractReceipt(job.image, { apiKey: getApiKey(), model: getModel() });
    update = { status: "review", result, lastError: null };
  } catch (error) {
    const kind = error instanceof ExtractionError ? error.kind : "unparsable";
    const message =
      error instanceof ExtractionError ? error.message : new ExtractionError("unparsable").message;

    if (kind === "network") {
      // Don't burn attempts while offline; the `online` event re-drains.
      eligibleAt.set(job.id, Date.now() + NETWORK_RETRY_MS);
      update = { status: "pending", lastError: message };
    } else if (isRetryable(kind) && job.attempts + 1 < MAX_ATTEMPTS) {
      const attempts = job.attempts + 1;
      eligibleAt.set(job.id, Date.now() + backoffMs(attempts));
      update = { status: "pending", attempts, lastError: message };
    } else {
      // Retryable + exhausted counts the final attempt; non-retryable
      // failures (auth/unparsable) keep the counter untouched.
      const attempts = isRetryable(kind) ? job.attempts + 1 : job.attempts;
      update = { status: "failed", attempts, lastError: message };
    }
  }

  // The user may have discarded the job while extraction ran — never
  // resurrect it (or overwrite a concurrent reset) with a stale put.
  const current = await db.get("scanQueue", job.id);
  if (current && current.status === "processing") {
    await db.put("scanQueue", { ...current, ...update });
  } else {
    eligibleAt.delete(job.id);
  }
  notifyMutation("scanQueue");
  scheduleRetryTimer();
}

/**
 * Process pending jobs sequentially, oldest first, while online and a key
 * exists. Re-entrant calls coalesce into the running pass; the returned
 * promise resolves once the queue is fully drained.
 */
export function drainQueue(): Promise<void> {
  if (currentDrain) {
    rerunRequested = true;
    return currentDrain;
  }
  currentDrain = (async () => {
    do {
      rerunRequested = false;
      while (isOnline() && getApiKey() !== "") {
        const job = await nextEligibleJob();
        if (!job) break;
        await processJob(job);
      }
    } while (rerunRequested);
  })().finally(() => {
    currentDrain = null;
  });
  return currentDrain;
}

/**
 * Jobs stuck in "processing" (app was closed mid-extraction) would never be
 * picked up again — make them pending before the first drain of a session.
 */
export async function resetStaleProcessingJobs(): Promise<void> {
  const db = await getDB();
  const stale = (await db.getAll("scanQueue")).filter((job) => job.status === "processing");
  if (stale.length === 0) return;
  for (const job of stale) {
    await db.put("scanQueue", { ...job, status: "pending" });
  }
  notifyMutation("scanQueue");
}

/** Start the module-level processor: initial drain + `online` listener. */
export function startQueueProcessor(): void {
  if (started) return;
  started = true;
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => void drainQueue());
  }
  void resetStaleProcessingJobs().then(() => drainQueue());
}

/** Test helper: clear in-memory backoff/timer state. */
export function resetQueueStateForTests(): void {
  eligibleAt.clear();
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  rerunRequested = false;
}
