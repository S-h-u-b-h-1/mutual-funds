// Module 1 — Investor Identity. Investor profile, investment account, risk profile, investment
// preferences, RM assignment, onboarding progress. Backs docs/INVEST_PLATFORM_ARCHITECTURE.md
// §5.1/§9.1. Every function takes an already-authenticated userId (from apiAuth.requireUser())
// — never derives it from a request body, matching the rest of this codebase's auth discipline.
import { query } from "../db.js";
import { investmentProvider } from "./providers/index.js";
import { callProvider } from "./providers/resilience.js";
import { logAudit } from "./audit.js";
import { emitEvent } from "../platform/events/core.js";
import { getComplianceProgress } from "./complianceService.js";

export async function getProfile(userId) {
  const r = await query(`select * from investor_profiles where user_id = $1`, [userId]);
  return r.rows[0] ?? null;
}

export async function upsertProfile(userId, fields) {
  const {
    dateOfBirth = null, gender = null, occupation = null, annualIncomeBand = null,
    addressLine1 = null, addressLine2 = null, city = null, state = null, pincode = null,
  } = fields;
  const r = await query(
    `insert into investor_profiles
       (user_id, date_of_birth, gender, occupation, annual_income_band, address_line1, address_line2, city, state, pincode, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
     on conflict (user_id) do update set
       date_of_birth = coalesce($2, investor_profiles.date_of_birth),
       gender = coalesce($3, investor_profiles.gender),
       occupation = coalesce($4, investor_profiles.occupation),
       annual_income_band = coalesce($5, investor_profiles.annual_income_band),
       address_line1 = coalesce($6, investor_profiles.address_line1),
       address_line2 = coalesce($7, investor_profiles.address_line2),
       city = coalesce($8, investor_profiles.city),
       state = coalesce($9, investor_profiles.state),
       pincode = coalesce($10, investor_profiles.pincode),
       updated_at = now()
     returning *`,
    [userId, dateOfBirth, gender, occupation, annualIncomeBand, addressLine1, addressLine2, city, state, pincode]
  );
  await logAudit(userId, "invest_profile_updated", { fields: Object.keys(fields) });
  return r.rows[0];
}

export async function getAccount(userId) {
  const r = await query(`select * from investment_accounts where user_id = $1`, [userId]);
  return r.rows[0] ?? null;
}

// Idempotent: returns the existing account if one exists, otherwise opens one via the
// (mock, this phase) InvestmentProvider and persists it. Account opening is gated on compliance
// being 'completed' — an investment account existing does not itself mean the investor is
// allowed to transact; see complianceService for that check.
export async function ensureAccount(userId) {
  const existing = await getAccount(userId);
  if (existing) return existing;

  // Not retryable: opening a duplicate account is exactly the failure mode this must avoid, and
  // this call has no idempotency key reaching the provider. Timeout + circuit breaker still apply.
  const opened = await callProvider("mock-investment", "openAccount", () => investmentProvider.openAccount({ userId }));
  let r;
  try {
    r = await query(
      `insert into investment_accounts (user_id, account_number, status, opened_at)
       values ($1, $2, $3, now())
       returning *`,
      [userId, opened.accountNumber, opened.status]
    );
  } catch (err) {
    // Backend Hardening (2026-07-24): investment_accounts.user_id is unique, so this can only
    // mean a concurrent call already won the race between our own getAccount() check above and
    // this insert — same shape as webhooks/core.js's receiveWebhook() insert-race handling.
    // Honor this function's own doc comment ("idempotent — returns the existing account") rather
    // than letting the loser's raw 23505 propagate.
    if (err?.code === "23505") return await getAccount(userId);
    throw err;
  }
  await logAudit(userId, "invest_account_opened", { accountNumber: opened.accountNumber, provider: opened.provider });
  await emitEvent("InvestorCreated", { userId, accountNumber: opened.accountNumber }, { correlationId: userId, source: "identityService" });
  return r.rows[0];
}

export async function getRiskProfile(userId) {
  const r = await query(`select * from risk_profiles where user_id = $1`, [userId]);
  return r.rows[0] ?? null;
}

// Deterministic placeholder scoring — averages four 1-5 questionnaire inputs into a 0-100 score
// and buckets it. This is a first-pass internal methodology for the mock phase, not a
// regulatory-grade risk assessment; a real one would need a compliance-reviewed questionnaire
// before this platform ever handles real investments.
export function scoreRiskAnswers(answers) {
  const fields = ["horizonScore", "lossToleranceScore", "incomeStabilityScore", "experienceScore"];
  const values = fields.map((f) => Number(answers?.[f])).filter((v) => Number.isFinite(v) && v >= 1 && v <= 5);
  if (values.length !== fields.length) {
    throw new Error(`Risk questionnaire requires all of: ${fields.join(", ")}, each 1-5`);
  }
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const score = Math.round(((avg - 1) / 4) * 100); // 1-5 scale -> 0-100
  const category = score < 40 ? "conservative" : score < 70 ? "moderate" : "aggressive";
  return { score, category };
}

export async function upsertRiskProfile(userId, answers) {
  const { score, category } = scoreRiskAnswers(answers);
  const r = await query(
    `insert into risk_profiles (user_id, risk_category, score, answers, assessed_at, updated_at)
     values ($1, $2, $3, $4, now(), now())
     on conflict (user_id) do update set
       risk_category = $2, score = $3, answers = $4, assessed_at = now(), updated_at = now()
     returning *`,
    [userId, category, score, JSON.stringify(answers)]
  );
  await logAudit(userId, "invest_risk_profile_assessed", { category, score });
  return r.rows[0];
}

export async function getPreferences(userId) {
  const r = await query(`select * from investment_preferences where user_id = $1`, [userId]);
  return r.rows[0] ?? null;
}

