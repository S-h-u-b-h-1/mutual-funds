// Derived Fundamentals / Metrics (Stock Intelligence) — THE single place fundamentals are
// computed. Section 5's "frontend should not independently calculate fundamentals" means every
// ratio a screen displays is computed here, once, from the raw fields financialStatements.js
// centralizes in LINE_ITEM_KEYS — never re-derived ad hoc in a route handler or a component.
//
// Every compute() function takes the SAME combined shape: { pnl, balanceSheet, cashFlow,
// previousPeriod, sharesOutstanding }, where pnl/balanceSheet/cashFlow are the flat
// { [line_item_key]: value|null } maps financialStatements.js's getStatement()/
// getStatementsForCompany() return as `.fields`. previousPeriod carries the SAME { pnl,
// balanceSheet, cashFlow } shape for one prior period (only previousPeriod.pnl is read today, by
// revenueGrowth) — kept symmetric with the top-level shape, rather than a bare number, so a caller
// who already has both periods' getStatement() results can pass them straight through with no
// reshaping, and so a future period-over-period metric (e.g. net profit growth) has somewhere to
// read from without a signature change. sharesOutstanding is passed separately because it is not a
// financial-statement line item — it lives on company_valuation_snapshots (see valuation.js).
//
// Every compute() function returns null (never 0, never a fabricated number) when it cannot be
// computed from what's on file — division by zero, a missing operand, or a non-finite result all
// resolve to null, and no combination of inputs (including entirely absent/null sections) throws.
// Matches this codebase's "unknown is better than wrong" convention (see casNormalizer.js's
// computeXirr/computePortfolioXirr for the MF-domain precedent of the same shape).
import { LINE_ITEM_KEYS } from "./financialStatements.js";

// Self-check, runs once at module load: every field name a compute() function below reads must
// exist in LINE_ITEM_KEYS (financialStatements.js) — the single source of truth for the raw
// vocabulary. A typo'd or drifted field name becomes a load-time crash (loud, immediate, caught the
// first time this module is imported anywhere, including by its own test file) instead of a
// silently-always-null metric nobody notices. Keep FIELD_USAGE in sync when adding a metric.
const FIELD_USAGE = {
  revenueGrowth: { pnl: ["revenue"] },
  ebitdaMargin: { pnl: ["ebitda", "revenue"] },
  operatingMargin: { pnl: ["ebitda", "depreciation_amortization", "revenue"] },
  netProfitMargin: { pnl: ["net_profit", "revenue"] },
  epsBasic: { pnl: ["eps_basic"] },
  epsDiluted: { pnl: ["eps_diluted"] },
  roe: { pnl: ["net_profit"], balance_sheet: ["total_equity"] },
  roce: { pnl: ["profit_before_tax", "finance_costs"], balance_sheet: ["total_assets", "current_liabilities"] },
  debtToEquity: { balance_sheet: ["total_debt", "total_equity"] },
  interestCoverage: { pnl: ["ebitda", "finance_costs"] },
  freeCashFlow: { cash_flow: ["cfo", "capex"] },
  cfoToPat: { cash_flow: ["cfo"], pnl: ["net_profit"] },
  workingCapital: { balance_sheet: ["current_assets", "current_liabilities"] },
  currentRatio: { balance_sheet: ["current_assets", "current_liabilities"] },
  bookValuePerShare: { balance_sheet: ["total_equity"] }, // sharesOutstanding is a param, not a line item
  assetTurnover: { pnl: ["revenue"], balance_sheet: ["total_assets"] },
};
for (const [metricKey, byStatement] of Object.entries(FIELD_USAGE)) {
  for (const [statementType, keys] of Object.entries(byStatement)) {
    for (const key of keys) {
      if (!LINE_ITEM_KEYS[statementType]?.includes(key)) {
        throw new Error(
          `metrics.js self-check failed: "${metricKey}" references "${statementType}.${key}", which is not in ` +
            `LINE_ITEM_KEYS (financialStatements.js). Add it there first — this module must never define its own line-item vocabulary.`
        );
      }
    }
  }
}

