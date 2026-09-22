import type { ExtractionResult } from "../db/types.ts";
import { ExtractionError, errorKindFromStatus } from "./errors.ts";
import { EXTRACTION_PROMPT } from "./prompt.ts";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
// A hung request would block the strictly sequential queue forever.
const REQUEST_TIMEOUT_MS = 60_000;

export type GeminiSettings = {
  apiKey: string;
  model: string;
};

// Mirrors ExtractionResult; all fields nullable, none required —
// validation happens app-side.
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    date: { type: "STRING", nullable: true, description: "ISO YYYY-MM-DD" },
    time: { type: "STRING", nullable: true, description: "HH:MM" },
    station: { type: "STRING", nullable: true },
    location: { type: "STRING", nullable: true },
    fuelType: { type: "STRING", nullable: true },
    liters: { type: "NUMBER", nullable: true },
    pricePerLiter: { type: "NUMBER", nullable: true },
    total: { type: "NUMBER", nullable: true },
  },
} as const;

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * The model does not always honour the ISO hint: accept "YYYY-MM-DD" and the
 * German "DD.MM.YYYY", drop anything else — a malformed value would render as
 * an empty <input type="date"> yet still be saved.
 */
export function normalizeDate(value: unknown): string | null {
  const text = asString(value);
  if (text === null) return null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  const german = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(text);
  let year: number;
  let month: number;
  let day: number;
  if (iso) {
    [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (german) {
    const rawYear = Number(german[3]);
    [year, month, day] = [
      rawYear < 100 ? 2000 + rawYear : rawYear,
      Number(german[2]),
      Number(german[1]),
    ];
  } else {
    return null;
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** "9:30", "09.30", "09:30:15" → "09:30"; anything else → null. */
export function normalizeTime(value: unknown): string | null {
  const text = asString(value);
  if (text === null) return null;
  const match = /^(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?$/.exec(text);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] === undefined ? 0 : Number(match[3]);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function normalizeResult(raw: unknown): ExtractionResult {
  const obj = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    date: normalizeDate(obj.date),
    time: normalizeTime(obj.time),
    station: asString(obj.station),
    location: asString(obj.location),
    fuelType: asString(obj.fuelType),
    liters: asNumber(obj.liters),
    pricePerLiter: asNumber(obj.pricePerLiter),
    total: asNumber(obj.total),
  };
}

/**
 * Send one receipt photo to Gemini and return the structured extraction.
 * Throws `ExtractionError`; never leaks the API key into errors or URLs.
 */
export async function extractReceipt(
  image: Blob,
  settings: GeminiSettings,
): Promise<ExtractionResult> {
  const body = {
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: image.type || "image/jpeg",
              data: await blobToBase64(image),
            },
          },
          { text: EXTRACTION_PROMPT },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  };

  let response: Response;
  try {
    response = await fetch(
      `${API_BASE}/models/${encodeURIComponent(settings.model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Auth via header only — `?key=` query params leak into caches/logs.
          "x-goog-api-key": settings.apiKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
  } catch {
    throw new ExtractionError("network");
  }

  if (!response.ok) {
    throw new ExtractionError(errorKindFromStatus(response.status));
  }

  try {
    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("empty");
    // With responseSchema there is no markdown fence to strip.
    return normalizeResult(JSON.parse(text));
  } catch {
    throw new ExtractionError("unparsable");
  }
}

export type KeyTestResult = "ok" | "invalid" | "model" | "unavailable" | "network";

/**
 * Minimal authenticated request to validate an API key ("Key testen").
 * Distinguishes a bad key from an unknown model and from being offline, so
 * the user isn't sent to fix the wrong thing.
 */
export async function testApiKey(settings: GeminiSettings): Promise<KeyTestResult> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/models/${encodeURIComponent(settings.model)}`, {
      headers: { "x-goog-api-key": settings.apiKey },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return "network";
  }
  if (response.ok) return "ok";
  const kind = errorKindFromStatus(response.status);
  if (kind === "model") return "model";
  if (kind === "auth") return "invalid";
  // 429/5xx: Gemini answered, so the device is online and the key may be fine.
  return "unavailable";
}