export async function upsertPreferences(userId, fields) {
  const { preferredCategories = null, preferredPlan = "direct", sipDay = null, goals = null } = fields;
  const r = await query(
    `insert into investment_preferences (user_id, preferred_categories, preferred_plan, sip_day, goals, updated_at)
     values ($1, $2, $3, $4, $5, now())
     on conflict (user_id) do update set
       preferred_categories = coalesce($2, investment_preferences.preferred_categories),
       preferred_plan = coalesce($3, investment_preferences.preferred_plan),
       sip_day = coalesce($4, investment_preferences.sip_day),
       goals = coalesce($5, investment_preferences.goals),
       updated_at = now()
     returning *`,
    [userId, preferredCategories ? JSON.stringify(preferredCategories) : null, preferredPlan, sipDay, goals ? JSON.stringify(goals) : null]
  );
  await logAudit(userId, "invest_preferences_updated", { fields: Object.keys(fields) });
  return r.rows[0];
}

export async function getRmAssignment(userId) {
  const r = await query(
    `select ra.*, a.employee_code, a.specialization, u.name as advisor_name
       from rm_assignments ra
       join advisors a on a.id = ra.advisor_id
       join users u on u.id = a.user_id
      where ra.user_id = $1 and ra.active
      order by ra.assigned_at desc limit 1`,
    [userId]
  );
  return r.rows[0] ?? null;
}

// Deactivates any existing active assignment before creating the new one — a client has at most
// one active RM at a time (see rm_assignments' design note in the migration).
export async function assignRm(userId, advisorId) {
  await query(`update rm_assignments set active = false, unassigned_at = now() where user_id = $1 and active`, [userId]);
  const r = await query(
    `insert into rm_assignments (user_id, advisor_id) values ($1, $2) returning *`,
    [userId, advisorId]
  );
  await logAudit(userId, "invest_advisor_assigned", { advisorId });
  return r.rows[0];
}

// "Onboarding progress" (Module 1) IS compliance progress (Module 2) — one number, not two
// competing ones. Exposed from here too so /api/v1/invest/profile can return a single summary
// object without the frontend having to stitch together two endpoints for one screen.
export async function getOnboardingProgress(userId) {
  return getComplianceProgress(userId);
}

// Suasion mission Section A (2026-07-28): a richer, presentation-ready onboarding contract on
// top of the SAME underlying compliance_items data getOnboardingProgress already exposes — this
// does not change what determines investment_ready (complianceService remains the sole
// authority), it only adds human-readable labels/ordering/next-action guidance so the frontend
// stops having to reconstruct that logic itself from a raw item-key list. Deliberately additive:
// getOnboardingProgress/GET /api/v1/invest/profile are unchanged, so nothing already consuming
// that shape (Codex) needs to change. See docs/INVEST_API_CONTRACTS.md's Module 1 section.
const STEP_METADATA = {
  mobile: { label: "Verify mobile number", category: "contact_verification", required: true },
  email: { label: "Verify email address", category: "contact_verification", required: true },
  pan: { label: "Verify PAN", category: "kyc", required: true },
  identity: { label: "Complete identity verification", category: "kyc", required: true },
  nominee: { label: "Add a nominee", category: "declarations", required: true },
  bank: { label: "Verify bank account", category: "banking", required: true },
  fatca: { label: "FATCA/CRS declaration", category: "declarations", required: true },
  risk_profile: { label: "Complete risk questionnaire", category: "risk_assessment", required: true },
};
// Matches the order journey1-onboarding.e2e.test.js already exercises end-to-end — a fresh
// investor following nextAction in sequence walks the exact path that fixture proves works.
const STEP_ORDER = Object.keys(STEP_METADATA);

export async function getOnboardingContract(userId) {
  const progress = await getComplianceProgress(userId);
  const byKey = Object.fromEntries(progress.items.map((i) => [i.item_key, i]));

  const steps = STEP_ORDER.map((key, index) => {
    const item = byKey[key];
    return {
      key,
      order: index + 1,
      label: STEP_METADATA[key].label,
      category: STEP_METADATA[key].category,
      required: STEP_METADATA[key].required,
      status: item?.status ?? "pending",
      completedAt: item?.completed_at ?? null,
      rejectionReason: item?.rejection_reason ?? null,
    };
  });

  // Priority: a rejected step needs the user's attention before anything else (they already
  // tried and it failed) — checked as its own pass rather than relying on STEP_ORDER position,
  // so a late-sequence rejection surfaces even if earlier steps happen to still be pending.
  const rejected = steps.find((s) => s.status === "rejected");
  const notStarted = steps.find((s) => s.status === "pending" || s.status === "in_progress");
  const actionable = rejected ?? notStarted;
  const needsReviewCount = steps.filter((s) => s.status === "needs_review").length;

  let nextAction;
  if (actionable) {
    nextAction = { key: actionable.key, label: actionable.label, reason: actionable.status === "rejected" ? "rejected" : actionable.status };
  } else if (needsReviewCount > 0) {
    // Nothing left the user can submit — remaining items are with us, not them.
    nextAction = { key: null, label: "Your submission is under review — no action needed right now.", reason: "waiting_on_review" };
  } else {
    nextAction = null; // every required step is done
  }

  const investmentReadyItem = byKey.investment_ready;
  // percent/status reuse getComplianceProgress's own numbers rather than recomputing from
  // `steps` — that array deliberately excludes the derived investment_ready item (it's not a
  // user-facing step), and DONE_STATUSES's exact verified/completed definition lives in
  // complianceService, not duplicated here.
  const readiness = {
    status: progress.overallStatus,
    percent: progress.percent,
    investmentReady: investmentReadyItem?.status === "completed",
  };

  return { readiness, steps, nextAction };
}
