import { buildRiskProfile, researchProfileFromAdvisoryAnswers } from "./advisoryEngine";

export const PROFILE_EDITABLE_FIELDS = [
  "role",
  "primaryGoal",
  "experience",
  "riskComfort",
  "horizon",
  "aumBand",
  "preferredCategories",
];

const ALLOWED = {
  role: new Set(["individual", "advisor", "analyst", "family-office"]),
  primaryGoal: new Set(["research", "compare", "portfolio", "news"]),
  experience: new Set(["beginner", "intermediate", "advanced", "professional"]),
  riskComfort: new Set(["conservative", "moderate", "aggressive"]),
  horizon: new Set(["0-1", "1-3", "3-5", "5+"]),
  aumBand: new Set(["not-specified", "under-5l", "5l-25l", "25l-1cr", "1cr+"]),
};

const ADVISORY_GOALS = new Set(["wealth", "retirement", "education", "emergency", "tax"]);
const REQUIRED_ADVISORY_KEYS = ["goal", "horizon", "reaction", "capacity", "experience"];

export class ProfilePolicyError extends Error {}

function cleanString(value, max = 300) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export function normalizeAdvisoryAnswers(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const answers = {
    goal: cleanString(input.goal, 32),
    horizon: Number(input.horizon),
    reaction: Number(input.reaction),
    capacity: Number(input.capacity),
    experience: Number(input.experience),
  };
  if (!ADVISORY_GOALS.has(answers.goal)) throw new ProfilePolicyError("Choose a valid financial goal.");
  for (const key of REQUIRED_ADVISORY_KEYS.slice(1)) {
    if (!Number.isInteger(answers[key]) || answers[key] < 1 || answers[key] > 4) {
      throw new ProfilePolicyError("Complete every risk-profile question before continuing.");
    }
  }
  return answers;
}

export function normalizeResearchProfile(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ProfilePolicyError("Invalid profile payload.");
  }

  const answers = input.advisoryAnswers ? normalizeAdvisoryAnswers(input.advisoryAnswers) : null;
  const derived = answers ? researchProfileFromAdvisoryAnswers(answers) : {};
  const profile = {
    role: cleanString(derived.role || input.role, 40),
    primaryGoal: cleanString(derived.primaryGoal || input.primaryGoal, 40),
    experience: cleanString(derived.experience || input.experience, 40),
    riskComfort: cleanString(derived.riskComfort || input.riskComfort, 40),
    horizon: cleanString(derived.horizon || input.horizon, 20),
    aumBand: cleanString(input.aumBand || derived.aumBand || "not-specified", 40),
    preferredCategories: cleanString(input.preferredCategories, 300),
    advisoryAnswers: answers,
    riskScore: answers ? buildRiskProfile(answers).score : null,
    riskProfile: answers ? buildRiskProfile(answers).key : null,
  };

  for (const key of ["role", "primaryGoal", "experience", "riskComfort", "horizon", "aumBand"]) {
    if (!ALLOWED[key].has(profile[key])) throw new ProfilePolicyError(`Choose a valid ${key}.`);
  }
  return profile;
}

export function normalizeChangeReason(value) {
  const reason = cleanString(value, 1000);
  if (reason.length < 20) throw new ProfilePolicyError("Explain why your circumstances or goals changed (at least 20 characters).");
  return reason;
}

export function researchProfileFromRow(row) {
  if (!row) return null;
  return {
    role: row.role,
    primaryGoal: row.primary_goal,
    experience: row.experience,
    riskComfort: row.risk_comfort,
    horizon: row.horizon,
    aumBand: row.aum_band,
    preferredCategories: row.preferred_categories,
    advisoryAnswers: row.advisory_answers,
    riskScore: row.risk_score,
    riskProfile: row.risk_profile,
    lockedAt: row.locked_at,
    updatedAt: row.updated_at,
  };
}

export function changeRequestFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    reason: row.reason,
    requestedProfile: row.requested_profile,
    requestedAt: row.requested_at,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
  };
}
