// The only module that touches localStorage for app settings. The Gemini API
// key lives here by design (BYO-key trade-off, see docs/specs §3); it must
// never appear in URLs, logs, error messages, or exports.
import { DEFAULT_MODEL } from "./gemini/model.ts";

const KEY_API_KEY = "gemini-api-key";
const KEY_MODEL = "gemini-model";
const KEY_KEEP_PHOTOS = "keep-photos";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode quota etc.) — settings stay session-local.
  }
}

export function getApiKey(): string {
  return read(KEY_API_KEY) ?? "";
}

export function setApiKey(value: string): void {
  write(KEY_API_KEY, value.trim());
}

export function getModel(): string {
  const stored = read(KEY_MODEL);
  return stored && stored.trim() !== "" ? stored : DEFAULT_MODEL;
}

export function setModel(value: string): void {
  write(KEY_MODEL, value.trim());
}

export function getKeepPhotos(): boolean {
  return read(KEY_KEEP_PHOTOS) === "1";
}

export function setKeepPhotos(value: boolean): void {
  write(KEY_KEEP_PHOTOS, value ? "1" : "0");
}
