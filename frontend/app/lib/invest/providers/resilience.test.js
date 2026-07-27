import { describe, it, expect } from "vitest";
import {
  callProvider, isProviderUnavailable, investmentProviderUnavailableOutcome, paymentProviderUnavailableOutcome,
} from "./resilience.js";

function uniqueProvider(label) {
  return `test-provider-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

describe("callProvider (pure, no DB)", () => {
  it("returns the result on success", async () => {
    const result = await callProvider(uniqueProvider("success"), "method", async () => ({ ok: true }));
    expect(result).toEqual({ ok: true });
  });

  it("propagates a genuine failure with no retry by default", async () => {
    let calls = 0;
    const fn = async () => { calls += 1; throw new Error("boom"); };
    await expect(callProvider(uniqueProvider("no-retry"), "method", fn)).rejects.toThrow("boom");
    expect(calls).toBe(1); // not retryable by default — exactly one attempt
  });

  it("retries a retryable call up to maxAttempts, then throws the last error", async () => {
    // isRetryable: () => true — this test is about callProvider correctly plumbing retryOpts
    // through to withRetry, not re-testing the Retry Framework's own default classifier (which
    // deliberately does NOT retry a plain, unclassified Error — see retry/core.js's own comment).
    let calls = 0;
    const fn = async () => { calls += 1; throw new Error("still failing"); };
    await expect(
      callProvider(uniqueProvider("retry-exhaust"), "method", fn, {
        retryable: true,
        retryOpts: { maxAttempts: 3, baseMs: 1, sleep: async () => {}, isRetryable: () => true },
      })
    ).rejects.toThrow("still failing");
    expect(calls).toBe(3);
  });

  it("retries a retryable call and succeeds once the underlying call recovers", async () => {
    let calls = 0;
    const fn = async () => {
      calls += 1;
      if (calls < 3) throw new Error("transient");
      return { recovered: true };
    };
    const result = await callProvider(uniqueProvider("retry-recover"), "method", fn, {
      retryable: true,
      retryOpts: { maxAttempts: 5, baseMs: 1, sleep: async () => {}, isRetryable: () => true },
    });
    expect(result).toEqual({ recovered: true });
    expect(calls).toBe(3);
  });

  it("times out a call that takes too long, and the timeout error is classified as retryable-shaped", async () => {
    const neverResolves = () => new Promise(() => {}); // deliberately hangs
    const err = await callProvider(uniqueProvider("timeout"), "method", neverResolves, { timeoutMs: 20 }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.providerTimeout).toBe(true);
    expect(isProviderUnavailable(err)).toBe(true);
  });

  it("trips the circuit breaker after repeated failures, then rejects immediately without calling fn", async () => {
    const providerName = uniqueProvider("breaker-trip");
    let calls = 0;
    const failing = async () => { calls += 1; throw new Error("provider is down"); };

    // Default breaker: trips at failureThreshold=0.5 once minimumCalls=5 outcomes exist.
    for (let i = 0; i < 5; i++) {
      await callProvider(providerName, "method", failing).catch(() => {});
    }
    expect(calls).toBe(5);

    // The breaker should now be OPEN — a further call must be rejected WITHOUT invoking fn again.
    const err = await callProvider(providerName, "method", failing).catch((e) => e);
    expect(err.circuitBreakerOpen).toBe(true);
    expect(calls).toBe(5); // unchanged — fn was never called this time
    expect(isProviderUnavailable(err)).toBe(true);
  });

  it("keeps each provider's breaker independent — one provider tripping doesn't affect another", async () => {
    const providerA = uniqueProvider("independent-a");
    const providerB = uniqueProvider("independent-b");
    const failing = async () => { throw new Error("down"); };
    for (let i = 0; i < 5; i++) await callProvider(providerA, "method", failing).catch(() => {});

    const errA = await callProvider(providerA, "method", failing).catch((e) => e);
    expect(errA.circuitBreakerOpen).toBe(true);

    // providerB has never been called — must still attempt the real call, not short-circuit.
    let bCalled = false;
    await callProvider(providerB, "method", async () => { bCalled = true; return "fine"; });
    expect(bCalled).toBe(true);
  });

  it("does not retry even when marked retryable once the circuit is open — fails fast instead", async () => {
    const providerName = uniqueProvider("breaker-plus-retry");
    const failing = async () => { throw new Error("down"); };
    for (let i = 0; i < 5; i++) await callProvider(providerName, "method", failing).catch(() => {});

    const startedAt = Date.now();
    const err = await callProvider(providerName, "method", failing, {
      retryable: true,
      retryOpts: { maxAttempts: 5, baseMs: 1000 }, // would take seconds if it actually retried with real backoff
    }).catch((e) => e);
    expect(err.circuitBreakerOpen).toBe(true);
    expect(Date.now() - startedAt).toBeLessThan(500); // fast-failed, did not sleep through backoff
  });
});

describe("isProviderUnavailable", () => {
  it("is true only for a classified timeout or open-circuit error, never a generic error", () => {
    expect(isProviderUnavailable({ providerTimeout: true })).toBe(true);
    expect(isProviderUnavailable({ circuitBreakerOpen: true })).toBe(true);
    expect(isProviderUnavailable(new Error("some other bug"))).toBe(false);
    expect(isProviderUnavailable(null)).toBe(false);
    expect(isProviderUnavailable(undefined)).toBe(false);
  });
});

describe("unavailable outcome shapes", () => {
  it("investmentProviderUnavailableOutcome matches InvestmentProvider's rejected shape", () => {
    const outcome = investmentProviderUnavailableOutcome({ providerTimeout: true });
    expect(outcome.status).toBe("rejected");
    expect(outcome.rejectionCode).toBe("PROVIDER_UNAVAILABLE");
    expect(typeof outcome.rejectionReason).toBe("string");
  });

  it("paymentProviderUnavailableOutcome matches PaymentProvider's declined shape", () => {
    const outcome = paymentProviderUnavailableOutcome();
    expect(outcome.status).toBe("declined");
    expect(outcome.errorCode).toBe("PROVIDER_UNAVAILABLE");
  });
});
