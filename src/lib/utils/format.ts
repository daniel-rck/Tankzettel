// All formatting targets de-DE; numbers are *stored* with "." decimals,
// formatting happens in the UI only.

const currencyFormat = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const priceFormat = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

const litersFormat = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(value: number): string {
  return currencyFormat.format(value);
}

export function formatPricePerLiter(value: number): string {
  return `${priceFormat.format(value)} €/l`;
}

export function formatLiters(value: number): string {
  return `${litersFormat.format(value)} l`;
}

export function formatKilometers(value: number): string {
  return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(value)} km`;
}

/** "YYYY-MM-DD" → "DD.MM.YYYY" (string-level, no timezone pitfalls). */
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) return isoDate;
  return `${day}.${month}.${year}`;
}

// Deterministic German short month labels ("Mär 26" style) — ICU short
// months are inconsistent ("März", "Jan.").
const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
] as const;

/** "YYYY-MM" → "Mär 26". */
export function formatMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-");
  const index = Number(month) - 1;
  const label = MONTH_LABELS[index];
  if (!year || !label) return yearMonth;
  return `${label} ${year.slice(2)}`;
}

/**
 * Parse a German or technical decimal string: "46.92", "46,92", "1.234,56".
 * Returns null for garbage or empty input.
 */
export function parseDecimal(input: string): number | null {
  const trimmed = input.trim().replace(/\s/g, "");
  if (trimmed === "") return null;

  let normalized = trimmed;
  const hasComma = normalized.includes(",");
  const hasDot = normalized.includes(".");
  if (hasComma && hasDot) {
    // The last separator wins as decimal point; the other is a thousands sep.
    if (normalized.lastIndexOf(",") > normalized.lastIndexOf(".")) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else if (hasComma) {
    normalized = normalized.replace(",", ".");
  }

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
