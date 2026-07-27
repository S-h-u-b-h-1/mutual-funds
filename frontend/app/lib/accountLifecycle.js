// Account Lifecycle (Backend Hardening Phase 3, H6). See docs/ACCOUNT_LIFECYCLE_AND_RETENTION.md
// for the full design, the regulatory tension it resolves (a GDPR-style "delete my data"
// expectation vs. a registered distributor's likely obligation to retain transaction/compliance
// history), and the open policy questions explicitly flagged there for legal/compliance
// confirmation rather than invented here.
//
// Two deliberately different-shaped actions:
//
//   deactivateAccount() / reactivateAccount() — fully reversible. Blocks login. Touches nothing
//     else: no anonymization, no cascades, no data loss. For "I want to step away" / "I changed
//     my mind."
//
//   requestAccountDeletion() — NOT reversible. Anonymizes every directly-identifying field on the
//     user's own `users` and `investor_profiles` rows, but never hard-deletes the `users` row
//     itself — so it never cascades into any of the ~35 other tables that reference it. Every
//     financial/compliance/document/audit record this account's activity ever created survives
//     fully intact, now attributed to an anonymized identity instead of being destroyed or
//     silently orphaned by a cascade. That is the safer default until legal/compliance confirms
//     which specific fields, if any, may actually be erased outright and on what timeline — see
//     the doc's "Open policy questions" section.
import { query } from "./db.js";

async function recordLifecycleEvent(userId, event, detail = {}) {
  await query(`insert into account_lifecycle_events (user_id, event, detail) values ($1, $2, $3)`, [userId, event, JSON.stringify(detail)]);
}

export async function deactivateAccount(userId) {
  const r = await query(
    `update users set deactivated_at = now(), updated_at = now()
     where id = $1 and deactivated_at is null and deleted_at is null
     returning id`,
    [userId]
  );
  if (r.rows.length === 0) return null;
  // Blocking future sign-in alone (see auth.js's signIn callback) leaves an ALREADY-established
  // session valid until it naturally expires. Deleting "database" strategy session rows makes
  // deactivation take effect immediately on every device for the common case; the "jwt" fallback
  // strategy's existing cookie stays cryptographically valid regardless — same pre-existing,
  // documented limitation as reset-password's own session note (see that route).
  await query(`delete from sessions where user_id = $1`, [userId]);
  await recordLifecycleEvent(userId, "deactivated");
  return { deactivated: true };
}

export async function reactivateAccount(userId) {
  const r = await query(
    `update users set deactivated_at = null, updated_at = now()
     where id = $1 and deactivated_at is not null and deleted_at is null
     returning id`,
    [userId]
  );
  if (r.rows.length === 0) return null;
  await recordLifecycleEvent(userId, "reactivated");
  return { reactivated: true };
}

// Idempotent on purpose (returns null on a second call, same "already happened" convention as
// this codebase's other user-facing transitions — see notifications/core.js's markRead etc.) —
// deletion has no "undo," so a duplicate request must be a safe no-op, not a second anonymization
// pass or an error.
export async function requestAccountDeletion(userId) {
  const r = await query(
    `update users set
       deleted_at = now(),
       deactivated_at = coalesce(deactivated_at, now()),
       name = '[deleted]',
       email = 'deleted-' || id || '@deleted.mfpulse.internal',
       password_hash = null,
       image = null,
       updated_at = now()
     where id = $1 and deleted_at is null
     returning id`,
    [userId]
  );
  if (r.rows.length === 0) return null;

  await query(
    `update investor_profiles set
       date_of_birth = null, gender = null, occupation = null, annual_income_band = null,
       address_line1 = null, address_line2 = null, city = null, state = null, pincode = null,
       updated_at = now()
     where user_id = $1`,
    [userId]
  );

  // "Database" session strategy rows are real and server-revocable — gone means gone. The "jwt"
  // fallback strategy's own documented limitation (an existing cookie stays cryptographically
  // valid until natural expiry) is unchanged by this, same as reset-password's own note.
  await query(`delete from sessions where user_id = $1`, [userId]);

  await recordLifecycleEvent(userId, "deletion_requested_and_anonymized");
  return { deleted: true };
}

// Single source of truth for "may this user complete sign-in right now" — auth.js's signIn
// callback calls this for every provider (Credentials, OAuth, magic link alike).
//
// deleted_at is an unconditional, permanent block — deletion has no undo, and for a Credentials
// account it's already unreachable anyway (requestAccountDeletion() nulls password_hash, so
// bcrypt.compare falls through to DUMMY_HASH same as a nonexistent user) but OAuth/magic-link
// providers re-authenticate via the SAME provider identity regardless of password_hash, so this
// still needs an explicit check for those.
//
// deactivated_at is deliberately NOT a hard block here: reactivateAccount()'s own route requires
// an already-authenticated session to call, which a deactivated account cannot have (deactivation
// deletes existing sessions) — a dead end where deactivation would be permanent in practice,
// defeating the entire point of it being the reversible option. Successfully completing sign-in
// with valid credentials while deactivated IS the reactivation path: this clears deactivated_at
// as a side effect and lets sign-in proceed, exactly like many consumer apps' "log back in to
// reactivate" convention. The explicit /api/v1/account/reactivate route remains for an edge case
// (a second tab with a still-live session).
export async function resolveSignInEligibility(userId) {
  const r = await query(`select deactivated_at, deleted_at from users where id = $1`, [userId]);
  const user = r.rows[0];
  if (!user) return false;
  if (user.deleted_at) return false;
  if (user.deactivated_at) {
    await query(`update users set deactivated_at = null, updated_at = now() where id = $1`, [userId]);
    await recordLifecycleEvent(userId, "reactivated", { via: "sign_in" });
  }
  return true;
}
