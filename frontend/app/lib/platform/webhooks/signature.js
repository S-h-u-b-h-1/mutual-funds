// Webhook signature scheme (hmac-sha256): sign/verify "<timestamp>.<rawBody>" with a shared
// secret. Used for OUR outbound deliveries and for inbound providers that let us choose the
// scheme (the mock does). Providers with a dictated scheme register a custom verify() instead
// (registry.js) — nothing here assumes any real provider's undocumented format.
import crypto from "node:crypto";

export function computeSignature(secret, timestampSeconds, rawBody) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestampSeconds}.${rawBody}`)
    .digest("hex");
}

/**
 * Verify an hmac-sha256 webhook signature. Returns { valid, reason }.
 * - timing-safe comparison (a plain === would leak match length/position timing)
 * - replay protection: the SIGNED timestamp must be within toleranceSeconds of now, so a
 *   captured request can't be resent later (and a forged timestamp breaks the signature)
 */
export function verifySignature({ secret, timestampSeconds, rawBody, signature, toleranceSeconds = 300, nowMs = Date.now() }) {
  if (!secret) return { valid: false, reason: "No signing secret configured." };
  if (!timestampSeconds || !signature) return { valid: false, reason: "Missing signature headers." };
  const ts = Number(timestampSeconds);
  if (!Number.isFinite(ts)) return { valid: false, reason: "Malformed timestamp." };
  const ageSeconds = Math.abs(nowMs / 1000 - ts);
  if (ageSeconds > toleranceSeconds) {
    return { valid: false, reason: `Timestamp outside replay window (${Math.round(ageSeconds)}s > ${toleranceSeconds}s).` };
  }
  const expected = computeSignature(secret, timestampSeconds, rawBody);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(signature), "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, reason: "Signature mismatch." };
  }
  return { valid: true, reason: null };
}
