// Webhook Platform core (Phase 4 M2). Incoming pipeline: verify → replay/dup checks →
// persist → process async via the M1 job platform. Outgoing: fan out internal events to
// registered listener URLs as signed deliveries, again via jobs. Retries, backoff, and the
// failure queue are the job platform's — this module implements no second retry system.
import { query } from "../../db.js";
import { enqueueJob } from "../jobs/core.js";
import { registerHandler } from "../jobs/registry.js";
import { getWebhookProvider } from "./registry.js";
import { verifySignature, computeSignature } from "./signature.js";

// Only signature-relevant headers are persisted — a full header dump would store IPs, cookies,
// and infra internals nobody needs and compliance would have to answer for.
const STORED_HEADERS = ["x-webhook-signature", "x-webhook-timestamp", "x-webhook-event-id", "content-type", "user-agent"];

function headerSubset(headers) {
  const out = {};
  for (const key of STORED_HEADERS) {
    if (headers[key] != null) out[key] = headers[key];
  }
  return out;
}

async function recordRejection(provider, { payload = null, headers = {}, reason, signatureValid = false }) {
  const r = await query(
    `insert into webhook_deliveries (provider, payload, headers, signature_valid, status, reject_reason)
     values ($1, $2, $3, $4, 'rejected', $5) returning id`,
    [provider, payload == null ? null : JSON.stringify(payload), JSON.stringify(headerSubset(headers)), signatureValid, reason]
  );
  return { status: "rejected", reason, deliveryId: r.rows[0].id };
}

/**
 * The full incoming pipeline. `headers` is a plain object with lowercase keys; `rawBody` is
 * the exact request body string (signatures are computed over bytes, so parse AFTER verify).
 * Returns { status: 'received'|'duplicate'|'rejected'|'unknown_provider'|'disabled'|'unconfigured', … }.
 */
export async function receiveWebhook(provider, { rawBody, headers = {} }) {
  const ep = await query(`select * from webhook_endpoints where provider = $1`, [provider]);
  const endpoint = ep.rows[0];
  if (!endpoint) return { status: "unknown_provider" };
  if (!endpoint.enabled) {
    return { ...(await recordRejection(provider, { headers, reason: "Endpoint disabled." })), status: "disabled" };
  }

  const config = getWebhookProvider(provider);
  if (!config) {
    // endpoint row exists but no code registered a handler — a deployment/config gap, and it
    // should fail loudly at the edge rather than dead-letter mysteriously later
    return { ...(await recordRejection(provider, { headers, reason: "No handler registered in code for this provider." })), status: "unconfigured" };
  }

  let verdict;
  if (endpoint.signature_scheme === "custom") {
    verdict = config.verify
      ? config.verify({ rawBody, headers, endpoint })
      : { valid: false, reason: "signature_scheme=custom but the provider registered no verify()." };
  } else {
    verdict = verifySignature({
      secret: endpoint.secret_env_var ? process.env[endpoint.secret_env_var] : null,
      timestampSeconds: headers["x-webhook-timestamp"],
      rawBody,
      signature: headers["x-webhook-signature"],
      toleranceSeconds: endpoint.tolerance_seconds,
    });
  }
  if (!verdict.valid) {
    return await recordRejection(provider, { headers, reason: verdict.reason });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { ...(await recordRejection(provider, { headers, reason: "Malformed JSON body.", signatureValid: true })), status: "malformed" };
  }

  const externalEventId = config.extractEventId(payload, headers) ?? null;
  const eventType = config.extractEventType(payload, headers) ?? null;

  // Duplicate detection on the provider's own event id. The unique index is the authority
  // (races included); the SELECT just gives the friendly common-case answer. Duplicate
  // arrivals are recorded as their own 'duplicate' rows (event history), with the key nulled
  // so the index keeps pointing at the one real delivery.
  if (externalEventId != null) {
    const existing = await query(
      `select id from webhook_deliveries
       where provider = $1 and external_event_id = $2 and status <> 'rejected'`,
      [provider, externalEventId]
    );
    if (existing.rows[0]) {
      await query(
        `insert into webhook_deliveries (provider, payload, headers, signature_valid, status, reject_reason)
         values ($1, $2, $3, true, 'duplicate', $4)`,
        [provider, JSON.stringify(payload), JSON.stringify(headerSubset(headers)), `Duplicate of delivery ${existing.rows[0].id}`]
      );
      return { status: "duplicate", originalDeliveryId: existing.rows[0].id };
    }
  }

  let delivery;
  try {
    const r = await query(
      `insert into webhook_deliveries (provider, external_event_id, event_type, payload, headers, signature_valid, status)
       values ($1, $2, $3, $4, $5, true, 'received') returning *`,
      [provider, externalEventId, eventType, JSON.stringify(payload), JSON.stringify(headerSubset(headers))]
    );
    delivery = r.rows[0];
  } catch (err) {
    if (err?.code === "23505") {
      // lost the insert race to a concurrent identical event — same answer as the SELECT path
      const winner = await query(
        `select id from webhook_deliveries
         where provider = $1 and external_event_id = $2 and status <> 'rejected'`,
        [provider, externalEventId]
      );
      return { status: "duplicate", originalDeliveryId: winner.rows[0]?.id ?? null };
    }
    throw err;
  }

  const { job } = await enqueueJob(
    "webhook-process",
    { deliveryId: delivery.id },
    { idempotencyKey: `webhook-process:${delivery.id}`, correlationId: delivery.id, priority: 3 }
  );
  await query(`update webhook_deliveries set job_id = $2 where id = $1`, [delivery.id, job.id]);
  return { status: "received", deliveryId: delivery.id, jobId: job.id };
}

