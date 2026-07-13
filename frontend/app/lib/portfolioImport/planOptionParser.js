// Plan and Option Parser (Scheme Matching & Portfolio Import Reliability sprint, Phase 3).
// Deterministic, no fabrication: every rule here is backed by a measured finding in
// docs/SCHEME_MATCHING_AUDIT.md (Classes E, F, G), not a generic assumption about AMFI naming.
// Parses freeform source text (a broker/CAS scheme-name string, or any user-typed fragment) into
// a plan and an option — never merges Growth and IDCW, never merges Direct and Regular, and never
// guesses when the source text genuinely doesn't say. The original matched fragment is always
// preserved (sourceText) so normalization never destroys what the source actually said.

// Plan aliases — Class E: no scheme in the live AMFI universe carries Institutional / Retail /
// Super Institutional as a *live* plan value anymore (post-2013 SEBI consolidation folded them
// into Regular; confirmed against funds.json — only "Direct" and "Regular" appear today). Source
// text (old CAS statements, broker exports referencing legacy holdings) may still use these
// terms, so they're recognized as input aliases that resolve to Regular, never preserved as a
// distinct canonical plan value. "Super Institutional" is checked before bare "Institutional" so
// the fuller phrase is captured as sourceText when present.
const PLAN_PATTERNS = [
  { test: /\bdirect\b/i, plan: "Direct" },
  { test: /\bsuper\s*institutional\b/i, plan: "Regular" },
  { test: /\binstitutional\b/i, plan: "Regular" },
  { test: /\bretail\b/i, plan: "Regular" },
  { test: /\bregular\b/i, plan: "Regular" },
];

export function parsePlan(sourceText) {
  const text = String(sourceText || "");
  for (const { test, plan } of PLAN_PATTERNS) {
    const m = text.match(test);
    if (m) return { plan, sourceText: m[0], confidence: "high" };
  }
  return { plan: null, sourceText: null, confidence: "unknown" };
}

// Option aliases — Classes F and G. Order matters (first match wins): more specific phrases
// (long-form reinvestment/payout wording) are checked before the bare "idcw"/"div"/"dividend"
// fallbacks, so a fully-specified source string gets a specific sub-type instead of being
// downgraded to "Unspecified" by an earlier, looser pattern matching first.
const OPTION_PATTERNS = [
  { test: /\bbonus\b/i, option: "Bonus", subType: null, confidence: "high" },
  { test: /\bcumulative\b/i, option: "Growth", subType: null, confidence: "high" }, // Class F1
  { test: /reinvestment of income distribution|idcw[\s-]*reinvest|dividend[\s-]*reinvest/i, option: "IDCW", subType: "Reinvestment", confidence: "high" }, // Class F3
  { test: /idcw[\s-]*payout|dividend[\s-]*payout/i, option: "IDCW", subType: "Payout", confidence: "high" },
  { test: /\bgrowth\b/i, option: "Growth", subType: null, confidence: "high" },
  { test: /\bidcw\b/i, option: "IDCW", subType: "Unspecified", confidence: "medium" }, // bare IDCW — sub-type genuinely not stated
  { test: /(^|[\s-])div([\s-]|$)/i, option: "IDCW", subType: "Unspecified", confidence: "medium" }, // Class F4 — abbreviated "Div"
  { test: /\bdividend\b/i, option: "IDCW", subType: "Unspecified", confidence: "medium" }, // bare legacy "Dividend", no payout/reinvest qualifier
];

export function parseOption(sourceText) {
  const text = String(sourceText || "");
  // Class F2 — ETFs have one unit type; Growth/IDCW does not apply. Checked first so an ETF
  // whose name happens to also contain another matched word (rare, but possible) isn't
  // misclassified into the Growth/IDCW model at all.
  if (/\betf\b/i.test(text)) {
    return { option: null, subType: null, sourceText: null, confidence: "not_applicable", note: "ETF — no Growth/IDCW split applies to this structure." };
  }
  for (const { test, option, subType, confidence } of OPTION_PATTERNS) {
    const m = text.match(test);
    if (m) return { option, subType, sourceText: m[0].trim(), confidence, note: null };
  }
  // Class F5 — genuinely not stated (commonly solution-oriented schemes: Children's, Retirement).
  // Honest null, never a guess.
  return { option: null, subType: null, sourceText: null, confidence: "unknown", note: null };
}

export function parsePlanAndOption(sourceText) {
  const text = String(sourceText || "");
  const p = parsePlan(text);
  const o = parseOption(text);
  return {
    plan: p.plan,
    planConfidence: p.confidence,
    planSourceText: p.sourceText,
    option: o.option,
    optionSubType: o.subType,
    optionConfidence: o.confidence,
    optionSourceText: o.sourceText,
    optionNote: o.note,
  };
}
