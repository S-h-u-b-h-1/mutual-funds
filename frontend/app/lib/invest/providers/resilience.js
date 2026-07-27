// Provider Resilience (Backend Hardening Phase 3). Every provider call in the service layer
// (identityService, complianceService, orderService, documentService, portfolioService) routes
// through callProvider() below instead of calling the provider directly — before this, none of
// the 5 invest providers had timeout, retry, or circuit-breaker protection: a hung mock call would
// hang the whole request until Vercel's own function timeout killed it with a generic error, and
// a struggling provider would be hammered by every concurrent request instead of failing fast.
//
// Reuses the existing Retry Framework (platform/retry/core.js) and Circuit Breaker Framework
// (platform/circuitBreaker/core.js) — both already built and already used by the job platform;
// this is the invest-provider layer finally adopting them, not a new implementation.
import { withRetry } from "../../platform/retry/core.js";
import { createCircuitBreaker } from "../../platform/circuitBreaker/core.js";
import { getRequestContext, logInfo, logError } from "../../platform/observability/core.js";
import { PROVIDER_ERROR_CODES } from "./types.js";

const DEFAULT_TIMEOUT_MS = 8000;

// One breaker per provider (not per method): createCircuitBreaker's own design intent is that
// each downstream gets its own instance, so a struggling KYC provider trips independently of the
// payment provider. Keyed by providerName ('mock-investment', 'mock-payment', ...), lazily
// created on first use. In-memory, per warm serverless instance — the Circuit Breaker Framework's
// own documented, accepted tradeoff (see circuitBreaker/core.js's header comment); nothing here
// changes that.
const breakers = new Map();
function breakerFor(providerName) {
  if (!breakers.has(providerName)) breakers.set(providerName, createCircuitBreaker(providerName));
  return breakers.get(providerName);
}

function withTimeout(fn, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(`Provider call timed out after ${timeoutMs}ms`);
      err.name = "AbortError"; // recognized as retryable by the Retry Framework's default classifier
      err.providerTimeout = true;
      reject(err);
    }, timeoutMs);
    fn().then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

/**
 * Call a provider method through a timeout and that provider's circuit breaker, optionally
 * retrying on failure.
 *
 * providerName: circuit-breaker identity, e.g. provider.constructor.name or a fixed string like
 *   'mock-investment' — must be STABLE across calls to the same provider so they share one breaker.
 * methodName: for logs only, e.g. 'placeOrder'.
 * fn: the actual call, as a thunk — () => provider.method(...args).
 * opts.timeoutMs: default 8000.
 * opts.retryable: default false. Only pass true for a call that is genuinely idempotent/read-style
 *   (a status check, a fetch, a sync) — "do not blindly retry non-idempotent operations" (see
 *   docs/BACKEND_TECHNICAL_DEBT.md's Provider Resilience item). A write/mutating call (place an
 *   order, initiate a payment, generate a document) must NOT be retried here: without a stable
 *   idempotency key reaching the provider, a retried write can create a duplicate. Timeout and
 *   circuit-breaker protection still apply either way.
 * opts.retryOpts: forwarded to withRetry() when retryable is true.
 */
export async function callProvider(providerName, methodName, fn, opts = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, retryable = false, retryOpts = {} } = opts;
  const breaker = breakerFor(providerName);
  const { correlationId } = getRequestContext();
  const startedAt = Date.now();

  const attempt = () => breaker.execute(() => withTimeout(fn, timeoutMs));
  const run = retryable ? () => withRetry(attempt, retryOpts) : attempt;

  try {
    const result = await run();
    logInfo({
      event: "provider_call", provider: providerName, method: methodName, outcome: "success",
      durationMs: Date.now() - startedAt, correlationId,
      // Most mock providers already return a request/reference id (mockRef()-generated) —
      // surfaced here when present, without assuming every provider/method shape has one.
      providerReference: result?.providerOrderId ?? result?.paymentRef ?? result?.mandateRef ?? result?.payoutReference ?? result?.sessionId ?? null,
    });
    return result;
  } catch (err) {
    const classification = err?.circuitBreakerOpen ? "circuit_open" : err?.providerTimeout ? "timeout" : "error";
    logError({
      event: "provider_call", provider: providerName, method: methodName, outcome: "failure",
      classification, errorMessage: err?.message ?? String(err), durationMs: Date.now() - startedAt, correlationId,
    });
    throw err;
  }
}

// True only for a failure THIS module classified (timeout or an open circuit breaker) — never
// for a generic unexpected exception. That distinction matters at every call site that catches
// this: a real bug in a provider call must still propagate and surface as a real 500 (visible via
// C3's observability), not get silently reinterpreted as an ordinary-looking business decline.
export function isProviderUnavailable(err) {
  return Boolean(err?.circuitBreakerOpen || err?.providerTimeout);
}

function unavailableReason(err) {
  return err?.circuitBreakerOpen
    ? "Provider is temporarily unavailable (circuit open after repeated failures)."
    : "Provider did not respond in time.";
}

// Fallback shapes for the two DIFFERENT result conventions the mock providers use — InvestmentProvider
// (status: 'accepted'|'rejected', rejectionReason, rejectionCode) vs PaymentProvider (status:
// 'success'|'declined', errorCode) — only construct the one matching the call site being wrapped.
// Both deliberately mirror an ordinary business decline's shape exactly, so lifecycle code doesn't
// need a second branch for "unreachable" vs "said no." Only use where the caller already treats a
// non-accepted/non-success status as a normal, non-throwing outcome.
export function investmentProviderUnavailableOutcome(err) {
  return { status: "rejected", rejectionReason: unavailableReason(err), rejectionCode: PROVIDER_ERROR_CODES.PROVIDER_UNAVAILABLE };
}
export function paymentProviderUnavailableOutcome() {
  // No reason-text field in this shape (the mock PaymentProvider's own success/decline results
  // never have one, only errorCode) — nowhere to put unavailableReason()'s string here.
  return { status: "declined", errorCode: PROVIDER_ERROR_CODES.PROVIDER_UNAVAILABLE, paymentRef: null, mandateRef: null, provider: null };
}
