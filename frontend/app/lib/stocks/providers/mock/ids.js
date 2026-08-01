// Synthetic-id helper for the stocks-domain mock provider — a deliberate small duplication of
// frontend/app/lib/invest/providers/mock/ids.js's idea rather than a cross-domain import, keeping
// this domain's provider seam fully independent of the Invest platform's.
import crypto from "node:crypto";

export function mockRef(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}
