import { Download, ReceiptText, Trash2 } from "lucide-react";
import {
  deleteEntry,
  type FuelEntry,
  getDB,
  sortNewestFirst,
  useLiveQuery,
} from "../../lib/db/index.ts";
import { Badge, Button, Card, EmptyState, PageHeader } from "../../lib/ui/index.ts";
import { CSV_FILENAME, entriesToCsv } from "../../lib/utils/csv.ts";
import {
  formatCurrency,
  formatDate,
  formatKilometers,
  formatLiters,
  formatPricePerLiter,
} from "../../lib/utils/format.ts";

function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function EntryRow({ entry }: { entry: FuelEntry }) {
  function handleDelete(): void {
    if (window.confirm("Diesen Beleg wirklich löschen?")) {
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
      <Button variant="ghost" size="sm" aria-label="Beleg löschen" onClick={handleDelete}>
        <Trash2 size={16} aria-hidden="true" />
      </Button>
    </li>
  );
}

export function BelegePage() {
  const { data } = useLiveQuery("entries", async () => {
    const db = await getDB();
    return sortNewestFirst(await db.getAll("entries"));
  });
  const entries = data ?? [];

  const totalLiters = entries.reduce((sum, entry) => sum + (entry.liters ?? 0), 0);
  const totalCost = entries.reduce((sum, entry) => sum + (entry.total ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Belege"
        subtitle={`${entries.length} ${entries.length === 1 ? "Eintrag" : "Einträge"}`}
        actions={
          <Button
            variant="secondary"
            disabled={entries.length === 0}
            onClick={() => downloadFile(entriesToCsv(entries), CSV_FILENAME, "text/csv")}
          >
            <Download size={16} aria-hidden="true" />
            CSV-Export
          </Button>
        }
      />

      {entries.length === 0 ? (
        <EmptyState
          icon={<ReceiptText size={40} aria-hidden="true" />}
          title="Noch keine Belege"
          description="Erfasse deinen ersten Tankbeleg per Foto oder manuell."
        />
      ) : (
        <Card className="py-1">
          <ul>
            {entries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} />
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-border pt-3 pb-2 text-sm">
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
