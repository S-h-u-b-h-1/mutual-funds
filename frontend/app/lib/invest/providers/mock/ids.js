// Shared synthetic-id helpers for every mock provider — kept in one place so "what does a mock
// reference number look like" has one answer, not five slightly different ones.
import crypto from "node:crypto";

export function mockRef(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

export function mockAccountNumber() {
  // 8 digits, MFP-prefixed — visually distinct from any real BSE/CDSL/folio number format, so a
  // mock value is never mistaken for a real one in logs or a screenshot.
  const digits = crypto.randomInt(10000000, 99999999);
  return `MFPMOCK${digits}`;
}
