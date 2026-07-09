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
function buildIsinIndex() {
  const idx = {};
  for (const f of allFunds()) {
    if (f.isin) idx[f.isin.trim().toUpperCase()] = f;
  }
  return idx;
}
// Portfolio import (Mission B): brokerage/CAS exports identify holdings by ISIN, not scheme code.
export function getFundByIsin(isin) {
  if (!isin) return null;
  isinIndex ||= buildIsinIndex();
  return isinIndex[String(isin).trim().toUpperCase()] || null;
}

const nameIndex = { byNormalized: null };
function normalizeSchemeName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\(erstwhile.*?\)/g, "")
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
// Fallback when a source gives no ISIN: exact match on a normalized scheme name only — never a
// fuzzy/best-guess match, since silently attributing a holding to the wrong fund is worse than
// reporting it unmatched. Returns null (not a guess) when zero or more than one fund shares the
// normalized name.
export function getFundByExactName(name) {
  nameIndex.byNormalized ||= buildNameIndex();
  const matches = nameIndex.byNormalized[normalizeSchemeName(name)];
  return matches && matches.length === 1 ? matches[0] : null;
}
