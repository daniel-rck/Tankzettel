import {
  CheckCircle2,
  Download,
  KeyRound,
  ShieldCheck,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { type ChangeEvent, type KeyboardEvent, useRef, useState } from "react";
import { deleteAllEntries } from "../../lib/db/entries.ts";
import { getDB } from "../../lib/db/index.ts";
import { DEFAULT_MODEL, type KeyTestResult, testApiKey } from "../../lib/gemini/index.ts";
import { drainQueue } from "../../lib/queue/processor.ts";
import { getApiKey, getModel, setApiKey, setModel } from "../../lib/settings.ts";
import { Button, Card, PageHeader, Spinner } from "../../lib/ui/index.ts";
import {
  backupFilename,
  createBackup,
  type ImportReport,
  importBackup,
} from "../../lib/utils/backup.ts";
import { downloadFile } from "../../lib/utils/download.ts";

const INPUT_CLASS =
  "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg " +
  "focus:outline-none focus:ring-2 focus:ring-accent-500";

type KeyTestState = "idle" | "testing" | KeyTestResult;

const KEY_TEST_FAILURE: Record<Exclude<KeyTestResult, "ok">, string> = {
  invalid: "Key ungültig",
  model: "Modell nicht gefunden — Modell-ID prüfen",
  network: "Keine Verbindung — später erneut testen",
};

type Notice = { tone: "ok" | "error"; text: string };

function NoticeText({ notice }: { notice: Notice | null }) {
  // The live region stays mounted so screen readers announce each update.
  return (
    <p
      role="status"
      aria-live="polite"
      className={`text-sm empty:hidden ${notice?.tone === "error" ? "text-danger" : "text-fg-muted"}`}
    >
      {notice?.text}
    </p>
  );
}

async function exportBackup(): Promise<void> {
  const db = await getDB();
  const entries = await db.getAll("entries");
  downloadFile(createBackup(entries), backupFilename(), "application/json");
}

function describeImport(report: ImportReport): string {
  const parts = [
    `${report.added} neu`,
    `${report.updated} aktualisiert`,
    `${report.skipped} unverändert`,
  ];
  if (report.invalid > 0) parts.push(`${report.invalid} ungültig übersprungen`);
  return `Import abgeschlossen: ${parts.join(", ")}.`;
}

function commitOnEnter(commit: () => void) {
  return (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") commit();
  };
}

export function EinstellungenPage() {
  const [apiKey, setApiKeyState] = useState(getApiKey);
  const [model, setModelState] = useState(getModel);
  const [keyTest, setKeyTest] = useState<KeyTestState>("idle");
  const [backupNotice, setBackupNotice] = useState<Notice | null>(null);
  const [dangerNotice, setDangerNotice] = useState<Notice | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Persist on blur/Enter, not per keystroke: every save may drain the queue,
  // and a half-typed key would fail pending scans as "API-Key ungültig".
  function commitApiKey(): void {
    const trimmed = apiKey.trim();
    setApiKeyState(trimmed);
    if (trimmed === getApiKey()) return;
    setApiKey(trimmed);
    setKeyTest("idle");
    // A fresh key may unblock waiting scan jobs.
    if (trimmed !== "") void drainQueue();
  }

  function commitModel(): void {
    const trimmed = model.trim();
    setModelState(trimmed);
    // An empty field falls back to the default model — not a change if that's current.
    if ((trimmed || DEFAULT_MODEL) === getModel()) return;
    setModel(trimmed);
    setKeyTest("idle");
    if (getApiKey() !== "") void drainQueue();
  }

  async function handleKeyTest(): Promise<void> {
    commitApiKey();
    commitModel();
    setKeyTest("testing");
    setKeyTest(await testApiKey({ apiKey: getApiKey(), model: getModel() }));
  }

  async function handleExport(): Promise<void> {
    try {
      await exportBackup();
      setBackupNotice({ tone: "ok", text: "Backup-Datei wurde erstellt." });
    } catch {
      setBackupNotice({ tone: "error", text: "Backup konnte nicht erstellt werden." });
    }
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const report = await importBackup(await file.text());
      setBackupNotice({ tone: "ok", text: describeImport(report) });
    } catch (error) {
      setBackupNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Import fehlgeschlagen.",
      });
    }
  }

  async function handleDeleteAll(): Promise<void> {
    if (
      !window.confirm("Wirklich ALLE Belege löschen? Das kann nicht rückgängig gemacht werden.")
    ) {
      return;
    }
    try {
      await deleteAllEntries();
      setDangerNotice({ tone: "ok", text: "Alle Belege wurden gelöscht." });
    } catch {
      setDangerNotice({ tone: "error", text: "Löschen fehlgeschlagen." });
    }
  }

  return (
    <>
      <PageHeader title="Einstellungen" />
      <div className="space-y-4">
        <Card>
          <h3 className="mb-1 flex items-center gap-2 text-base font-medium">
            <KeyRound size={18} aria-hidden="true" />
            Gemini API-Key
          </h3>
          <p className="mb-3 text-sm text-fg-muted">
            Die Beleg-Erkennung nutzt Google Gemini mit deinem eigenen, kostenlosen API-Key.
            Erstelle ihn unter{" "}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
              className="text-accent-600 underline"
            >
              aistudio.google.com/apikey
            </a>{" "}
            und füge ihn hier ein. Ohne Key funktioniert alles außer der automatischen Extraktion.
          </p>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-fg-muted">API-Key</span>
            <input
              type="password"
              autoComplete="off"
              className={INPUT_CLASS}
              spellCheck={false}
              value={apiKey}
              onChange={(e) => setApiKeyState(e.target.value)}
              onBlur={commitApiKey}
              onKeyDown={commitOnEnter(commitApiKey)}
            />
          </label>
          <label className="mt-3 flex flex-col gap-1 text-sm">
            <span className="text-fg-muted">Modell</span>
            <input
              type="text"
              className={`${INPUT_CLASS} font-mono`}
              placeholder={DEFAULT_MODEL}
              spellCheck={false}
              value={model}
              onChange={(e) => setModelState(e.target.value)}
              onBlur={commitModel}
              onKeyDown={commitOnEnter(commitModel)}
            />
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-3" aria-live="polite">
            <Button
              variant="secondary"
              disabled={apiKey.trim() === "" || keyTest === "testing"}
              className="disabled:opacity-50"
              onClick={() => void handleKeyTest()}
            >
              Key testen
            </Button>
            {keyTest === "testing" ? <Spinner size="sm" label="Key wird getestet …" /> : null}
            {keyTest === "ok" ? (
              <span className="flex items-center gap-1 text-sm text-success">
                <CheckCircle2 size={16} aria-hidden="true" /> Key funktioniert
              </span>
            ) : null}
            {keyTest === "invalid" || keyTest === "model" || keyTest === "network" ? (
              <span className="flex items-center gap-1 text-sm text-danger">
                <XCircle size={16} aria-hidden="true" /> {KEY_TEST_FAILURE[keyTest]}
              </span>
            ) : null}
          </div>
        </Card>

        <Card>
          <h3 className="mb-1 text-base font-medium">Backup</h3>
          <p className="mb-3 text-sm text-fg-muted">
            Alle Belege als JSON-Datei sichern oder wiederherstellen. Der Browser kann lokale Daten
            im Ausnahmefall löschen — ein regelmäßiges Backup ist die einzige Absicherung.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void handleExport()}>
              <Download size={16} aria-hidden="true" />
              Backup exportieren
            </Button>
            <Button variant="secondary" onClick={() => importInputRef.current?.click()}>
              <Upload size={16} aria-hidden="true" />
              Backup importieren
            </Button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => void handleImport(e)}
              aria-hidden="true"
              tabIndex={-1}
            />
          </div>
          <div className="mt-3">
            <NoticeText notice={backupNotice} />
          </div>
        </Card>

        <Card>
          <h3 className="mb-1 flex items-center gap-2 text-base font-medium">
            <ShieldCheck size={18} aria-hidden="true" />
            Datenschutz
          </h3>
          <p className="text-sm text-fg-muted">
            Alle Daten bleiben auf diesem Gerät. Ein Belegfoto verlässt das Gerät nur für die
            Extraktion — an Googles Gemini-API mit deinem eigenen Key. Im kostenlosen Tarif kann
            Google die Daten zum Training verwenden. Keine Konten, keine Telemetrie, keine weiteren
            Anfragen an Dritte.
          </p>
        </Card>

        <Card className="border-danger/40">
          <h3 className="mb-1 text-base font-medium text-danger">Gefahrenzone</h3>
          <p className="mb-3 text-sm text-fg-muted">
            Löscht alle gespeicherten Belege unwiderruflich. Einstellungen bleiben erhalten.
          </p>
          <Button variant="danger" onClick={() => void handleDeleteAll()}>
            <Trash2 size={16} aria-hidden="true" />
            Alle Belege löschen
          </Button>
          <div className="mt-3">
            <NoticeText notice={dangerNotice} />
          </div>
        </Card>
      </div>
    </>
  );
}
