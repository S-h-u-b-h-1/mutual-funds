// Retry Framework (Phase 4.5) — the reusable retry primitive every subsystem (job platform,
// future circuit breaker, future provider adapters) builds on instead of hand-rolling its own
// backoff math. See docs/RETRY_FRAMEWORK.md for architecture and the extension guide.
//
// Two layers, used independently:
//   computeBackoff() — pure delay math (no I/O, no sleeping). The job platform calls this
//     directly to compute a future `run_at` for a requeued row (delay unit: whatever the
//     caller's base/max are in — jobs/core.js passes seconds since it's scheduling a DB row
//     minutes-to-hours out; an inline caller would pass milliseconds instead).
//   withRetry() — an actual retry LOOP for synchronous-style, in-request retries (e.g. a
//     provider adapter's inline HTTP call) that isn't backed by the job queue. Delays here are
//     always milliseconds, since it really does `await sleep(ms)` between attempts.
//
// Job-queue-backed retries do NOT use withRetry — the job platform's own requeue-with-run_at
// IS its retry loop (see jobs/core.js failJob), and its dead-letter table (status='dead') IS
// its DLQ. withRetry's onExhausted hook is where a non-queue-backed caller implements its own
// dead-lettering if it needs one; none of today's callers do.

const DEFAULT_MAX_ATTEMPTS = 5;

/**
 * Pure backoff-delay calculation. attempt is 1-based (the Nth failed attempt just happened).
 * strategy: 'exponential' (base * 2^(attempt-1)), 'linear' (base * attempt), or 'immediate' (0).
 * Both non-immediate strategies cap at `max` and apply ±25% jitter (thundering-herd avoidance),
 * floored at 1 so a delay is never rounded down to 0 by jitter.
 */
export function computeBackoff(attempt, opts = {}) {
  const { strategy = "exponential", base = 30, max = 3600, random = Math.random } = opts;
  if (attempt < 1) throw new Error("computeBackoff: attempt must be >= 1");

  if (strategy === "immediate") return 0;

  let exact;
  if (strategy === "linear") exact = Math.min(base * attempt, max);
  else if (strategy === "exponential") exact = Math.min(base * 2 ** (attempt - 1), max);
  else throw new Error(`computeBackoff: unknown strategy '${strategy}'`);

  const jitter = exact * 0.25 * (random() * 2 - 1);
  return Math.max(1, Math.round(exact + jitter));
}

/**
 * Default failure classifier: network-shaped errors and HTTP 429/5xx are retryable; everything
 * else (validation errors, 4xx, unrecognized errors) is terminal. Deliberately conservative —
 * an unknown error defaults to NOT retrying rather than silently retrying something permanent.
 * Callers with domain-specific error shapes should pass their own `isRetryable` to withRetry().
 */
const RETRYABLE_CODES = new Set(["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EPIPE"]);

export function isRetryableByDefault(error) {
  const status = error?.status ?? error?.statusCode;
  if (typeof status === "number") return status === 429 || status >= 500;
  if (RETRYABLE_CODES.has(error?.code)) return true;
  if (error?.name === "AbortError") return true;
  return false;
}

/**
 * Run `fn(attempt)` with retry. Stops on first success, on a non-retryable error, or once
 * maxAttempts is exhausted — whichever comes first — then rethrows the last error.
 * `sleep`/`random` are injectable so tests run instantly and deterministically.
 */
export async function withRetry(fn, opts = {}) {
  const {
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    strategy = "exponential",
    baseMs = 200,
    maxMs = 30_000,
    isRetryable = isRetryableByDefault,
    onAttemptFailed = null,
    onExhausted = null,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    random = Math.random,
  } = opts;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      onAttemptFailed?.(err, attempt);
      const canRetry = attempt < maxAttempts && isRetryable(err);
      if (!canRetry) {
        onExhausted?.(err, attempt);
        throw err;
      }
      const delay = computeBackoff(attempt, { strategy, base: baseMs, max: maxMs, random });
      await sleep(delay);
    }
  }
  throw new Error("withRetry: unreachable"); // loop always returns or throws
}
