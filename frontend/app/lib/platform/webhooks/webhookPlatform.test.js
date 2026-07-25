// Webhook Platform integration tests (Phase 4 M2) — real Neon, real HTTP for outbound
// delivery (an in-test local server), real job-platform round-trips. Disposable-rows
// discipline: everything is tagged with this run's id and deleted afterwards.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import http from "node:http";
import { query } from "../../db.js";
import { computeSignature, verifySignature } from "./signature.js";
import { registerWebhookProvider } from "./registry.js";
import {
  receiveWebhook,
  processWebhookDelivery,
  emitOutboundEvent,
  deliverOutboundWebhook,
  getWebhookMetrics,
} from "./core.js";
import { runWorkerTick, getJob } from "../jobs/core.js";
// full production handler set so a tick from this suite executes ANY real due job correctly
import "../jobs/handlers/index.js";
import { acquireClaimTestLock, releaseClaimTestLock } from "../jobs/testClaimLock.js";

const RUN = crypto.randomBytes(3).toString("hex");
const SECRET = `test-secret-${RUN}`;
const createdDeliveryIds = [];

function signedHeaders(rawBody, { secret = SECRET, ageSeconds = 0 } = {}) {
  const ts = Math.floor(Date.now() / 1000) - ageSeconds;
  return {
    "x-webhook-timestamp": String(ts),
    "x-webhook-signature": computeSignature(secret, ts, rawBody),
    "content-type": "application/json",
  };
}

async function receiveTracked(provider, args) {
  const result = await receiveWebhook(provider, args);
  if (result.deliveryId) createdDeliveryIds.push(result.deliveryId);
  return result;
}

beforeAll(async () => {
  // See jobs/testClaimLock.js: this file's runWorkerTick() call and jobPlatform.test.js both
  // claim from the shared `jobs` table and race each other under Vitest's file-level
  // parallelism without this.
  await acquireClaimTestLock();
  // the seeded mock-payments endpoint names this env var as its secret source
  process.env.WEBHOOK_SECRET_MOCK_PAYMENTS = SECRET;
  process.env[`WEBHOOK_SECRET_TEST_OUT_${RUN}`] = SECRET;
});

afterAll(async () => {
  // deliveries created directly + any recorded rows (rejected/duplicate) from this run's window
  await query(`delete from webhook_deliveries where id = any($1::uuid[])`, [createdDeliveryIds]);
  await query(
    `delete from webhook_deliveries where provider like $1 or (provider = 'mock-payments' and payload->>'test_run' = $2)`,
    [`test-${RUN}-%`, RUN]
  );
  await query(
    `delete from webhook_deliveries where provider = 'mock-payments' and payload is null and received_at > now() - interval '30 minutes' and status = 'rejected'`
  );
  await query(`delete from webhook_endpoints where provider like $1`, [`test-${RUN}-%`]);
  await query(`delete from webhook_outbound where name like $1`, [`test-${RUN}-%`]); // cascades deliveries
  await query(`delete from jobs where idempotency_key like 'webhook-process:%' and payload->>'deliveryId' = any($1)`, [createdDeliveryIds.map(String)]);
  await query(
    `delete from jobs where type in ('webhook-process','webhook-outbound-deliver') and created_at > now() - interval '30 minutes'
       and not exists (select 1 from webhook_deliveries wd where wd.id::text = jobs.payload->>'deliveryId')
       and not exists (select 1 from webhook_outbound_deliveries od where od.id::text = jobs.payload->>'outboundDeliveryId')`
  );
  await releaseClaimTestLock();
});

describe("webhook signature scheme", () => {
  const body = `{"n":1}`;
  it("round-trips a valid signature", () => {
    const ts = Math.floor(Date.now() / 1000);
    const sig = computeSignature(SECRET, ts, body);
    expect(verifySignature({ secret: SECRET, timestampSeconds: ts, rawBody: body, signature: sig })).toEqual({ valid: true, reason: null });
  });
  it("rejects a wrong secret and a tampered body", () => {
    const ts = Math.floor(Date.now() / 1000);
    const sig = computeSignature(SECRET, ts, body);
    expect(verifySignature({ secret: "other", timestampSeconds: ts, rawBody: body, signature: sig }).valid).toBe(false);
    expect(verifySignature({ secret: SECRET, timestampSeconds: ts, rawBody: `{"n":2}`, signature: sig }).valid).toBe(false);
  });
  it("rejects a stale timestamp (replay protection) and missing headers", () => {
    const ts = Math.floor(Date.now() / 1000) - 3600;
    const sig = computeSignature(SECRET, ts, body);
    const stale = verifySignature({ secret: SECRET, timestampSeconds: ts, rawBody: body, signature: sig, toleranceSeconds: 300 });
    expect(stale.valid).toBe(false);
    expect(stale.reason).toMatch(/replay window/);
    expect(verifySignature({ secret: SECRET, rawBody: body }).valid).toBe(false);
  });
});

