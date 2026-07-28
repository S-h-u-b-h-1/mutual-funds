// Shared test-only helper — creates a disposable test user for integration tests and deletes it
// (cascades to every invest_* row via the FKs' `on delete cascade`) afterward. Same disposable-
// test-account pattern already used elsewhere in this session's verification passes; never used
// outside test files.
import { query } from "../db.js";
import * as identityService from "./identityService.js";
import * as complianceService from "./complianceService.js";
import { runWorkerTick } from "../platform/jobs/core.js";
import crypto from "node:crypto";

export async function createTestUser(label) {
  const email = `invest-test-${label}-${crypto.randomBytes(4).toString("hex")}@mfpulse.test`;
  const r = await query(`insert into users (name, email) values ($1, $2) returning id`, [`Test ${label}`, email]);
  return r.rows[0].id;
}

export async function deleteTestUser(userId) {
  // Drain any event-dispatch jobs this user's activity enqueued (emitEvent() calls from
  // identityService/complianceService/orderService/etc.) before deleting the user row — the
  // same drain makeInvestmentReadyUser does after its own setup (see its comment for the full
  // H11 background), but done here at teardown so it also catches jobs created by whatever the
  // CALLER did with this user afterward (orders, redemptions, a real end-to-end route flow like
  // journey1-onboarding.e2e.test.js), not just construction. Undrained, these jobs sit in the
  // shared `jobs` table indefinitely and get non-deterministically claimed by any other file's
  // unfiltered runWorkerTick() call — concretely, jobPlatform.test.js's own "drains the queue"
  // test, whose assertions can come up short if its freshly enqueued jobs lose a claim race
  // against a pile of foreign event-dispatch jobs nobody drained. Fixed once here so no caller
  // of the base createTestUser/deleteTestUser pair has to remember it.
  const pending = await query(
    `select id from jobs where type = 'event-dispatch' and correlation_id = $1 and status = 'queued'`,
    [userId]
  );
  if (pending.rows.length > 0) {
    await runWorkerTick({
      workerId: `test-delete-drain-${userId}`,
      maxJobs: pending.rows.length,
      idIn: pending.rows.map((r) => r.id),
    });
  }
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

  // ensureAccount() and every submitItem() call above that reaches a DONE status emit a real
  // domain event (InvestorCreated, ComplianceCompleted xN, InvestmentReady) — all with
  // correlationId=userId — which enqueues one real event-dispatch job per registered listener.
  // Undrained, this is exactly the shared jobs-table noise BACKEND_TECHNICAL_DEBT.md's H11
  // diagnosed: every one of this helper's callers was creating it, and only files that happened
  // to also call runWorkerTick() with no filter were vulnerable to tripping over the pile-up.
  // Draining it once, here, for every current and future caller, fixes the actual root cause
  // instead of requiring each caller to remember to filter around it.
  const pending = await query(
    `select id from jobs where type = 'event-dispatch' and correlation_id = $1 and status = 'queued'`,
    [userId]
  );
  if (pending.rows.length > 0) {
    await runWorkerTick({
      workerId: `test-mireu-drain-${userId}`,
      maxJobs: pending.rows.length,
      idIn: pending.rows.map((r) => r.id),
    });
  }

  return userId;
}
