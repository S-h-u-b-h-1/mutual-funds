// Canonical Scheme Identity Resolver (Scheme Matching & Portfolio Import Reliability sprint,
// Phase 2). Composes the fixed funds.js primitives (ISIN/name/former-name lookups) and the
// Plan/Option parser into one priority-ordered resolution, per docs/SCHEME_MATCHING_AUDIT.md.
// Never silently chooses between multiple plausible schemes — every path either returns exactly
// one confident answer with its reasoning, or reports the real candidates and asks for
// confirmation. No new fund data, no fuzzy scoring beyond what's explicitly documented below.
import { getFund, getFundsByIsin, getFundsByNormalizedName, getFundsByFormerName, allFunds } from "../funds";
import { parsePlanAndOption } from "./planOptionParser";

// Vocabulary stripped when extracting a scheme's "base name" (fund family, independent of plan/
// option) — mirrors exactly the terms planOptionParser.js recognizes, so base-name extraction and
// plan/option parsing never disagree about what counts as a plan/option word versus part of the
// fund's actual name.
const PLAN_OPTION_WORDS = /\b(direct|regular|institutional|retail|super|growth|idcw|dividend|payout|reinvestment|reinvest|cumulative|bonus|option|options|plan)\b/gi;
const CUM_CAPITAL_WITHDRAWAL = /income\s+distribution\s+cum\s+capital\s+withdrawal/gi;

