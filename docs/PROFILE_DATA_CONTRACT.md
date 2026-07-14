# Profile Data Contract

Production Activation Phases 4–5. Exactly what the research profile collects, why, and how it's
kept separate from the platform's sensitive financial-profile data.

## Every field, audited

Source of truth: `frontend/app/lib/userProfile.js`'s `PROFILE_OPTIONS`, `sql/neon/
005_research_profile.sql`, and `frontend/app/api/v1/sync/research-profile/route.js`.

| Field | Purpose | Optional? | Sensitive? | Retention | User-visible? | Editable? | Delete behavior | Personalization consumer |
|---|---|---|---|---|---|---|---|---|
| `role` | Which persona to tailor language/depth for (individual / advisor / analyst / family office) | No (required at signup) | No — a broad self-description, not identity data | Until account deletion or explicit profile reset | Yes, shown on `/profile` | Yes | Cleared on profile delete (see below) | Not yet consumed by any UI surface — collected ahead of the personalization work that will use it (honest: no feature reads this today) |
| `primary_goal` | What the visitor is here to do (research / compare / portfolio / news) | No | No | Same as above | Yes | Yes | Same | Same — collected, not yet consumed |
| `experience` | Self-reported investing experience level | No | No | Same as above | Yes | Yes | Same | `AuthStatus.jsx`'s account menu displays it via `optionLabel()`; not yet used to adjust content depth anywhere |
| `risk_comfort` | Self-reported risk tolerance label (not a computed risk score) | No | Low — a preference label, not financial data | Same as above | Yes | Yes | Same | `AuthStatus.jsx` account menu; not yet used to filter/rank research |
| `horizon` | Investment time horizon **band** (0-1 / 1-3 / 3-5 / 5+ years) | No | No | Same as above | Yes | Yes | Same | Collected, not yet consumed |
| `aum_band` | Portfolio size **band**, explicit "prefer not to say" default | Yes | Low — a wide range, not a figure, and opt-out by default | Same as above | Yes | Yes | Same | Collected, not yet consumed |
| `preferred_categories` | Free-text fund categories the user cares about | Yes | No | Same as above | Yes | Yes | Same | Collected, not yet consumed |

**Honest note on "personalization consumer":** most of these fields are collected but not yet
read by any feature. That's not a defect to hide — it's the actual current state, and it directly
informs Phase 5's boundary: since nothing here is used for anything beyond display in the account
menu today, there is no justification for collecting anything more sensitive than what's listed
above. If a future feature needs finer-grained data (e.g. exact age or income for a retirement
calculator), that data belongs in `investor_profile` under its consent gate, not bolted onto this
table.

## What is deliberately NOT collected here

Name, email, and password are handled by the `users` table (existing auth system) — not
duplicated into `research_profile`. Nothing in this table can identify a specific financial
position, income, or legal identity.

## Delete behavior

`research_profile.user_id` has `on delete cascade` against `users(id)` — deleting the account
(the existing `/api/v1/account` DELETE route) removes this row automatically, with no separate
delete path today. A standalone "reset my research profile without deleting my account" control
does not yet exist (see Phase 8 for what's built vs. outstanding).

## Consent boundary: research_profile vs. investor_profile

Two tables exist for two genuinely different categories of data, and the mission's explicit
instruction — "do not mix research-preference data with financial-profile data such as salary,
income, or savings" — is enforced structurally, not just by convention:

| | `research_profile` (this table) | `investor_profile` (`sql/neon/003_investor_intelligence.sql`) |
|---|---|---|
| Fields | role, goal, experience, risk comfort **label**, horizon **band**, AUM **band**, free-text categories | age, gender, occupation, monthly salary, annual income, emergency fund, current savings, existing investments, dependents, tax slab, SIP/lumpsum budget |
| Sensitivity | Low — bands and labels, not figures | High — exact financial figures and personal circumstances |
| Consent required to write? | No — logged in is enough (same posture as `user_preferences`) | **Yes** — the table's own schema comment requires an explicit `consent_given_at` before any write, because "unlike the research-only sync tables, writes here should be gated on the user having actively opted in, not just being logged in" |
| Populated today? | Yes, via signup/profile-setup | **No** — Mission B's Investor Profile phase (task #112) is explicitly deferred; this table exists in schema only, nothing writes to it |
| Purpose disclosure | Stated in the profile form itself ("These fields personalize the research workspace...") | Not yet built — required before this table is ever written to |
| Deletion controls | Cascades with account deletion (see above) | Not yet built |
| Restricted access | Standard `requireUser()` session check, same as every other personal table | Same mechanism, but writes are additionally gated on consent once that flow exists |
| Audit logging | Not applicable — no sensitive data to audit access to | Should be added when this table starts being written to, given the sensitivity of what it holds |

**The boundary holds today because `investor_profile` is unpopulated.** The risk this document
exists to head off is a future change quietly writing salary/income/savings fields into
`research_profile` (or extending its signup form) without building the consent flow first. Any
such change must create or reuse the `investor_profile` path, not extend this one.
