// Fund Completeness + Research Readiness — deterministic, traceable measurement of how much
// trustworthy information exists for a fund. No fabricated values: a field counts only if it is
// actually present (from AMFI NAV or a real factsheet). Mirrored in scripts/market_coverage_audit.py.

const present = (v) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);

// Nine completeness dimensions, each scored 0–100 by fraction of its fields present, then weighted.
export function fundCompleteness(f, meta) {
  f = f || {};
  meta = meta || null;
  const m = (k) => meta && present(meta[k]);
  const dims = {
    identity: frac([f.name, f.amc, cat(f), f.assetClass, f.structure, f.isin]),
    performance: frac([f.nav, f.r1m, f.r3m, f.r1y, f.r3y ?? f.r5y, f.vol90]),
    benchmark: frac([f.benchmark]),
    risk: frac([f.vol90, f.maxdd90, f.consistency]),
    metadata: fracBool([m("expense_ratio") || m("regular_expense_ratio") || m("direct_expense_ratio"), m("aum_crores"), m("riskometer"), m("launch_date"), m("exit_load")]),
    manager: fracBool([m("fund_manager")]),
    portfolio: fracBool([m("holdings"), m("sector_allocation")]),
    documents: fracBool([!!meta]),
    lineage: frac([f.navDate, f.code]),
  };
  const W = { identity: 15, performance: 20, benchmark: 10, risk: 10, metadata: 15, manager: 10, portfolio: 10, documents: 5, lineage: 5 };
  const tw = Object.values(W).reduce((a, b) => a + b, 0);
  const score = Math.round(Object.entries(W).reduce((s, [k, w]) => s + (w / tw) * dims[k], 0));
  return { score, dims, weights: W };
}

// The nine questions an institution-grade fund page must answer, each with its data source.
export function researchReadiness(f, meta) {
  f = f || {};
  const m = (k) => meta && present(meta[k]);
  const q = [
    ["What is this fund?", present(f.name) && present(cat(f)), "AMFI"],
    ["Who manages it?", m("fund_manager"), "Factsheet"],
    ["What does it own?", m("holdings") || m("sector_allocation"), "Factsheet portfolio"],
    ["What benchmark does it follow?", present(f.benchmark), f.benchmarkStd ? "SEBI category standard" : "Mandate"],
    ["How expensive is it?", m("expense_ratio") || m("regular_expense_ratio") || m("direct_expense_ratio"), "Factsheet TER"],
    ["How risky is it?", present(f.vol90) || m("riskometer"), present(f.vol90) ? "NAV volatility" : "Riskometer"],
    ["How large is it?", m("aum_crores"), "Factsheet AUM"],
    ["How has it performed?", present(f.r1m) || present(f.r1y), "AMFI NAV returns"],
    ["Why should an investor consider it?", present(f.r1m) && (present(f.catPct) || present(f.vol90)), "Health / peer rank"],
  ];
  const questions = q.map(([question, answered, source]) => ({ question, answered: !!answered, source }));
  const score = Math.round((100 * questions.filter((x) => x.answered).length) / questions.length);
  return { score, questions, answered: questions.filter((x) => x.answered).length, total: questions.length };
}

function cat(f) { return f.category && f.category !== "Other" ? f.category : null; }
function frac(arr) { return Math.round((100 * arr.filter(present).length) / arr.length); }
function fracBool(arr) { return Math.round((100 * arr.filter(Boolean).length) / arr.length); }

export const completenessTone = (s) => (s >= 75 ? "pos" : s >= 50 ? "warn" : "neg");
