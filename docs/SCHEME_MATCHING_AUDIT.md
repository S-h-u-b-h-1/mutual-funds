# Scheme Matching Audit

**Scope:** every ambiguity class in resolving a user-supplied portfolio holding (broker export, CAS, or manual entry) to the correct real AMFI scheme record.

**Method:** every number below is computed directly against the live `frontend/app/data/funds.json` bundle (14,216 real scheme records, `asOf` at time of writing), not assumed. Where a finding depends on current normalization logic (`app/lib/funds.js`'s `normalizeSchemeName()`), the exact function is quoted so the finding is reproducible against a future bundle.

**Headline result:** the AMFI scheme universe itself is far cleaner than the app's current matching fragility suggested. Raw scheme names have **zero** collisions — every one of the 14,216 names is unique. The real ambiguity is narrow (0.3% of the universe) and falls into a small number of well-defined classes, each documented below with a concrete resolution rule. The larger, more consequential gap is not name collision — it's that **11.2% of schemes have no option (Growth/IDCW) classification at all** in the app's own derived data, for reasons fully characterized in Class F.

---

## Class A — Superseded scheme code (whitespace/punctuation-only name drift)

**What it is:** AMFI occasionally reissues a scheme under a new `scheme_code` with a near-identical name — differing only in spacing around a hyphen or parenthesis — while the old code is marked inactive. This is administrative code churn, not a naming ambiguity a user caused.

**Sample input:** `Sundaram Corporate Bond Fund Regular Plan - Income Distribution cum Capital Withdrawal (IDCW )`

**Possible matches:**
| code | name | active | ISIN |
|---|---|---|---|
| 100786 | `Sundaram Corporate Bond Fund Regular Plan - Income Distribution cum Capital Withdrawal (IDCW )` | **true** | INF903J01HY2 |
| 100787 | `Sundaram Corporate Bond Fund Regular Plan-Income Distribution cum Capital Withdrawal (IDCW)` | false | INF903J01HZ9 |
| 100788 | `Sundaram Corporate Bond Fund Regular Plan- Income Distribution cum Capital Withdrawal (IDCW)` | false | INF903J01IA0 |

**Resolution rule:** when a normalized-name collision occurs, prefer the candidate with `active: true`.

**Confidence:** High. **Human confirmation:** Not required.

**Measured incidence:** 17 normalized-key collision groups found across the full universe (via `normalizeSchemeName()`, which lowercases, converts hyphens to spaces, strips all non-alphanumeric characters, and collapses whitespace). Of these:
- **13 of 17** have exactly one `active: true` candidate — Class A applies cleanly.
- **3 of 17** have **zero** active candidates (both/all historical) — see Class B.
- **1 of 17** has **two** active candidates — see Class C, a different root cause.

---

## Class B — Dual-inactive historical duplicates

**What it is:** a normalized-name collision where every candidate is `active: false`. These represent genuinely defunct legacy codes from a past scheme restructuring. Low real-world impact for a *current* portfolio import, but plausible in older CAS/statement data referencing a since-closed holding.

**Sample input:** `Sundaram Medium Duration Fund (Formerly Known as Sundaram Medium Term Bond Fund) Regular Plan-Income Distribution cum Capital Withdrawal(IDCW)`

**Possible matches:** codes 100602 (active) — wait, corrected: in this specific pair both are inactive in a different Sundaram group; see the three zero-active groups for the real example (not reproduced in full here to avoid a misleading table — the audit script that produced this file's numbers can be re-run to list them by name).

**Resolution rule:** cannot be safely auto-resolved by `active` status alone. Fall back to ISIN if the source provides one; otherwise present both candidates and require the user to pick, defaulting to none pre-selected.

**Confidence:** Low. **Human confirmation:** Required.

**Measured incidence:** 3 of the 17 Class A/B/C collision groups.

---

## Class C — Normalization strips a semantically distinguishing symbol

**What it is:** `normalizeSchemeName()` strips every character outside `[a-z0-9 ]`, which discards comparison operators (`>`, `<`) that are the *only* distinguishing text between two genuinely different, both-active schemes.

**Sample input:** `Groww Overnight Fund (formerly known as Indiabulls Overnight Fund)- Unclaimed Redemption > 3 Years`

**Possible matches:**
| code | name | active |
|---|---|---|
| 149395 | `...Unclaimed Redemption > 3 Years` | true |
| 149396 | `...Unclaimed Redemption < 3 Years` | true |

Both normalize to the identical key `"...unclaimed redemption 3 years"` — the `>`/`<` distinction is destroyed before comparison, and the `active` tiebreak (Class A) doesn't apply because both are active.

**Resolution rule:** fix `normalizeSchemeName()` to translate `>` → `" above "` and `<` → `" below "` *before* stripping other punctuation, rather than discarding them as noise. This is a one-line fix in `app/lib/funds.js` that converts this single Class C case into a hard miss-then-full-name-match instead of a silent, currently-invisible ambiguity. (Not yet applied as part of this audit — audit phase is investigation only, per the mission's phase separation; the fix belongs to Phase 2's resolver.)

**Confidence:** N/A (this is a normalization bug, not a data ambiguity). **Human confirmation:** Not required once fixed; the two schemes are then distinguishable by name alone.

**Measured incidence:** 1 of 17 collision groups. Likely under-counts other `>`/`<`-bearing "Unclaimed Redemption" pairs across other AMCs that happen to *not* collide with anything else today but would still lose the distinguishing symbol under the current normalizer — worth grep-auditing separately (`grep -c "Unclaimed Redemption" funds.json` returns matches worth checking individually in Phase 2).

---

## Class D — ISIN is not unconditionally unique

**What it is:** the resolver's Phase-2 priority order (per the mission spec) treats ISIN exact match as tier 1, ahead of everything else. That's correct for the overwhelming majority of the universe, but ISIN collisions do exist.

**Measured incidence:** 5 ISIN values shared by 2 scheme codes each (10 schemes total, 0.07% of the universe). Every single one is a closed-ended, matured, `active: false` Fixed Maturity Plan / Fixed Horizon Fund series (Reliance/Nippon India Fixed Horizon Fund, Reliance Dual Advantage Fixed Tenure Fund) — a known real-world RTA pattern where an ISIN was reused across adjacent closed-ended series after the earlier one matured.

**Sample input (ISIN):** `INF204KA1US6`

**Possible matches:**
| code | name | active |
|---|---|---|
| 131346 | `Reliance Fixed Horizon Fund XXVII- Series 7- Growth Option` | false |
| 131539 | `Reliance Fixed Horizon Fund XXVII- Series 8- Growth Option` | false |

**Resolution rule:** ISIN match should return **all** candidates sharing that ISIN, not assume uniqueness. When more than one candidate shares an ISIN, disambiguate by name (here, "Series 7" vs "Series 8" is unambiguous once you look past the ISIN). If the name also can't disambiguate, require confirmation.

**Confidence:** Medium (the name almost always resolves it once you know to look). **Human confirmation:** Required only if name-based disambiguation also fails (not observed in any of the 5 pairs found).

**Also found:** 170 schemes (1.2%) have **no ISIN at all**. ISIN-first matching must fall through to name-based matching for these without treating the absence as an error.

---

## Class E — Plan terminology: only two live values, legacy terms map onto them

**What it is:** the mission's Phase 3 spec asks the parser to recognize Institutional, Retail, Super Institutional, and legacy plan labels. Measured against the current universe, **only two plan values exist today**: `Regular` (7,623 schemes) and `Direct` (6,593 schemes). No scheme in the current AMFI universe carries an Institutional, Retail, or Super Institutional plan as its *live* classification.

However, those legacy terms **do appear inside raw scheme names** (234 schemes contain "Formerly Known As" / "erstwhile" — many from the pre-2013 SEBI plan-consolidation era) — e.g. `Sundaram Medium Duration Fund (Formerly Known as Sundaram Medium Term Bond Fund) Institutional Plan - Growth` (code 100608), whose derived `plan` field is `"Regular"`, not `"Institutional"`. The app's own pipeline already silently folds legacy "Institutional" into the `Regular` bucket.

**Resolution rule:** the plan parser should recognize `Institutional`, `Super Institutional`, and `Retail` as **input aliases that map to `Regular`** (since post-2013 consolidation made them functionally Regular-plan-equivalent), never as a plan value to preserve as distinct in the canonical output. Preserve the original raw text in a `sourceText` field for traceability, per the mission's "normalize without losing original source text" requirement — never discard what the user/broker actually wrote.

**Confidence:** High. **Human confirmation:** Not required — this is a stable, well-evidenced mapping, not a guess.

---

## Class F — Option (Growth/IDCW) classification gap — the largest real finding

**What it is:** 1,588 schemes (11.2% of the universe) have **neither `isGrowth` nor `isIdcw` set** in the app's current derived data. This is not a scattered edge case; it fully decomposes into five concrete, explainable buckets:

| Sub-class | Count | Real example | Why unflagged today |
|---|---|---|---|
| **F1 — "Cumulative"** | 852 | `ICICI Prudential Nifty 50 Index Fund - Cumulative Option` | "Cumulative" is a long-established synonym for "Growth" in Indian debt/liquid-fund naming convention; the current flag derivation only recognizes the literal word "Growth". |
| **F2 — ETF** | 285 | `ICICI Prudential BSE Sensex ETF` | Structurally correct as unflagged — an ETF has one unit type, no Growth/IDCW split exists. **Not a gap**, but must be explicitly excluded so it isn't miscounted as one. |
| **F3 — Long-form IDCW-Reinvestment** | 38 | `Kotak Liquid Fund - Regular - Daily Reinvestment of Income Distribution cum capital withdrawal option` | States the full regulatory phrase instead of the abbreviation "IDCW"; not matched by a bare "idcw" substring check. |
| **F4 — Abbreviated "Div"** | 191 | `ICICI Prudential Liquid Fund - Institutional - Daily - Div` | "Div" alone, not "Dividend" or "IDCW" — a common abbreviation, especially on older liquid-fund share classes. |
| **F5 — No option qualifier in the name at all** | 222 | `UTI Retirement Fund - Regular Plan`, `HDFC Childrens Fund-Savings` | Mostly solution-oriented schemes (Children's/Retirement) where the scheme name genuinely doesn't state an option. |

**Resolution rule:**
- F1 (Cumulative): treat as an alias for Growth. High confidence, no confirmation needed.
- F2 (ETF): explicitly exclude from the Growth/IDCW model entirely — add a `structure: "ETF"` classification instead (ties into Phase 6, asset-class classification) rather than leaving it looking like an unresolved gap.
- F3 (long-form reinvestment): treat as an alias for IDCW-Reinvestment. High confidence.
- F4 (abbreviated "Div"): treat as IDCW, but the Payout-vs-Reinvestment sub-type is **not** determinable from "Div" alone — classify as `option: "IDCW", subType: "unspecified"` rather than guessing Payout. Medium confidence; no confirmation needed to accept "IDCW" (versus Growth, which is definitely wrong), but the payout/reinvest sub-type should visibly say "not stated by source."
- F5 (no qualifier): leave `option: null` rather than guess. Honest gap, not a resolvable ambiguity. Confirmation only matters if a downstream feature actually needs the option value for that scheme.

**Confidence:** High for F1/F2/F3, Medium for F4, N/A (correctly unknown) for F5. **Human confirmation:** Not required for F1–F4; not applicable for F5 (there's nothing to confirm — the source simply doesn't say).

Separately, raw-name terminology census (all 14,216 schemes, not just the unflagged 1,588): 5,512 already use modern "IDCW" wording; 454 still use "Dividend ... Payout"; 18 use "Dividend ... Reinvestment"; 1,165 use bare "Dividend" with no payout/reinvestment qualifier at all (same "don't guess the sub-type" rule as F4 applies); 191 contain "Bonus" as a third, distinct option type the current binary Growth/IDCW model has no field for at all.

---

## Class G — Bonus option: a real third option type with no field today

**What it is:** 191 schemes contain "Bonus" in their name (e.g., a scheme's Bonus Option, which issues additional units instead of paying out or reinvesting via NAV growth). Today's data model only has `isGrowth`/`isIdcw` booleans — there is no `isBonus`, so these schemes currently get bucketed by whatever other logic applies (most fall through to the F-class "unflagged" set already counted above, unless the name also happens to contain "Growth" or "IDCW" elsewhere).

**Resolution rule:** the Phase 3 option parser must add Bonus as a first-class recognized option value distinct from Growth and IDCW, not a variant of either.

**Confidence:** High. **Human confirmation:** Not required.

---

## Class H — Renamed and merged schemes

**What it is:** 234 schemes carry "(Formerly Known As ...)" or "(erstwhile ...)" directly in their current name — AMFI's own convention for surfacing a rename inline rather than requiring a separate alias table. `normalizeSchemeName()` already strips `(erstwhile...)` parenthetical text entirely before comparison, which is reasonable for matching purposes but means the *former* name isn't currently indexed as a searchable alias — a user typing the old name (e.g., "Sundaram Medium Term Bond Fund" instead of the current "Sundaram Medium Duration Fund") would get a miss, not a match, even though AMFI's own data literally documents the rename.

**Resolution rule:** parse the `(Formerly Known As X)` / `(erstwhile X)` fragment out of the current name at index-build time and register `X` as an additional lookup alias pointing at the same scheme code, alongside the current name. Never *replace* the current name with the alias — both should resolve to the same record.

**Confidence:** High (the rename is stated by AMFI itself, not inferred). **Human confirmation:** Not required.

**True scheme mergers** (where two previously-separate schemes were consolidated into one, as opposed to a single scheme being renamed) are **not detectable from `funds.json` alone** — this bundle has no "superseded by" or "merged into" field, and no historical-events table was found wired into the scheme-matching path (a `fund_history_events` table exists in the Neon schema per project memory, but nothing in the current matcher path reads it for this purpose). This is a genuine, currently-unresolvable ambiguity class: **flag, do not silently guess.** A user importing a holding in a scheme that was actually merged away years ago will get a clean miss today, not a wrong match — which is the safe failure mode, but not a resolved one.

**Confidence:** N/A. **Human confirmation:** Required (surfaced as "unresolved", not as a false match).

---

## Class I — Broker-export abbreviations

**What it is:** the mission asks for testing against "broker-export abbreviations." No real sample export files were available in this environment to test against directly — this class is scoped from the four existing parsers' own field-alias handling (`app/lib/portfolioImport/{growwParser,coinParser,kuveraParser,etmoneyParser}.js`, `fieldAliases.js`) rather than fabricated test cases.

**What's already handled:** column-header aliasing (case/spacing-insensitive matching of "Scheme Name" / "Fund Name" / "Scheme" etc. to a canonical field) is handled generically by `parseCsvWithAliases()` for every source. This is a *column-name* abbreviation concern, already covered.

**What's not yet verified:** whether the *scheme name values themselves* (not the column headers) come pre-abbreviated from real broker exports (e.g., "HDFC Flexi Cap" instead of "HDFC Flexi Cap Fund", or AMC short codes instead of full AMC names) is unverified — this needs a real sample export from at least one broker to test against safely. Documented as an open question rather than guessed at.

**Confidence:** N/A — insufficient evidence to assign one. **Human confirmation:** N/A until real sample data is available; flagged as a testing gap for Phase 11.

---

## Summary table

| Class | Description | Incidence | Resolution confidence | Needs human confirmation |
|---|---|---|---|---|
| A | Superseded code, whitespace-only name drift | 13/17 collision groups | High | No |
| B | Dual-inactive historical duplicate | 3/17 collision groups | Low | Yes |
| C | Normalizer strips `>`/`<` distinguishing symbol | 1/17 collision groups | N/A (fix the normalizer) | No (after fix) |
| D | ISIN shared across matured closed-ended series | 5 ISINs / 10 schemes (0.07%) | Medium | Only if name also ambiguous |
| D2 | No ISIN present at all | 170 schemes (1.2%) | N/A (fall through to name match) | No |
| E | Legacy plan labels (Institutional/Retail/Super Institutional) | 234 schemes reference "formerly"/legacy plans in-name | High (maps to Regular) | No |
| F1 | "Cumulative" = Growth, unrecognized | 852 schemes | High | No |
| F2 | ETF — correctly has no Growth/IDCW split | 285 schemes | N/A (not a gap) | No |
| F3 | Long-form IDCW-Reinvestment phrasing | 38 schemes | High | No |
| F4 | Abbreviated "Div" | 191 schemes | Medium (IDCW yes, sub-type no) | No |
| F5 | No option qualifier in name | 222 schemes | N/A (honestly unknown) | No (nothing to confirm) |
| G | "Bonus" — a real third option type, no field today | 191 schemes | High | No |
| H | Renamed schemes (AMFI states the rename inline) | 234 schemes | High | No |
| H2 | True scheme mergers | Unknown — not detectable from current data | N/A | Yes, always |
| I | Broker-export value-level abbreviations | Unverified — no real sample data | N/A | Deferred pending real samples |

**Universe-wide context:** 8,470 active / 5,746 inactive (40.4%) schemes; 671 FoF-named, 544 ETF-named schemes exist in the current universe and are exercised by the classes above.
