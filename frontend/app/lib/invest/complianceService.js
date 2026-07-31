// Module 2 — Compliance Engine. Per-item state machine (pending -> in_progress ->
// verified/rejected/needs_review -> completed) plus overall percentage progress. Backs
// docs/INVEST_PLATFORM_ARCHITECTURE.md §6. Every item transition goes through the (mock, this
// phase) provider interfaces in ./providers — never a hardcoded "always succeeds" — so the
// frontend has to handle rejected/needs_review states, not just the happy path.
import { query } from "../db.js";
import { kycProvider, documentProvider } from "./providers/index.js";
import { callProvider } from "./providers/resilience.js";
import { logAudit } from "./audit.js";
import { emitEvent } from "../platform/events/core.js";

// 'investment_ready' is last on purpose — it's a derived gate, never directly submitted by the
// user, only auto-completed once every other item is done (see maybeCompleteInvestmentReady).
export const ITEM_KEYS = ["mobile", "email", "pan", "identity", "nominee", "bank", "fatca", "pep", "risk_profile", "investment_ready"];
// Exported so evaluateInvestmentReadiness (identityService.js) can classify items as done/pending
// using the exact same definition submitItem/refreshOverallStatus use here — a second, drifted
// copy of "what counts as done" would be exactly the kind of second-source-of-truth bug this
// audit keeps finding and fixing elsewhere.
export const DONE_STATUSES = new Set(["verified", "completed"]);

// Auth+Onboarding truth audit, Phase 11 (consent ledger). A thin, deliberately non-fatal wrapper —
// a failed consent write must never block the compliance item it's attached to (the item's own
// status is already correct at the point this is called; losing the audit trail of WHEN consent
// was captured is bad, but blocking a real compliance action because of it would be worse), so
// this only logs rather than throws.
async function recordConsent(userId, { consentType, version, source, documentRef = null, correlationId = null }) {
  try {
    await query(
      `insert into consent_records (user_id, consent_type, version, source, document_ref, correlation_id)
       values ($1, $2, $3, $4, $5, $6)`,
      [userId, consentType, version, source, documentRef, correlationId]
    );
  } catch (err) {
    logAudit(userId, "consent_record_write_failed", { consentType, error: String(err?.message || err) }).catch(() => {});
  }
}

// Simple E.164-ish digit-count check (7-15 digits after stripping spaces/dashes/parens/leading
// +) — deliberately not India-specific, since NRI investors are a real segment. This is an
// engineering-level format check, not a regulatory determination.
function isPlausiblePhoneNumber(raw) {
  const digits = String(raw || "").replace(/[\s\-()]/g, "").replace(/^\+/, "");
  return /^\d{7,15}$/.test(digits);
}

