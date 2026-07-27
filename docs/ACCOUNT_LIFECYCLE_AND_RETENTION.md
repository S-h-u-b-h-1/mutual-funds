# Account Lifecycle & Retention

How account deactivation and deletion actually work, why deletion no longer hard-deletes
anything, and — explicitly — what is **not** decided here because it requires legal/compliance
confirmation, not an engineering guess.

## The problem this replaces

Until 2026-07-27, `DELETE /api/v1/account` ran exactly one statement:

```sql
delete from users where id = $1
```

Every one of the ~35 tables that reference `users(id)` does so with `on delete cascade`
(`sql/neon/002_auth_and_user_data.sql` through `021_provider_metadata.sql`). That one DELETE
therefore wiped, unconditionally and irreversibly: bank account records, KYC/identity documents,
every completed investment order and SIP mandate, every compliance decision, the notification
history, and the audit trail of all of it — with no distinction between "sign me out everywhere"
and "destroy my regulated financial history," and no retention layer of any kind. For a platform
operating under a real, registered AMFI distributor ARN (289322), that was not acceptable to leave
ambiguous. No UI has ever called this endpoint, which is the only reason this hasn't already
caused a real incident.

## The design: two different actions, deliberately different shapes

**Deactivation** (`app/lib/accountLifecycle.js`'s `deactivateAccount()` /
`reactivateAccount()`, routes at `POST /api/v1/account/deactivate` and `/reactivate`) is fully
reversible. It sets `users.deactivated_at`, which blocks sign-in (see below), and deletes the
account's current sessions so it takes effect immediately rather than at next natural session
expiry. It touches nothing else — no anonymization, no data loss.

**Deletion** (`requestAccountDeletion()`, still `DELETE /api/v1/account`) is **not** reversible,
but it no longer runs `delete from users`. Instead it anonymizes the identifying fields on the
user's own `users` row in place —

```sql
update users set
  deleted_at = now(),
  name = '[deleted]',
  email = 'deleted-' || id || '@deleted.mfpulse.internal',
  password_hash = null,
  image = null
where id = $1
```

— and the equivalent for `investor_profiles` (date of birth, gender, occupation, address, income
band all set to null). It **never hard-deletes the `users` row**, and therefore none of the ~35
`on delete cascade` foreign keys ever fire. Every order, SIP mandate, compliance decision,
document, and audit-log entry this account's activity ever created survives completely intact —
now attributed to an anonymized identity instead of being destroyed or silently orphaned by a
cascade. Verified directly: `accountLifecycle.test.js`'s "preserves every compliance/financial
record for a real investment-ready user" test creates a full compliance/order-account history via
the same `makeInvestmentReadyUser()` helper every other invest test file in this codebase uses,
deletes the account, and asserts the exact same row counts survive.

This is a standard, well-understood resolution of a real and common tension: a GDPR-style "delete
my data" expectation versus a registered financial intermediary's likely obligation to retain
transaction and compliance history. **Anonymize the identity, preserve the record** is the safer
default of the two available failure modes — over-retention is a compliance conversation;
improper early destruction of a record a regulator later asks for is a much worse one. This
document does not claim that trade-off is legally optimal, only that it is the defensible default
until someone with actual authority to interpret the applicable regulations says otherwise (see
"Open policy questions" below).

### Why deactivation auto-clears on the next successful sign-in

`resolveSignInEligibility()` (called from `auth.js`'s `signIn` callback, for every provider —
Credentials, OAuth, and magic link alike) treats `deleted_at` as an unconditional, permanent
block, but treats `deactivated_at` differently: successfully completing sign-in while deactivated
**clears** `deactivated_at` and lets sign-in proceed, rather than blocking it.

This is deliberate, not an oversight. The alternative — blocking sign-in outright while
deactivated — is a dead end: `reactivateAccount()`'s own route requires an already-authenticated
session to call, and deactivation deletes existing sessions specifically so it takes effect
immediately. A hard sign-in block would mean a deactivated account could never obtain the very
session it needs to reactivate itself, making "reversible" false in practice. "Log back in to
reactivate" is a deliberate, common convention (see most consumer apps' own account-deactivation
flows) chosen specifically to avoid that dead end. The explicit `/api/v1/account/reactivate` route
still exists for the narrower case of a still-live second session (e.g. another tab) noticing the
account was deactivated elsewhere.

