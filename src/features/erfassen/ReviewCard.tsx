import { AlertTriangle, RotateCcw, Trash2 } from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { getDB, useLiveQuery } from "../../lib/db/index.ts";
import type { EntrySource, ExtractionResult, FuelEntry } from "../../lib/db/types.ts";
import { Badge, Button, Card } from "../../lib/ui/index.ts";
import { formatDecimalInput, parseDecimal, parseKilometers } from "../../lib/utils/format.ts";
import {
  canSave,
  DUPLICATE_WARNING,
  hasPlausibilityIssue,
  isLikelyDuplicate,
  PLAUSIBILITY_WARNING,
} from "../../lib/utils/validation.ts";

export type ReviewCardProps = {
  /** Prefill from a scan result; null/undefined renders an empty card. */
  initial?: ExtractionResult | null;
  /** Edit mode: prefills all fields and preserves id/createdAt/source. */
  entry?: FuelEntry;
  /** Receipt photo to review against (scan jobs). */
  image?: Blob;
  /** German error message for failed jobs. */
  errorMessage?: string | null;
  /** Extra content after the error message, e.g. a link to the settings. */
  errorAction?: ReactNode;
  /** Move focus into the first field on mount (card opened by the user). */
  focusOnMount?: boolean;
  source: EntrySource;
  onSave: (entry: FuelEntry) => void | Promise<void>;
  onDiscard?: () => void;
  onRetry?: () => void;
};

type Draft = {
  date: string;
  time: string;
  station: string;
  location: string;
  fuelType: string;
  liters: string;
  pricePerLiter: string;
  total: string;
  odometer: string;
};

function toDraft(
  initial: (ExtractionResult & { odometer?: number | null }) | null | undefined,
): Draft {
  return {
    date: initial?.date ?? "",
    time: initial?.time ?? "",
    station: initial?.station ?? "",
    location: initial?.location ?? "",
    fuelType: initial?.fuelType ?? "",
    liters: formatDecimalInput(initial?.liters),
    pricePerLiter: formatDecimalInput(initial?.pricePerLiter),
    total: formatDecimalInput(initial?.total),
    odometer:
      initial?.odometer === null || initial?.odometer === undefined
        ? ""
        : String(Math.round(initial.odometer)),
  };
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-fg-muted">{label}</span>
      {children}
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </label>
  );
}

const INPUT_CLASS =
  "h-10 rounded-md border border-border bg-surface px-3 text-sm text-fg " +
  "focus:outline-none focus:ring-2 focus:ring-accent-500 aria-invalid:border-danger";
const NUMERIC_CLASS = `${INPUT_CLASS} font-mono tabular-nums`;

const INVALID_NUMBER = "Keine gültige Zahl";

/** Parse a numeric field; `invalid` flags non-empty input that isn't a number. */
function parseField(
  input: string,
  parse: (value: string) => number | null,
): { value: number | null; invalid: boolean } {
  const value = parse(input);
  return { value, invalid: value === null && input.trim() !== "" };
}

