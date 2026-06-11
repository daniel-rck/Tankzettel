# Claude-Code-Hinweise für Tankzettel

Local-First-PWA zum Erfassen und Auswerten von Tankbelegen: Beleg fotografieren,
Gemini Flash (eigener API-Key des Nutzers) extrahiert die Daten, Review-Karte,
speichern, auswerten. Keine Accounts, kein Backend, keine Telemetrie.

## Quelle der Wahrheit

1. **`docs/specs/00-tankzettel.md`** — die App-Spec. Vor jeder Arbeit lesen;
   bei Designänderungen im selben Change aktualisieren (living document).
2. **Foundation [`daniel-rck/web-base`](https://github.com/daniel-rck/web-base)**
   — Stack, Layout-System, Storage-/PWA-/Router-/CI-Konventionen. Bei
   ungeklärten Entscheidungen die minimale, zu den bestehenden Mustern
   passende Variante wählen. Scaffolding & Updates über die CLI
   (`bunx github:daniel-rck/web-base …`), nicht von Hand kopieren.

## Quality Gates

Vor jedem Commit grün halten:

```bash
bun run lint        # Biome (check)
bun run typecheck   # tsc (App + SW)
bun run test        # Vitest
bun run build       # SPA + PWA
```

## Konventionen (gemäß web-base)

- **Bun** als Runtime & Package-Manager (kein npm/yarn-Lockfile).
- **Biome** für Lint + Format — eine Config, kein ESLint/Prettier.
- **TypeScript strict** inkl. `noUncheckedIndexedAccess`;
  `verbatimModuleSyntax` (→ `import type`); `type` statt `interface`.
- **Deutsche UI + README, englischer Quellcode** (Bezeichner, Kommentare,
  Commits, `docs/specs/`).
- **App-Daten in IndexedDB** (`idb` + `useLiveQuery`), `localStorage` nur für
  Settings. Mutationen rufen `notifyMutation(store)` auf.
- Struktur: `src/lib/{db,gemini,queue,ui,utils}` + `src/features/<modul>/`
  (erfassen, belege, auswertung, einstellungen), Routen als typed constants.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`).

## App-spezifische Leitplanken

- **API-Key**: nur im `x-goog-api-key`-Header verwenden — nie als
  `?key=`-Query-Param, nie loggen, nie in Fehlermeldungen oder Exporte
  aufnehmen. Key liegt in `localStorage`, Zugriff ausschließlich über
  `src/lib/settings.ts`.
- **Model-ID** (`gemini-2.5-flash` als Default) ist eine Konstante mit
  Settings-Override — beim Implementieren die aktuell gültige
  Free-Tier-ID in AI Studio verifizieren, nicht blind übernehmen.
- **Jeder Scan läuft durch die `scanQueue`** (auch online): ein Codepfad,
  sequenzielle Verarbeitung, Backoff bei 429/5xx — Details in Spec §5.
- **Offline-first ernst nehmen**: ohne Key und ohne Netz bleibt alles außer
  der Extraktion voll nutzbar.
- **Design**: Layout-System unverändert übernehmen, `theme.css` nur
  `--accent-h: 55`. Erlaubte Abweichung „receipt treatment" (Mono-Ziffern,
  dashed/dotted Trenner) nur additiv — Spec §9.
- **Charts mit chart.js** (per `bun add`), nicht recharts; Farben aus den
  Theme-Variablen, damit Dark Mode funktioniert.
- Keine Requests außer an `generativelanguage.googleapis.com`, und auch
  dorthin nur bei expliziter Extraktion.
