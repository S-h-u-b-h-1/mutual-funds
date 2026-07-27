import { describe, it, expect } from "vitest";
import { query } from "../../db.js";
import { checkRateLimit, getClientIp } from "./core.js";

function uniqueAction(label) {
  return `test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

describe("checkRateLimit (integration, real Neon)", () => {
  it("allows requests up to the limit, then rejects", async () => {
    const action = uniqueAction("basic");
    const opts = { limit: 3, windowSeconds: 60 };
    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(await checkRateLimit(action, "user-a", opts));
    }
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false, false]);
    expect(results[4].count).toBe(5); // still counts past the limit, for visibility into how far over
  });

  it("different identifiers under the same action have independent buckets", async () => {
    const action = uniqueAction("independent");
    const opts = { limit: 1, windowSeconds: 60 };
    const a1 = await checkRateLimit(action, "alice", opts);
    const a2 = await checkRateLimit(action, "alice", opts);
    const b1 = await checkRateLimit(action, "bob", opts);
    expect(a1.allowed).toBe(true);
    expect(a2.allowed).toBe(false); // alice's second request in the same window
    expect(b1.allowed).toBe(true); // bob is unaffected by alice's count
  });

  it("different actions for the same identifier have independent buckets", async () => {
    const identifier = `shared-identifier-${Date.now()}`;
    const opts = { limit: 1, windowSeconds: 60 };
    const login = await checkRateLimit(uniqueAction("login"), identifier, opts);
    const register = await checkRateLimit(uniqueAction("register"), identifier, opts);
    expect(login.allowed).toBe(true);
    expect(register.allowed).toBe(true); // a fresh action namespace, not sharing login's count
  });

  // Races real concurrent requests (Promise.all, not sequential calls) against ONE fresh bucket —
  // the property this is actually testing is that the underlying UPSERT is atomic under
  // concurrency, not just correct when called one at a time. A sequential loop could never expose
  // a race in the counting itself.
  it("under real concurrency, exactly `limit` requests are allowed — never more, from a fresh bucket", async () => {
    const action = uniqueAction("concurrent");
    const opts = { limit: 5, windowSeconds: 60 };
    const results = await Promise.all(
      Array.from({ length: 20 }, () => checkRateLimit(action, "racer", opts))
    );
    const allowedCount = results.filter((r) => r.allowed).length;
    expect(allowedCount).toBe(5);

    // Cross-check against the table directly — the real financial-grade claim isn't "20 function
    // calls agreed with each other," it's "the persisted count is exactly 20," proving no
    // increment was lost to the concurrent UPSERTs racing each other.
    const row = await query(
      `select count from rate_limit_buckets where bucket_key = $1 order by window_start desc limit 1`,
      [`${action}:racer`]
    );
    expect(Number(row.rows[0].count)).toBe(20);
  });

  it("fails open (allowed: true) if the identifier is oddly-shaped, never throws", async () => {
    const action = uniqueAction("odd-input");
    await expect(checkRateLimit(action, "", { limit: 1, windowSeconds: 60 })).resolves.toMatchObject({ allowed: true });
  });
});

describe("getClientIp", () => {
  it("takes the first hop from x-forwarded-for", () => {
    const request = { headers: new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }) };
    expect(getClientIp(request)).toBe("203.0.113.5");
  });

  it("falls back to a well-formed placeholder, never null/undefined, when the header is absent", () => {
    const request = { headers: new Headers() };
    expect(getClientIp(request)).toBe("unknown");
  });
});
