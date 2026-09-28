import { query, withTransaction } from "./db";
import { changeRequestFromRow, normalizeChangeReason, normalizeResearchProfile, researchProfileFromRow } from "./profileGovernancePolicy";

const PROFILE_SELECT = `role, primary_goal, experience, risk_comfort, horizon, aum_band,
  preferred_categories, advisory_answers, risk_score, risk_profile, locked_at, updated_at`;

function profileValues(profile) {
  return [
    profile.role,
    profile.primaryGoal,
    profile.experience,
    profile.riskComfort,
    profile.horizon,
    profile.aumBand,
    profile.preferredCategories || null,
    profile.advisoryAnswers ? JSON.stringify(profile.advisoryAnswers) : null,
    profile.riskScore,
    profile.riskProfile,
  ];
}

function sameGovernedProfile(current, requested) {
  const signature = (profile) => JSON.stringify({
    role: profile.role || "",
    primaryGoal: profile.primaryGoal || "",
    experience: profile.experience || "",
    riskComfort: profile.riskComfort || "",
    horizon: profile.horizon || "",
    aumBand: profile.aumBand || "not-specified",
    preferredCategories: profile.preferredCategories || "",
    riskScore: Number.isFinite(Number(profile.riskScore)) ? Number(profile.riskScore) : null,
    riskProfile: profile.riskProfile || "",
    advisoryAnswers: profile.advisoryAnswers ? {
      goal: profile.advisoryAnswers.goal,
      horizon: Number(profile.advisoryAnswers.horizon),
      reaction: Number(profile.advisoryAnswers.reaction),
      capacity: Number(profile.advisoryAnswers.capacity),
      experience: Number(profile.advisoryAnswers.experience),
    } : null,
  });
  return signature(current) === signature(requested);
}

export async function getResearchProfileState(userId) {
  const [profileResult, requestResult] = await Promise.all([
    query(`select ${PROFILE_SELECT} from research_profile where user_id = $1`, [userId]),
    query(
      `select id, status, reason, requested_profile, requested_at, reviewed_at, review_note
       from profile_change_requests where user_id = $1 order by requested_at desc limit 1`,
      [userId]
    ),
  ]);
  return {
    profile: researchProfileFromRow(profileResult.rows[0]),
    latestRequest: changeRequestFromRow(requestResult.rows[0]),
  };
}

export async function createInitialResearchProfile(userId, input) {
  const profile = normalizeResearchProfile(input);
  return withTransaction(async (client) => {
    const existing = await client.query(`select ${PROFILE_SELECT} from research_profile where user_id = $1 for update`, [userId]);
    if (existing.rows[0]) return { locked: true, profile: researchProfileFromRow(existing.rows[0]) };

    const result = await client.query(
      `insert into research_profile
        (user_id, role, primary_goal, experience, risk_comfort, horizon, aum_band,
         preferred_categories, advisory_answers, risk_score, risk_profile, locked_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,now(),now())
       returning ${PROFILE_SELECT}`,
      [userId, ...profileValues(profile)]
    );
    await client.query(
      `insert into audit_log (user_id, action, metadata) values ($1, 'research_profile_locked', $2::jsonb)`,
      [userId, JSON.stringify({ riskProfile: profile.riskProfile, riskScore: profile.riskScore })]
    );
    return { locked: false, profile: researchProfileFromRow(result.rows[0]) };
  });
}

export async function submitProfileChangeRequest(userId, input) {
  const requestedProfile = normalizeResearchProfile(input?.requestedProfile);
  const reason = normalizeChangeReason(input?.reason);

  return withTransaction(async (client) => {
    const currentResult = await client.query(`select ${PROFILE_SELECT} from research_profile where user_id = $1 for update`, [userId]);
    const currentProfile = researchProfileFromRow(currentResult.rows[0]);
    if (!currentProfile) return { missingProfile: true };
    if (sameGovernedProfile(currentProfile, requestedProfile)) return { noChange: true };

    const pending = await client.query(
      `select id, status, reason, requested_profile, requested_at, reviewed_at, review_note
       from profile_change_requests where user_id = $1 and status = 'pending' limit 1`,
      [userId]
    );
    if (pending.rows[0]) return { existing: changeRequestFromRow(pending.rows[0]) };

    const inserted = await client.query(
      `insert into profile_change_requests (user_id, current_profile, requested_profile, reason)
       values ($1, $2::jsonb, $3::jsonb, $4)
       returning id, status, reason, requested_profile, requested_at, reviewed_at, review_note`,
      [userId, JSON.stringify(currentProfile), JSON.stringify(requestedProfile), reason]
    );
    await client.query(
      `insert into audit_log (user_id, action, metadata) values ($1, 'research_profile_change_requested', $2::jsonb)`,
      [userId, JSON.stringify({ requestId: inserted.rows[0].id })]
    );
    return { request: changeRequestFromRow(inserted.rows[0]) };
  });
}

export async function listPendingProfileChangeRequests() {
  const result = await query(
    `select r.id, r.user_id, u.name as user_name, u.email as user_email, r.current_profile,
            r.requested_profile, r.reason, r.status, r.requested_at
     from profile_change_requests r join users u on u.id = r.user_id
     where r.status = 'pending' order by r.requested_at asc`
  );
  return result.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    currentProfile: row.current_profile,
    requestedProfile: row.requested_profile,
    reason: row.reason,
    status: row.status,
    requestedAt: row.requested_at,
  }));
}

export async function reviewProfileChangeRequest(requestId, reviewerUserId, decision, note = "") {
  if (!['approved', 'rejected'].includes(decision)) throw new Error("Decision must be approved or rejected.");
  const reviewNote = typeof note === "string" ? note.trim().slice(0, 1000) : "";

  return withTransaction(async (client) => {
    const result = await client.query(`select * from profile_change_requests where id = $1 for update`, [requestId]);
    const request = result.rows[0];
    if (!request) return { missing: true };
    if (request.status !== "pending") return { alreadyReviewed: true, status: request.status };

    if (decision === "approved") {
      const profile = normalizeResearchProfile(request.requested_profile);
      await client.query(
        `update research_profile set
           role=$2, primary_goal=$3, experience=$4, risk_comfort=$5, horizon=$6, aum_band=$7,
           preferred_categories=$8, advisory_answers=$9::jsonb, risk_score=$10, risk_profile=$11,
           locked_at=now(), updated_at=now()
         where user_id=$1`,
        [request.user_id, ...profileValues(profile)]
      );
    }

    const reviewed = await client.query(
      `update profile_change_requests set status=$2, reviewed_at=now(), reviewed_by_user_id=$3, review_note=$4
       where id=$1 returning id, status, reason, requested_profile, requested_at, reviewed_at, review_note`,
      [requestId, decision, reviewerUserId, reviewNote || null]
    );
    await client.query(
      `insert into audit_log (user_id, action, metadata) values ($1, $2, $3::jsonb)`,
      [request.user_id, `research_profile_change_${decision}`, JSON.stringify({ requestId, reviewerUserId })]
    );
    return { request: changeRequestFromRow(reviewed.rows[0]) };
  });
}
