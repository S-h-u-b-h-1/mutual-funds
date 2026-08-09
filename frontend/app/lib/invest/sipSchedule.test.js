import { describe, it, expect } from "vitest";
import { isInstallmentDueOn, dueDateKey } from "./sipSchedule.js";

describe("isInstallmentDueOn", () => {
  it("is due on start_date itself (the first installment)", () => {
    expect(isInstallmentDueOn({ frequency: "monthly", start_date: "2026-03-15" }, "2026-03-15")).toBe(true);
  });

  it("is not due before start_date", () => {
    expect(isInstallmentDueOn({ frequency: "monthly", start_date: "2026-03-15" }, "2026-03-14")).toBe(false);
  });

  it("monthly: due on the same day-of-month every month after start", () => {
    const mandate = { frequency: "monthly", start_date: "2026-03-15" };
    expect(isInstallmentDueOn(mandate, "2026-04-15")).toBe(true);
    expect(isInstallmentDueOn(mandate, "2026-04-14")).toBe(false);
    expect(isInstallmentDueOn(mandate, "2026-04-16")).toBe(false);
    expect(isInstallmentDueOn(mandate, "2027-01-15")).toBe(true);
  });

  it("monthly: clamps a day-31 mandate to the last day of shorter months", () => {
    const mandate = { frequency: "monthly", start_date: "2026-01-31" };
    expect(isInstallmentDueOn(mandate, "2026-01-31")).toBe(true);
    expect(isInstallmentDueOn(mandate, "2026-02-28")).toBe(true); // 2026 is not a leap year
    expect(isInstallmentDueOn(mandate, "2026-02-27")).toBe(false);
    expect(isInstallmentDueOn(mandate, "2026-04-30")).toBe(true); // April has 30 days
    expect(isInstallmentDueOn(mandate, "2026-03-31")).toBe(true); // March has 31 — no clamping needed
  });

  it("monthly: clamps to Feb 29 in a leap year", () => {
    expect(isInstallmentDueOn({ frequency: "monthly", start_date: "2026-01-31" }, "2028-02-29")).toBe(true);
    expect(isInstallmentDueOn({ frequency: "monthly", start_date: "2026-01-31" }, "2028-02-28")).toBe(false);
  });

  it("quarterly: due every 3 months from start, with the same clamping rule", () => {
    const mandate = { frequency: "quarterly", start_date: "2026-01-31" };
    expect(isInstallmentDueOn(mandate, "2026-01-31")).toBe(true);
    expect(isInstallmentDueOn(mandate, "2026-02-28")).toBe(false); // month 1, not a multiple of 3
    expect(isInstallmentDueOn(mandate, "2026-04-30")).toBe(true); // month 3, clamped (April has 30 days)
    expect(isInstallmentDueOn(mandate, "2026-07-31")).toBe(true); // month 6
  });

  it("weekly: due on the same day-of-week as start_date, every week", () => {
    const mandate = { frequency: "weekly", start_date: "2026-03-16" }; // a Monday
    expect(isInstallmentDueOn(mandate, "2026-03-16")).toBe(true);
    expect(isInstallmentDueOn(mandate, "2026-03-23")).toBe(true);
    expect(isInstallmentDueOn(mandate, "2026-03-17")).toBe(false);
    expect(isInstallmentDueOn(mandate, "2026-03-22")).toBe(false);
  });

  it("respects end_date — not due after it, still due on or before it", () => {
    const mandate = { frequency: "monthly", start_date: "2026-01-15", end_date: "2026-03-15" };
    expect(isInstallmentDueOn(mandate, "2026-03-15")).toBe(true);
    expect(isInstallmentDueOn(mandate, "2026-04-15")).toBe(false);
  });

  it("a null end_date never blocks (runs until cancelled)", () => {
    expect(isInstallmentDueOn({ frequency: "monthly", start_date: "2020-01-15", end_date: null }, "2030-01-15")).toBe(true);
  });

  it("accepts camelCase field names too (startDate/endDate)", () => {
    expect(isInstallmentDueOn({ frequency: "monthly", startDate: "2026-03-15" }, "2026-03-15")).toBe(true);
  });
});

describe("dueDateKey", () => {
  it("formats a date as YYYY-MM-DD regardless of time-of-day", () => {
    expect(dueDateKey(new Date("2026-03-15T23:59:00Z"))).toBe("2026-03-15");
    expect(dueDateKey("2026-03-15")).toBe("2026-03-15");
  });
});
