import type { ChartConfiguration } from "chart.js";
import { ChartLine } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import {
  computeConsumption,
  computeKpis,
  type MonthlyCost,
  monthlyCosts,
  type PricePoint,
  pricePoints,
} from "../../lib/analytics.ts";
import { getDB, useLiveQuery } from "../../lib/db/index.ts";
import { QueryFallback } from "../../lib/QueryFallback.tsx";
import { Card, EmptyState, PageHeader } from "../../lib/ui/index.ts";
import {
  formatCurrency,
  formatDate,
  formatKilometers,
  formatLiters,
  formatPricePerLiter,
} from "../../lib/utils/format.ts";
import { ChartCanvas, type ChartColors, useChartColors } from "./ChartCanvas.tsx";

/** KPI row in receipt style: label, dotted leader, mono value. */
function KpiRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="shrink-0 text-fg-muted">{label}</span>
      <span className="min-w-4 flex-1 border-b border-dotted border-border" aria-hidden="true" />
      <span className="shrink-0 text-right font-mono tabular-nums">{children}</span>
    </div>
  );
}

const PRICE_TICK = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
const EURO_TICK = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function priceChartConfig(points: PricePoint[], colors: ChartColors): ChartConfiguration {
  return {
    type: "line",
    data: {
      labels: points.map((p) => formatDate(p.date)),
      datasets: [
        {
          label: "Preis €/l",
          data: points.map((p) => p.pricePerLiter),
          borderColor: colors.accent,
          backgroundColor: colors.accent,
          pointRadius: 3,
          tension: 0.2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      locale: "de-DE",
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (item) => formatPricePerLiter(Number(item.parsed.y)) },
        },
      },
      scales: {
        x: { ticks: { color: colors.text }, grid: { color: colors.grid } },
        y: {
          ticks: {
            color: colors.text,
            callback: (value) => `${PRICE_TICK.format(Number(value))} €`,
          },
          grid: { color: colors.grid },
        },
      },
    },
  };
}

function costChartConfig(monthly: MonthlyCost[], colors: ChartColors): ChartConfiguration {
  return {
    type: "bar",
    data: {
      labels: monthly.map((m) => m.label),
      datasets: [
        {
          label: "Kosten €",
          data: monthly.map((m) => m.total),
          backgroundColor: colors.accentFill,
          hoverBackgroundColor: colors.accent,
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      locale: "de-DE",
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (item) => formatCurrency(Number(item.parsed.y)) } },
      },
      scales: {
        x: { ticks: { color: colors.text }, grid: { display: false } },
        y: {
          ticks: { color: colors.text, callback: (value) => EURO_TICK.format(Number(value)) },
          grid: { color: colors.grid },
        },
      },
    },
  };
}

/** Screen-reader summary of the price chart: range and extremes. */
function describePrices(points: PricePoint[]): string {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return "Liniendiagramm: Preis pro Liter über die Zeit";
  const prices = points.map((p) => p.pricePerLiter);
  return (
    `Liniendiagramm: Preis pro Liter vom ${formatDate(first.date)} bis ${formatDate(last.date)}, ` +
    `zuletzt ${formatPricePerLiter(last.pricePerLiter)}, ` +
    `zwischen ${formatPricePerLiter(Math.min(...prices))} und ${formatPricePerLiter(Math.max(...prices))}`
  );
}

function describeCosts(monthly: MonthlyCost[]): string {
  const parts = monthly.map((m) => `${m.label}: ${formatCurrency(m.total)}`);
  return `Balkendiagramm: Tankkosten pro Monat. ${parts.join(", ")}`;
}

