// Circuit Breaker Framework (Phase 4.5 — Step 2) — the second shared primitive of the Provider
// Infrastructure Layer. Protects a caller from repeatedly hammering a struggling downstream
// (a provider, an external API) by tripping OPEN once its recent failure rate crosses a
// threshold, failing fast without even attempting the call, then cautiously probing recovery
// via HALF_OPEN once a cooldown elapses. See docs/CIRCUIT_BREAKER_FRAMEWORK.md.
//
// Composable with the Retry Framework (retry/core.js), not coupled to it — a caller decides
// whether retries happen INSIDE the breaker's view (each attempt recorded individually) or
// OUTSIDE it (a breaker-rejected call retried later, after cooldown). See the docs for both
// patterns.
//
// State is IN-MEMORY, per breaker instance, per process. On Vercel serverless this means state
// is shared across requests handled by the same warm instance but does NOT persist across a
// cold start and is NOT shared across concurrent instances — documented limitation, not a bug.
// None of today's consumers need cross-instance shared state (there are no real external
// providers plugged in yet); a future Postgres-backed store would slot in behind the same
// execute()/getState()/getMetrics() API without changing callers.

export const STATES = { CLOSED: "closed", OPEN: "open", HALF_OPEN: "half_open" };

/**
 * Create an independent circuit breaker. Each provider/downstream should get its OWN instance —
 * a struggling email provider must not trip the SMS provider's breaker.
 *
 * opts:
 *   failureThreshold (0-1, default 0.5) — trip once the failure rate within the rolling window
 *     reaches this, but only once minimumCalls have happened (a window of "1 failure out of 1
 *     call" should not trip a breaker on its own).
 *   minimumCalls (default 5) — minimum outcomes recorded before failureThreshold is evaluated.
 *   windowSize (default 20) — rolling window of the most recent call outcomes.
 *   cooldownMs (default 30000) — how long OPEN lasts before allowing a HALF_OPEN probe.
 *   halfOpenMaxCalls (default 1) — how many concurrent trial calls HALF_OPEN admits; whichever
 *     settles first decides the transition (first success -> CLOSED, first failure -> OPEN).
 *   now — injectable clock, for deterministic tests.
 */
export function createCircuitBreaker(name, opts = {}) {
  if (!name || typeof name !== "string") throw new Error("createCircuitBreaker: name is required");
  const {
    failureThreshold = 0.5,
    minimumCalls = 5,
    windowSize = 20,
    cooldownMs = 30_000,
    halfOpenMaxCalls = 1,
    now = () => Date.now(),
  } = opts;

  let state = STATES.CLOSED;
  let outcomes = []; // rolling window of booleans, true = success
  let openedAt = null;
  let halfOpenCallsUsed = 0;
  let totalTrips = 0;
  let lastError = null;
  let lastSuccessAt = null;
  let lastFailureAt = null;

  function recordOutcome(success) {
    outcomes.push(success);
    if (outcomes.length > windowSize) outcomes.shift();
    if (success) lastSuccessAt = now();
    else lastFailureAt = now();
  }

  function currentFailureRate() {
    if (outcomes.length === 0) return 0;
    return outcomes.filter((o) => !o).length / outcomes.length;
  }

  // Lazy transition: OPEN -> HALF_OPEN once cooldown has elapsed. Called at the start of every
  // state read/execute so a breaker that's been idle past its cooldown reports HALF_OPEN
  // immediately, without needing a background timer.
  function maybeExpireCooldown() {
    if (state === STATES.OPEN && now() - openedAt >= cooldownMs) {
      state = STATES.HALF_OPEN;
      halfOpenCallsUsed = 0;
    }
  }

  function trip(error) {
    state = STATES.OPEN;
    openedAt = now();
    totalTrips += 1;
    if (error) lastError = String(error?.message ?? error);
  }

  /** Run `fn()` through the breaker. Rejects immediately (never calling fn) when OPEN or when
   * HALF_OPEN's trial-call limit is already in flight. */
  async function execute(fn) {
    maybeExpireCooldown();

    if (state === STATES.OPEN) {
      const err = new Error(`Circuit breaker '${name}' is open — call rejected without attempting.`);
      err.circuitBreakerOpen = true;
      throw err;
    }
    if (state === STATES.HALF_OPEN) {
      if (halfOpenCallsUsed >= halfOpenMaxCalls) {
        const err = new Error(`Circuit breaker '${name}' is half-open and at its trial-call limit.`);
        err.circuitBreakerOpen = true;
        throw err;
      }
      halfOpenCallsUsed += 1;
    }

    try {
      const result = await fn();
      recordOutcome(true);
      if (state === STATES.HALF_OPEN) {
        state = STATES.CLOSED;
        outcomes = [];
      }
      return result;
    } catch (err) {
      recordOutcome(false);
      lastError = String(err?.message ?? err);
      if (state === STATES.HALF_OPEN) {
        trip(err);
      } else if (outcomes.length >= minimumCalls && currentFailureRate() >= failureThreshold) {
        trip(err);
      }
      throw err;
    }
  }

  function getState() {
    maybeExpireCooldown();
    return state;
  }

  function getMetrics() {
    maybeExpireCooldown();
    return {
      name,
      state,
      failureRate: currentFailureRate(),
      sampleSize: outcomes.length,
      totalTrips,
      lastError,
      lastSuccessAt,
      lastFailureAt,
      openedAt,
    };
  }

  /** Manual reset — clears operational state and forces CLOSED. totalTrips is deliberately NOT
   * cleared: it's a lifetime metric (a breaker tripping 15 times today despite repeated resets
   * is itself the signal an operator needs), not current-health state. */
  function reset() {
    state = STATES.CLOSED;
    outcomes = [];
    openedAt = null;
    halfOpenCallsUsed = 0;
    lastError = null;
  }

  /** Manual trip — forces OPEN regardless of recent history. Operational escape hatch for a
   * known-bad provider before it's actually failed enough calls to trip on its own. */
  function forceOpen(reason) {
    trip(reason ? new Error(reason) : new Error("manually forced open"));
  }

  return { name, execute, getState, getMetrics, reset, forceOpen };
}
