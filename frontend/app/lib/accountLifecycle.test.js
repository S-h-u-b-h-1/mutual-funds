import { describe, it, expect } from "vitest";
import { query } from "./db.js";
import { deactivateAccount, reactivateAccount, requestAccountDeletion, resolveSignInEligibility } from "./accountLifecycle.js";
import { createTestUser, deleteTestUser, makeInvestmentReadyUser } from "./invest/testHelpers.js";

describe("deactivateAccount / reactivateAccount (integration, real Neon)", () => {
  it("deactivate sets deactivated_at, deletes sessions, records an event; a second call is a no-op", async () => {
    const userId = await createTestUser("lifecycle-deactivate");
    try {
      await query(`insert into sessions (session_token, user_id, expires) values ($1, $2, now() + interval '1 day')`, [`tok-${userId}`, userId]);

      const result = await deactivateAccount(userId);
      expect(result).toEqual({ deactivated: true });

      const row = await query(`select deactivated_at, deleted_at from users where id = $1`, [userId]);
      expect(row.rows[0].deactivated_at).toBeTruthy();
      expect(row.rows[0].deleted_at).toBeNull();

      const sessions = await query(`select 1 from sessions where user_id = $1`, [userId]);
      expect(sessions.rows).toHaveLength(0);

      const events = await query(`select event from account_lifecycle_events where user_id = $1 order by created_at`, [userId]);
      expect(events.rows.map((r) => r.event)).toEqual(["deactivated"]);

      expect(await deactivateAccount(userId)).toBeNull(); // already deactivated
    } finally {
      await deleteTestUser(userId);
    }
  });

  it("reactivate clears deactivated_at and records an event; a second call (not deactivated) is a no-op", async () => {
    const userId = await createTestUser("lifecycle-reactivate");
    try {
      await deactivateAccount(userId);
      const result = await reactivateAccount(userId);
      expect(result).toEqual({ reactivated: true });

      const row = await query(`select deactivated_at from users where id = $1`, [userId]);
      expect(row.rows[0].deactivated_at).toBeNull();

      expect(await reactivateAccount(userId)).toBeNull(); // not deactivated
    } finally {
      await deleteTestUser(userId);
    }
  });
});

describe("resolveSignInEligibility (integration, real Neon)", () => {
  it("a normal, untouched account is eligible", async () => {
    const userId = await createTestUser("lifecycle-normal");
    try {
      expect(await resolveSignInEligibility(userId)).toBe(true);
    } finally {
      await deleteTestUser(userId);
    }
  });

  it("a deactivated account is eligible AND is auto-reactivated by the sign-in attempt itself", async () => {
    // This is the load-bearing property: without the auto-clear, deactivation would be a dead
    // end (reactivateAccount() requires an already-authenticated session, which a deactivated
    // account can't have, since deactivation deletes existing sessions). Successfully resolving
    // sign-in eligibility here IS how a deactivated account gets its access back.
    const userId = await createTestUser("lifecycle-auto-reactivate");
    try {
      await deactivateAccount(userId);
      const eligible = await resolveSignInEligibility(userId);
      expect(eligible).toBe(true);

      const row = await query(`select deactivated_at from users where id = $1`, [userId]);
      expect(row.rows[0].deactivated_at).toBeNull(); // cleared as a side effect

      const events = await query(`select event, detail from account_lifecycle_events where user_id = $1 order by created_at`, [userId]);
      expect(events.rows.map((r) => r.event)).toEqual(["deactivated", "reactivated"]);
      expect(events.rows[1].detail).toMatchObject({ via: "sign_in" });
    } finally {
      await deleteTestUser(userId);
    }
  });

  it("a deleted account is permanently ineligible — never auto-reactivated, unlike deactivation", async () => {
    const userId = await createTestUser("lifecycle-deleted-ineligible");
    try {
      await requestAccountDeletion(userId);
      expect(await resolveSignInEligibility(userId)).toBe(false);
      expect(await resolveSignInEligibility(userId)).toBe(false); // stays false, not a one-shot check
    } finally {
      await deleteTestUser(userId);
    }
  });
});

