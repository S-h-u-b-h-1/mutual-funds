import { defineConfig } from "vitest/config";

// Pure logic tests that neither connect to nor mutate Postgres. The default Vitest config keeps
// its mandatory real-database guard for the integration suite; this separate config lets CI and
// contributors run deterministic unit tests without weakening that safety boundary.
export default defineConfig({
  test: {
    environment: "node",
    include: ["app/lib/stocks/sourceRegistry.test.js", "app/lib/stocks/universe.test.js", "app/lib/stocks/universeResearch.test.js", "app/lib/stocks/researchProfiles.test.js", "app/lib/stocks/companyAnalysis.test.js", "app/lib/stocks/evidenceFramework.test.js"],
  },
});
