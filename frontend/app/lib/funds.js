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