describe("requestAccountDeletion (integration, real Neon)", () => {
  it("anonymizes users and investor_profiles, deletes sessions, records an event; a second call is a no-op", async () => {
    const userId = await createTestUser("lifecycle-delete-basic");
    try {
      await query(
        `insert into investor_profiles (user_id, occupation, city) values ($1, 'Engineer', 'Mumbai')
         on conflict (user_id) do update set occupation = excluded.occupation, city = excluded.city`,
        [userId]
      );
      await query(`insert into sessions (session_token, user_id, expires) values ($1, $2, now() + interval '1 day')`, [`tok-del-${userId}`, userId]);

      const result = await requestAccountDeletion(userId);
      expect(result).toEqual({ deleted: true });

      const user = await query(`select name, email, password_hash, image, deleted_at from users where id = $1`, [userId]);
      expect(user.rows[0].name).toBe("[deleted]");
      expect(user.rows[0].email).toBe(`deleted-${userId}@deleted.mfpulse.internal`);
      expect(user.rows[0].password_hash).toBeNull();
      expect(user.rows[0].deleted_at).toBeTruthy();

      const profile = await query(`select occupation, city from investor_profiles where user_id = $1`, [userId]);
      expect(profile.rows[0].occupation).toBeNull();
      expect(profile.rows[0].city).toBeNull();

      const sessions = await query(`select 1 from sessions where user_id = $1`, [userId]);
      expect(sessions.rows).toHaveLength(0);

      const events = await query(`select event from account_lifecycle_events where user_id = $1`, [userId]);
      expect(events.rows.map((r) => r.event)).toEqual(["deletion_requested_and_anonymized"]);

      expect(await requestAccountDeletion(userId)).toBeNull(); // already deleted
    } finally {
      await deleteTestUser(userId);
    }
  });

  // The actual point of H6: a real investment-ready user's compliance/financial history must
  // survive account deletion completely intact, not be cascade-wiped or orphaned — verified
  // against real compliance_applications/compliance_items rows created by the same
  // makeInvestmentReadyUser() helper every other invest test file in this codebase uses.
  it("preserves every compliance/financial record for a real investment-ready user — nothing cascades away", async () => {
    const userId = await makeInvestmentReadyUser("lifecycle-preserve");
    try {
      const beforeApp = await query(`select id from compliance_applications where user_id = $1`, [userId]);
      const beforeItems = await query(`select count(*)::int as n from compliance_items where application_id = $1`, [beforeApp.rows[0].id]);
      const beforeAccount = await query(`select id from investment_accounts where user_id = $1`, [userId]);
      expect(beforeItems.rows[0].n).toBeGreaterThan(0);
      expect(beforeAccount.rows).toHaveLength(1);

      const result = await requestAccountDeletion(userId);
      expect(result).toEqual({ deleted: true });

      // The user row itself still exists (anonymized, not gone) — this is WHY nothing cascaded.
      const stillExists = await query(`select deleted_at from users where id = $1`, [userId]);
      expect(stillExists.rows).toHaveLength(1);
      expect(stillExists.rows[0].deleted_at).toBeTruthy();

      const afterApp = await query(`select id, user_id from compliance_applications where user_id = $1`, [userId]);
      const afterItems = await query(`select count(*)::int as n from compliance_items where application_id = $1`, [beforeApp.rows[0].id]);
      const afterAccount = await query(`select id from investment_accounts where user_id = $1`, [userId]);
      expect(afterApp.rows).toHaveLength(1);
      expect(afterApp.rows[0].id).toBe(beforeApp.rows[0].id);
      expect(afterItems.rows[0].n).toBe(beforeItems.rows[0].n); // exact same count — nothing lost
      expect(afterAccount.rows).toHaveLength(1);
    } finally {
      await deleteTestUser(userId);
    }
  }, 60000);
});