describe("incoming pipeline (integration, real Neon)", () => {
  it("unknown provider is refused before any verification", async () => {
    const result = await receiveWebhook(`test-${RUN}-nope`, { rawBody: "{}", headers: {} });
    expect(result.status).toBe("unknown_provider");
  });

  it("a correctly signed webhook is persisted and a processing job is enqueued", async () => {
    const rawBody = JSON.stringify({ event_id: `evt-${RUN}-1`, payment_id: "pay_1", order_ref: "ord_1", status: "captured", test_run: RUN });
    const result = await receiveTracked("mock-payments", { rawBody, headers: signedHeaders(rawBody) });
    expect(result.status).toBe("received");
    const d = await query(`select * from webhook_deliveries where id = $1`, [result.deliveryId]);
    expect(d.rows[0].signature_valid).toBe(true);
    expect(d.rows[0].external_event_id).toBe(`evt-${RUN}-1`);
    expect(d.rows[0].event_type).toBe("payment.captured");
    expect(d.rows[0].job_id).toBe(result.jobId);
    const job = await getJob(result.jobId);
    expect(job.type).toBe("webhook-process");
    expect(job.idempotency_key).toBe(`webhook-process:${result.deliveryId}`);
  });

  it("an invalid signature is rejected, recorded with its reason, and enqueues nothing", async () => {
    const rawBody = JSON.stringify({ event_id: `evt-${RUN}-forged`, test_run: RUN });
    const result = await receiveTracked("mock-payments", {
      rawBody,
      headers: signedHeaders(rawBody, { secret: "wrong-secret" }),
    });
    expect(result.status).toBe("rejected");
    expect(result.reason).toMatch(/mismatch/i);
    const d = await query(`select * from webhook_deliveries where id = $1`, [result.deliveryId]);
    expect(d.rows[0].status).toBe("rejected");
    expect(d.rows[0].signature_valid).toBe(false);
    expect(d.rows[0].job_id).toBeNull();
    const jobs = await query(`select count(*)::int as c from jobs where payload->>'deliveryId' = $1`, [result.deliveryId]);
    expect(jobs.rows[0].c).toBe(0);
  });

  it("a replayed (stale-timestamp) request is rejected even with a once-valid signature", async () => {
    const rawBody = JSON.stringify({ event_id: `evt-${RUN}-replay`, test_run: RUN });
    const result = await receiveTracked("mock-payments", { rawBody, headers: signedHeaders(rawBody, { ageSeconds: 3600 }) });
    expect(result.status).toBe("rejected");
    expect(result.reason).toMatch(/replay window/);
  });

  it("the same provider event id is detected as a duplicate: acked, recorded, not re-enqueued", async () => {
    const rawBody = JSON.stringify({ event_id: `evt-${RUN}-dup`, payment_id: "pay_2", order_ref: "ord_2", status: "captured", test_run: RUN });
    const first = await receiveTracked("mock-payments", { rawBody, headers: signedHeaders(rawBody) });
    expect(first.status).toBe("received");
    const second = await receiveTracked("mock-payments", { rawBody, headers: signedHeaders(rawBody) });
    expect(second.status).toBe("duplicate");
    expect(second.originalDeliveryId).toBe(first.deliveryId);
    const history = await query(
      `select status, count(*)::int as c from webhook_deliveries
       where provider = 'mock-payments' and payload->>'event_id' = $1 group by status`,
      [`evt-${RUN}-dup`]
    );
    const byStatus = Object.fromEntries(history.rows.map((r) => [r.status, r.c]));
    expect(byStatus.received).toBe(1);
    expect(byStatus.duplicate).toBe(1); // duplicate arrival kept as event history
    const jobs = await query(`select count(*)::int as c from jobs where payload->>'deliveryId' = $1`, [first.deliveryId]);
    expect(jobs.rows[0].c).toBe(1);
  });

  it("valid signature over a malformed JSON body is recorded and refused", async () => {
    const rawBody = `{"not json`;
    const result = await receiveTracked("mock-payments", { rawBody, headers: signedHeaders(rawBody) });
    expect(result.status).toBe("malformed");
  });

  it("a disabled endpoint refuses deliveries", async () => {
    const provider = `test-${RUN}-disabled`;
    await query(
      `insert into webhook_endpoints (provider, signature_scheme, enabled) values ($1, 'hmac-sha256', false)`,
      [provider]
    );
    registerWebhookProvider(provider, { handler: async () => ({}) });
    const result = await receiveWebhook(provider, { rawBody: "{}", headers: {} });
    expect(result.status).toBe("disabled");
  });

  it("custom signature scheme: the provider's own verify() decides (future real-provider path)", async () => {
    const provider = `test-${RUN}-custom`;
    await query(
      `insert into webhook_endpoints (provider, signature_scheme) values ($1, 'custom')`,
      [provider]
    );
    registerWebhookProvider(provider, {
      handler: async (payload) => ({ got: payload.n }),
      verify: ({ headers }) =>
        headers["x-provider-token"] === `tok-${RUN}` ? { valid: true, reason: null } : { valid: false, reason: "Bad provider token." },
      extractEventId: (payload) => payload?.ref ?? null,
    });
    const ok = await receiveTracked(provider, { rawBody: JSON.stringify({ n: 7, ref: "r1" }), headers: { "x-provider-token": `tok-${RUN}` } });
    expect(ok.status).toBe("received");
    const bad = await receiveTracked(provider, { rawBody: "{}", headers: { "x-provider-token": "nope" } });
    expect(bad.status).toBe("rejected");
    expect(bad.reason).toBe("Bad provider token.");
  });
});