export function ReviewCard({
  initial,
  entry,
  image,
  errorMessage,
  errorAction,
  focusOnMount = false,
  source,
  onSave,
  onDiscard,
  onRetry,
}: ReviewCardProps) {
  const formId = useId();
  const [draft, setDraft] = useState<Draft>(() => toDraft(entry ?? initial));
  // One id per card, not per save attempt: if the save half-succeeds (entry
  // written, scan job not yet deleted) a retry overwrites the same entry
  // instead of duplicating the receipt.
  const [entryId] = useState(() => entry?.id ?? crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [imageExpanded, setImageExpanded] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focusOnMount) return;
    const field = firstFieldRef.current;
    field?.focus();
    field?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusOnMount]);

  // The object URL lives exactly as long as the <img> is attached to this
  // blob: a ref callback with cleanup (React 19) creates and revokes it
  // without a state round-trip.
  const attachImage = useCallback(
    (img: HTMLImageElement | null) => {
      if (!img || !image) return;
      const url = URL.createObjectURL(image);
      img.src = url;
      return () => URL.revokeObjectURL(url);
    },
    [image],
  );

  const { data: entries } = useLiveQuery("entries", async () => {
    const db = await getDB();
    return db.getAll("entries");
  });

  const liters = parseField(draft.liters, parseDecimal);
  const pricePerLiter = parseField(draft.pricePerLiter, parseDecimal);
  const total = parseField(draft.total, parseDecimal);
  const odometer = parseField(draft.odometer, parseKilometers);
  const hasInvalidField =
    liters.invalid || pricePerLiter.invalid || total.invalid || odometer.invalid;

  const showPlausibilityWarning = hasPlausibilityIssue(
    liters.value,
    pricePerLiter.value,
    total.value,
  );
  const showDuplicateWarning = isLikelyDuplicate(
    { date: draft.date || null, total: total.value },
    entries ?? [],
    entry?.id,
  );
  const saveable = canSave(liters.value, total.value) && !hasInvalidField;
  const saveHint = hasInvalidField
    ? "Bitte die markierten Felder korrigieren."
    : saveable
      ? null
      : "Liter oder Betrag angeben, um zu speichern.";

  function set<K extends keyof Draft>(key: K, value: string): void {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!saveable || saving) return;
    setSaving(true);
    setSaveError(false);
    try {
      const now = Date.now();
      await onSave({
        id: entryId,
        date: draft.date || null,
        time: draft.time.trim() || null,
        station: draft.station.trim(),
        location: draft.location.trim(),
        fuelType: draft.fuelType.trim(),
        liters: liters.value,
        pricePerLiter: pricePerLiter.value,
        total: total.value,
        odometer: odometer.value,
        source: entry?.source ?? source,
        createdAt: entry?.createdAt ?? now,
        updatedAt: now,
      });
    } catch (error) {
      console.error("saving entry failed", error);
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <form aria-labelledby={`${formId}-title`} onSubmit={(event) => void handleSubmit(event)}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 id={`${formId}-title`} className="text-base font-medium">
            {entry ? "Beleg bearbeiten" : source === "manual" ? "Manuell erfassen" : "Beleg prüfen"}
          </h3>
          <Badge variant={errorMessage ? "danger" : "accent"}>
            {errorMessage
              ? "Fehlgeschlagen"
              : entry
                ? "Bearbeiten"
                : source === "manual"
                  ? "Manuell"
                  : "Scan"}
          </Badge>
        </div>

        {errorMessage ? (
          <p className="mb-3 flex items-start gap-2 text-sm text-danger">
            <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>
              {errorMessage}
              {errorAction ? <> {errorAction}</> : null}
            </span>
          </p>
        ) : null}

        {image ? (
          <button
            type="button"
            onClick={() => setImageExpanded((current) => !current)}
            aria-label={imageExpanded ? "Belegfoto verkleinern" : "Belegfoto vergrößern"}
            aria-expanded={imageExpanded}
            className={`mb-3 block rounded-md focus:outline-none focus:ring-2 focus:ring-accent-500 ${
              imageExpanded ? "cursor-zoom-out" : "cursor-zoom-in"
            }`}
          >
            <img
              ref={attachImage}
              alt="Foto des Tankbelegs"
              className={`rounded-md border border-border object-contain ${
                imageExpanded ? "max-h-none" : "max-h-48"
              }`}
            />
          </button>
        ) : null}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Datum">
            <input
              ref={firstFieldRef}
              type="date"
              className={INPUT_CLASS}
              value={draft.date}
              onChange={(e) => set("date", e.target.value)}
            />
          </Field>
          <Field label="Zeit">
            <input
              type="time"
              className={INPUT_CLASS}
              value={draft.time}
              onChange={(e) => set("time", e.target.value)}
            />
          </Field>
          <Field label="Tankstelle">
            <input
              type="text"
              className={INPUT_CLASS}
              value={draft.station}
              onChange={(e) => set("station", e.target.value)}
            />
          </Field>
          <Field label="Ort">
            <input
              type="text"
              className={INPUT_CLASS}
              value={draft.location}
              onChange={(e) => set("location", e.target.value)}
            />
          </Field>
          <Field label="Kraftstoff">
            <input
              type="text"
              className={INPUT_CLASS}
              placeholder="Super E10"
              value={draft.fuelType}
              onChange={(e) => set("fuelType", e.target.value)}
            />
          </Field>
          <Field label="Liter" error={liters.invalid ? INVALID_NUMBER : null}>
            <input
              type="text"
              inputMode="decimal"
              className={NUMERIC_CLASS}
              placeholder="0,00"
              aria-invalid={liters.invalid || undefined}
              value={draft.liters}
              onChange={(e) => set("liters", e.target.value)}
            />
          </Field>
          <Field label="Preis €/l" error={pricePerLiter.invalid ? INVALID_NUMBER : null}>
            <input
              type="text"
              inputMode="decimal"
              className={NUMERIC_CLASS}
              placeholder="0,000"
              aria-invalid={pricePerLiter.invalid || undefined}
              value={draft.pricePerLiter}
              onChange={(e) => set("pricePerLiter", e.target.value)}
            />
          </Field>
          <Field label="Betrag €" error={total.invalid ? INVALID_NUMBER : null}>
            <input
              type="text"
              inputMode="decimal"
              className={NUMERIC_CLASS}
              placeholder="0,00"
              aria-invalid={total.invalid || undefined}
              value={draft.total}
              onChange={(e) => set("total", e.target.value)}
            />
          </Field>
          <Field
            label="km-Stand (optional)"
            error={odometer.invalid ? "Ganze Kilometer, z. B. 123.456" : null}
          >
            <input
              type="text"
              inputMode="numeric"
              className={NUMERIC_CLASS}
              placeholder="z. B. 123.456"
              aria-invalid={odometer.invalid || undefined}
              value={draft.odometer}
              onChange={(e) => set("odometer", e.target.value)}
            />
          </Field>
        </div>

        {/* One polite live region: warnings are announced as they appear while typing. */}
        <div aria-live="polite">
          {showPlausibilityWarning ? (
            <p className="mt-3 flex items-start gap-2 text-sm text-warning">
              <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
              {PLAUSIBILITY_WARNING}
            </p>
          ) : null}
          {showDuplicateWarning ? (
            <p className="mt-3 flex items-start gap-2 text-sm text-warning">
              <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
              {DUPLICATE_WARNING}
            </p>
          ) : null}
          {saveError ? (
            <p className="mt-3 flex items-start gap-2 text-sm text-danger">
              <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
              Speichern fehlgeschlagen — bitte erneut versuchen.
            </p>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={!saveable || saving}>
            {saving ? "Speichert …" : entry ? "Speichern" : "Übernehmen"}
          </Button>
          {onRetry ? (
            <Button variant="secondary" onClick={onRetry}>
              <RotateCcw size={16} aria-hidden="true" />
              Erneut versuchen
            </Button>
          ) : null}
          {onDiscard ? (
            <Button variant="ghost" onClick={onDiscard}>
              {entry ? null : <Trash2 size={16} aria-hidden="true" />}
              {entry ? "Abbrechen" : "Verwerfen"}
            </Button>
          ) : null}
          {saveHint ? <span className="text-xs text-fg-muted">{saveHint}</span> : null}
        </div>
      </form>
    </Card>
  );
}
