import type { ExtractionResult } from "../db/types.ts";
import { ExtractionError, errorKindFromStatus } from "./errors.ts";
import { EXTRACTION_PROMPT } from "./prompt.ts";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

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

function normalizeResult(raw: unknown): ExtractionResult {
  const obj = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    date: asString(obj.date),
    time: asString(obj.time),
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

/** Minimal authenticated request to validate an API key ("Key testen"). */
export async function testApiKey(settings: GeminiSettings): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/models/${encodeURIComponent(settings.model)}`, {
      headers: { "x-goog-api-key": settings.apiKey },
    });
    return response.ok;
  } catch {
    return false;
  }
}
