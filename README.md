# Tankzettel

Local-First-PWA zum Erfassen und Auswerten von Tankbelegen: Beleg
fotografieren, die Daten werden per Gemini Flash (eigener, kostenloser
API-Key) automatisch ausgelesen, in einer Review-Karte geprüft und lokal
gespeichert. Keine Accounts, kein Backend, keine Telemetrie.

**App:** https://tankzettel.daniel-rck.workers.dev

## Funktionen

- **Erfassen** — Beleg fotografieren (oder Foto auswählen), automatische
  Extraktion von Datum, Tankstelle, Litern, Preis und Betrag; Review-Karte
  zum Korrigieren; manuelle Erfassung ohne Foto.
- **Offline-fähig** — Fotos werden lokal gespeichert und automatisch
  extrahiert, sobald wieder eine Verbindung besteht. Ohne API-Key bleibt
  alles außer der Extraktion voll nutzbar.
- **Belege** — Liste aller Tankungen, Löschen, CSV-Export (Excel-DE-tauglich).
- **Auswertung** — Kennzahlen, Preisverlauf, Kosten pro Monat und
  Ø-Verbrauch (sobald km-Stände erfasst sind).
- **Backup** — Export/Import aller Belege als JSON-Datei.

## API-Key einrichten

Die Beleg-Erkennung nutzt Google Gemini mit deinem eigenen API-Key
(kostenlos): unter [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
erstellen und in den Einstellungen der App eintragen. Der Key wird nur
lokal gespeichert und ausschließlich für die Extraktion verwendet.

## Datenschutz

Alle Daten bleiben auf dem Gerät (IndexedDB). Ein Belegfoto verlässt das
Gerät nur für die Extraktion — an Googles Gemini-API mit deinem eigenen
Key; im kostenlosen Tarif kann Google diese Daten zum Training verwenden.
Es gibt keine Konten, keine Telemetrie und keine weiteren Anfragen an
Dritte. Da der Browser lokale Daten im Ausnahmefall löschen kann, ist das
JSON-Backup die einzige Absicherung — regelmäßig exportieren.

## Entwicklung

Basis ist die Foundation [`daniel-rck/web-base`](https://github.com/daniel-rck/web-base)
(Stack, Layout-System, Konventionen). Die App-Spezifikation liegt in
[`docs/specs/00-tankzettel.md`](docs/specs/00-tankzettel.md).

```bash
bun install
bun run dev        # Vite-Dev-Server
bun run lint       # Biome
bun run typecheck  # tsc (App + SW + Worker)
bun run test       # Vitest
bun run build      # SPA + PWA
```
