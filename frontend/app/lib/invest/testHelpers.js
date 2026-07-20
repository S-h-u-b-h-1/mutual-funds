// Shared test-only helper — creates a disposable test user for integration tests and deletes it
// (cascades to every invest_* row via the FKs' `on delete cascade`) afterward. Same disposable-
// test-account pattern already used elsewhere in this session's verification passes; never used
// outside test files.
import { query } from "../db.js";
import * as identityService from "./identityService.js";
import * as complianceService from "./complianceService.js";
import crypto from "node:crypto";

export async function createTestUser(label) {
  const email = `invest-test-${label}-${crypto.randomBytes(4).toString("hex")}@mfpulse.test`;
  const r = await query(`insert into users (name, email) values ($1, $2) returning id`, [`Test ${label}`, email]);
  return r.rows[0].id;
}

export async function deleteTestUser(userId) {
  await query(`delete from users where id = $1`, [userId]);
}

// Fast-tracks a disposable user through the whole Journey 1 flow (already verified end-to-end
// in journey1-onboarding.e2e.test.js) so tests for later journeys (Order Management, Portfolio,
// ...) don't each re-derive "how do I get an investment-ready user" — one real, tested setup
// path, reused. Forces Math.random for the pass duration so PAN/identity/bank land on their
// success branch deterministically; restores it before returning.
export async function makeInvestmentReadyUser(label) {
  const userId = await createTestUser(label);
  await identityService.upsertProfile(userId, { occupation: "Test", city: "Test City" });
  await identityService.ensureAccount(userId);
  await identityService.upsertRiskProfile(userId, {
    horizonScore: 3, lossToleranceScore: 3, incomeStabilityScore: 3, experienceScore: 3,
  });

  const originalRandom = Math.random;
  Math.random = () => 0.1; // force every weighted mock outcome onto its success branch
  try {
    await complianceService.submitItem(userId, "mobile", { otp: "123456" });
    await complianceService.submitItem(userId, "email", { otp: "123456" });
    await complianceService.submitItem(userId, "pan", { pan: "ABCDE1234F" });
    await complianceService.submitItem(userId, "identity", { pan: "ABCDE1234F", consentToken: `consent_${label}` });
    await complianceService.submitItem(userId, "nominee", { name: "Test Nominee", relationship: "Spouse", allocationPct: 100 });
    await complianceService.submitItem(userId, "bank", { accountNumber: "000111222333", ifsc: "HDFC0000001", accountHolderName: "Test User" });
    await complianceService.submitItem(userId, "fatca", { declared: true });
    await complianceService.submitItem(userId, "risk_profile", {});
  } finally {
    Math.random = originalRandom;
  }

  return userId;
}
