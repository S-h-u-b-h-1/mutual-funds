import { describe, it, expect, vi } from "vitest";
import { computeBackoff, isRetryableByDefault, withRetry } from "./core.js";

const noJitter = () => 0.5; // random()*2-1 === 0, i.e. exact backoff with no jitter applied

describe("computeBackoff", () => {
  it("exponential grows and caps at max, matching the job platform's original formula exactly", () => {
    expect(computeBackoff(1, { base: 30, max: 3600, random: noJitter })).toBe(30);
    expect(computeBackoff(2, { base: 30, max: 3600, random: noJitter })).toBe(60);
    expect(computeBackoff(5, { base: 30, max: 3600, random: noJitter })).toBe(480);
    expect(computeBackoff(12, { base: 30, max: 3600, random: noJitter })).toBe(3600); // capped
  });

  it("linear grows by a fixed step and caps at max", () => {
    expect(computeBackoff(1, { strategy: "linear", base: 10, max: 1000, random: noJitter })).toBe(10);
    expect(computeBackoff(3, { strategy: "linear", base: 10, max: 1000, random: noJitter })).toBe(30);
    expect(computeBackoff(500, { strategy: "linear", base: 10, max: 1000, random: noJitter })).toBe(1000);
  });

  it("immediate always returns 0 regardless of attempt", () => {
    expect(computeBackoff(1, { strategy: "immediate" })).toBe(0);
    expect(computeBackoff(50, { strategy: "immediate" })).toBe(0);
  });

  it("jitter stays within ±25% of the exact value", () => {
    for (const random of [0, 0.25, 0.75, 1]) {
      const jittered = computeBackoff(1, { base: 100, max: 3600, random: () => random });
      expect(jittered).toBeGreaterThanOrEqual(75);
      expect(jittered).toBeLessThanOrEqual(125);
    }
  });

  it("never returns less than 1 for a non-immediate strategy, even with maximally negative jitter", () => {
    expect(computeBackoff(1, { base: 1, max: 3600, random: () => 0 })).toBeGreaterThanOrEqual(1);
  });

  it("rejects attempt < 1 and an unknown strategy", () => {
    expect(() => computeBackoff(0)).toThrow(/attempt must be >= 1/);
    expect(() => computeBackoff(1, { strategy: "bogus" })).toThrow(/unknown strategy/);
  });
});

describe("isRetryableByDefault", () => {
  it("treats HTTP 429 and 5xx as retryable, everything else as terminal", () => {
    expect(isRetryableByDefault({ status: 429 })).toBe(true);
    expect(isRetryableByDefault({ status: 503 })).toBe(true);
    expect(isRetryableByDefault({ statusCode: 500 })).toBe(true);
    expect(isRetryableByDefault({ status: 400 })).toBe(false);
    expect(isRetryableByDefault({ status: 404 })).toBe(false);
  });

  it("treats common network error codes and AbortError as retryable", () => {
    for (const code of ["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EPIPE"]) {
      expect(isRetryableByDefault({ code })).toBe(true);
    }
    expect(isRetryableByDefault({ name: "AbortError" })).toBe(true);
  });

  it("defaults an unrecognized error to terminal (never retry blind)", () => {
    expect(isRetryableByDefault(new Error("something unexpected"))).toBe(false);
    expect(isRetryableByDefault(undefined)).toBe(false);
  });
});

describe("withRetry", () => {
  const instant = { sleep: async () => {}, random: () => 0.5 };

  it("returns the result on first success without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, instant);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a retryable failure and succeeds once the underlying call recovers", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ status: 503 })
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValueOnce("recovered");
    const result = await withRetry(fn, { ...instant, maxAttempts: 5 });
    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("stops immediately on a non-retryable error without exhausting maxAttempts", async () => {
    const fn = vi.fn().mockRejectedValue({ status: 400 });
    await expect(withRetry(fn, { ...instant, maxAttempts: 5 })).rejects.toMatchObject({ status: 400 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("exhausts maxAttempts on a persistently retryable error, then rethrows the last error", async () => {
    const fn = vi.fn().mockRejectedValue({ status: 503, attempt: "final" });
    await expect(withRetry(fn, { ...instant, maxAttempts: 3 })).rejects.toMatchObject({ status: 503 });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("calls onAttemptFailed for every failed attempt and onExhausted exactly once at the end", async () => {
    const onAttemptFailed = vi.fn();
    const onExhausted = vi.fn();
    const fn = vi.fn().mockRejectedValue({ status: 503 });
    await expect(withRetry(fn, { ...instant, maxAttempts: 3, onAttemptFailed, onExhausted })).rejects.toBeTruthy();
    expect(onAttemptFailed).toHaveBeenCalledTimes(3);
    expect(onExhausted).toHaveBeenCalledTimes(1);
    expect(onExhausted).toHaveBeenCalledWith({ status: 503 }, 3);
  });

  it("respects a custom isRetryable predicate instead of the default classifier", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("business-rule-violation"));
    const isRetryable = (err) => err.message === "business-rule-violation";
    await expect(withRetry(fn, { ...instant, maxAttempts: 3, isRetryable })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(3); // custom predicate says retryable, so it exhausts normally
  });

  it("performance: immediate strategy with a fast-failing function completes without real delay", async () => {
    const fn = vi.fn().mockRejectedValue({ status: 503 });
    const start = Date.now();
    await expect(withRetry(fn, { maxAttempts: 20, strategy: "immediate" })).rejects.toBeTruthy();
    expect(Date.now() - start).toBeLessThan(500); // 20 real attempts, zero real backoff — must be fast
  });

  it("concurrency: independent concurrent withRetry calls don't share or corrupt state", async () => {
    const makeFlaky = (failTimes) => {
      let calls = 0;
      return vi.fn(async () => {
        calls++;
        if (calls <= failTimes) throw { status: 503 };
        return calls;
      });
    };
    const a = makeFlaky(1);
    const b = makeFlaky(3);
    const [resultA, resultB] = await Promise.all([
      withRetry(a, { ...instant, maxAttempts: 5 }),
      withRetry(b, { ...instant, maxAttempts: 5 }),
    ]);
    expect(resultA).toBe(2);
    expect(resultB).toBe(4);
  });
});
