import { getDB, notifyMutation } from "../db/db.ts";
import type { ScanJob } from "../db/types.ts";
import { downscale } from "../gemini/downscale.ts";
import { ExtractionError, isConfigError, isRetryable } from "../gemini/errors.ts";
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
let retryTimerAt = 0;
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
    .toSorted((a, b) => a.createdAt - b.createdAt);
  return pending[0] ?? null;
}

/**
 * Keep one timer armed for the earliest backoff deadline. A new, sooner
 * deadline (e.g. a 30 s network retry while an 8 min rate-limit backoff is
 * pending) replaces the later timer instead of waiting behind it.
 */
function scheduleRetryTimer(): void {
  const now = Date.now();
  const future = Array.from(eligibleAt.values()).filter((at) => at > now);
  if (future.length === 0) return;
  const earliest = Math.min(...future);
  if (retryTimer !== null) {
    if (retryTimerAt <= earliest) return;
    clearTimeout(retryTimer);
  }
  retryTimerAt = earliest;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void drainQueue();
  }, earliest - now);
}

/** Result of one processed job, as far as the drain loop cares. */
type ProcessOutcome = "done" | "config-error";

async function claimJob(id: string): Promise<ScanJob | null> {
  // Check-and-set in one transaction: a job the user discarded between
  // selection and claim must not be resurrected.
  const db = await getDB();
  const tx = db.transaction("scanQueue", "readwrite");
  const current = await tx.store.get(id);
  if (!current || current.status !== "pending") {
    await tx.done;
    return null;
  }
  const claimed: ScanJob = { ...current, status: "processing" };
  await tx.store.put(claimed);
  await tx.done;
  notifyMutation("scanQueue");
  return claimed;
}

async function processJob(selected: ScanJob): Promise<ProcessOutcome> {
  const job = await claimJob(selected.id);
  if (!job) return "done";
  const db = await getDB();

  let update: Partial<ScanJob>;
  let outcome: ProcessOutcome = "done";
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
      if (isConfigError(kind)) outcome = "config-error";
    }
  }

  // The user may have discarded the job while extraction ran — never
  // resurrect it (or overwrite a concurrent reset) with a stale put.
  const tx = db.transaction("scanQueue", "readwrite");
  const current = await tx.store.get(job.id);
  if (current && current.status === "processing") {
    await tx.store.put({ ...current, ...update });
  } else {
    eligibleAt.delete(job.id);
  }
  await tx.done;
  notifyMutation("scanQueue");
  scheduleRetryTimer();
  return outcome;
}

/**
 * Process pending jobs sequentially, oldest first, while online and a key
 * exists. Re-entrant calls coalesce into the running pass; the returned
 * promise resolves once the queue is fully drained. A configuration error
 * (bad key, unknown model) ends the pass: the remaining jobs stay pending
 * until the settings change or the user retries.
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
        if ((await processJob(job)) === "config-error") {
          // Requests that queued up behind the failing job would hit the
          // same settings — drop them; a settings change drains again.
          rerunRequested = false;
          break;
        }
      }
    } while (rerunRequested);
  })()
    .catch((error: unknown) => {
      // IndexedDB failure: log it; the next trigger tries again.
      console.error("scanQueue drain failed", error);
    })
    .finally(() => {
      currentDrain = null;
      // A drainQueue() call in the microtask gap between the loop's last
      // check and this cleanup joined a pass that was already over.
      if (rerunRequested) void drainQueue();
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
  retryTimerAt = 0;
  rerunRequested = false;
}