describe("processing (handler execution via job platform)", () => {
  it("processWebhookDelivery runs the provider handler and marks the delivery processed — idempotently", async () => {
    const rawBody = JSON.stringify({ event_id: `evt-${RUN}-proc`, payment_id: "pay_3", order_ref: "ord_3", status: "authorized", test_run: RUN });
    const received = await receiveTracked("mock-payments", { rawBody, headers: signedHeaders(rawBody) });
    const result = await processWebhookDelivery({ deliveryId: received.deliveryId });
    expect(result.acknowledged).toBe(true);
    const d = await query(`select status, processed_at from webhook_deliveries where id = $1`, [received.deliveryId]);
    expect(d.rows[0].status).toBe("processed");
    expect(d.rows[0].processed_at).not.toBeNull();
    const again = await processWebhookDelivery({ deliveryId: received.deliveryId });
    expect(again.alreadyProcessed).toBe(true);
  });

  it("a handler failure marks the delivery failed with the error and rethrows for the job platform to retry", async () => {
    const rawBody = JSON.stringify({ event_id: `evt-${RUN}-badpay`, payment_id: "pay_4", test_run: RUN }); // missing order_ref+status
    const received = await receiveTracked("mock-payments", { rawBody, headers: signedHeaders(rawBody) });
    await expect(processWebhookDelivery({ deliveryId: received.deliveryId })).rejects.toThrow(/missing required field/);
    const d = await query(`select status, last_error from webhook_deliveries where id = $1`, [received.deliveryId]);
    expect(d.rows[0].status).toBe("failed");
    expect(d.rows[0].last_error).toMatch(/order_ref/);
  });

  it("end-to-end: receive → worker tick → processed", async () => {
    const rawBody = JSON.stringify({ event_id: `evt-${RUN}-e2e`, payment_id: "pay_5", order_ref: "ord_5", status: "refunded", test_run: RUN });
    const received = await receiveTracked("mock-payments", { rawBody, headers: signedHeaders(rawBody) });
    // idIn scopes the claim to this exact job at the SQL level — the shared jobs table can hold
    // unrelated due rows from other concurrently-running test files (see jobs/testClaimLock.js).
    await runWorkerTick({ workerId: `test-webhook-${RUN}`, maxJobs: 1, idIn: [received.jobId] });
    const d = await query(`select status from webhook_deliveries where id = $1`, [received.deliveryId]);
    expect(d.rows[0].status).toBe("processed");
    const job = await getJob(received.jobId);
    expect(job.status).toBe("succeeded");
    expect(job.result.status).toBe("refunded");
  });
});

