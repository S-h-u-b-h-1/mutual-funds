// Configuration Platform (Phase 4.5 — Step 3) — the third shared primitive of the Provider
// Infrastructure Layer. Centralizes environment validation, startup fail-fast checks, per-
// provider structured configuration (timeouts/retries/circuit-breaker/rate-limits), and
// server-side platform ops flags. See docs/CONFIGURATION_PLATFORM.md.
//
// Deliberately distinct from frontend/app/lib/featureFlags.js, which is a separate, existing,
// working system for CLIENT-EXPOSED premium-feature gating (NEXT_PUBLIC_FLAG_*, defaults off,
// user-facing tier switches like "Daily AI Brief"). This module's flags are SERVER-SIDE-ONLY
// operational toggles (PLATFORM_FLAG_*, e.g. "is the new BSE adapter enabled") — a different
// axis entirely. Do not merge the two; they solve different problems for different audiences.

function missingEnvError(entries) {
  const lines = entries.map((e) => `  - ${e.name}${e.description ? `: ${e.description}` : ""}`);
  return new Error(
    `Configuration Platform: missing required environment variable(s):\n${lines.join("\n")}\n` +
      "Fix: set these in your environment (.env.local for local dev, repo/host secrets for CI/production) before starting."
  );
}

/** Read a required env var; throws a clear, actionable error immediately if absent/empty. */
export function requireEnv(name, opts = {}) {
  const value = process.env[name];
  if (value === undefined || value === "") throw missingEnvError([{ name, description: opts.description }]);
  return value;
}

/** Read an optional env var, falling back to defaultValue when absent/empty. */
export function optionalEnv(name, defaultValue = undefined) {
  const value = process.env[name];
  return value === undefined || value === "" ? defaultValue : value;
}

/**
 * Validate a whole schema of env requirements at once, throwing a SINGLE aggregated error
 * listing every missing one — better startup DX than discovering required vars one at a time
 * across separate call sites. schema: [{ name, required, description }].
 */
export function validateStartup(schema) {
  const missing = schema.filter((entry) => entry.required && !process.env[entry.name]);
  if (missing.length > 0) throw missingEnvError(missing);
  return true;
}

// Platform-level required config — extend as new server-side infra dependencies are added.
// Per-provider requirements (e.g. a future email provider's API key) belong in that provider's
// OWN schema passed to validateStartup() at its own entry point, not bolted on here.
export const PLATFORM_CONFIG_SCHEMA = [
  {
    name: "DATABASE_URL",
    required: true,
    description: "Neon Postgres connection string — required by every platform subsystem (jobs/webhooks/reconciliation/events).",
  },
];

/** Server-side operational flag — see the module-level note on why this is distinct from
 * app/lib/featureFlags.js. Unset/anything other than the literal string 'true' means disabled. */
export function isPlatformFlagEnabled(name) {
  return process.env[`PLATFORM_FLAG_${name}`] === "true";
}

const DEFAULT_PROVIDER_CONFIG = {
  timeoutMs: 10_000,
  maxAttempts: 3,
  circuitBreaker: { failureThreshold: 0.5, cooldownMs: 30_000 },
  rateLimitPerMinute: 60,
};

/**
 * Structured per-provider config: caller-supplied defaults, overridable per-provider via
 * environment variables following a consistent naming convention
 * (PROVIDER_<NAME>_TIMEOUT_MS, _MAX_ATTEMPTS, _CB_FAILURE_THRESHOLD, _CB_COOLDOWN_MS,
 * _RATE_LIMIT_PER_MINUTE) — so any future provider gets env-overridable timeouts/retry/circuit-
 * breaker/rate-limit config for free, without bespoke plumbing at each call site.
 */
export function getProviderConfig(providerName, defaults = {}) {
  if (!providerName || typeof providerName !== "string") {
    throw new Error("getProviderConfig: providerName is required");
  }
  const merged = {
    ...DEFAULT_PROVIDER_CONFIG,
    ...defaults,
    circuitBreaker: { ...DEFAULT_PROVIDER_CONFIG.circuitBreaker, ...defaults.circuitBreaker },
  };
  const prefix = `PROVIDER_${providerName.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_`;

  return {
    name: providerName,
    timeoutMs: Number(optionalEnv(`${prefix}TIMEOUT_MS`, merged.timeoutMs)),
    maxAttempts: Number(optionalEnv(`${prefix}MAX_ATTEMPTS`, merged.maxAttempts)),
    circuitBreaker: {
      failureThreshold: Number(optionalEnv(`${prefix}CB_FAILURE_THRESHOLD`, merged.circuitBreaker.failureThreshold)),
      cooldownMs: Number(optionalEnv(`${prefix}CB_COOLDOWN_MS`, merged.circuitBreaker.cooldownMs)),
    },
    rateLimitPerMinute: Number(optionalEnv(`${prefix}RATE_LIMIT_PER_MINUTE`, merged.rateLimitPerMinute)),
  };
}
