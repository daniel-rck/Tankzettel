import {
  CheckCircle2,
  Download,
  KeyRound,
  ShieldCheck,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { type ChangeEvent, useRef, useState } from "react";
import { deleteAllEntries, getDB } from "../../lib/db/index.ts";
import { DEFAULT_MODEL, testApiKey } from "../../lib/gemini/index.ts";
import { drainQueue } from "../../lib/queue/processor.ts";
import { getApiKey, getModel, setApiKey, setModel } from "../../lib/settings.ts";
import { Button, Card, PageHeader, Spinner } from "../../lib/ui/index.ts";
import { BACKUP_FILENAME, createBackup, importBackup } from "../../lib/utils/backup.ts";

const INPUT_CLASS =
  "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg " +
  "focus:outline-none focus:ring-2 focus:ring-accent-500";

type KeyTestState = "idle" | "testing" | "ok" | "fail";

export function EinstellungenPage() {
  const [apiKey, setApiKeyState] = useState(getApiKey);
  const [model, setModelState] = useState(getModel);
  const [keyTest, setKeyTest] = useState<KeyTestState>("idle");
  const [importReport, setImportReport] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  function saveApiKey(value: string): void {
    setApiKeyState(value);
    setApiKey(value);
    setKeyTest("idle");
    // A fresh key may unblock waiting scan jobs.
    if (value.trim() !== "") void drainQueue();
  }

  function saveModel(value: string): void {
    setModelState(value);
    setModel(value);
  }

  async function handleKeyTest(): Promise<void> {
    setKeyTest("testing");
    const ok = await testApiKey({ apiKey: getApiKey(), model: getModel() });
    setKeyTest(ok ? "ok" : "fail");
  }

  async function handleExport(): Promise<void> {
    const db = await getDB();
    const entries = await db.getAll("entries");
    const blob = new Blob([createBackup(entries)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = BACKUP_FILENAME;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const report = await importBackup(await file.text());
      setImportReport(
        `Import abgeschlossen: ${report.added} neu, ${report.updated} aktualisiert, ${report.skipped} unverändert.`,
      );
    } catch (error) {
      setImportReport(error instanceof Error ? error.message : "Import fehlgeschlagen.");
    }
  }

  function handleDeleteAll(): void {
    if (window.confirm("Wirklich ALLE Belege löschen? Das kann nicht rückgängig gemacht werden.")) {
      void deleteAllEntries();
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
              value={apiKey}
              onChange={(e) => saveApiKey(e.target.value)}
            />
          </label>
          <label className="mt-3 flex flex-col gap-1 text-sm">
            <span className="text-fg-muted">Modell</span>
            <input
              type="text"
              className={`${INPUT_CLASS} font-mono`}
              placeholder={DEFAULT_MODEL}
              value={model}
              onChange={(e) => saveModel(e.target.value)}
            />
          </label>
          <div className="mt-3 flex items-center gap-3">
            <Button
              variant="secondary"
              disabled={apiKey.trim() === "" || keyTest === "testing"}
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
            {keyTest === "fail" ? (
              <span className="flex items-center gap-1 text-sm text-danger">
                <XCircle size={16} aria-hidden="true" /> Key oder Modell ungültig
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
          {importReport ? <p className="mt-3 text-sm text-fg-muted">{importReport}</p> : null}
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
          <Button variant="danger" onClick={handleDeleteAll}>
            <Trash2 size={16} aria-hidden="true" />
            Alle Belege löschen
          </Button>
        </Card>
      </div>
    </>
  );
}
