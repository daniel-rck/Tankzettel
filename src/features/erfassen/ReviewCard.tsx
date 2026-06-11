import { AlertTriangle, RotateCcw, Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useId, useMemo, useState } from "react";
import {
  type EntrySource,
  type ExtractionResult,
  type FuelEntry,
  getDB,
  useLiveQuery,
} from "../../lib/db/index.ts";
import { Badge, Button, Card } from "../../lib/ui/index.ts";
import { parseDecimal } from "../../lib/utils/format.ts";
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
  /** Receipt photo to review against (scan jobs). */
  image?: Blob;
  /** German error message for failed jobs. */
  errorMessage?: string | null;
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

function toDraft(initial: ExtractionResult | null | undefined): Draft {
  return {
    date: initial?.date ?? "",
    time: initial?.time ?? "",
    station: initial?.station ?? "",
    location: initial?.location ?? "",
    fuelType: initial?.fuelType ?? "",
    liters: initial?.liters?.toString() ?? "",
    pricePerLiter: initial?.pricePerLiter?.toString() ?? "",
    total: initial?.total?.toString() ?? "",
    odometer: "",
  };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the input is always passed as children
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-fg-muted">{label}</span>
      {children}
    </label>
  );
}

const INPUT_CLASS =
  "h-10 rounded-md border border-border bg-surface px-3 text-sm text-fg " +
  "focus:outline-none focus:ring-2 focus:ring-accent-500";
const NUMERIC_CLASS = `${INPUT_CLASS} font-mono tabular-nums`;

export function ReviewCard({
  initial,
  image,
  errorMessage,
  source,
  onSave,
  onDiscard,
  onRetry,
}: ReviewCardProps) {
  const formId = useId();
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial));
  const [saving, setSaving] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!image) return;
    const url = URL.createObjectURL(image);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  const { data: entries } = useLiveQuery("entries", async () => {
    const db = await getDB();
    return db.getAll("entries");
  });

  const liters = parseDecimal(draft.liters);
  const pricePerLiter = parseDecimal(draft.pricePerLiter);
  const total = parseDecimal(draft.total);
  const odometer = parseDecimal(draft.odometer);

  const showPlausibilityWarning = hasPlausibilityIssue(liters, pricePerLiter, total);
  const showDuplicateWarning = useMemo(
    () => isLikelyDuplicate({ date: draft.date || null, total }, entries ?? []),
    [draft.date, total, entries],
  );
  const saveable = canSave(liters, total);

  function set<K extends keyof Draft>(key: K, value: string): void {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function handleSave(): Promise<void> {
    if (!saveable || saving) return;
    setSaving(true);
    try {
      const now = Date.now();
      await onSave({
        id: crypto.randomUUID(),
        date: draft.date || null,
        time: draft.time.trim() || null,
        station: draft.station.trim(),
        location: draft.location.trim(),
        fuelType: draft.fuelType.trim(),
        liters,
        pricePerLiter,
        total,
        odometer,
        source,
        createdAt: now,
        updatedAt: now,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card aria-labelledby={`${formId}-title`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 id={`${formId}-title`} className="text-base font-medium">
          {source === "manual" ? "Manuell erfassen" : "Beleg prüfen"}
        </h3>
        <Badge variant={errorMessage ? "danger" : "accent"}>
          {errorMessage ? "Fehlgeschlagen" : source === "manual" ? "Manuell" : "Scan"}
        </Badge>
      </div>

      {errorMessage ? (
        <p className="mb-3 flex items-start gap-2 text-sm text-danger">
          <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          {errorMessage}
        </p>
      ) : null}

      {imageUrl ? (
        <img
          src={imageUrl}
          alt="Foto des Tankbelegs"
          className="mb-3 max-h-48 rounded-md border border-border object-contain"
        />
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Datum">
          <input
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
        <Field label="Liter">
          <input
            type="text"
            inputMode="decimal"
            className={NUMERIC_CLASS}
            placeholder="0,00"
            value={draft.liters}
            onChange={(e) => set("liters", e.target.value)}
          />
        </Field>
        <Field label="Preis €/l">
          <input
            type="text"
            inputMode="decimal"
            className={NUMERIC_CLASS}
            placeholder="0,000"
            value={draft.pricePerLiter}
            onChange={(e) => set("pricePerLiter", e.target.value)}
          />
        </Field>
        <Field label="Betrag €">
          <input
            type="text"
            inputMode="decimal"
            className={NUMERIC_CLASS}
            placeholder="0,00"
            value={draft.total}
            onChange={(e) => set("total", e.target.value)}
          />
        </Field>
        <Field label="km-Stand (optional)">
          <input
            type="text"
            inputMode="decimal"
            className={NUMERIC_CLASS}
            placeholder="z.B. 123456"
            value={draft.odometer}
            onChange={(e) => set("odometer", e.target.value)}
          />
        </Field>
      </div>

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

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={() => void handleSave()} disabled={!saveable || saving}>
          Übernehmen
        </Button>
        {onRetry ? (
          <Button variant="secondary" onClick={onRetry}>
            <RotateCcw size={16} aria-hidden="true" />
            Erneut versuchen
          </Button>
        ) : null}
        {onDiscard ? (
          <Button variant="ghost" onClick={onDiscard}>
            <Trash2 size={16} aria-hidden="true" />
            Verwerfen
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
