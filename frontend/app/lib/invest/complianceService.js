// Module 2 — Compliance Engine. Per-item state machine (pending -> in_progress ->
// verified/rejected/needs_review -> completed) plus overall percentage progress. Backs
// docs/INVEST_PLATFORM_ARCHITECTURE.md §6. Every item transition goes through the (mock, this
// phase) provider interfaces in ./providers — never a hardcoded "always succeeds" — so the
// frontend has to handle rejected/needs_review states, not just the happy path.
import { query } from "../db.js";
import { kycProvider, documentProvider } from "./providers/index.js";
import { logAudit } from "./audit.js";
import { emitEvent } from "../platform/events/core.js";

// 'investment_ready' is last on purpose — it's a derived gate, never directly submitted by the
// user, only auto-completed once every other item is done (see maybeCompleteInvestmentReady).
export const ITEM_KEYS = ["mobile", "email", "pan", "identity", "nominee", "bank", "fatca", "risk_profile", "investment_ready"];
const DONE_STATUSES = new Set(["verified", "completed"]);

export async function ensureApplication(userId) {
  const app = await query(
    `insert into compliance_applications (user_id) values ($1)
     on conflict (user_id) do update set user_id = excluded.user_id
     returning *`,
    [userId]
  );
  const applicationId = app.rows[0].id;
  // Batched into one round trip instead of one insert per item key — this runs unconditionally
  // on every getApplication() call (the compliance gate checked before every order/redemption/
  // switch/SIP action), so after the first call for a user every one of these becomes a pure-
  // overhead no-op INSERT ... ON CONFLICT DO NOTHING. unnest() expands the array server-side.
  await query(
    `insert into compliance_items (application_id, item_key)
       select $1, unnest($2::text[])
     on conflict (application_id, item_key) do nothing`,
    [applicationId, ITEM_KEYS]
  );
  return app.rows[0];
}

export async function getApplication(userId) {
  const app = await ensureApplication(userId);
  const items = await query(
    `select item_key, status, provider, provider_reference, rejection_reason, completed_at, updated_at
       from compliance_items where application_id = $1 order by item_key`,
    [app.id]
  );
  return { application: app, items: items.rows };
}

async function setItemStatus(applicationId, itemKey, { status, provider = null, providerReference = null, rejectionReason = null }) {
  // completed_at derives from $3 (status) via a pure SQL CASE, not string interpolation — status
  // only ever comes from this module's own dispatch table (never request payload) so
  // interpolating it would be safe too, but a fully parameterized query needs no such reasoning
  // from a future reader at all.
  const r = await query(
    `update compliance_items set
       status = $3, provider = $4, provider_reference = $5, rejection_reason = $6,
       completed_at = case when $3 = any($7::text[]) then now() else null end,
       updated_at = now()
     where application_id = $1 and item_key = $2
     returning *`,
    [applicationId, itemKey, status, provider, providerReference, rejectionReason, [...DONE_STATUSES]]
  );
  return r.rows[0];
}

// mobile/email: a lightweight OTP simulation, not a real SMS/email send. "123456" is the
// well-known mock success code; anything else is rejected — this exists so the frontend can
// build and test both the success and failure OTP screens against something real.
function verifyMockOtp(otp) {
  return otp === "123456"
    ? { status: "completed", rejectionReason: null }
    : { status: "rejected", rejectionReason: "Invalid OTP (mock environment: use 123456)." };
}

async function refreshOverallStatus(userId) {
  const { application, items } = await getApplication(userId);
  let overall;
  if (items.some((i) => i.status === "rejected")) overall = "rejected";
  else if (items.some((i) => i.status === "needs_review")) overall = "needs_review";
  else if (items.every((i) => DONE_STATUSES.has(i.status))) overall = "completed";
  else if (items.some((i) => i.status !== "pending")) overall = "in_progress";
  else overall = "pending";
  await query(`update compliance_applications set overall_status = $2, updated_at = now() where id = $1`, [application.id, overall]);
  return overall;
}

// The derived gate item — only auto-completes once every OTHER item is verified/completed.
// Never directly submitted through submitItem() (see the guard there).
async function maybeCompleteInvestmentReady(userId, applicationId) {
  const { items } = await getApplication(userId);
  const others = items.filter((i) => i.item_key !== "investment_ready");
  if (others.every((i) => DONE_STATUSES.has(i.status))) {
    await setItemStatus(applicationId, "investment_ready", { status: "completed" });
    await emitEvent("InvestmentReady", { userId }, { correlationId: userId, source: "complianceService" });
  }
}

