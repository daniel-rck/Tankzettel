import type { FuelEntry } from "../db/types.ts";
import { formatDate } from "./format.ts";

export const CSV_FILENAME = "tankzettel.csv";

const HEADER = "Datum;Zeit;Tankstelle;Ort;Kraftstoff;Liter;Preis_EUR_pro_Liter;Betrag_EUR;km_Stand";

/** Decimal comma, fixed fraction digits, no thousands separators. */
function csvNumber(value: number | null, decimals: number): string {
  if (value === null) return "";
  return value.toFixed(decimals).replace(".", ",");
}

function csvField(value: string): string {
  if (/[;"\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/**
 * Semicolon-separated, "," decimals, UTF-8 BOM — opens cleanly in German
 * Excel. Rows keep the given order (callers pass newest first).
 */
export function entriesToCsv(entries: FuelEntry[]): string {
  const rows = entries.map((entry) =>
    [
      entry.date ? formatDate(entry.date) : "",
      entry.time ?? "",
      csvField(entry.station),
      csvField(entry.location),
      csvField(entry.fuelType),
      csvNumber(entry.liters, 2),
      csvNumber(entry.pricePerLiter, 3),
      csvNumber(entry.total, 2),
      entry.odometer === null ? "" : String(Math.round(entry.odometer)),
    ].join(";"),
  );
  return `\uFEFF${[HEADER, ...rows].join("\r\n")}\r\n`;
}
