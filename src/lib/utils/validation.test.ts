import { describe, expect, it } from "vitest";
import { makeEntry } from "../../test/fixtures.ts";
import { canSave, hasPlausibilityIssue, isLikelyDuplicate } from "./validation.ts";

describe("hasPlausibilityIssue", () => {
  it("accepts liters × price ≈ total within 5 ct", () => {
    expect(hasPlausibilityIssue(32.18, 1.699, 54.67)).toBe(false);
  });

  it("is not tripped by float artifacts exactly at the threshold", () => {
    // 41.3 × 1.8 = 74.34000000000002 in IEEE 754; 74.29 is exactly 5 ct off.
    expect(hasPlausibilityIssue(41.3, 1.8, 74.29)).toBe(false);
    expect(hasPlausibilityIssue(41.3, 1.8, 74.28)).toBe(true);
  });

  it("flags a mismatch beyond 5 ct", () => {
    expect(hasPlausibilityIssue(32.18, 1.699, 56.0)).toBe(true);
  });

  it("stays quiet when a value is missing", () => {
    expect(hasPlausibilityIssue(null, 1.699, 56.0)).toBe(false);
    expect(hasPlausibilityIssue(32.18, null, 56.0)).toBe(false);
    expect(hasPlausibilityIssue(32.18, 1.699, null)).toBe(false);
  });
});

describe("isLikelyDuplicate", () => {
  const existing = [makeEntry({ id: "a", date: "2026-03-05", total: 54.67 })];

  it("flags same date and total within 1 ct", () => {
    expect(isLikelyDuplicate({ date: "2026-03-05", total: 54.67 }, existing)).toBe(true);
    expect(isLikelyDuplicate({ date: "2026-03-05", total: 54.671 }, existing)).toBe(true);
  });

  it("ignores different dates or totals", () => {
    expect(isLikelyDuplicate({ date: "2026-03-06", total: 54.67 }, existing)).toBe(false);
    expect(isLikelyDuplicate({ date: "2026-03-05", total: 54.69 }, existing)).toBe(false);
  });

  it("ignores null fields and the excluded entry itself", () => {
    expect(isLikelyDuplicate({ date: null, total: 54.67 }, existing)).toBe(false);
    expect(isLikelyDuplicate({ date: "2026-03-05", total: null }, existing)).toBe(false);
    expect(isLikelyDuplicate({ date: "2026-03-05", total: 54.67 }, existing, "a")).toBe(false);
  });
});

describe("canSave", () => {
  it("requires at least liters or total", () => {
    expect(canSave(null, null)).toBe(false);
    expect(canSave(32.18, null)).toBe(true);
    expect(canSave(null, 54.67)).toBe(true);
  });
});