export async function submitItem(userId, itemKey, payload = {}) {
  if (!ITEM_KEYS.includes(itemKey)) throw new Error(`Unknown compliance item: ${itemKey}`);
  if (itemKey === "investment_ready") throw new Error("investment_ready is derived automatically, not directly submittable.");

  const { application } = await getApplication(userId);
  await setItemStatus(application.id, itemKey, { status: "in_progress" });

  let outcome;
  switch (itemKey) {
    case "mobile":
    case "email":
      outcome = verifyMockOtp(payload.otp);
      break;

    case "pan": {
      const session = await kycProvider.initiateVerification({ userId, pan: payload.pan });
      const check = await kycProvider.checkStatus(session.sessionId);
      outcome = { status: check.status, provider: "mock-kyc", providerReference: session.sessionId, rejectionReason: check.reason };
      break;
    }

    case "identity": {
      if (!payload.consentToken) throw new Error("identity verification requires consentToken (consent must be recorded before any document fetch).");
      const doc = await documentProvider.fetchDocument(payload.consentToken, "identity");
      const ckyc = await kycProvider.checkCKYCStatus(payload.pan);
      const status = ckyc.status === "kyc_compliant" ? "verified" : ckyc.status === "on_hold" ? "needs_review" : "rejected";
      outcome = { status, provider: "mock-kyc", providerReference: doc.storageRef, rejectionReason: status === "rejected" ? "CKYC status: not registered" : null };
      break;
    }

    case "nominee": {
      const { name, relationship, allocationPct } = payload;
      if (!name || !relationship || !(allocationPct > 0 && allocationPct <= 100)) {
        outcome = { status: "rejected", rejectionReason: "name, relationship, and allocationPct (1-100) are required." };
        break;
      }
      await query(
        `insert into nominees (user_id, name, relationship, allocation_pct, minor, guardian_name)
         values ($1, $2, $3, $4, $5, $6)`,
        [userId, name, relationship, allocationPct, Boolean(payload.minor), payload.guardianName ?? null]
      );
      outcome = { status: "completed" };
      break;
    }

    case "bank": {
      const { accountNumber, ifsc, accountHolderName } = payload;
      if (!accountNumber || !ifsc || !accountHolderName) {
        outcome = { status: "rejected", rejectionReason: "accountNumber, ifsc, and accountHolderName are required." };
        break;
      }
      // Mock penny-drop: mostly succeeds, occasionally needs manual review — same weighted-
      // outcome idea as the mock providers, kept local since this isn't behind a provider
      // interface of its own (see architecture doc — bank verification rides on PaymentProvider
      // conceptually, but no concrete "verify" call is modeled there yet).
      const verified = Math.random() < 0.9;
      const maskedNumber = accountNumber.slice(-4).padStart(accountNumber.length, "*");
      await query(
        `insert into bank_accounts (user_id, account_number_masked, ifsc, account_holder_name, verification_method, verified)
         values ($1, $2, $3, $4, 'penny_drop', $5)`,
        [userId, maskedNumber, ifsc, accountHolderName, verified]
      );
      outcome = verified ? { status: "completed" } : { status: "needs_review", rejectionReason: "Penny-drop name match inconclusive — manual review required." };
      break;
    }

    case "fatca": {
      outcome = payload.declared === true
        ? { status: "completed" }
        : { status: "rejected", rejectionReason: "FATCA declaration must be explicitly confirmed." };
      break;
    }

    case "risk_profile": {
      const rp = await query(`select 1 from risk_profiles where user_id = $1`, [userId]);
      outcome = rp.rows.length
        ? { status: "completed" }
        : { status: "rejected", rejectionReason: "Complete the risk questionnaire first (see identityService.upsertRiskProfile)." };
      break;
    }

    default:
      throw new Error(`No handler for compliance item: ${itemKey}`);
  }

  const updated = await setItemStatus(application.id, itemKey, outcome);
  // DONE_STATUSES, not a literal 'completed' check — PAN/identity finish via 'verified', and
  // that's just as much "this item is done" as the other items' 'completed' (see DONE_STATUSES
  // above and maybeCompleteInvestmentReady's own use of the same set).
  if (DONE_STATUSES.has(updated.status)) {
    await emitEvent("ComplianceCompleted", { userId, itemKey }, { correlationId: userId, source: "complianceService" });
  }
  await maybeCompleteInvestmentReady(userId, application.id);
  const overallStatus = await refreshOverallStatus(userId);
  await logAudit(userId, "compliance_item_submitted", { itemKey, status: outcome.status, overallStatus });
  return { item: updated, overallStatus };
}

export async function getComplianceProgress(userId) {
  const { application, items } = await getApplication(userId);
  const doneCount = items.filter((i) => DONE_STATUSES.has(i.status)).length;
  return {
    overallStatus: application.overall_status,
    completed: doneCount,
    total: items.length,
    percent: Math.round((doneCount / items.length) * 100),
    items,
  };
}
