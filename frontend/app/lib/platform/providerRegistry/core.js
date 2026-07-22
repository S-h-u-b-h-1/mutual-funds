// Provider Registry (Phase 4.5 — Step 4) — the fourth shared primitive of the Provider
// Infrastructure Layer, and the piece that ties the first three together operationally. Every
// provider registers its name/version/capabilities/health/config/mode here so the platform can
// report installed/available providers, health, version, and errors from one place — the
// FINAL GOAL of this phase: integrating a new provider becomes "write one adapter, register it
// here, supply credentials, pass the conformance check" with no business-logic changes.
// See docs/PROVIDER_REGISTRY.md.
//
// Deliberately additive to, not a replacement for, frontend/app/lib/invest/providers/index.js —
// that file remains the ONE place that decides which concrete implementation backs each
// KYC/Investment/Payment/Portfolio/Document interface (the actual swap point). This registry is
// a separate, cross-cutting layer for OPERATIONAL metadata (health/version/capabilities/mode)
// about whatever is plugged in there (and, from M5 onward, about notification channel
// providers, webhook providers, and any future real integration) — not a second swap mechanism.
//
// Module-level Map, same convention as jobs/registry.js, webhooks/registry.js,
// events/registry.js, reconciliation/registry.js — one process-wide registry, populated by
// side-effect imports at module load time.

const providers = new Map();

/**
 * Register a provider's operational metadata.
 * opts:
 *   version (string) — provider adapter version, e.g. 'mock-1.0.0'.
 *   capabilities (string[]) — what operations it supports. Prefer deriveCapabilities() over a
 *     hand-typed list so this can't drift from the interface it implements.
 *   supportedFeatures (string[]) — higher-level feature flags the provider supports (distinct
 *     from raw method capabilities — e.g. a payment provider might support 'upi_autopay' as a
 *     feature built from several capability methods together).
 *   mode ('sandbox' | 'production', default 'sandbox').
 *   enabled (boolean, default true) — registered-but-disabled providers show up in
 *     listAvailableProviders() but not listInstalledProviders().
 *   getHealth (() => object, default returns {status:'unknown'}) — caller-supplied health
 *     snapshot, typically a circuit breaker's getMetrics() or an equivalent. Never called until
 *     status is actually requested (no eager health checks at registration time).
 *   getConfig (() => object|null, default returns null) — caller-supplied config snapshot,
 *     typically getProviderConfig(name) from the Configuration Platform.
 */
export function registerProvider(name, opts = {}) {
  if (!name || typeof name !== "string") throw new Error("registerProvider: name is required");
  const {
    version = "0.0.0",
    capabilities = [],
    supportedFeatures = [],
    mode = "sandbox",
    enabled = true,
    getHealth = () => ({ status: "unknown" }),
    getConfig = () => null,
  } = opts;
  providers.set(name, {
    name,
    version,
    // Copy defensively when given an actual array (protects against later external mutation of
    // the caller's array); preserve anything else AS GIVEN rather than spreading it — spreading
    // a non-array iterable (e.g. a string) silently coerces it into a character array, which
    // would defeat runProviderConformanceCheck's Array.isArray() validation below by making
    // clearly-wrong input look shape-valid.
    capabilities: Array.isArray(capabilities) ? [...capabilities] : capabilities,
    supportedFeatures: Array.isArray(supportedFeatures) ? [...supportedFeatures] : supportedFeatures,
    mode,
    enabled,
    getHealth,
    getConfig,
    registeredAt: new Date().toISOString(),
  });
}

export function getProvider(name) {
  return providers.get(name) ?? null;
}

/** Every registered provider, regardless of enabled state — what COULD be active. */
export function listAvailableProviders() {
  return Array.from(providers.keys()).sort();
}

/** Registered AND enabled — actively part of the running platform. */
export function listInstalledProviders() {
  return listAvailableProviders().filter((name) => providers.get(name).enabled);
}

/** Full operational status for one provider: version/mode/capabilities/health/config. Health
 * and config getters are called lazily here and never let a throwing getter break the read —
 * a broken health check must never itself look like the provider being unhealthy in a
 * misleading way (it's reported as its own distinct 'error' status instead). */
export function getProviderStatus(name) {
  const p = providers.get(name);
  if (!p) return null;

  let health;
  try {
    health = p.getHealth();
  } catch (err) {
    health = { status: "error", error: String(err?.message ?? err) };
  }

  let config;
  try {
    config = p.getConfig();
  } catch {
    config = null;
  }

  return {
    name: p.name,
    version: p.version,
    mode: p.mode,
    enabled: p.enabled,
    capabilities: p.capabilities,
    supportedFeatures: p.supportedFeatures,
    health,
    config,
    registeredAt: p.registeredAt,
  };
}

export function getAllProviderStatuses() {
  return listAvailableProviders().map(getProviderStatus);
}

/** Platform-wide rollup for the future operational dashboard (Phase 4.5 step 7). */
export function getPlatformProviderSummary() {
  const all = getAllProviderStatuses();
  return {
    totalProviders: all.length,
    installedCount: all.filter((p) => p.enabled).length,
    byMode: {
      sandbox: all.filter((p) => p.mode === "sandbox").length,
      production: all.filter((p) => p.mode === "production").length,
    },
    // A provider is "with errors" if its health reports an error status directly, or if its
    // circuit breaker (a common getHealth() shape) reports open/half_open — both are
    // operator-actionable signals worth surfacing at the summary level.
    withErrors: all.filter((p) => p.health?.status === "error" || ["open", "half_open"].includes(p.health?.state)).map((p) => p.name),
  };
}

/**
 * Derive a capability list from an interface base class's own declared async methods, so a
 * provider's registered capabilities can't drift from the interface it actually implements —
 * see frontend/app/lib/invest/providers/types.js for the interfaces this is meant to reflect.
 */
export function deriveCapabilities(InterfaceClass) {
  return Object.getOwnPropertyNames(InterfaceClass.prototype)
    .filter((name) => name !== "constructor")
    .sort();
}

const REQUIRED_HEALTH_FIELDS = ["status"];

/**
 * Conformance check — the 4th step the brief's FINAL GOAL names for integrating a new provider
 * ("write one adapter, register it, supply credentials, pass the conformance check"). Verifies
 * the REGISTRATION is well-formed (right shape, health/config getters don't throw, required
 * fields present) — not the provider's actual business behavior, which is that provider's own
 * test suite's job. Intended to be called from each provider's own test file, e.g.:
 *   expect(runProviderConformanceCheck("mock-payments").ok).toBe(true);
 */
export function runProviderConformanceCheck(name) {
  const p = providers.get(name);
  if (!p) return { ok: false, issues: [`'${name}' is not registered`] };

  const issues = [];
  if (typeof p.version !== "string" || !p.version) issues.push("version must be a non-empty string");
  if (!Array.isArray(p.capabilities)) issues.push("capabilities must be an array");
  if (!Array.isArray(p.supportedFeatures)) issues.push("supportedFeatures must be an array");
  if (!["sandbox", "production"].includes(p.mode)) issues.push("mode must be 'sandbox' or 'production'");

  let health;
  try {
    health = p.getHealth();
    for (const field of REQUIRED_HEALTH_FIELDS) {
      if (!(field in health)) issues.push(`getHealth() result missing required field '${field}'`);
    }
  } catch (err) {
    issues.push(`getHealth() threw: ${String(err?.message ?? err)}`);
  }

  try {
    p.getConfig();
  } catch (err) {
    issues.push(`getConfig() threw: ${String(err?.message ?? err)}`);
  }

  return { ok: issues.length === 0, issues };
}
