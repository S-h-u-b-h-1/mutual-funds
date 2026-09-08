import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  workers: 2,
  fullyParallel: true,
  retries: 0,
  webServer: process.env.CI && !process.env.E2E_BASE_URL ? { command: "npm start -- -p 3011", url: "http://localhost:3011", timeout: 120000 } : undefined,
  reporter: [["list"], ["json", { outputFile: "../output/playwright/remediation/results.json" }]],
  // Default to the browser revision matching Playwright, locally and in CI. An unrelated
  // installed Chrome upgrade caused minutes of worker-shutdown delay during verification.
  use: { baseURL: process.env.E2E_BASE_URL || "http://localhost:3011", browserName: "chromium", ...(process.env.E2E_USE_INSTALLED_CHROME ? { channel: "chrome" } : {}), screenshot: process.env.E2E_DIAGNOSTIC ? "off" : "only-on-failure", trace: process.env.E2E_DIAGNOSTIC ? "off" : "retain-on-failure" },
});
