import { Download, Pencil, ReceiptText, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { deleteEntry, sortNewestFirst, updateEntry } from "../../lib/db/entries.ts";
import { getDB, useLiveQuery } from "../../lib/db/index.ts";
import type { FuelEntry } from "../../lib/db/types.ts";
import { QueryFallback } from "../../lib/QueryFallback.tsx";
import { Badge, Button, Card, EmptyState, PageHeader } from "../../lib/ui/index.ts";
import { CSV_FILENAME, entriesToCsv } from "../../lib/utils/csv.ts";
import { downloadFile } from "../../lib/utils/download.ts";
import {
  formatCurrency,
  formatDate,
  formatKilometers,
  formatLiters,
  formatPricePerLiter,
} from "../../lib/utils/format.ts";
import { ReviewCard } from "../erfassen/ReviewCard.tsx";

/** "V-Markt vom 05.03.2026" — context for per-row button labels. */
function describeEntry(entry: FuelEntry): string {
  const station = entry.station || "Unbekannte Tankstelle";
  return entry.date ? `${station} vom ${formatDate(entry.date)}` : `${station} ohne Datum`;
}

function EntryRow({
  entry,
  onEdit,
  restoreFocus,
}: {
  entry: FuelEntry;
  onEdit: () => void;
  /** The row's edit card just closed: hand focus back to its edit button. */
  restoreFocus: boolean;
}) {
  const editRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (restoreFocus) editRef.current?.focus();
  }, [restoreFocus]);

  function handleDelete(): void {
    if (window.confirm(`Beleg ${describeEntry(entry)} wirklich löschen?`)) {
      void deleteEntry(entry.id);
    }
  }

  return (
    <li className="flex items-center gap-3 border-b border-dashed border-border py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {entry.station || "Unbekannte Tankstelle"}
          {entry.location ? <span className="text-fg-muted"> · {entry.location}</span> : null}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-fg-muted">
          <span className="font-mono tabular-nums">
            {entry.date ? formatDate(entry.date) : "ohne Datum"}
            {entry.time ? ` ${entry.time}` : ""}
          </span>
          {entry.fuelType ? <Badge>{entry.fuelType}</Badge> : null}
          {entry.source === "manual" ? <Badge variant="neutral">manuell</Badge> : null}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-mono text-sm tabular-nums">
          {entry.total !== null ? formatCurrency(entry.total) : "—"}
        </p>
        <p className="mt-0.5 font-mono text-xs tabular-nums text-fg-muted">
          {entry.liters !== null ? formatLiters(entry.liters) : "—"}
          {entry.pricePerLiter !== null ? ` · ${formatPricePerLiter(entry.pricePerLiter)}` : ""}
        </p>
        {entry.odometer !== null ? (
          <p className="mt-0.5 font-mono text-xs tabular-nums text-fg-subtle">
            {formatKilometers(entry.odometer)}
          </p>
        ) : null}
      </div>
      <Button
        ref={editRef}
        variant="ghost"
        size="sm"
        aria-label={`Beleg ${describeEntry(entry)} bearbeiten`}
        onClick={onEdit}
      >
        <Pencil size={16} aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Beleg ${describeEntry(entry)} löschen`}
        onClick={handleDelete}
      >
        <Trash2 size={16} aria-hidden="true" />
      </Button>
    </li>
  );
}

export function BelegePage() {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [lastEditedId, setLastEditedId] = useState<string | null>(null);
  const { data, loading, error } = useLiveQuery("entries", async () => {
    const db = await getDB();
    return sortNewestFirst(await db.getAll("entries"));
  });
  const entries = data ?? [];

  const totalLiters = entries.reduce((sum, entry) => sum + (entry.liters ?? 0), 0);
  const totalCost = entries.reduce((sum, entry) => sum + (entry.total ?? 0), 0);

  function startEditing(id: string): void {
    setLastEditedId(null);
    setEditingId(id);
  }

  function stopEditing(): void {
    setLastEditedId(editingId);
    setEditingId(null);
  }

  return (
    <>
      <PageHeader
        title="Belege"
        subtitle={
          data === undefined
            ? undefined
            : `${entries.length} ${entries.length === 1 ? "Eintrag" : "Einträge"}`
        }
        actions={
          <Button
            variant="secondary"
            disabled={entries.length === 0}
            className="disabled:opacity-50"
            onClick={() => downloadFile(entriesToCsv(entries), CSV_FILENAME, "text/csv")}
          >
            <Download size={16} aria-hidden="true" />
            CSV-Export
          </Button>
        }
      />

      {data === undefined ? (
        <QueryFallback loading={loading} error={error} />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<ReceiptText size={40} aria-hidden="true" />}
          title="Noch keine Belege"
          description="Erfasse deinen ersten Tankbeleg per Foto oder manuell."
        />
      ) : (
        <Card className="py-1">
          <ul>
            {entries.map((entry) =>
              entry.id === editingId ? (
                <li
                  key={entry.id}
                  className="border-b border-dashed border-border py-3 last:border-b-0"
                >
                  <ReviewCard
                    entry={entry}
                    source={entry.source}
                    focusOnMount
                    onSave={async (updated) => {
                      await updateEntry(updated);
                      stopEditing();
                    }}
                    onDiscard={stopEditing}
                  />
                </li>
              ) : (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  onEdit={() => startEditing(entry.id)}
                  restoreFocus={entry.id === lastEditedId}
                />
              ),
            )}
          </ul>
          {/* bottom-16 clears the fixed mobile bottom nav (main has pb-16). */}
          <div className="sticky bottom-16 flex items-center justify-between border-t border-border bg-surface pt-3 pb-2 text-sm md:bottom-0">
            <span className="text-fg-muted">Gesamt</span>
            <span className="font-mono tabular-nums">
              {formatLiters(totalLiters)} · {formatCurrency(totalCost)}
            </span>
          </div>
        </Card>
      )}
    </>
  );
}
