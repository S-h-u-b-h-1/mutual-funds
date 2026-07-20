// 'mock-payments' — the harness provider proving the incoming pipeline end-to-end. It stands
// where a real payment gateway's callback handler will: same registration surface, same
// contract. It validates shape and acknowledges; wiring payment status into orders belongs to
// the reconciliation/payment milestones (M3/M5) — a mock provider must not fake that.
// The delivery row itself (webhook_deliveries) is the durable trace of every callback.
import { registerWebhookProvider } from "../registry.js";

export function handleMockPaymentEvent(payload) {
  const required = ["payment_id", "order_ref", "status"];
  const missing = required.filter((k) => payload?.[k] == null);
  if (missing.length > 0) {
    throw new Error(`mock-payments payload missing required field(s): ${missing.join(", ")}`);
  }
  const allowed = ["initiated", "authorized", "captured", "failed", "refunded"];
  if (!allowed.includes(payload.status)) {
    throw new Error(`mock-payments unknown payment status '${payload.status}'.`);
  }
  return { acknowledged: true, payment_id: payload.payment_id, status: payload.status };
}

registerWebhookProvider("mock-payments", {
  handler: handleMockPaymentEvent,
  extractEventId: (payload) => payload?.event_id ?? null,
  extractEventType: (payload) => (payload?.status ? `payment.${payload.status}` : null),
});