export function AuswertungPage() {
  const colors = useChartColors();
  const { data, loading, error } = useLiveQuery("entries", async () => {
    const db = await getDB();
    return db.getAll("entries");
  });
  const entries = useMemo(() => data ?? [], [data]);

  const kpis = useMemo(() => computeKpis(entries), [entries]);
  const points = useMemo(() => pricePoints(entries), [entries]);
  const monthly = useMemo(() => monthlyCosts(entries), [entries]);
  const consumption = useMemo(() => computeConsumption(entries), [entries]);

  // Theme-aware chart configs; re-created when data or theme changes.
  const priceChart = useMemo(
    () => (points.length < 2 ? null : priceChartConfig(points, colors)),
    [points, colors],
  );
  const costChart = useMemo(
    () => (monthly.length === 0 ? null : costChartConfig(monthly, colors)),
    [monthly, colors],
  );

  if (data === undefined) {
    return (
      <>
        <PageHeader title="Auswertung" />
        <QueryFallback loading={loading} error={error} />
      </>
    );
  }

  if (entries.length === 0) {
    return (
      <>
        <PageHeader title="Auswertung" />
        <EmptyState
          icon={<ChartLine size={40} aria-hidden="true" />}
          title="Noch keine Daten"
          description="Sobald Belege erfasst sind, erscheinen hier Kennzahlen und Diagramme."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Auswertung" />
      <div className="space-y-4">
        <Card>
          <h3 className="mb-3 text-base font-medium">Kennzahlen</h3>
          <div className="space-y-2">
            <KpiRow label="Tankungen">{kpis.count}</KpiRow>
            <KpiRow label="Getankt gesamt">{formatLiters(kpis.totalLiters)}</KpiRow>
            <KpiRow label="Kosten gesamt">{formatCurrency(kpis.totalCost)}</KpiRow>
            {kpis.avgPricePerLiter !== null ? (
              <KpiRow label="Ø Preis (gewichtet)">
                {formatPricePerLiter(kpis.avgPricePerLiter)}
              </KpiRow>
            ) : null}
            {kpis.cheapest !== null ? (
              <KpiRow label="Günstigster Preis">
                {formatPricePerLiter(kpis.cheapest.pricePerLiter)}
                {kpis.cheapest.date ? ` (${formatDate(kpis.cheapest.date)})` : ""}
              </KpiRow>
            ) : null}
            {kpis.mostExpensive !== null ? (
              <KpiRow label="Teuerster Preis">
                {formatPricePerLiter(kpis.mostExpensive.pricePerLiter)}
                {kpis.mostExpensive.date ? ` (${formatDate(kpis.mostExpensive.date)})` : ""}
              </KpiRow>
            ) : null}
          </div>
        </Card>

        <Card>
          <h3 className="mb-3 text-base font-medium">Preisverlauf</h3>
          {priceChart ? (
            <ChartCanvas config={priceChart} ariaLabel={describePrices(points)} />
          ) : (
            <p className="text-sm text-fg-muted">
              Mindestens zwei Belege mit Datum und Literpreis nötig.
            </p>
          )}
        </Card>

        <Card>
          <h3 className="mb-3 text-base font-medium">Kosten pro Monat</h3>
          {costChart ? (
            <ChartCanvas config={costChart} ariaLabel={describeCosts(monthly)} />
          ) : (
            <p className="text-sm text-fg-muted">Noch keine Belege mit Datum und Betrag.</p>
          )}
        </Card>

        <Card>
          <h3 className="mb-3 text-base font-medium">Verbrauch</h3>
          {consumption !== null ? (
            <div className="space-y-2">
              <KpiRow label="Ø Verbrauch">
                {`${consumption.litersPer100Km.toLocaleString("de-DE", {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })} l/100 km`}
              </KpiRow>
              <KpiRow label="Strecke">{formatKilometers(consumption.distanceKm)}</KpiRow>
              <KpiRow label="Getankt (gewertet)">{formatLiters(consumption.liters)}</KpiRow>
              <p className="pt-1 text-xs text-fg-subtle">Hinweis: setzt Volltanken voraus.</p>
            </div>
          ) : (
            <p className="text-sm text-fg-muted">
              Erfasse bei mindestens zwei Tankungen den km-Stand, um den Verbrauch zu sehen.
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
