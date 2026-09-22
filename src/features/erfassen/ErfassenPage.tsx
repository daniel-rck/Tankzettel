import {
  AlertTriangle,
  Camera,
  Clock,
  ImagePlus,
  KeyRound,
  PencilLine,
  Trash2,
} from "lucide-react";
import { type ChangeEvent, type DragEvent, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { addEntry } from "../../lib/db/entries.ts";
import { getDB, useLiveQuery } from "../../lib/db/index.ts";
import type { ScanJob } from "../../lib/db/types.ts";
import { isConfigErrorMessage } from "../../lib/gemini/index.ts";
import { QueryFallback } from "../../lib/QueryFallback.tsx";
import { deleteJob, enqueueScan, retryJob } from "../../lib/queue/processor.ts";
import { ROUTES } from "../../lib/routes.ts";
import { getApiKey } from "../../lib/settings.ts";
import { Badge, Button, Card, EmptyState, PageHeader, Spinner } from "../../lib/ui/index.ts";
import { ReviewCard } from "./ReviewCard.tsx";

const SETTINGS_LINK_CLASS = "text-accent-600 underline underline-offset-2";

// IndexedDB hands out a fresh Blob per read, so every queue mutation would
// give each review card a "new" photo (new object URL, image reload). A job's
// image never changes — reuse the first Blob seen per job id.
const imageCache = new Map<string, Blob>();

async function loadJobs(): Promise<ScanJob[]> {
  const db = await getDB();
  const all = await db.getAll("scanQueue");
  const ids = new Set(all.map((job) => job.id));
  for (const id of imageCache.keys()) {
    if (!ids.has(id)) imageCache.delete(id);
  }
  return all
    .map((job) => {
      const cached = imageCache.get(job.id);
      if (cached) return { ...job, image: cached };
      imageCache.set(job.id, job.image);
      return job;
    })
    .toSorted((a, b) => a.createdAt - b.createdAt);
}

function scanTime(job: ScanJob): string {
  return new Date(job.createdAt).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function confirmDiscard(job: ScanJob): void {
  if (window.confirm("Scan verwerfen? Das Belegfoto wird dabei gelöscht.")) {
    void deleteJob(job.id);
  }
}

function QueueRow({ job, hasApiKey }: { job: ScanJob; hasApiKey: boolean }) {
  const processing = job.status === "processing";
  return (
    <Card className="flex items-center gap-3 py-3">
      {processing ? (
        <Spinner size="sm" label="Beleg wird gelesen …" />
      ) : (
        <Clock size={16} aria-hidden="true" className="shrink-0 text-fg-subtle" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          {processing ? (
            "Beleg wird gelesen …"
          ) : hasApiKey ? (
            "Wartet auf Extraktion"
          ) : (
            <>
              Wartet auf API-Key —{" "}
              <Link to={ROUTES.einstellungen} className={SETTINGS_LINK_CLASS}>
                einrichten
              </Link>
            </>
          )}
        </p>
        {job.lastError ? <p className="truncate text-xs text-fg-muted">{job.lastError}</p> : null}
      </div>
      {job.attempts > 0 ? (
        <Badge variant="warning">
          {job.attempts} {job.attempts === 1 ? "Fehlversuch" : "Fehlversuche"}
        </Badge>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Scan von ${scanTime(job)} Uhr verwerfen`}
        onClick={() => confirmDiscard(job)}
      >
        <Trash2 size={16} aria-hidden="true" />
      </Button>
    </Card>
  );
}

export function ErfassenPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [preparing, setPreparing] = useState(0);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const hasApiKey = getApiKey() !== "";

  const { data: jobs, loading, error } = useLiveQuery("scanQueue", loadJobs);

  async function handleFiles(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    const images = list.filter((file) => file.type.startsWith("image/"));
    const skipped = list.filter((file) => !file.type.startsWith("image/")).map((f) => f.name);
    setIntakeError(null);
    setPreparing((count) => count + images.length);
    for (const file of images) {
      try {
        await enqueueScan(file);
      } catch (cause) {
        // Undecodable formats (e.g. HEIC outside Safari) or corrupt files.
        console.warn("could not enqueue scan", cause);
        skipped.push(file.name);
      } finally {
        setPreparing((count) => count - 1);
      }
    }
    if (skipped.length > 0) {
      setIntakeError(
        `${skipped.length === 1 ? "Eine Datei konnte" : `${skipped.length} Dateien konnten`} nicht als Foto gelesen werden: ${skipped.join(", ")}. Bitte als JPEG oder PNG aufnehmen.`,
      );
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>): void {
    void handleFiles(event.target.files);
    event.target.value = "";
  }

  function onDrop(event: DragEvent): void {
    event.preventDefault();
    setDragActive(false);
    void handleFiles(event.dataTransfer.files);
  }

  function onDragLeave(event: DragEvent): void {
    // Ignore leave events fired when moving over child elements.
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDragActive(false);
    }
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
          <Button
            variant="secondary"
            onClick={() => setManualOpen(true)}
            disabled={manualOpen}
            className="disabled:opacity-50"
          >
            <PencilLine size={16} aria-hidden="true" />
            Manuell erfassen
          </Button>
        }
      />

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onInputChange}
        aria-hidden="true"
        tabIndex={-1}
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

      <div
        onDrop={onDrop}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={onDragLeave}
        className={`mb-6 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          dragActive ? "border-accent-500 bg-accent-100/40" : "border-border bg-surface-muted"
        }`}
      >
        <Camera size={32} aria-hidden="true" className="mx-auto mb-3 text-fg-subtle" />
        <p className="mb-4 text-sm text-fg-muted">
          Tankbeleg fotografieren, auswählen oder hierher ziehen
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={() => cameraInputRef.current?.click()}>
            <Camera size={16} aria-hidden="true" />
            Foto aufnehmen
          </Button>
          <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
            <ImagePlus size={16} aria-hidden="true" />
            Foto auswählen
          </Button>
        </div>
        <div aria-live="polite">
          {preparing > 0 ? (
            <p className="mt-4 flex items-center justify-center gap-2 text-sm text-fg-muted">
              <span aria-hidden="true" className="flex shrink-0">
                <Spinner size="sm" />
              </span>
              {preparing === 1
                ? "Foto wird vorbereitet …"
                : `${preparing} Fotos werden vorbereitet …`}
            </p>
          ) : null}
          {intakeError ? (
            <p className="mt-4 flex items-start justify-center gap-2 text-sm text-danger">
              <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
              {intakeError}
            </p>
          ) : null}
        </div>
        {hasApiKey ? null : (
          <p className="mt-4 flex items-center justify-center gap-2 text-sm text-fg-muted">
            <KeyRound size={16} aria-hidden="true" className="shrink-0" />
            <span>
              Für die automatische Extraktion fehlt ein API-Key —{" "}
              <Link to={ROUTES.einstellungen} className={SETTINGS_LINK_CLASS}>
                in den Einstellungen einrichten
              </Link>
              . Fotos bleiben gespeichert.
            </span>
          </p>
        )}
      </div>

      <div className="space-y-4">
        {/* The manual card leads: opened by the user, it must not land off-screen below the scans. */}
        {manualOpen ? (
          <ReviewCard
            source="manual"
            focusOnMount
            onSave={async (entry) => {
              await addEntry(entry);
              setManualOpen(false);
            }}
            onDiscard={() => setManualOpen(false)}
          />
        ) : null}

        <QueryFallback loading={loading && jobs === undefined} error={error} />

        {queueRows.map((job) => (
          <QueueRow key={job.id} job={job} hasApiKey={hasApiKey} />
        ))}

        {reviewJobs.map((job) => (
          <ReviewCard
            key={job.id}
            source="scan"
            initial={job.result}
            image={job.image}
            errorMessage={job.status === "failed" ? job.lastError : null}
            errorAction={
              job.status === "failed" && isConfigErrorMessage(job.lastError) ? (
                <Link to={ROUTES.einstellungen} className={SETTINGS_LINK_CLASS}>
                  Zu den Einstellungen
                </Link>
              ) : null
            }
            onSave={async (entry) => {
              await addEntry(entry);
              await deleteJob(job.id);
            }}
            onDiscard={() => confirmDiscard(job)}
            onRetry={job.status === "failed" ? () => void retryJob(job.id) : undefined}
          />
        ))}

        {jobs !== undefined && queueRows.length === 0 && reviewJobs.length === 0 && !manualOpen ? (
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
