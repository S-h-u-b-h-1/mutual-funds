import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { recordCompanyEvent, getCompanyTimeline, upsertResultsCalendarEntry, getResultsCalendar, getUpcomingResults } from "./timeline.js";
import { createTestCompany, deleteTestCompany } from "./testHelpers.js";

describe("timeline (integration, real Neon, disposable company)", () => {
  let companyId;

  beforeAll(async () => {
    companyId = await createTestCompany({ label: "timeline" });
  });

  afterAll(async () => {
    await deleteTestCompany(companyId);
  });

  it("rejects an event with no source — every timeline entry must be attributable", async () => {
    await expect(recordCompanyEvent({ companyId, eventType: "dividend", eventDate: "2026-06-01", headline: "Test dividend" })).rejects.toThrow(/requires headline and source/);
  });

  it("rejects an unrecognized event_type", async () => {
    await expect(recordCompanyEvent({ companyId, eventType: "not_a_type", eventDate: "2026-06-01", headline: "x", source: "unit-test" })).rejects.toThrow(/invalid eventType/);
  });

  it("records events and returns them newest-first, optionally filtered by type", async () => {
    await recordCompanyEvent({ companyId, eventType: "dividend", eventDate: "2026-01-15", headline: "Interim dividend declared", source: "unit-test" });
    await recordCompanyEvent({ companyId, eventType: "results", eventDate: "2026-05-15", headline: "Q4 results published", source: "unit-test" });
    await recordCompanyEvent({ companyId, eventType: "results", eventDate: "2026-08-15", headline: "Q1 results published", source: "unit-test" });

    const all = await getCompanyTimeline(companyId);
    expect(all.length).toBe(3);
    expect(all[0].headline).toBe("Q1 results published"); // newest first

    const resultsOnly = await getCompanyTimeline(companyId, { eventType: "results" });
    expect(resultsOnly.length).toBe(2);
    expect(resultsOnly.every((e) => e.eventType === "results")).toBe(true);
  });

  it("upserts a results-calendar entry and updates it in place as status changes", async () => {
    await upsertResultsCalendarEntry({ companyId, periodEndDate: "2026-09-30", periodType: "quarterly", expectedDate: "2026-11-05", status: "expected", source: "unit-test" });
    let calendar = await getResultsCalendar(companyId);
    expect(calendar[0].status).toBe("expected");

    await upsertResultsCalendarEntry({
      companyId, periodEndDate: "2026-09-30", periodType: "quarterly",
      expectedDate: "2026-11-05", actualPublicationDate: "2026-11-06", status: "published", source: "unit-test",
    });
    calendar = await getResultsCalendar(companyId);
    expect(calendar.length).toBe(1); // same row, updated in place, not a second one
    expect(calendar[0].status).toBe("published");
    expect(calendar[0].actualPublicationDate).not.toBeNull();
  });

  it("surfaces upcoming (not yet published) results in the cross-company view", async () => {
    const futureCompanyId = await createTestCompany({ label: "upcoming" });
    try {
      await upsertResultsCalendarEntry({ companyId: futureCompanyId, periodEndDate: "2026-12-31", periodType: "quarterly", expectedDate: "2099-01-15", status: "expected", source: "unit-test" });
      const upcoming = await getUpcomingResults({ fromDate: "2098-01-01" });
      expect(upcoming.some((r) => r.companyId === futureCompanyId)).toBe(true);
      expect(upcoming.every((r) => r.status === "expected" || r.status === "delayed")).toBe(true);
    } finally {
      await deleteTestCompany(futureCompanyId);
    }
  });
});