function n(value) {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}
function safeDiv(numerator, denominator) {
  const a = n(numerator);
  const b = n(denominator);
  if (a === null || b === null || b === 0) return null;
  return a / b;
}
function safeAdd(a, b) {
  const x = n(a);
  const y = n(b);
  return x === null || y === null ? null : x + y;
}
function safeSubtract(a, b) {
  const x = n(a);
  const y = n(b);
  return x === null || y === null ? null : x - y;
}
function pct(ratio) {
  return ratio === null ? null : ratio * 100;
}

export const METRIC_DEFINITIONS = {
  revenueGrowth: {
    label: "Revenue Growth (vs. previousPeriod)",
    unit: "PERCENT",
    compute(input) {
      const pnl = input?.pnl || {};
      const priorPnl = input?.previousPeriod?.pnl || {};
      const current = n(pnl.revenue);
      const prior = n(priorPnl.revenue);
      if (current === null || prior === null || prior === 0) return null;
      return ((current - prior) / prior) * 100;
    },
  },

  ebitdaMargin: {
    label: "EBITDA Margin",
    unit: "PERCENT",
    compute(input) {
      const pnl = input?.pnl || {};
      return pct(safeDiv(pnl.ebitda, pnl.revenue));
    },
  },

  // EBIT approximated as EBITDA - depreciation & amortization — LINE_ITEM_KEYS.pnl has no separate
  // "operating profit" line, and this is the standard way to derive it from what's there.
  operatingMargin: {
    label: "Operating Margin (EBIT / Revenue)",
    unit: "PERCENT",
    compute(input) {
      const pnl = input?.pnl || {};
      const ebit = safeSubtract(pnl.ebitda, pnl.depreciation_amortization);
      return pct(safeDiv(ebit, pnl.revenue));
    },
  },

  netProfitMargin: {
    label: "Net Profit Margin",
    unit: "PERCENT",
    compute(input) {
      const pnl = input?.pnl || {};
      return pct(safeDiv(pnl.net_profit, pnl.revenue));
    },
  },

  // Already a line item (pnl.eps_basic/eps_diluted) — exposed here too so every derived figure has
  // one access point (METRIC_DEFINITIONS), not "some read via metrics.js, some read off the
  // statement directly".
  epsBasic: {
    label: "EPS (Basic)",
    unit: "INR_PER_SHARE",
    compute(input) {
      const pnl = input?.pnl || {};
      return n(pnl.eps_basic);
    },
  },
  epsDiluted: {
    label: "EPS (Diluted)",
    unit: "INR_PER_SHARE",
    compute(input) {
      const pnl = input?.pnl || {};
      return n(pnl.eps_diluted);
    },
  },

  roe: {
    label: "Return on Equity",
    unit: "PERCENT",
    compute(input) {
      const pnl = input?.pnl || {};
      const balanceSheet = input?.balanceSheet || {};
      return pct(safeDiv(pnl.net_profit, balanceSheet.total_equity));
    },
  },

  // JUDGMENT CALL (flagged for review): ROCE = (Profit Before Tax + Finance Costs) / (Total Assets
  // - Current Liabilities). Numerator approximates EBIT (operating profit before interest and tax)
  // as PBT + finance costs — holds when finance costs are the only add-back between EBIT and PBT,
  // true for a standard P&L but not guaranteed for every filer. Denominator (capital employed) is
  // Total Assets - Current Liabilities, i.e. equity + non-current liabilities. This is one of
  // several conventional ROCE formulas (an EBITDA-based numerator is also common); documented
  // explicitly since ROCE has no single universal definition.
  roce: {
    label: "Return on Capital Employed",
    unit: "PERCENT",
    compute(input) {
      const pnl = input?.pnl || {};
      const balanceSheet = input?.balanceSheet || {};
      const ebit = safeAdd(pnl.profit_before_tax, pnl.finance_costs);
      const capitalEmployed = safeSubtract(balanceSheet.total_assets, balanceSheet.current_liabilities);
      return pct(safeDiv(ebit, capitalEmployed));
    },
  },

  debtToEquity: {
    label: "Debt / Equity",
    unit: "RATIO",
    compute(input) {
      const balanceSheet = input?.balanceSheet || {};
      return safeDiv(balanceSheet.total_debt, balanceSheet.total_equity);
    },
  },

  interestCoverage: {
    label: "Interest Coverage (EBITDA / Finance Costs)",
    unit: "RATIO",
    compute(input) {
      const pnl = input?.pnl || {};
      return safeDiv(pnl.ebitda, pnl.finance_costs);
    },
  },

  // Inherits whatever unit the underlying cfo/capex line items were recorded in (schema default is
  // INR_CRORE; the flat `.fields` map does not carry per-field unit metadata through). Only
  // meaningful as a single-statement-consistent figure, which holds in practice since one statement
  // is one filing reported in one unit.
  freeCashFlow: {
    label: "Free Cash Flow (CFO - Capex)",
    unit: "INR_CRORE",
    compute(input) {
      const cashFlow = input?.cashFlow || {};
      return safeSubtract(cashFlow.cfo, cashFlow.capex);
    },
  },

  cfoToPat: {
    label: "CFO / PAT (Cash Conversion)",
    unit: "RATIO",
    compute(input) {
      const cashFlow = input?.cashFlow || {};
      const pnl = input?.pnl || {};
      return safeDiv(cashFlow.cfo, pnl.net_profit);
    },
  },

  workingCapital: {
    label: "Working Capital (Current Assets - Current Liabilities)",
    unit: "INR_CRORE", // same source-unit caveat as freeCashFlow
    compute(input) {
      const balanceSheet = input?.balanceSheet || {};
      return safeSubtract(balanceSheet.current_assets, balanceSheet.current_liabilities);
    },
  },

  currentRatio: {
    label: "Current Ratio",
    unit: "RATIO",
    compute(input) {
      const balanceSheet = input?.balanceSheet || {};
      return safeDiv(balanceSheet.current_assets, balanceSheet.current_liabilities);
    },
  },

  // Raw total_equity / sharesOutstanding. total_equity's unit depends on the source statement
  // (schema default INR_CRORE); sharesOutstanding is an absolute share count, typically sourced
  // from company_valuation_snapshots.shares_outstanding. No crore/lakh -> rupee conversion is
  // performed — the flat `.fields` map loses per-field unit metadata, so this function has no
  // reliable way to know the source unit; a caller displaying this value is responsible for scaling
  // it against the source statement's actual `unit` column if that unit isn't already absolute INR.
  bookValuePerShare: {
    label: "Book Value per Share",
    unit: "PER_SHARE",
    compute(input) {
      const balanceSheet = input?.balanceSheet || {};
      return safeDiv(balanceSheet.total_equity, input?.sharesOutstanding);
    },
  },

  assetTurnover: {
    label: "Asset Turnover (Revenue / Total Assets)",
    unit: "RATIO",
    compute(input) {
      const pnl = input?.pnl || {};
      const balanceSheet = input?.balanceSheet || {};
      return safeDiv(pnl.revenue, balanceSheet.total_assets);
    },
  },
};

// Runs every metric in METRIC_DEFINITIONS against the same input, returning
// { [metricKey]: { value, label, unit } } — value null wherever it isn't computable. Tolerates
// input being entirely absent (undefined/null) or any of its sections being explicitly null; the
// try/catch is defense-in-depth on top of every compute() already being written to never throw.
export function computeMetrics(input) {
  const safeInput = input && typeof input === "object" ? input : {};
  const result = {};
  for (const [key, def] of Object.entries(METRIC_DEFINITIONS)) {
    let value;
    try {
      value = def.compute(safeInput);
    } catch {
      value = null;
    }
    result[key] = { value: value === undefined || (typeof value === "number" && Number.isNaN(value)) ? null : value, label: def.label, unit: def.unit };
  }
  return result;
}
