import { describe, it, expect, afterEach, vi } from "vitest";
import {
  requireEnv,
  optionalEnv,
  validateStartup,
  PLATFORM_CONFIG_SCHEMA,
  isPlatformFlagEnabled,
  getProviderConfig,
} from "./core.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requireEnv", () => {
  it("returns the value when set", () => {
    vi.stubEnv("TEST_REQUIRED_VAR", "hello");
    expect(requireEnv("TEST_REQUIRED_VAR")).toBe("hello");
  });

  it("throws a clear, actionable error when missing", () => {
    vi.stubEnv("TEST_REQUIRED_VAR", "");
    expect(() => requireEnv("TEST_REQUIRED_VAR", { description: "needed for X" })).toThrow(
      /missing required environment variable.*TEST_REQUIRED_VAR: needed for X/s
    );
  });

  it("throws when the var is entirely unset", () => {
    expect(() => requireEnv("TOTALLY_UNSET_VAR_XYZ")).toThrow(/TOTALLY_UNSET_VAR_XYZ/);
  });
});

describe("optionalEnv", () => {
  it("returns the value when set", () => {
    vi.stubEnv("TEST_OPTIONAL_VAR", "value");
    expect(optionalEnv("TEST_OPTIONAL_VAR", "default")).toBe("value");
  });

  it("returns the default when unset", () => {
    expect(optionalEnv("TOTALLY_UNSET_VAR_ABC", "default")).toBe("default");
  });

  it("returns the default when set to an empty string", () => {
    vi.stubEnv("TEST_OPTIONAL_VAR", "");
    expect(optionalEnv("TEST_OPTIONAL_VAR", "default")).toBe("default");
  });
});

describe("validateStartup", () => {
  it("passes silently when every required entry is present", () => {
    vi.stubEnv("REQ_A", "1");
    vi.stubEnv("REQ_B", "2");
    expect(
      validateStartup([
        { name: "REQ_A", required: true },
        { name: "REQ_B", required: true },
        { name: "OPT_C", required: false },
      ])
    ).toBe(true);
  });

  it("throws ONE aggregated error listing every missing required entry", () => {
    vi.stubEnv("REQ_A", "1");
    try {
      validateStartup([
        { name: "REQ_A", required: true },
        { name: "REQ_B", required: true, description: "b thing" },
        { name: "REQ_C", required: true, description: "c thing" },
      ]);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err.message).toMatch(/REQ_B: b thing/);
      expect(err.message).toMatch(/REQ_C: c thing/);
      expect(err.message).not.toMatch(/REQ_A/); // present var isn't reported as missing
    }
  });

  it("ignores missing entries that are not marked required", () => {
    expect(validateStartup([{ name: "TOTALLY_UNSET_VAR_DEF", required: false }])).toBe(true);
  });

  it("PLATFORM_CONFIG_SCHEMA requires DATABASE_URL", () => {
    expect(PLATFORM_CONFIG_SCHEMA.some((e) => e.name === "DATABASE_URL" && e.required)).toBe(true);
  });
});

describe("isPlatformFlagEnabled", () => {
  it("is true only for the literal string 'true'", () => {
    vi.stubEnv("PLATFORM_FLAG_NEW_ADAPTER", "true");
    expect(isPlatformFlagEnabled("NEW_ADAPTER")).toBe(true);
  });

  it("is false for unset, '1', 'false', or any other value", () => {
    expect(isPlatformFlagEnabled("TOTALLY_UNSET_FLAG")).toBe(false);
    vi.stubEnv("PLATFORM_FLAG_X", "1");
    expect(isPlatformFlagEnabled("X")).toBe(false);
    vi.stubEnv("PLATFORM_FLAG_Y", "false");
    expect(isPlatformFlagEnabled("Y")).toBe(false);
  });

  it("uses the PLATFORM_FLAG_ prefix, distinct from the client-facing NEXT_PUBLIC_FLAG_ prefix", () => {
    vi.stubEnv("NEXT_PUBLIC_FLAG_NEW_ADAPTER", "true"); // the OTHER (client) flag system
    expect(isPlatformFlagEnabled("NEW_ADAPTER")).toBe(false); // must not read that prefix
  });
});

describe("getProviderConfig", () => {
  it("requires a providerName", () => {
    expect(() => getProviderConfig()).toThrow(/providerName is required/);
  });

  it("returns built-in defaults when no caller defaults or env overrides are given", () => {
    const cfg = getProviderConfig("test-provider-a");
    expect(cfg).toMatchObject({
      name: "test-provider-a",
      timeoutMs: 10_000,
      maxAttempts: 3,
      circuitBreaker: { failureThreshold: 0.5, cooldownMs: 30_000 },
      rateLimitPerMinute: 60,
    });
  });

  it("caller-supplied defaults override the built-in defaults", () => {
    const cfg = getProviderConfig("test-provider-b", { timeoutMs: 5000, circuitBreaker: { failureThreshold: 0.8 } });
    expect(cfg.timeoutMs).toBe(5000);
    expect(cfg.circuitBreaker.failureThreshold).toBe(0.8);
    expect(cfg.circuitBreaker.cooldownMs).toBe(30_000); // untouched sub-field keeps the built-in default
  });

  it("environment variables override caller defaults, using the sanitized PROVIDER_<NAME>_ prefix", () => {
    vi.stubEnv("PROVIDER_TEST_PROVIDER_C_TIMEOUT_MS", "2500");
    vi.stubEnv("PROVIDER_TEST_PROVIDER_C_CB_FAILURE_THRESHOLD", "0.9");
    const cfg = getProviderConfig("test-provider-c", { timeoutMs: 9999 });
    expect(cfg.timeoutMs).toBe(2500); // env wins over caller default
    expect(cfg.circuitBreaker.failureThreshold).toBe(0.9);
  });

  it("sanitizes non-alphanumeric characters in the provider name for the env prefix", () => {
    vi.stubEnv("PROVIDER_BSE_STAR_MF_TIMEOUT_MS", "7777");
    const cfg = getProviderConfig("bse-star-mf");
    expect(cfg.timeoutMs).toBe(7777);
  });
});
