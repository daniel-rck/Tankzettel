import { describe, expect, it } from "vitest";
import {
  formatCurrency,
  formatDate,
  formatDecimalInput,
  formatLiters,
  formatMonthLabel,
  formatPricePerLiter,
  parseDecimal,
  parseKilometers,
} from "./format.ts";

// Intl uses non-breaking spaces; normalize for assertions.
function plain(value: string): string {
  return value.replace(/\s/g, " ");
}

describe("formatDecimalInput", () => {
  it("renders a comma decimal without rounding or grouping", () => {
    expect(formatDecimalInput(46.92)).toBe("46,92");
    expect(formatDecimalInput(1.699)).toBe("1,699");
    expect(formatDecimalInput(123456)).toBe("123456");
  });

  it("renders empty for missing values", () => {
    expect(formatDecimalInput(null)).toBe("");
    expect(formatDecimalInput(undefined)).toBe("");
  });

  it("round-trips through parseDecimal", () => {
    for (const value of [46.92, 1.699, 123456, 0.001]) {
      expect(parseDecimal(formatDecimalInput(value))).toBe(value);
    }
  });
});

describe("parseDecimal", () => {
  it("parses dot decimals", () => {
    expect(parseDecimal("46.92")).toBe(46.92);
  });

  it("parses comma decimals", () => {
    expect(parseDecimal("46,92")).toBe(46.92);
  });

  it("parses German thousands notation", () => {
    expect(parseDecimal("1.234,56")).toBe(1234.56);
  });

  it("parses English thousands notation", () => {
    expect(parseDecimal("1,234.56")).toBe(1234.56);
  });

  it("parses integers and ignores whitespace", () => {
    expect(parseDecimal(" 123 ")).toBe(123);
  });

  it("returns null for garbage", () => {
    expect(parseDecimal("abc")).toBeNull();
    expect(parseDecimal("12abc")).toBeNull();
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("   ")).toBeNull();
    expect(parseDecimal("1,2,3")).toBeNull();
  });

  it("accepts bare separators and a trailing unit", () => {
    expect(parseDecimal(",5")).toBe(0.5);
    expect(parseDecimal("5,")).toBe(5);
    expect(parseDecimal("46,92 €")).toBe(46.92);
    expect(parseDecimal("32,1 l")).toBe(32.1);
  });

  it("rejects negative values", () => {
    expect(parseDecimal("-5")).toBeNull();
    expect(parseDecimal("-46,92")).toBeNull();
  });
});

describe("parseKilometers", () => {
  it("reads German thousands separators as thousands, not decimals", () => {
    expect(parseKilometers("123.456")).toBe(123456);
    expect(parseKilometers("1.234.567")).toBe(1234567);
    expect(parseKilometers("123 456")).toBe(123456);
  });

  it("reads plain integers and ignores a km suffix", () => {
    expect(parseKilometers("123456")).toBe(123456);
    expect(parseKilometers("98765 km")).toBe(98765);
  });

  it("returns null for empty or non-integer input", () => {
    expect(parseKilometers("")).toBeNull();
    expect(parseKilometers("12,5")).toBeNull();
    expect(parseKilometers("12.34")).toBeNull();
    expect(parseKilometers("abc")).toBeNull();
  });
});

describe("formatting", () => {
  it("formats currency with 2 decimals", () => {
    expect(plain(formatCurrency(46.9))).toBe("46,90 €");
  });

  it("formats price per liter with 3 decimals", () => {
    expect(plain(formatPricePerLiter(1.899))).toBe("1,899 €/l");
  });

  it("formats liters with 2 decimals", () => {
    expect(plain(formatLiters(32.1))).toBe("32,10 l");
  });

  it("formats ISO dates as German dates", () => {
    expect(formatDate("2026-03-05")).toBe("05.03.2026");
  });

  it("formats month labels in 'Mär 26' style", () => {
    expect(formatMonthLabel("2026-03")).toBe("Mär 26");
    expect(formatMonthLabel("2025-12")).toBe("Dez 25");
  });
});
