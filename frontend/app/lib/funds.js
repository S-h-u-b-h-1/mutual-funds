// Server-only access to the scheme-level bundle (funds.json). Imported once here so the
// 4MB dataset is a single shared module, never shipped to the client.
import data from "../data/funds.json";

export const asOf = data.asOf;
export const coverage = data.coverage;
export const cohorts = data.cohorts;

export function getFund(code) {
  return data.funds[code] || null;
}
export function allFunds() {
  return Object.values(data.funds);
}
export function cohortOf(f) {
  return f && f.cohortKey ? data.cohorts[f.cohortKey] : null;
}

export const benchmarkSlug = (name) => String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

let benchmarkIndex = null;
function buildBenchmarkIndex() {
  const idx = {};
  for (const f of allFunds()) {
    if (!f.benchmark) continue;
    const slug = benchmarkSlug(f.benchmark);
    (idx[slug] ||= { name: f.benchmark, codes: [] }).codes.push(f.code);
  }
  return idx;
}
export function getBenchmark(slug) {
  benchmarkIndex ||= buildBenchmarkIndex();
  return benchmarkIndex[slug] || null;
}

let isinIndex = null;
// Class D (docs/SCHEME_MATCHING_AUDIT.md): 5 ISINs are shared by 2 scheme codes each — all
// matured, inactive closed-ended Fixed Horizon Fund / Fixed Tenure Fund series that reused an
// ISIN after the earlier series closed. The old single-fund index silently overwrote the first
// match with whichever scheme happened to be processed last in allFunds() order — a real,
// previously-undetected bug (the ISIN "matched" something, but not deterministically the same
// something on every rebuild). Now collects every scheme sharing an ISIN so callers can see and
// resolve the ambiguity instead of it being invisible.
function buildIsinIndex() {
  const idx = {};
  for (const f of allFunds()) {
    if (f.isin) (idx[f.isin.trim().toUpperCase()] ||= []).push(f);
  }
  return idx;
}
export function getFundsByIsin(isin) {
  if (!isin) return [];
  isinIndex ||= buildIsinIndex();
  return isinIndex[String(isin).trim().toUpperCase()] || [];
}
// Portfolio import (Mission B): brokerage/CAS exports identify holdings by ISIN, not scheme code.
// Preserves the original single-result contract for existing callers; returns null (not a guess)
// when an ISIN resolves to more than one scheme — see getFundsByIsin() for the full candidate set.
export function getFundByIsin(isin) {
  const matches = getFundsByIsin(isin);
  return matches.length === 1 ? matches[0] : null;
}

const nameIndex = { byNormalized: null };
// Class C (docs/SCHEME_MATCHING_AUDIT.md): the previous version stripped ">" and "<" as generic
// punctuation, which destroyed the only distinguishing text between two different, both-active
// real schemes ("Unclaimed Redemption > 3 Years" vs "< 3 Years" — confirmed a genuine collision
// in the live universe). Comparison operators are now translated to words before the generic
// punctuation strip, so they survive into the normalized key instead of being discarded as noise.
function normalizeSchemeName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\(erstwhile.*?\)/g, "")
    .replace(/>/g, " above ")
    .replace(/</g, " below ")
    .replace(/[-–—]/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function buildNameIndex() {
  const idx = {};
  for (const f of allFunds()) {
    const key = normalizeSchemeName(f.name);
    (idx[key] ||= []).push(f);
  }
  return idx;
}
// Every scheme sharing a normalized name — never a fuzzy/best-guess match, since silently
// attributing a holding to the wrong fund is worse than reporting it unmatched. Callers decide
// how to use ties (see schemeResolver.js's Class A "prefer active" rule); this function itself
// never picks one candidate over another.
export function getFundsByNormalizedName(name) {
  nameIndex.byNormalized ||= buildNameIndex();
  return nameIndex.byNormalized[normalizeSchemeName(name)] || [];
}
// Fallback when a source gives no ISIN: exact match on a normalized scheme name only. Preserves
// the original single-result contract for existing callers; returns null (not a guess) when zero
// or more than one fund shares the normalized name — see getFundsByNormalizedName() for ties.
export function getFundByExactName(name) {
  const matches = getFundsByNormalizedName(name);
  return matches.length === 1 ? matches[0] : null;
}

// Class H (docs/SCHEME_MATCHING_AUDIT.md): 234 schemes state their own rename inline —
// "Scheme Name (Formerly Known As Old Name) ...". normalizeSchemeName() already strips this
// parenthetical before comparison (so the *current* name still matches cleanly), but the former
// name itself was not previously indexed as a searchable alias — a user typing the pre-rename
// name got a hard miss even though AMFI's own data documents the rename. Extracted once, at
// index-build time, from the same field naming already resolves — no second source of truth.
let formerNameIndex = null;
function buildFormerNameIndex() {
  const idx = {};
  const pattern = /\((?:formerly known as|erstwhile)\s+([^)]+)\)/i;
  for (const f of allFunds()) {
    const m = f.name.match(pattern);
    if (!m) continue;
    const key = normalizeSchemeName(m[1]);
    if (!key) continue;
    (idx[key] ||= []).push(f);
  }
  return idx;
}
export function getFundsByFormerName(name) {
  formerNameIndex ||= buildFormerNameIndex();
  return formerNameIndex[normalizeSchemeName(name)] || [];
}