// ---- processing job handler (registered on the M1 platform below) ----

export async function processWebhookDelivery({ deliveryId }) {
  const r = await query(`select * from webhook_deliveries where id = $1`, [deliveryId]);
  const delivery = r.rows[0];
  if (!delivery) throw new Error(`webhook-process: delivery ${deliveryId} not found.`);
  if (delivery.status === "processed") return { alreadyProcessed: true }; // at-least-once re-run
  if (!["received", "processing", "failed"].includes(delivery.status)) {
    return { skipped: delivery.status };
  }
  const config = getWebhookProvider(delivery.provider);
  if (!config) throw new Error(`webhook-process: no handler registered for '${delivery.provider}'.`);
  await query(`update webhook_deliveries set status = 'processing' where id = $1`, [deliveryId]);
  try {
    const result = await config.handler(delivery.payload, { delivery });
    await query(
      `update webhook_deliveries set status = 'processed', processed_at = now(), last_error = null where id = $1`,
      [deliveryId]
    );
    return result ?? { processed: true };
  } catch (err) {
    await query(
      `update webhook_deliveries set status = 'failed', last_error = $2 where id = $1`,
      [deliveryId, String(err?.message ?? err).slice(0, 2000)]
    );
    throw err; // job platform owns retry/backoff/DLQ
  }
}

// ---- outgoing ----

/**
 * Fan an internal event out to every enabled registered listener whose event_types include
 * it. Each (event, listener) pair becomes one delivery row + one delivery job.
 */
export async function emitOutboundEvent(eventType, payload) {
  const listeners = await query(
    `select * from webhook_outbound where enabled and event_types @> $1::jsonb`,
    [JSON.stringify([eventType])]
  );
  const deliveries = [];
  for (const listener of listeners.rows) {
    const d = await query(
      `insert into webhook_outbound_deliveries (outbound_id, event_type, payload)
       values ($1, $2, $3) returning id`,
      [listener.id, eventType, JSON.stringify(payload)]
    );
    const { job } = await enqueueJob(
      "webhook-outbound-deliver",
      { outboundDeliveryId: d.rows[0].id },
      { idempotencyKey: `webhook-out:${d.rows[0].id}`, correlationId: d.rows[0].id }
    );
    await query(`update webhook_outbound_deliveries set job_id = $2 where id = $1`, [d.rows[0].id, job.id]);
    deliveries.push(d.rows[0].id);
  }
  return { matched: listeners.rows.length, deliveryIds: deliveries };
}

