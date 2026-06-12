import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAll, getDB } from "../db/index.ts";
import type { ScanJob } from "../db/types.ts";
import {
  deleteJob,
  drainQueue,
  resetQueueStateForTests,
  resetStaleProcessingJobs,
  retryJob,
} from "./processor.ts";

function setOnline(value: boolean): void {
  Object.defineProperty(globalThis.navigator, "onLine", { value, configurable: true });
}

async function putJob(overrides: Partial<ScanJob> = {}): Promise<ScanJob> {
  const job: ScanJob = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    image: new Blob(["fake-jpeg"], { type: "image/jpeg" }),
    status: "pending",
    attempts: 0,
    lastError: null,
    result: null,
    ...overrides,
  };
  const db = await getDB();
  await db.put("scanQueue", job);
  return job;
}

async function getJob(id: string): Promise<ScanJob | undefined> {
  const db = await getDB();
  return db.get("scanQueue", id);
}

function geminiResponse(result: object): Response {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }],
    }),
    { status: 200 },
  );
}

beforeEach(async () => {
  await clearAll();
  resetQueueStateForTests();
  localStorage.clear();
  localStorage.setItem("gemini-api-key", "test-key");
  setOnline(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetQueueStateForTests();
});

describe("scan queue state machine", () => {
  it("pending → review on a successful extraction", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      geminiResponse({
        date: "2026-06-01",
        time: "09:30",
        station: "V-Markt",
        location: "Türkheim",
        fuelType: "Super E10",
        liters: 32.18,
        pricePerLiter: 1.699,
        total: 54.67,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const job = await putJob();
    await drainQueue();

    const updated = await getJob(job.id);
    expect(updated?.status).toBe("review");
    expect(updated?.result?.liters).toBe(32.18);
    expect(updated?.result?.station).toBe("V-Markt");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Auth must travel in the header, never in the URL.
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain("test-key");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
  });

  it("429 → stays pending with backoff and retries later", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 429 }))
      .mockResolvedValue(geminiResponse({ liters: 40 }));
    vi.stubGlobal("fetch", fetchMock);

    const job = await putJob();
    await drainQueue();

    let updated = await getJob(job.id);
    expect(updated?.status).toBe("pending");
    expect(updated?.attempts).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Still in backoff: another drain must not touch the job.
    await drainQueue();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // After backoff expires (simulated by clearing in-memory state) it succeeds.
    resetQueueStateForTests();
    await drainQueue();
    updated = await getJob(job.id);
    expect(updated?.status).toBe("review");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("403 → failed with a German key error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 403 })));

    const job = await putJob();
    await drainQueue();

    const updated = await getJob(job.id);
    expect(updated?.status).toBe("failed");
    expect(updated?.lastError).toBe("API-Key ungültig — in den Einstellungen prüfen.");
    // Non-retryable failures don't inflate the attempt counter.
    expect(updated?.attempts).toBe(0);
  });

  it("unparsable response → failed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [] }), { status: 200 })),
    );

    const job = await putJob();
    await drainQueue();

    const updated = await getJob(job.id);
    expect(updated?.status).toBe("failed");
    expect(updated?.lastError).toBe("Beleg konnte nicht gelesen werden — manuell ausfüllen.");
  });

  it("offline → job stays pending, no request is made", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    setOnline(false);

    const job = await putJob();
    await drainQueue();

    expect((await getJob(job.id))?.status).toBe("pending");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("without an API key the queue does not run", async () => {
    localStorage.clear();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const job = await putJob();
    await drainQueue();

    expect((await getJob(job.id))?.status).toBe("pending");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("network error → stays pending without burning attempts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    const job = await putJob();
    await drainQueue();

    const updated = await getJob(job.id);
    expect(updated?.status).toBe("pending");
    expect(updated?.attempts).toBe(0);
  });

  it("gives up after 5 attempts on persistent 5xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 500 })));

    const job = await putJob();
    for (let i = 0; i < 5; i += 1) {
      resetQueueStateForTests();
      await drainQueue();
    }

    const updated = await getJob(job.id);
    expect(updated?.status).toBe("failed");
    expect(updated?.attempts).toBe(5);
  });

  it("retryJob resets a failed job and processes it again", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 403 }))
      .mockResolvedValue(geminiResponse({ total: 50 }));
    vi.stubGlobal("fetch", fetchMock);

    const job = await putJob();
    await drainQueue();
    expect((await getJob(job.id))?.status).toBe("failed");

    await retryJob(job.id);
    await drainQueue();

    const updated = await getJob(job.id);
    expect(updated?.status).toBe("review");
    expect(updated?.attempts).toBe(0);
    expect(updated?.lastError).toBeNull();
  });

  it("a job discarded while processing is not resurrected", async () => {
    let jobId = "";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        // Simulate the user hitting "Scan verwerfen" mid-extraction.
        await deleteJob(jobId);
        return geminiResponse({ total: 50 });
      }),
    );

    const job = await putJob();
    jobId = job.id;
    await drainQueue();

    expect(await getJob(job.id)).toBeUndefined();
  });

  it("resets jobs stuck in processing from a previous session", async () => {
    const job = await putJob({ status: "processing" });

    await resetStaleProcessingJobs();

    expect((await getJob(job.id))?.status).toBe("pending");
  });

  it("processes jobs sequentially, oldest first", async () => {
    const order: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        order.push("call");
        return geminiResponse({ total: 1 });
      }),
    );

    const older = await putJob({ createdAt: 1 });
    const newer = await putJob({ createdAt: 2 });
    await drainQueue();

    expect((await getJob(older.id))?.status).toBe("review");
    expect((await getJob(newer.id))?.status).toBe("review");
    expect(order).toHaveLength(2);
  });
});
