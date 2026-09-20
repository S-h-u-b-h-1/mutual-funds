import { afterEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { query } from "./db";
import { createInitialResearchProfile, getResearchProfileState, reviewProfileChangeRequest, submitProfileChangeRequest } from "./profileGovernanceService";

const createdUserIds = [];
const originalAnswers = { goal: "wealth", horizon: 4, reaction: 3, capacity: 3, experience: 2 };
const changedAnswers = { goal: "emergency", horizon: 1, reaction: 1, capacity: 1, experience: 2 };

async function createUser(role = "investor") {
  const email = `profile-governance-${crypto.randomBytes(6).toString("hex")}@mfpulse.test`;
  const result = await query(`insert into users (name, email, role) values ('Profile Test', $1, $2) returning id`, [email, role]);
  createdUserIds.push(result.rows[0].id);
  return result.rows[0].id;
}

afterEach(async () => {
  if (!createdUserIds.length) return;
  await query(`delete from audit_log where user_id = any($1::uuid[])`, [createdUserIds]);
  await query(`delete from users where id = any($1::uuid[])`, [createdUserIds]);
  createdUserIds.length = 0;
});

describe("profile governance service", () => {
  it("locks the initial profile and applies only an approved change request", async () => {
    const userId = await createUser();
    const reviewerId = await createUser("advisor");

    const initial = await createInitialResearchProfile(userId, { advisoryAnswers: originalAnswers });
    expect(initial.locked).toBe(false);
    expect(initial.profile.riskProfile).toBe("growth");

    const directOverwrite = await createInitialResearchProfile(userId, { advisoryAnswers: changedAnswers });
    expect(directOverwrite.locked).toBe(true);
    expect(directOverwrite.profile.riskProfile).toBe("growth");

    const noChange = await submitProfileChangeRequest(userId, {
      requestedProfile: { advisoryAnswers: originalAnswers },
      reason: "This explanation is long enough but the answers are unchanged.",
    });
    expect(noChange.noChange).toBe(true);

    const submitted = await submitProfileChangeRequest(userId, {
      requestedProfile: { advisoryAnswers: changedAnswers },
      reason: "My emergency-fund needs and time horizon have changed.",
    });
    expect(submitted.request.status).toBe("pending");

    const beforeReview = await getResearchProfileState(userId);
    expect(beforeReview.profile.riskProfile).toBe("growth");
    expect(beforeReview.latestRequest.status).toBe("pending");

    const reviewed = await reviewProfileChangeRequest(submitted.request.id, reviewerId, "approved", "Verified changed circumstances.");
    expect(reviewed.request.status).toBe("approved");

    const afterReview = await getResearchProfileState(userId);
    expect(afterReview.profile.riskProfile).toBe("conservative");
    expect(afterReview.profile.advisoryAnswers).toEqual(changedAnswers);
  });
});
