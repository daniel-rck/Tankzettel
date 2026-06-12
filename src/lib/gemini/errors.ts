export type ExtractionErrorKind =
  | "auth" // HTTP 400/403 — invalid key
  | "rate-limit" // HTTP 429
  | "server" // HTTP 5xx
  | "network" // fetch failed / offline
  | "unparsable"; // empty or non-JSON response

/** Whether a failed attempt should stay `pending` and be retried later. */
export function isRetryable(kind: ExtractionErrorKind): boolean {
  return kind === "rate-limit" || kind === "server" || kind === "network";
}

const USER_MESSAGES: Record<ExtractionErrorKind, string> = {
  auth: "API-Key ungültig — in den Einstellungen prüfen.",
  "rate-limit": "Rate-Limit erreicht — wird automatisch erneut versucht.",
  server: "Gemini-Server nicht erreichbar — wird automatisch erneut versucht.",
  network: "Keine Verbindung — wird bei Internetzugang erneut versucht.",
  unparsable: "Beleg konnte nicht gelesen werden — manuell ausfüllen.",
};

export class ExtractionError extends Error {
  readonly kind: ExtractionErrorKind;

  constructor(kind: ExtractionErrorKind) {
    // Never include response bodies or the API key in the message.
    super(USER_MESSAGES[kind]);
    this.name = "ExtractionError";
    this.kind = kind;
  }
}

export function errorKindFromStatus(status: number): ExtractionErrorKind {
  if (status === 429) return "rate-limit";
  if (status >= 500) return "server";
  return "auth"; // 400/403 and other client errors → key/config problem
}