// ISO 3166-1 alpha-2 format check only (e.g. "IN", "US") — not validated against a real country
// list. See migration 034's header: REGULATORY FIELD SET REQUIRES CONFIRMATION.
function isPlausibleCountryCode(raw) {
  return /^[A-Za-z]{2}$/.test(String(raw || "").trim());
}

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
    case "email":
      outcome = verifyMockOtp(payload.otp);
      break;

    case "mobile": {
      // Auth+Onboarding truth audit, Phase 4/9: previously this checked the mock OTP against no
      // phone number at all — "mobile verified" had structurally nothing behind it. Now a real
      // number must be submitted and stored before the OTP check even runs; only a genuinely
      // implausible number is rejected here (invalid format), same posture as bank's
      // accountNumber/ifsc presence check below.
      if (!isPlausiblePhoneNumber(payload.phoneNumber)) {
        outcome = { status: "rejected", rejectionReason: "A valid phone number is required to verify your mobile." };
        break;
      }
      // Upsert, not update — the profile step and the mobile step can be completed in either
      // order, so investor_profiles may not have a row yet (a plain UPDATE would silently
      // affect zero rows and lose the number).
      await query(
        `insert into investor_profiles (user_id, phone_number) values ($1, $2)
         on conflict (user_id) do update set phone_number = excluded.phone_number, updated_at = now()`,
        [userId, payload.phoneNumber]
      );
      outcome = verifyMockOtp(payload.otp);
      break;
    }

    case "pan": {
      // initiateVerification is NOT retryable — it starts a new session at the provider, so a
      // retry could open a duplicate one. checkStatus IS a pure read, safe to retry.
      const session = await callProvider("mock-kyc", "initiateVerification", () => kycProvider.initiateVerification({ userId, pan: payload.pan }));
      const check = await callProvider("mock-kyc", "checkStatus", () => kycProvider.checkStatus(session.sessionId), { retryable: true });
      outcome = { status: check.status, provider: "mock-kyc", providerReference: session.sessionId, rejectionReason: check.reason };
      // Auth+Onboarding truth audit, Phase 4/5: investor_profiles.pan_masked existed but nothing
      // ever wrote to it — a completed PAN check had no durable record of which PAN it verified.
      // Only recorded when the check wasn't an outright rejection — a rejected attempt might be a
      // mistyped/invalid PAN and shouldn't become "this investor's PAN on file".
      if (payload.pan && check.status !== "rejected") {
        const masked = String(payload.pan).slice(-4).padStart(String(payload.pan).length, "*");
        await query(
          `insert into investor_profiles (user_id, pan_masked) values ($1, $2)
           on conflict (user_id) do update set pan_masked = excluded.pan_masked, updated_at = now()`,
          [userId, masked]
        );
      }
      break;
    }

    case "identity": {
      if (!payload.consentToken) throw new Error("identity verification requires consentToken (consent must be recorded before any document fetch).");
      // Auth+Onboarding truth audit, Phase 11: this consentToken used to be forwarded to the
      // document provider and then discarded — real at the moment of the call, gone from any
      // queryable state the instant this function returned. Now durably recorded before the
      // provider calls that depend on it, matching the ledger's own "grant must remain provable"
      // design (see consent_records' table comment).
      await recordConsent(userId, { consentType: "investment_declaration", version: "v1", source: "onboarding", correlationId: payload.consentToken });
      // Both retrieval/lookup calls, not writes — retrying either fetches the same answer again.
      const doc = await callProvider("mock-document", "fetchDocument", () => documentProvider.fetchDocument(payload.consentToken, "identity"), { retryable: true });
      const ckyc = await callProvider("mock-kyc", "checkCKYCStatus", () => kycProvider.checkCKYCStatus(payload.pan), { retryable: true });
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
      // Auth+Onboarding truth audit, Phase 9: previously a plain INSERT with no ON CONFLICT, so
      // correcting a typo by resubmitting this step created a SECOND nominee row instead of
      // fixing the first. `sequence` (default 1) makes "which nominee is this" explicit — the
      // current single-nominee onboarding step always targets slot 1, so a resubmission now
      // correctly replaces it; a future multi-nominee UI can submit sequence 2, 3, ... for
      // genuinely additional nominees without colliding.
      const sequence = Number.isInteger(payload.sequence) && payload.sequence > 0 ? payload.sequence : 1;
      await query(
        `insert into nominees (user_id, name, relationship, allocation_pct, minor, guardian_name, sequence)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (user_id, sequence) do update set
           name = excluded.name, relationship = excluded.relationship, allocation_pct = excluded.allocation_pct,
           minor = excluded.minor, guardian_name = excluded.guardian_name`,
        [userId, name, relationship, allocationPct, Boolean(payload.minor), payload.guardianName ?? null, sequence]
      );
      await recordConsent(userId, { consentType: "nominee_declaration", version: "v1", source: "onboarding" });
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
      // Auth+Onboarding truth audit, Phase 6: previously a single boolean (payload.declared),
      // with NO structured persistence at all — real gap, not a documentation error (the prior
      // docs never claimed a fatca_declarations table existed). Replaced with a versioned,
      // structured declaration. tax_residency_country is the one field this cannot proceed
      // without (it's NOT NULL on fatca_declarations — see migration 034's ENGINEERING MODEL
      // READY / REGULATORY FIELD SET REQUIRES CONFIRMATION note); a submission missing it is
      // rejected with a specific reason rather than silently defaulting to "IN" — fabricating a
      // customer's tax residency would be a real compliance-truth violation, not a convenience.
      if (payload.declared !== true) {
        outcome = { status: "rejected", rejectionReason: "FATCA declaration must be explicitly confirmed." };
        break;
      }
      if (!isPlausibleCountryCode(payload.taxResidencyCountry)) {
        outcome = { status: "rejected", rejectionReason: "Country of tax residence (ISO 2-letter code) is required to complete your FATCA declaration." };
        break;
      }
      const isUsPerson = Boolean(payload.isUsPerson);
      const isUsCitizen = Boolean(payload.isUsCitizen);
      // A US-person declaration always routes to review — the actual downstream FATCA reporting
      // workflow for a US-person investor isn't built (BLOCKED — no reporting provider/process
      // integrated), so auto-completing would be a false "you're all set" for a case this
      // platform genuinely can't fully handle yet.
      const status = isUsPerson || isUsCitizen ? "needs_review" : "completed";
      await query(
        `insert into fatca_declarations
           (user_id, tax_residency_country, additional_tax_residencies, tin, tin_type, country_of_birth, place_of_birth, is_us_person, is_us_citizen, status)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         on conflict (user_id) do update set
           version = fatca_declarations.version + 1,
           tax_residency_country = excluded.tax_residency_country, additional_tax_residencies = excluded.additional_tax_residencies,
           tin = excluded.tin, tin_type = excluded.tin_type, country_of_birth = excluded.country_of_birth,
           place_of_birth = excluded.place_of_birth, is_us_person = excluded.is_us_person, is_us_citizen = excluded.is_us_citizen,
           status = excluded.status, declared_at = now()`,
        [
          userId, String(payload.taxResidencyCountry).trim().toUpperCase(),
          payload.additionalTaxResidencies ? JSON.stringify(payload.additionalTaxResidencies) : null,
          payload.tin ?? null, payload.tinType ?? null, payload.countryOfBirth ?? null, payload.placeOfBirth ?? null,
          isUsPerson, isUsCitizen, status,
        ]
      );
      await recordConsent(userId, { consentType: "fatca_declaration", version: "v1", source: "onboarding" });
      outcome = status === "needs_review"
        ? { status, rejectionReason: "US-person FATCA declarations require manual review — automated FATCA reporting is not yet integrated." }
        : { status };
      break;
    }

    case "pep": {
      // Auth+Onboarding truth audit, Phase 7: previously absent entirely — zero persistence, zero
      // workflow. No automated PEP screening provider exists, so this is purely a self-declaration
      // gate: "no" resolves immediately (not_applicable, no review needed); "yes" ALWAYS routes to
      // manual review — this platform cannot and does not attempt to auto-clear a self-declared PEP.
      if (typeof payload.declared !== "boolean") {
        outcome = { status: "rejected", rejectionReason: "A PEP declaration (yes or no) is required." };
        break;
      }
      const status = payload.declared ? "needs_review" : "completed";
      await query(
        `insert into pep_declarations (user_id, declared, status)
         values ($1, $2, $3)
         on conflict (user_id) do update set declared = excluded.declared, status = excluded.status, declared_at = now()`,
        [userId, payload.declared, payload.declared ? "needs_review" : "not_applicable"]
      );
      await recordConsent(userId, { consentType: "pep_declaration", version: "v1", source: "onboarding" });
      outcome = status === "needs_review"
        ? { status, rejectionReason: "A self-declared PEP status requires manual review before investing." }
        : { status };
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
