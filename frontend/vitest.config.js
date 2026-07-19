import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["app/**/*.test.js"],
    // Integration tests hit real Neon over the network with several sequential round-trips per
    // service call (e.g. one compliance item submission touches 5+ queries) — the 5s default is
    // tuned for pure-logic unit tests and was measured to be too short for these.
    testTimeout: 45000,
  },
});
