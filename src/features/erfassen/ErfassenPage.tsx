import { Camera, ImagePlus, KeyRound, PencilLine, Trash2 } from "lucide-react";
import { type ChangeEvent, type DragEvent, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { addEntry } from "../../lib/db/entries.ts";
import { getDB, useLiveQuery } from "../../lib/db/index.ts";
import type { ScanJob } from "../../lib/db/types.ts";
import { deleteJob, enqueueScan, retryJob } from "../../lib/queue/processor.ts";
import { ROUTES } from "../../lib/routes.ts";
import { getApiKey } from "../../lib/settings.ts";
import { Badge, Button, Card, EmptyState, PageHeader, Spinner } from "../../lib/ui/index.ts";
import { ReviewCard } from "./ReviewCard.tsx";

function QueueRow({ job }: { job: ScanJob }) {
  return (
    <Card className="flex items-center gap-3 py-3">
      {job.status === "processing" ? (
        <Spinner size="sm" label="Beleg wird gelesen …" />
      ) : (
        <Spinner size="sm" className="opacity-40" label="Wartet" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          {job.status === "processing" ? "Beleg wird gelesen …" : "Wartet auf Extraktion"}
        </p>
        {job.lastError ? <p className="truncate text-xs text-fg-muted">{job.lastError}</p> : null}
      </div>
      {job.attempts > 0 ? <Badge variant="warning">{job.attempts}. Versuch</Badge> : null}
      <Button
        variant="ghost"
        size="sm"
        aria-label="Scan verwerfen"
        onClick={() => void deleteJob(job.id)}
      >
        <Trash2 size={16} aria-hidden="true" />
      </Button>
    </Card>
  );
}

export function ErfassenPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const hasApiKey = getApiKey() !== "";

  const { data: jobs } = useLiveQuery("scanQueue", async () => {
    const db = await getDB();
    const all = await db.getAll("scanQueue");
    return all.sort((a, b) => a.createdAt - b.createdAt);
  });

  async function handleFiles(files: FileList | null): Promise<void> {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.type.startsWith("image/")) await enqueueScan(file);
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>): void {
    void handleFiles(event.target.files);
    event.target.value = "";
  }

  function onDrop(event: DragEvent): void {
    event.preventDefault();
    void handleFiles(event.dataTransfer.files);
  }

  const queueRows = (jobs ?? []).filter(
    (job) => job.status === "pending" || job.status === "processing",
  );
  const reviewJobs = (jobs ?? []).filter(
    (job) => job.status === "review" || job.status === "failed",
  );

  return (
    <>
      <PageHeader
        title="Erfassen"
        subtitle="Beleg fotografieren — die Daten werden automatisch ausgelesen"
        actions={
          <Button variant="secondary" onClick={() => setManualOpen(true)}>
            <PencilLine size={16} aria-hidden="true" />
            Manuell erfassen
          </Button>
        }
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={onInputChange}
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* biome-ignore lint/a11y/noStaticElementInteractions: drop target wraps a real button */}
      <div
        onDrop={onDrop}
        onDragOver={(event) => event.preventDefault()}
        className="mb-6 rounded-lg border-2 border-dashed border-border bg-surface-muted p-8 text-center"
      >
        <Camera size={32} aria-hidden="true" className="mx-auto mb-3 text-fg-subtle" />
        <p className="mb-4 text-sm text-fg-muted">
          Tankbeleg fotografieren oder Foto hierher ziehen
        </p>
        <Button onClick={() => fileInputRef.current?.click()}>
          <ImagePlus size={16} aria-hidden="true" />
          Foto auswählen
        </Button>
        {!hasApiKey ? (
          <p className="mt-4 flex items-center justify-center gap-2 text-sm text-fg-muted">
            <KeyRound size={16} aria-hidden="true" />
            <span>
              Für die automatische Extraktion fehlt ein API-Key —{" "}
              <Link to={ROUTES.einstellungen} className="text-accent-600 underline">
                in den Einstellungen einrichten
              </Link>
              . Fotos bleiben gespeichert.
            </span>
          </p>
        ) : null}
      </div>

      <div className="space-y-4">
        {queueRows.map((job) => (
          <QueueRow key={job.id} job={job} />
        ))}

        {reviewJobs.map((job) => (
          <ReviewCard
            key={job.id}
            source="scan"
            initial={job.result}
            image={job.image}
            errorMessage={job.status === "failed" ? job.lastError : null}
            onSave={async (entry) => {
              await addEntry(entry);
              await deleteJob(job.id);
            }}
            onDiscard={() => void deleteJob(job.id)}
            onRetry={job.status === "failed" ? () => void retryJob(job.id) : undefined}
          />
        ))}

        {manualOpen ? (
          <ReviewCard
            source="manual"
            onSave={async (entry) => {
              await addEntry(entry);
              setManualOpen(false);
            }}
            onDiscard={() => setManualOpen(false)}
          />
        ) : null}

        {queueRows.length === 0 && reviewJobs.length === 0 && !manualOpen ? (
          <EmptyState
            icon={<Camera size={40} aria-hidden="true" />}
            title="Keine offenen Scans"
            description="Fotografiere einen Tankbeleg oder erfasse einen Eintrag manuell."
          />
        ) : null}
      </div>
    </>
  );
}
