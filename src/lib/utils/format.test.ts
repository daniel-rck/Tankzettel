import { describe, expect, it } from "vitest";
import {
  formatCurrency,
  formatDate,
  formatLiters,
  formatMonthLabel,
  formatPricePerLiter,
  parseDecimal,
} from "./format.ts";

// Intl uses non-breaking spaces; normalize for assertions.
function plain(value: string): string {
  return value.replace(/\s/g, " ");
}

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