function normalizeLoose(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\((?:formerly known as|erstwhile)[^)]*\)/gi, "")
    .replace(/[-–—]/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractBaseName(text) {
  const withoutCumWithdrawal = String(text || "").replace(CUM_CAPITAL_WITHDRAWAL, " ");
  return normalizeLoose(withoutCumWithdrawal.replace(PLAN_OPTION_WORDS, " "));
}

let baseNameIndex = null;
function buildBaseNameIndex() {
  const idx = {};
  for (const f of allFunds()) {
    const key = extractBaseName(f.name);
    if (!key) continue;
    (idx[key] ||= []).push(f);
  }
  return idx;
}
function candidatesByBaseName(text) {
  baseNameIndex ||= buildBaseNameIndex();
  return baseNameIndex[extractBaseName(text)] || [];
}

// A candidate's own real plan/option flags, compared against what the input text parsed to.
// Only used to narrow an already-matched base-name group — never invoked on its own as a search.
function candidateMatchesParsedPlanOption(fund, parsed) {
  if (parsed.plan === "Direct" && !fund.isDirect) return false;
  if (parsed.plan === "Regular" && fund.isDirect) return false;
  if (parsed.option === "Growth" && !fund.isGrowth) return false;
  if (parsed.option === "IDCW" && !fund.isIdcw && !fund.isGrowth) {
    // isIdcw may be unset for the abbreviated/legacy-terminology schemes documented as Class F in
    // the audit — accept a fund with neither flag set as a plausible IDCW candidate rather than
    // rejecting it outright, since "neither flag set" is a known data gap, not proof it's Growth.
    if (fund.isGrowth) return false;
  }
  if (parsed.option === "Bonus" && (fund.isGrowth || fund.isIdcw)) return false;
  return true;
}

const looksLikeSchemeCode = (input) => /^\d{4,7}$/.test(String(input || "").trim());

// Prefer the active candidate among a tied group (Class A) — returns { winner, tied } where
// `tied` is true only when the active-status tiebreak itself doesn't produce exactly one.
function preferActive(candidates) {
  const active = candidates.filter((f) => f.active);
  if (active.length === 1) return { winner: active[0], tied: false };
  return { winner: null, tied: true };
}

function baseResult(overrides) {
  return {
    status: "unresolved",
    schemeCode: null,
    fundFamily: null,
    planType: null,
    optionType: null,
    optionSubType: null,
    amc: null,
    category: null,
    isin: null,
    confidence: "low",
    matchMethod: "unresolved",
    ambiguityCandidates: [],
    warning: null,
    sourceText: null,
    ...overrides,
  };
}

function toResult(fund, { status, confidence, matchMethod, warning = null, ambiguityCandidates = [] }, sourceText) {
  return baseResult({
    status,
    schemeCode: fund.code,
    fundFamily: extractBaseName(fund.name) ? fund.name : fund.name,
    planType: fund.isDirect ? "Direct" : "Regular",
    optionType: fund.isGrowth ? "Growth" : fund.isIdcw ? "IDCW" : /\bbonus\b/i.test(fund.name) ? "Bonus" : null,
    amc: fund.amc || null,
    category: fund.category || null,
    isin: fund.isin || null,
    confidence,
    matchMethod,
    ambiguityCandidates: ambiguityCandidates.map(summarizeCandidate),
    warning,
    sourceText,
  });
}

function summarizeCandidate(f) {
  return { schemeCode: f.code, name: f.name, active: f.active, isin: f.isin || null, amc: f.amc, category: f.category };
}

/**
 * Resolve one user-supplied holding identifier (a scheme name, an ISIN, or a scheme code) to a
 * real scheme record. Priority order, per docs/SCHEME_MATCHING_AUDIT.md:
 *   1. ISIN exact match
 *   2. AMFI scheme code exact match
 *   3. Normalized full-name exact match (with Class A "prefer active" tiebreak)
 *   4. Plan/option decomposition + base-name match
 *   5. Legacy ("Formerly Known As") alias match
 *   6. Constrained fuzzy match, only if it narrows to exactly one candidate
 *   7. Unresolved — never a silent guess
 *
 * @param {{ schemeName?: string, isin?: string }} input
 * @returns {ReturnType<typeof baseResult>}
 */
export function resolveSchemeIdentity(input) {
  const schemeName = (input?.schemeName || "").trim();
  const isin = (input?.isin || "").trim();
  const sourceText = schemeName || isin || "";

  // Tier 1 — ISIN exact match.
  if (isin) {
    const isinMatches = getFundsByIsin(isin);
    if (isinMatches.length === 1) {
      return toResult(isinMatches[0], { status: "confirmed", confidence: "high", matchMethod: "isin" }, sourceText);
    }
    if (isinMatches.length > 1) {
      // Class D — ISIN shared across schemes (observed only among matured closed-ended series).
      // Try to disambiguate using the scheme name, if one was also supplied.
      if (schemeName) {
        const byName = isinMatches.filter((f) => normalizeLoose(f.name) === normalizeLoose(schemeName));
        if (byName.length === 1) {
          return toResult(byName[0], { status: "confirmed", confidence: "high", matchMethod: "isin+name" }, sourceText);
        }
      }
      return baseResult({
        status: "needs_review",
        confidence: "low",
        matchMethod: "isin",
        warning: `This ISIN (${isin}) is shared by ${isinMatches.length} schemes (a known AMFI data pattern among matured closed-ended fund series) — the scheme name did not narrow it to one.`,
        ambiguityCandidates: isinMatches.map(summarizeCandidate),
        sourceText,
        isin,
      });
    }
    // ISIN provided but not found: fall through to name-based tiers rather than stopping here —
    // a mistyped ISIN alongside a correct name should still be resolvable.
  }

  // Tier 2 — AMFI scheme code exact match.
  if (schemeName && looksLikeSchemeCode(schemeName)) {
    const byCode = getFund(schemeName.trim());
    if (byCode) return toResult(byCode, { status: "confirmed", confidence: "high", matchMethod: "scheme_code" }, sourceText);
  }

  if (!schemeName) {
    return baseResult({ status: "unresolved", matchMethod: "unresolved", warning: "No scheme name or ISIN provided.", sourceText });
  }

  // Tier 3 — normalized full-name exact match.
  const nameMatches = getFundsByNormalizedName(schemeName);
  if (nameMatches.length === 1) {
    return toResult(nameMatches[0], { status: "confirmed", confidence: "high", matchMethod: "normalized_name" }, sourceText);
  }
  if (nameMatches.length > 1) {
    const { winner, tied } = preferActive(nameMatches);
    if (!tied) {
      return toResult(winner, {
        status: "high_confidence",
        confidence: "high",
        matchMethod: "normalized_name+active_tiebreak",
        warning: `${nameMatches.length} schemes share this exact name after normalization; resolved to the one currently active scheme (Class A in the scheme-matching audit — administrative code succession, not a naming conflict you caused).`,
        ambiguityCandidates: nameMatches.filter((f) => f !== winner),
      }, sourceText);
    }
    return baseResult({
      status: "needs_review",
      confidence: "low",
      matchMethod: "normalized_name",
      warning: `${nameMatches.length} schemes share this exact name and the active-status tiebreak didn't narrow it to one (Class B/C in the scheme-matching audit) — please confirm which one, or provide the ISIN.`,
      ambiguityCandidates: nameMatches.map(summarizeCandidate),
      sourceText,
    });
  }

  // Tier 4 — plan/option decomposition + base-name match. Handles cases where the exact string
  // doesn't match (different word order, missing punctuation) but the underlying fund, plan, and
  // option are all identifiable separately.
  const parsed = parsePlanAndOption(schemeName);
  const baseCandidates = candidatesByBaseName(schemeName);
  if (baseCandidates.length > 0) {
    const filtered = baseCandidates.filter((f) => candidateMatchesParsedPlanOption(f, parsed));
    const pool = filtered.length > 0 ? filtered : baseCandidates;
    if (pool.length === 1) {
      return toResult(pool[0], {
        status: "high_confidence",
        confidence: parsed.plan && parsed.option ? "high" : "medium",
        matchMethod: "plan_option_decomposition",
        warning: pool !== filtered ? "Matched by fund name; the plan/option in your input didn't narrow the field further than the name already did." : null,
      }, sourceText);
    }
    if (pool.length > 1) {
      const { winner, tied } = preferActive(pool);
      if (!tied) {
        return toResult(winner, {
          status: "high_confidence",
          confidence: "medium",
          matchMethod: "plan_option_decomposition+active_tiebreak",
          warning: `Matched by fund name and plan/option, narrowed further by active status (${pool.length} candidates remained after plan/option filtering).`,
          ambiguityCandidates: pool.filter((f) => f !== winner),
        }, sourceText);
      }
      return baseResult({
        status: "needs_review",
        confidence: "low",
        matchMethod: "plan_option_decomposition",
        warning: `Found the fund by name, but ${pool.length} plan/option variants remain after decomposition — please confirm which one.`,
        ambiguityCandidates: pool.map(summarizeCandidate),
        sourceText,
      });
    }
  }

  // Tier 5 — legacy "Formerly Known As" alias match.
  const formerMatches = getFundsByFormerName(schemeName);
  if (formerMatches.length === 1) {
    return toResult(formerMatches[0], {
      status: "high_confidence",
      confidence: "high",
      matchMethod: "legacy_alias",
      warning: `Matched via this scheme's former name — it is now called "${formerMatches[0].name}".`,
    }, sourceText);
  }
  if (formerMatches.length > 1) {
    const { winner, tied } = preferActive(formerMatches);
    if (!tied) {
      return toResult(winner, {
        status: "high_confidence",
        confidence: "medium",
        matchMethod: "legacy_alias+active_tiebreak",
        warning: `Matched via a former scheme name shared by ${formerMatches.length} current schemes, narrowed to the active one.`,
        ambiguityCandidates: formerMatches.filter((f) => f !== winner),
      }, sourceText);
    }
    return baseResult({
      status: "needs_review", confidence: "low", matchMethod: "legacy_alias",
      warning: `This former scheme name is now shared by ${formerMatches.length} current schemes — please confirm which one.`,
      ambiguityCandidates: formerMatches.map(summarizeCandidate), sourceText,
    });
  }

  // Tier 6 — constrained fuzzy match: substring containment, accepted only if it narrows to
  // exactly one real scheme. Never a scored/ranked "best guess" — a second candidate means no
  // match at all, per this project's standing "never silently attribute to the wrong fund" rule.
  const loose = normalizeLoose(schemeName);
  if (loose.length >= 8) {
    const substringMatches = allFunds().filter((f) => {
      const fname = normalizeLoose(f.name);
      return fname.includes(loose) || loose.includes(fname);
    });
    if (substringMatches.length === 1) {
      return toResult(substringMatches[0], {
        status: "needs_review",
        confidence: "low",
        matchMethod: "fuzzy_unique",
        warning: "Matched by partial name containment, not an exact or decomposed match — please confirm this is the right scheme before relying on it.",
      }, sourceText);
    }
  }

  // Tier 7 — unresolved.
  return baseResult({
    status: "unresolved",
    matchMethod: "unresolved",
    warning: `No scheme could be matched to "${schemeName}". Try providing the ISIN, or check the scheme name against the fund's factsheet.`,
    sourceText,
  });
}