describe("outgoing deliveries", () => {
  async function makeListener({ eventTypes, port, secretEnvVar = `WEBHOOK_SECRET_TEST_OUT_${RUN}` }) {
    const r = await query(
      `insert into webhook_outbound (name, url, event_types, secret_env_var)
       values ($1, $2, $3, $4) returning *`,
      [`test-${RUN}-listener-${port ?? "x"}`, `http://127.0.0.1:${port}/hook`, JSON.stringify(eventTypes), secretEnvVar]
    );
    return r.rows[0];
  }

  it("emitOutboundEvent fans out only to enabled listeners subscribed to that event type", async () => {
    const a = await makeListener({ eventTypes: [`test.${RUN}.match`], port: 1 });
    await makeListener({ eventTypes: [`test.${RUN}.other`], port: 2 });
    const result = await emitOutboundEvent(`test.${RUN}.match`, { hello: 1 });
    expect(result.matched).toBe(1);
    const rows = await query(`select * from webhook_outbound_deliveries where outbound_id = $1`, [a.id]);
    expect(rows.rows.length).toBe(1);
    expect(rows.rows[0].status).toBe("pending");
    expect(rows.rows[0].job_id).not.toBeNull();
  });

  it("delivers a signed POST the listener can verify; re-delivery is a no-op", async () => {
    const seen = [];
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        seen.push({ headers: req.headers, body });
        res.writeHead(200).end("ok");
      });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    try {
      const listener = await makeListener({ eventTypes: [`test.${RUN}.sign`], port });
      const emitted = await emitOutboundEvent(`test.${RUN}.sign`, { amount: 42 });
      const deliveryId = emitted.deliveryIds[0];
      const outcome = await deliverOutboundWebhook({ outboundDeliveryId: deliveryId });
      expect(outcome.delivered).toBe(true);
      expect(seen.length).toBe(1);
      const verdict = verifySignature({
        secret: SECRET,
        timestampSeconds: seen[0].headers["x-webhook-timestamp"],
        rawBody: seen[0].body,
        signature: seen[0].headers["x-webhook-signature"],
      });
      expect(verdict.valid).toBe(true);
      expect(JSON.parse(seen[0].body).event).toBe(`test.${RUN}.sign`);
      const row = await query(`select status, attempts, last_status_code from webhook_outbound_deliveries where id = $1`, [deliveryId]);
      expect(row.rows[0]).toMatchObject({ status: "delivered", attempts: 1, last_status_code: 200 });
      const again = await deliverOutboundWebhook({ outboundDeliveryId: deliveryId });
      expect(again.alreadyDelivered).toBe(true);
      expect(seen.length).toBe(1); // no second POST
    } finally {
      server.close();
    }
  });

  it("a failing listener throws for retry; the final attempt marks the delivery dead", async () => {
    const server = http.createServer((req, res) => res.writeHead(500).end("boom"));
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    try {
      await makeListener({ eventTypes: [`test.${RUN}.fail`], port });
      const emitted = await emitOutboundEvent(`test.${RUN}.fail`, { n: 1 });
      const deliveryId = emitted.deliveryIds[0];
      await expect(deliverOutboundWebhook({ outboundDeliveryId: deliveryId })).rejects.toThrow(/HTTP 500/);
      let row = await query(`select status, attempts, last_status_code from webhook_outbound_deliveries where id = $1`, [deliveryId]);
      expect(row.rows[0]).toMatchObject({ status: "pending", attempts: 1, last_status_code: 500 });
      // simulate the job platform's final attempt
      await expect(
        deliverOutboundWebhook({ outboundDeliveryId: deliveryId }, { job: { attempts: 5, max_attempts: 5 } })
      ).rejects.toThrow(/HTTP 500/);
      row = await query(`select status, attempts from webhook_outbound_deliveries where id = $1`, [deliveryId]);
      expect(row.rows[0].status).toBe("dead");
      expect(row.rows[0].attempts).toBe(2);
    } finally {
      server.close();
    }
  });

  it("a listener disabled after emit is skipped and the delivery marked dead", async () => {
    const listener = await makeListener({ eventTypes: [`test.${RUN}.late-disable`], port: 3 });
    const emitted = await emitOutboundEvent(`test.${RUN}.late-disable`, { n: 1 });
    await query(`update webhook_outbound set enabled = false where id = $1`, [listener.id]);
    const outcome = await deliverOutboundWebhook({ outboundDeliveryId: emitted.deliveryIds[0] });
    expect(outcome.skipped).toBe("listener_disabled");
    const row = await query(`select status from webhook_outbound_deliveries where id = $1`, [emitted.deliveryIds[0]]);
    expect(row.rows[0].status).toBe("dead");
  });
});

describe("metrics", () => {
  it("aggregates counts by provider/status without leaking payloads or URLs", async () => {
    const metrics = await getWebhookMetrics();
    expect(Array.isArray(metrics.incomingLast7d)).toBe(true);
    expect(Array.isArray(metrics.outboundLast7d)).toBe(true);
    const serialized = JSON.stringify(metrics);
    expect(serialized).not.toMatch(/payment_id|127\.0\.0\.1/);
  });
});
