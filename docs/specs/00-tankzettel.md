# Tankzettel — fuel receipt tracker (spec)

Status: **approved for implementation** · Living document — update in the same
change when the design changes.

Foundation: [`daniel-rck/web-base`](https://github.com/daniel-rck/web-base).
This spec only describes what is *specific* to Tankzettel. Everything not
mentioned here (stack, layout system, storage patterns, PWA setup, worker,
CI, Biome, hygiene) follows the web-base skill and its `references/` verbatim.
Scaffold with `bunx github:daniel-rck/web-base init`, then `add core`.

A working prototype exists as a Claude.ai artifact (single-file React). Its
extraction prompt, validation rules, and analytics formulas are carried over
here; its visual design is **not** (see §9).

---

## 1. Overview

**Tankzettel** is a local-first PWA for tracking fuel receipts ("Tankzettel").
The user photographs a receipt; a vision LLM (Gemini Flash, user-supplied API
key) extracts the structured data; the user reviews/corrects and saves. The
app lists all fill-ups and computes price/cost/consumption analytics.

- Repo: `daniel-rck/Tankzettel` · Hosted at `tankzettel.daniel-rck.workers.dev`
- Single user, single vehicle (v1), German UI, English source.
- App data in IndexedDB, settings in `localStorage` (web-base invariant #1).
- No backend logic: the Cloudflare Worker serves static assets only, no
  `/api/*` routes in v1.

### Non-goals (v1)

- No multi-device sync (data model stays sync-*compatible*, see §3).
- No multi-vehicle support (see §12).
- No accounts, no telemetry, no server-side key storage.
- No receipt-photo archive by default (photos are transient, see §5).

---

## 2. User flows

1. **Scan**: Erfassen page → pick/take photo(s) → each photo becomes a scan
   job → extraction runs (online) → result appears as an editable review card
   → user corrects if needed → "Übernehmen" saves a `FuelEntry`.
2. **Offline scan**: same, but extraction waits in the queue until the app is
   online again. The photo is safely persisted in IndexedDB meanwhile.
3. **Manual entry**: "Manuell erfassen" opens the same review card empty.
4. **Browse**: Belege page lists entries (newest first), allows inline edit
   (pencil → review card in place), delete and CSV export.
5. **Analyze**: Auswertung page shows KPIs + two charts (+ consumption when
   odometer data exists).
6. **Onboarding**: without an API key everything works except extraction; the
   scan area shows a hint linking to Einstellungen. Einstellungen explains how
   to create a free key (link to `https://aistudio.google.com/apikey`) and has
   a "Key testen" button.

---

## 3. Data model

`src/lib/db/types.ts` — all identifiers English, all numbers stored with `.`
decimal separator (formatting to `de-DE` happens in the UI only).

```typescript
export type EntrySource = "scan" | "manual";

export type FuelEntry = {
  id: string;                  // crypto.randomUUID()
  date: string | null;         // ISO "YYYY-MM-DD" (from receipt, editable)
  time: string | null;         // "HH:MM"
  station: string;             // e.g. "V-Markt"
  location: string;            // e.g. "Türkheim"
  fuelType: string;            // verbatim from receipt, e.g. "Super E10"
  liters: number | null;
  pricePerLiter: number | null; // EUR, typically 3 decimals
  total: number | null;         // EUR gross
  odometer: number | null;      // km, manual input, optional
  source: EntrySource;
  createdAt: number;            // Date.now()
  updatedAt: number;            // Date.now(), bump on every edit
};

export type ScanJobStatus = "pending" | "processing" | "review" | "failed";

export type ScanJob = {
  id: string;
  createdAt: number;
  image: Blob;                  // downscaled JPEG (the only photo we keep)
  status: ScanJobStatus;
  attempts: number;
  lastError: string | null;     // user-displayable German message
  result: ExtractionResult | null; // set when status === "review"
};

export type ExtractionResult = {
  date: string | null;
  time: string | null;
  station: string | null;
  location: string | null;
  fuelType: string | null;
  liters: number | null;
  pricePerLiter: number | null;
  total: number | null;
};
```

`updatedAt` exists so a later adoption of the web-base `sync` template can
merge by last-write-wins without a schema migration.

### IndexedDB schema

`src/lib/db/db.ts`, exactly the `getDB()` / `notifyMutation()` /
`useLiveQuery` pattern from web-base `references/storage.md`.

```typescript
interface TankzettelSchema extends DBSchema {
  entries: {
    key: string;
    value: FuelEntry;
    indexes: { byDate: string };   // index on `date` ("" for null dates)
  };
  scanQueue: {
    key: string;
    value: ScanJob;
  };
}

const DB_NAME = "tankzettel";
const DB_VERSION = 1;
```

No further indexes in v1 (entry counts are tiny; `getAll` + in-memory sort).

### Settings (`localStorage`)

Single values, per web-base "settings only" rule. Wrapped in
`src/lib/settings.ts` with typed getters/setters; no raw `localStorage`
access elsewhere.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `gemini-api-key` | string | `""` | user-supplied API key |
| `gemini-model` | string | `DEFAULT_MODEL` | Gemini model id |
| `keep-photos` | `"0" \| "1"` | `"0"` | keep `image` Blob on the saved job after confirm |

Security note: an API key in `localStorage` is as XSS-readable as one in
IndexedDB; this is the accepted BYO-key trade-off. The key must never appear
in URLs, logs, error messages, or exports.

---

## 4. Extraction service

`src/lib/gemini/` — pure functions, no React.

### 4.1 Image preprocessing

`downscale(file: Blob): Promise<Blob>` — canvas resize to max **2200 px**
long edge, JPEG quality **0.82**. Receipts are tall; keep aspect ratio.
The downscaled Blob (not the original) is stored on the `ScanJob` and sent
to the API.

### 4.2 Request

`extractReceipt(image: Blob, settings): Promise<ExtractionResult>`

- Endpoint: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- Auth: **`x-goog-api-key` header** — never the `?key=` query param (keys in
  URLs leak into SW caches and logs).
- Body: one `inlineData` part (base64 JPEG) + one `text` part (prompt below),
  plus `generationConfig` with `responseMimeType: "application/json"` and a
  `responseSchema` mirroring `ExtractionResult` (all fields nullable except
  none required — validation happens app-side). With `responseSchema` there
  is **no** markdown-fence stripping; `JSON.parse` the candidate text
  directly, inside a try/catch.

```typescript
export const DEFAULT_MODEL = "gemini-2.5-flash";
// Verify the current free-tier model id in AI Studio at implementation
// time; ids rotate faster than this spec. Keep it a settings-overridable
// constant, never hardcode it at call sites.
```

Prompt (German on purpose — receipts are German; keep as a `const`):

```
Du siehst das Foto eines deutschen Tankbelegs (Tankstellen-Quittung).
Extrahiere die Tankdaten in das vorgegebene JSON-Schema.
Regeln:
- Zahlen mit Punkt als Dezimaltrenner, keine Tausendertrenner, keine Einheiten.
- "station": Name der Tankstelle bzw. Kette (z.B. "V-Markt", "Feneberg", "Aral").
- "location": Ort der Tankstelle.
- "fuelType": Kraftstoffsorte wie auf dem Beleg gedruckt (z.B. "Super E10").
- "liters": getankte Menge in Litern.
- "pricePerLiter": Preis pro Liter in EUR (oft 3 Nachkommastellen).
- "total": Brutto-Gesamtbetrag in EUR.
- Nicht sicher erkennbare Werte: null.
```

### 4.3 Error taxonomy

Mapped to German user messages in one place (`src/lib/gemini/errors.ts`):

| Condition | Job status | Handling |
|---|---|---|
| no API key configured | stays `pending` | scan area shows settings hint; queue does not run |
| HTTP 400 / 403 | `failed` | "API-Key ungültig — in den Einstellungen prüfen." |
| HTTP 429 | stays `pending` | retry with backoff (§5), attempt counter++ |
| network error / offline | stays `pending` | retried on `online` event |
| 5xx | stays `pending` | backoff retry |
| unparsable / empty response | `failed` | "Beleg konnte nicht gelesen werden — manuell ausfüllen." |

`failed` jobs render as an empty review card (manual completion) with the
error message and a "Erneut versuchen" action that resets to `pending`.

---

## 5. Scan queue

`src/lib/queue/processor.ts` — every scan goes through the queue, even when
online (one code path).

- **Enqueue**: file input / drop / (later: share target) → `downscale` →
  `ScanJob` with `status: "pending"` → `scanQueue` store → `notifyMutation`.
- **Drain**: a module-level processor (started from `App`) runs when
  (a) app start, (b) `window` `online` event, (c) a job is enqueued, and
  (d) after each settings change of the API key. It processes jobs
  **sequentially** (free-tier RPM is low), oldest first, only while
  `navigator.onLine` and a key exists.
- **Backoff**: on 429/5xx, delay `min(2 ** attempts, 8)` minutes before the
  job becomes eligible again; after **5** attempts → `failed`. Eligibility is
  tracked in-memory (the `ScanJob` schema stays sync-compatible); after an
  app restart pending jobs are simply eligible again. Network errors don't
  consume attempts — they are retried on the `online` event (plus a gentle
  30 s timer for "online but unreachable" cases).
- **Review**: success sets `result` + `status: "review"`. Confirming a review
  card creates the `FuelEntry` (`source: "scan"`) and deletes the job —
  including its `image` Blob, unless `keep-photos` is on (then the job is
  deleted but nothing else retains the photo in v1; the setting is a stub for
  a later photo archive and ships hidden if not trivially wanted — decide at
  implementation, see §12).
- The Erfassen page renders the queue live via `useLiveQuery("scanQueue", …)`:
  pending/processing jobs as compact rows with a spinner, review/failed jobs
  as editable cards.

`navigator.storage.persist()` is requested once after the first entry is
saved (best-effort, ignore the result).

---

## 6. Review card & validation

One component (`src/features/erfassen/ReviewCard.tsx`) used for scan results,
failed jobs, and manual entry.

- Fields: Datum (`<input type="date">`), Zeit, Tankstelle, Ort, Kraftstoff,
  Liter, Preis €/l, Betrag €, km-Stand (optional). Numeric inputs are
  `inputMode="decimal"` text fields; parsing accepts both `46.92` and
  `46,92` (and `1.234,56`).
- **Plausibility**: if `|liters × pricePerLiter − total| > 0.05` → inline
  warning "Liter × Preis ergibt nicht den Betrag — bitte prüfen." (non-blocking).
- **Duplicate**: if an existing entry has the same `date` and
  `|Δtotal| < 0.01` → inline warning "Möglicherweise schon erfasst." (non-blocking).
- Saving requires at least `liters` or `total` to be a valid number.
- **Edit**: the same card edits saved entries inline on the Belege page
  (`entry` prop, one entry at a time): all fields prefill incl. odometer,
  `id`/`createdAt`/`source` are preserved, `updatedAt` is bumped via
  `updateEntry()`, the duplicate check excludes the entry itself, and the
  primary action reads "Speichern" instead of "Übernehmen".

---

## 7. Routes & features

Typed constants per web-base `references/router.md`; features lazy-loaded.
German feature folder names (family convention, cf. Hausverwaltung).

| Route | Folder | Page | Nav icon (lucide) |
|---|---|---|---|
| `/` | `features/erfassen` | scan area, queue, review cards, manual entry | `Camera` |
| `/belege` | `features/belege` | entry list, edit, delete, totals footer, CSV export | `ReceiptText` |
| `/auswertung` | `features/auswertung` | KPIs + charts | `ChartLine` |
| `/einstellungen` | `features/einstellungen` | API key (+test), model id, JSON backup/restore, privacy note, danger zone (delete all) | `Settings` |

`AppShell` with these four `NavItem`s; bottom-nav on mobile per layout system.
List rows and review cards use the shared `Card`/`Button`/`Badge`/`EmptyState`
primitives.

---

## 8. Analytics (Auswertung)

All derived in `src/lib/analytics.ts` as pure, unit-tested functions over
`FuelEntry[]`.

- **KPIs**: count · Σ liters · Σ cost · weighted Ø price = `Σtotal / Σliters`
  · cheapest / most expensive €/l with date.
- **Price chart** (chart.js line): `pricePerLiter` over `date`, entries with
  both values, ascending; ≥ 2 points required.
- **Cost chart** (chart.js bar): Σ `total` grouped by `YYYY-MM`, label
  `Mär 26` style.
- **Consumption** (only when ≥ 2 entries have `odometer` *and* `liters`):
  sort those by odometer ascending; `distance = last.odometer − first.odometer`;
  `liters = Σ liters of all but the first`; Ø = `liters / distance × 100`
  l/100 km. UI footnote: "setzt Volltanken voraus".
- Charts: `chart.js` added via `bun add` (domain dependency per web-base
  conventions — **not** recharts). Thin `<ChartCanvas>` wrapper around a
  `canvas` ref + `Chart` instance with proper destroy-on-unmount;
  `react-chartjs-2` is not needed. Colors from the theme's CSS variables so
  dark mode works.

Number formatting helpers (`src/lib/utils/format.ts`): `de-DE` locale,
currency 2 decimals, price/l 3 decimals, liters 2 decimals.

---

## 9. Design

Base: the web-base layout system unchanged. `theme.css` is copied verbatim;
the only edit is the per-app accent:

```css
--accent-h: 55; /* amber — fuel/petrol */
```

**Documented deviation — "receipt treatment"** (additive utility classes
only, dark-mode compatible, `theme.css` untouched so `web-base update layout`
stays clean):

- Numeric values (amounts, liters, prices, odometer) render in
  `font-mono tabular-nums`.
- Entry list rows are separated by dashed borders (`border-dashed`), echoing
  thermal-receipt perforation.
- KPI rows on Auswertung use a dotted leader between label and value
  (flex + `border-dotted` spacer).

The full "Thermobon" skin of the prototype (paper background, watermark,
zigzag tear edge) is deliberately **not** ported — it conflicts with the
shared design language and dark mode.

---

## 10. Export, backup, privacy

- **CSV export** (Belege page): semicolon-separated, `,` decimal separator,
  UTF-8 BOM (Excel-DE friendly), filename `tankzettel.csv`. Columns:
  `Datum;Zeit;Tankstelle;Ort;Kraftstoff;Liter;Preis_EUR_pro_Liter;Betrag_EUR;km_Stand`.
- **JSON backup** (Einstellungen): export `{ "version": 1, "exportedAt": …,
  "entries": FuelEntry[] }` as download; import merges by `id`
  (newer `updatedAt` wins) and reports counts. This is the only safeguard
  against IndexedDB eviction until sync exists — keep it prominent.
- **Privacy** (README + a short paragraph in Einstellungen): all data stays
  on-device; a receipt photo leaves the device only when extraction runs, to
  Google's Gemini API using *the user's own key*; on the free tier Google may
  use the data for training. No telemetry, no third-party requests otherwise.

---

## 11. Testing

Vitest + `fake-indexeddb/auto` (pattern from Hausverwaltung), `clearAll()`
in `beforeEach`. Required coverage:

- `format.ts` / numeric parsing (`46,92`, `1.234,56`, garbage → null).
- `analytics.ts` (weighted average, monthly grouping, consumption incl.
  edge cases: missing dates, single odometer entry, zero distance).
- Queue state machine with a mocked `fetch`: pending→review happy path,
  429→backoff→retry, 403→failed, offline→stays pending.
- CSV generation snapshot.
- Review-card validation (plausibility + duplicate warnings).

---

## 12. Open decisions

| # | Question | Current stance |
|---|---|---|
| 1 | Gemini model id | **Decided (2026-06-11):** `gemini-2.5-flash` verified as a stable, free-tier-eligible id in the Gemini API docs; default constant in `src/lib/gemini/model.ts`, user-overridable in settings |
| 2 | `keep-photos` setting | **Decided:** ships **hidden/off** in v1 — `src/lib/settings.ts` supports the flag, but no UI and nothing retains the photo after confirm (a photo archive UI is v2) |
| 3 | Web Share Target ("share photo → Tankzettel") | v2; needs `share_target` manifest entry + SW `fetch` handler enqueueing into `scanQueue` — injectManifest makes this possible, design before building |
| 4 | Multi-vehicle | out of scope; if it ever comes, add `vehicleId` to `FuelEntry` + a vehicles store and partition the consumption calc |
| 5 | Sync (web-base `sync` template) | not in v1; `updatedAt` already maintained for future LWW merge |

---

## 13. Acceptance criteria (v1 done =)

- [ ] Scaffolded via web-base CLI; `bun run lint && typecheck && test && build` green; reusable CI workflow wired.
- [ ] Photo → extraction → review → saved entry works on a real German receipt (test with V-Markt/Feneberg samples).
- [ ] Airplane mode: photo can be captured, persists, and is extracted automatically after reconnect.
- [ ] App is fully usable without an API key (manual entry, list, analytics, export).
- [ ] Invalid key produces the settings hint, not a console error.
- [ ] Plausibility + duplicate warnings appear per §6.
- [ ] CSV opens correctly in German Excel; JSON backup round-trips.
- [ ] Auswertung shows KPIs, both charts, and consumption once two odometer entries exist.
- [ ] PWA installable (manifest + icons + SW precache), works offline after first load, light/dark theme both clean.
- [ ] No request other than to `generativelanguage.googleapis.com` (and only on extraction).
