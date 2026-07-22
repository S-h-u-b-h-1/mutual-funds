import { describe, it, expect, vi } from "vitest";
import { createCircuitBreaker, STATES } from "./core.js";

function makeClock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

describe("createCircuitBreaker", () => {
  it("requires a name", () => {
    expect(() => createCircuitBreaker()).toThrow(/name is required/);
  });

  it("starts CLOSED and stays CLOSED under all-success traffic", async () => {
    const cb = createCircuitBreaker("test", { minimumCalls: 3 });
    expect(cb.getState()).toBe(STATES.CLOSED);
    for (let i = 0; i < 10; i++) await cb.execute(async () => "ok");
    expect(cb.getState()).toBe(STATES.CLOSED);
  });

  it("does not trip on 100% failures below minimumCalls", async () => {
    const cb = createCircuitBreaker("test", { minimumCalls: 5, failureThreshold: 0.5 });
    for (let i = 0; i < 4; i++) {
      await expect(cb.execute(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    }
    expect(cb.getState()).toBe(STATES.CLOSED); // only 4 samples, minimumCalls is 5
  });

  it("trips OPEN once failureThreshold is reached at/after minimumCalls", async () => {
    const cb = createCircuitBreaker("test", { minimumCalls: 4, failureThreshold: 0.5 });
    await expect(cb.execute(async () => { throw new Error("1"); })).rejects.toThrow();
    await expect(cb.execute(async () => { throw new Error("2"); })).rejects.toThrow();
    await cb.execute(async () => "ok");
    expect(cb.getState()).toBe(STATES.CLOSED); // 2/3 failures, only 3 samples so far
    await expect(cb.execute(async () => { throw new Error("3"); })).rejects.toThrow();
    expect(cb.getState()).toBe(STATES.OPEN); // 3/4 = 75% >= 50%, 4 samples >= minimumCalls
  });

  it("OPEN rejects immediately without ever calling fn", async () => {
    const cb = createCircuitBreaker("test", { minimumCalls: 1, failureThreshold: 0.5 });
    await expect(cb.execute(async () => { throw new Error("trip it"); })).rejects.toThrow();
    expect(cb.getState()).toBe(STATES.OPEN);

    const fn = vi.fn().mockResolvedValue("should never run");
    await expect(cb.execute(fn)).rejects.toMatchObject({ circuitBreakerOpen: true });
    expect(fn).not.toHaveBeenCalled();
  });

  it("transitions OPEN -> HALF_OPEN only after cooldownMs elapses", async () => {
    const clock = makeClock();
    const cb = createCircuitBreaker("test", { minimumCalls: 1, failureThreshold: 0.5, cooldownMs: 1000, now: clock.now });
    await expect(cb.execute(async () => { throw new Error("trip"); })).rejects.toThrow();
    expect(cb.getState()).toBe(STATES.OPEN);

    clock.advance(500);
    expect(cb.getState()).toBe(STATES.OPEN); // cooldown not elapsed yet

    clock.advance(500);
    expect(cb.getState()).toBe(STATES.HALF_OPEN); // exactly at cooldown boundary
  });

  it("HALF_OPEN -> CLOSED on a successful trial call, with a fresh outcome window", async () => {
    const clock = makeClock();
    const cb = createCircuitBreaker("test", { minimumCalls: 1, failureThreshold: 0.5, cooldownMs: 100, now: clock.now });
    await expect(cb.execute(async () => { throw new Error("trip"); })).rejects.toThrow();
    clock.advance(200);
    expect(cb.getState()).toBe(STATES.HALF_OPEN);

    const result = await cb.execute(async () => "recovered");
    expect(result).toBe("recovered");
    expect(cb.getState()).toBe(STATES.CLOSED);
    expect(cb.getMetrics().sampleSize).toBe(0); // fresh start after recovery
  });

  it("HALF_OPEN -> OPEN on a failed trial call, resetting the cooldown clock", async () => {
    const clock = makeClock();
    const cb = createCircuitBreaker("test", { minimumCalls: 1, failureThreshold: 0.5, cooldownMs: 100, now: clock.now });
    await expect(cb.execute(async () => { throw new Error("trip"); })).rejects.toThrow();
    clock.advance(200);
    expect(cb.getState()).toBe(STATES.HALF_OPEN);

    await expect(cb.execute(async () => { throw new Error("still broken"); })).rejects.toThrow();
    expect(cb.getState()).toBe(STATES.OPEN);
    expect(cb.getMetrics().totalTrips).toBe(2);

    // cooldown restarted from the second trip, not the first
    clock.advance(50);
    expect(cb.getState()).toBe(STATES.OPEN);
    clock.advance(50);
    expect(cb.getState()).toBe(STATES.HALF_OPEN);
  });

  it("HALF_OPEN admits at most halfOpenMaxCalls concurrent trial calls", async () => {
    const clock = makeClock();
    const cb = createCircuitBreaker("test", { minimumCalls: 1, failureThreshold: 0.5, cooldownMs: 100, halfOpenMaxCalls: 2, now: clock.now });
    await expect(cb.execute(async () => { throw new Error("trip"); })).rejects.toThrow();
    clock.advance(200);

    let resolveFirst, resolveSecond;
    const first = cb.execute(() => new Promise((r) => { resolveFirst = r; }));
    const second = cb.execute(() => new Promise((r) => { resolveSecond = r; }));
    // a third concurrent call, while the first two are still pending, must be rejected
    await expect(cb.execute(async () => "third")).rejects.toMatchObject({ circuitBreakerOpen: true });

    resolveFirst("ok1");
    resolveSecond("ok2");
    await expect(first).resolves.toBe("ok1");
    await expect(second).resolves.toBe("ok2");
  });

  it("rolling window evicts outcomes older than windowSize", async () => {
    const cb = createCircuitBreaker("test", { minimumCalls: 3, windowSize: 3, failureThreshold: 0.9 });
    // 3 failures would trip at threshold 0.9? no: 3/3=100%>=90%, would trip. Use successes to push failures out instead.
    await expect(cb.execute(async () => { throw new Error("f1"); })).rejects.toThrow();
    await expect(cb.execute(async () => { throw new Error("f2"); })).rejects.toThrow();
    await cb.execute(async () => "s1");
    await cb.execute(async () => "s2"); // window is now [f2, s1, s2] — only 1/3 failures
    await cb.execute(async () => "s3"); // window is now [s1, s2, s3] — 0/3 failures
    expect(cb.getMetrics().failureRate).toBe(0);
    expect(cb.getState()).toBe(STATES.CLOSED);
  });

  it("getMetrics reports name/state/failureRate/sampleSize/totalTrips/lastError/timestamps", async () => {
    const clock = makeClock(1000);
    const cb = createCircuitBreaker("payments", { minimumCalls: 1, failureThreshold: 0.5, now: clock.now });
    await cb.execute(async () => "ok");
    await expect(cb.execute(async () => { throw new Error("payment declined"); })).rejects.toThrow();
    const metrics = cb.getMetrics();
    expect(metrics).toMatchObject({ name: "payments", state: STATES.OPEN, totalTrips: 1, lastError: "payment declined" });
    expect(metrics.lastSuccessAt).toBe(1000);
    expect(metrics.lastFailureAt).toBe(1000);
    expect(metrics.openedAt).toBe(1000);
  });

  it("reset() forces CLOSED and clears operational state, but totalTrips stays a lifetime counter", async () => {
    const cb = createCircuitBreaker("test", { minimumCalls: 1, failureThreshold: 0.5 });
    await expect(cb.execute(async () => { throw new Error("trip"); })).rejects.toThrow();
    expect(cb.getState()).toBe(STATES.OPEN);
    cb.reset();
    expect(cb.getState()).toBe(STATES.CLOSED);
    expect(cb.getMetrics()).toMatchObject({ sampleSize: 0, lastError: null });
    expect(cb.getMetrics().totalTrips).toBe(1); // lifetime metric — an ops reset doesn't erase history
  });

  it("forceOpen() trips immediately regardless of history, for ops overrides", async () => {
    const cb = createCircuitBreaker("test", { minimumCalls: 100 }); // would never trip organically
    cb.forceOpen("known-bad deploy upstream");
    expect(cb.getState()).toBe(STATES.OPEN);
    expect(cb.getMetrics().lastError).toBe("known-bad deploy upstream");
  });

  it("independent breaker instances never share state", async () => {
    const email = createCircuitBreaker("email", { minimumCalls: 1, failureThreshold: 0.5 });
    const sms = createCircuitBreaker("sms", { minimumCalls: 1, failureThreshold: 0.5 });
    await expect(email.execute(async () => { throw new Error("email down"); })).rejects.toThrow();
    expect(email.getState()).toBe(STATES.OPEN);
    expect(sms.getState()).toBe(STATES.CLOSED);
  });

  it("concurrency: many concurrent successful calls on one breaker don't corrupt its window", async () => {
    const cb = createCircuitBreaker("test", { minimumCalls: 1, failureThreshold: 0.5, windowSize: 50 });
    await Promise.all(Array.from({ length: 30 }, () => cb.execute(async () => "ok")));
    expect(cb.getState()).toBe(STATES.CLOSED);
    expect(cb.getMetrics().sampleSize).toBe(30);
  });
});