### What a deleted account's audit trail actually shows

`account_lifecycle_events` (one row per transition: `deactivated`, `reactivated`, one of which
carries `{"via": "sign_in"}` when it happened through the auto-clear path above, and
`deletion_requested_and_anonymized`) is itself permanent — it is never anonymized or cleared,
by design; it is the record of what happened to the record.

## Open policy questions — explicitly not decided here

The instruction governing this work was explicit: do not guess regulatory retention periods, and
flag what needs real confirmation rather than inventing a rule. The following are genuinely open:

1. **Is "preserve indefinitely, anonymized" actually correct, or is there a specific retention
   *window* (e.g. N years from the last transaction) after which even the anonymized financial
   records should be purged?** This document does not name a number. Whatever SEBI/AMFI
   recordkeeping obligations apply to a registered mutual fund distributor need to be confirmed
   by someone with actual authority to interpret them, not inferred by an engineering session.
   Until that's confirmed, the system's default is to retain anonymized records indefinitely,
   which is the safer of the two ways to be wrong.

2. **`bank_accounts.account_holder_name`** is real, unmasked personal data (the account *number*
   was already stored masked before this change — `account_number_masked`, `sql/neon/
   009_invest_identity_compliance.sql` — that part predates this work). It is not touched by
   `requestAccountDeletion()`, on the reasoning that it's part of a verified financial artifact
   (proof of whose account was checked and approved for payouts) rather than free personal
   profile data. Whether that reasoning holds, or whether this field specifically should also be
   anonymized on deletion, is genuinely unclear and not decided here.

3. **`nominees`** (name, relationship, allocation percentage) is third-party personal data — of
   the *nominee*, not the account holder — attached to a completed KYC/compliance record. It is
   preserved as-is by the same "never hard-delete the users row" mechanism. Whether a nominee's
   personal data has the same retention justification as the account holder's own regulated
   transaction history, or should be handled differently, is not decided here.

4. **Right-to-erasure conflicts.** If a specific regulation (GDPR-adjacent or otherwise)
   ultimately requires literal erasure of specific fields on a specific timeline — not just
   anonymization — that is a legal determination this document cannot make. The mechanism here
   (anonymize-in-place, preserve associated records) can be extended to selectively null
   additional fields once that determination exists; it should not be extended speculatively
   ahead of it.

5. **Advisor-placed orders (H5).** `investment_orders.placed_by_user_id` (the advisor, if an order
   was placed on a client's behalf) has no `on delete` behavior specified at all. Because this
   redesign never hard-deletes a `users` row, that gap is no longer a *live* failure path — there
   is no more deletion event for it to fail on. It has deliberately not been separately hardened
   (e.g. `on delete set null`, matching `documents.actor_user_id`'s existing pattern) in this
   pass: doing so means altering `investment_orders` directly, a table that already has one
   pending, unmerged migration (C1, `sql/neon/022_order_idempotency.sql`) blocked on this
   session's tooling being unable to reliably apply `ALTER TABLE` to it in production. Adding a
   second, unrelated alter to the same table isn't worth that friction for a concern this
   redesign already made structurally dormant. Worth revisiting as real defense-in-depth once C1
   lands and that table's migration situation is calmer.

## What this does not solve

- **No admin/ops tooling** to look up or bulk-manage lifecycle state exists yet (M5 Slice 7,
  Notification Admin APIs, is the closest analog already tracked as pending — this would be a
  similar, separate piece of work for accounts).
- **No scheduled purge job.** Nothing currently runs on a schedule to enforce ANY retention window
  even once one is confirmed (see open question 1) — that's new work, not yet built, once the
  actual policy exists.
- **The `jwt` session strategy's existing limitation is unchanged.** For a deployment with no
  OAuth/Resend provider configured (falls back to `jwt`, see `auth.js`), an already-issued session
  cookie stays cryptographically valid until its natural expiry regardless of deactivation or
  deletion — the same pre-existing, already-documented gap noted in `reset-password`'s own route.
  Deleting `sessions` rows (what this change does for both deactivation and deletion) only has
  teeth under the `database` strategy.