export async function deliverOutboundWebhook({ outboundDeliveryId }, { job } = {}) {
  const r = await query(
    `select d.*, o.url, o.secret_env_var, o.enabled, o.name
     from webhook_outbound_deliveries d join webhook_outbound o on o.id = d.outbound_id
     where d.id = $1`,
    [outboundDeliveryId]
  );
  const delivery = r.rows[0];
  if (!delivery) throw new Error(`webhook-outbound-deliver: delivery ${outboundDeliveryId} not found.`);
  if (delivery.status === "delivered") return { alreadyDelivered: true };
  if (!delivery.enabled) {
    await query(
      `update webhook_outbound_deliveries set status = 'dead', last_error = 'Listener disabled before delivery.' where id = $1`,
      [outboundDeliveryId]
    );
    return { skipped: "listener_disabled" };
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({ event: delivery.event_type, deliveryId: delivery.id, payload: delivery.payload });
  const requestHeaders = {
    "content-type": "application/json",
    "x-webhook-timestamp": String(timestamp),
    "x-webhook-delivery": delivery.id,
  };
  const secret = delivery.secret_env_var ? process.env[delivery.secret_env_var] : null;
  if (secret) requestHeaders["x-webhook-signature"] = computeSignature(secret, timestamp, body);

  let statusCode = null;
  let error = null;
  try {
    const res = await fetch(delivery.url, {
      method: "POST",
      headers: requestHeaders,
      body,
      signal: AbortSignal.timeout(10_000),
    });
    statusCode = res.status;
    if (!res.ok) error = `Listener responded HTTP ${res.status}.`;
  } catch (err) {
    error = `Delivery failed: ${String(err?.message ?? err)}`;
  }

  if (error == null) {
    await query(
      `update webhook_outbound_deliveries
       set status = 'delivered', attempts = attempts + 1, last_status_code = $2, last_error = null, delivered_at = now()
       where id = $1`,
      [outboundDeliveryId, statusCode]
    );
    return { delivered: true, statusCode };
  }

  // final attempt (job platform is about to dead-letter) → mark the delivery dead too, so the
  // deliveries table tells the truth without needing a join against the DLQ
  const isFinalAttempt = job && job.attempts >= job.max_attempts;
  await query(
    `update webhook_outbound_deliveries
     set status = $3, attempts = attempts + 1, last_status_code = $2, last_error = $4
     where id = $1`,
    [outboundDeliveryId, statusCode, isFinalAttempt ? "dead" : "pending", error.slice(0, 2000)]
  );
  throw new Error(error);
}

// Register both job types on the M1 platform (module side effect, same pattern as the
// maintenance handlers — jobs/handlers/index.js imports this module into the production set).
registerHandler("webhook-process", processWebhookDelivery);
registerHandler("webhook-outbound-deliver", deliverOutboundWebhook);

/** Aggregate webhook metrics for observability — counts only, never payloads. */
export async function getWebhookMetrics() {
  const [incoming, outbound] = await Promise.all([
    query(`select provider, status, count(*)::int as count
           from webhook_deliveries where received_at > now() - interval '7 days'
           group by provider, status order by provider, status`),
    query(`select o.name, d.status, count(*)::int as count
           from webhook_outbound_deliveries d join webhook_outbound o on o.id = d.outbound_id
           where d.created_at > now() - interval '7 days'
           group by o.name, d.status order by o.name, d.status`),
  ]);
  return { incomingLast7d: incoming.rows, outboundLast7d: outbound.rows };
}
