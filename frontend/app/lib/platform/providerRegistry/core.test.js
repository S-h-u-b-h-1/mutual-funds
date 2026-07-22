import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import {
  registerProvider,
  getProvider,
  listAvailableProviders,
  listInstalledProviders,
  getProviderStatus,
  getAllProviderStatuses,
  getPlatformProviderSummary,
  deriveCapabilities,
  runProviderConformanceCheck,
} from "./core.js";
import { KYCProvider } from "../../invest/providers/types.js";

// Module-level registry, same convention as jobs/registry.js etc. — run-scoped unique names
// avoid cross-test pollution instead of needing an unregister/reset function.
const RUN = crypto.randomBytes(3).toString("hex");
const T = (name) => `test-${RUN}-${name}`;

describe("registerProvider / getProvider", () => {
  it("requires a name", () => {
    expect(() => registerProvider()).toThrow(/name is required/);
  });

  it("applies sensible defaults when opts are omitted", () => {
    const name = T("defaults");
    registerProvider(name);
    const p = getProvider(name);
    expect(p).toMatchObject({ name, version: "0.0.0", capabilities: [], supportedFeatures: [], mode: "sandbox", enabled: true });
    expect(p.registeredAt).toBeTruthy();
  });

  it("returns null for an unregistered provider", () => {
    expect(getProvider(T("never-registered"))).toBeNull();
  });
});

describe("listAvailableProviders / listInstalledProviders", () => {
  it("available includes disabled providers; installed excludes them", () => {
    const enabledName = T("list-enabled");
    const disabledName = T("list-disabled");
    registerProvider(enabledName, { enabled: true });
    registerProvider(disabledName, { enabled: false });

    expect(listAvailableProviders()).toContain(enabledName);
    expect(listAvailableProviders()).toContain(disabledName);
    expect(listInstalledProviders()).toContain(enabledName);
    expect(listInstalledProviders()).not.toContain(disabledName);
  });
});

describe("getProviderStatus", () => {
  it("returns the full shape and delegates to getHealth/getConfig", () => {
    const name = T("status-basic");
    registerProvider(name, {
      version: "1.2.3",
      capabilities: ["send"],
      supportedFeatures: ["retry"],
      mode: "production",
      getHealth: () => ({ status: "healthy", latencyMs: 42 }),
      getConfig: () => ({ timeoutMs: 5000 }),
    });
    const status = getProviderStatus(name);
    expect(status).toMatchObject({
      name,
      version: "1.2.3",
      mode: "production",
      enabled: true,
      capabilities: ["send"],
      supportedFeatures: ["retry"],
      health: { status: "healthy", latencyMs: 42 },
      config: { timeoutMs: 5000 },
    });
  });

  it("returns null for an unregistered provider", () => {
    expect(getProviderStatus(T("never-registered-status"))).toBeNull();
  });

  it("a throwing getHealth is reported as its own error status, not a crash", () => {
    const name = T("health-throws");
    registerProvider(name, { getHealth: () => { throw new Error("provider unreachable"); } });
    const status = getProviderStatus(name);
    expect(status.health).toMatchObject({ status: "error", error: "provider unreachable" });
  });

  it("a throwing getConfig degrades to null config, not a crash", () => {
    const name = T("config-throws");
    registerProvider(name, { getConfig: () => { throw new Error("config unavailable"); } });
    const status = getProviderStatus(name);
    expect(status.config).toBeNull();
  });
});

describe("getAllProviderStatuses", () => {
  it("includes every registered provider", () => {
    const name = T("all-statuses");
    registerProvider(name);
    const all = getAllProviderStatuses();
    expect(all.some((p) => p.name === name)).toBe(true);
  });
});

describe("getPlatformProviderSummary", () => {
  it("counts totals, by-mode, and detects errors from both plain and circuit-breaker-shaped health", () => {
    const healthy = T("summary-healthy");
    const errored = T("summary-errored");
    const breakerOpen = T("summary-breaker-open");
    registerProvider(healthy, { mode: "production", getHealth: () => ({ status: "healthy" }) });
    registerProvider(errored, { mode: "sandbox", getHealth: () => ({ status: "error" }) });
    registerProvider(breakerOpen, { mode: "sandbox", getHealth: () => ({ status: "degraded", state: "open" }) });

    const summary = getPlatformProviderSummary();
    expect(summary.totalProviders).toBeGreaterThanOrEqual(3);
    expect(summary.withErrors).toEqual(expect.arrayContaining([errored, breakerOpen]));
    expect(summary.withErrors).not.toContain(healthy);
  });
});

describe("deriveCapabilities", () => {
  it("derives the real KYCProvider interface's method names, sorted, excluding constructor", () => {
    expect(deriveCapabilities(KYCProvider)).toEqual(["checkCKYCStatus", "checkStatus", "initiateVerification"]);
  });
});

describe("runProviderConformanceCheck", () => {
  it("fails cleanly for an unregistered provider", () => {
    const result = runProviderConformanceCheck(T("never-registered-conformance"));
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatch(/is not registered/);
  });

  it("passes for a well-formed registration", () => {
    const name = T("conformance-good");
    registerProvider(name, {
      version: "1.0.0",
      capabilities: ["a"],
      supportedFeatures: ["b"],
      mode: "sandbox",
      getHealth: () => ({ status: "healthy" }),
      getConfig: () => ({}),
    });
    expect(runProviderConformanceCheck(name)).toEqual({ ok: true, issues: [] });
  });

  it("flags a non-array capabilities/supportedFeatures and an invalid mode", () => {
    const name = T("conformance-bad-shape");
    registerProvider(name, { capabilities: "not-an-array", supportedFeatures: "also-not", mode: "staging" });
    const result = runProviderConformanceCheck(name);
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        "capabilities must be an array",
        "supportedFeatures must be an array",
        "mode must be 'sandbox' or 'production'",
      ])
    );
  });

  it("flags a throwing getHealth and a getHealth result missing the required status field", () => {
    const throwingName = T("conformance-health-throws");
    registerProvider(throwingName, { getHealth: () => { throw new Error("boom"); } });
    expect(runProviderConformanceCheck(throwingName).issues).toEqual(expect.arrayContaining([expect.stringMatching(/getHealth\(\) threw: boom/)]));

    const missingFieldName = T("conformance-health-missing-field");
    registerProvider(missingFieldName, { getHealth: () => ({ latencyMs: 10 }) }); // no 'status'
    expect(runProviderConformanceCheck(missingFieldName).issues).toContain("getHealth() result missing required field 'status'");
  });

  it("flags a throwing getConfig", () => {
    const name = T("conformance-config-throws");
    registerProvider(name, { getConfig: () => { throw new Error("config boom"); } });
    expect(runProviderConformanceCheck(name).issues).toEqual(expect.arrayContaining([expect.stringMatching(/getConfig\(\) threw: config boom/)]));
  });
});
