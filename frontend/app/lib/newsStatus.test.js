import { describe, it, expect } from "vitest";
import { sourceHealth } from "./newsStatus";
const now = Date.parse("2026-09-08T10:00:00Z");
const source = { name: "Example", active: true, news_articles: [{ published_at: "2026-09-08T09:00:00Z" }], news_ingestion_runs: [{ status: "success", finished_at: "2026-09-08T09:45:00Z" }] };
describe("per-source news health", () => {
  it("requires both fresh runs and content", () => expect(sourceHealth(source, now).state).toBe("healthy"));
  it("does not call an old article fresh after a successful fetch", () => expect(sourceHealth({ ...source, news_articles: [{ published_at: "2026-08-01" }] }, now).state).toBe("stale"));
  it("distinguishes disabled sources", () => expect(sourceHealth({ ...source, active: false }, now).state).toBe("disabled"));
  it("does not mistake missing dates for current dates", () => expect(sourceHealth({ ...source, news_articles: [{}] }, now).state).toBe("degraded"));
  it("flags implausible future timestamps", () => expect(sourceHealth({ ...source, news_articles: [{ published_at: "2026-09-09" }] }, now).state).toBe("degraded"));
  it("flags pipeline failures despite articles being inserted", () => expect(sourceHealth({ ...source, news_ingestion_runs: [{ status: "failed", finished_at: "2026-09-08T09:45:00Z" }] }, now).state).toBe("degraded"));
});
