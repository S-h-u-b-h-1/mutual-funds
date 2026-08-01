// Stock screener — Section 9 of the Stock Intelligence build: "the deterministic filter engine
// remains source of truth" for this pass (no NL-query translation here). Schema this eventually
// reads from is sql/neon/035_stock_intelligence_foundation.sql.
//
// Deliberately metric-source-agnostic: this module never queries the database and never imports
// financialStatements.js/metrics.js/valuation.js (those are being built concurrently, in a
// different worktree, and may not exist yet). It takes `companies` as a plain array of
// `{ companyId, ...fields }` objects — already annotated with whatever numeric fields the filters
// need — and evaluates filters purely against those fields. Wiring "fetch a company's ROCE from
// the metrics module and attach it as a field" is a separate, later integration step.
export const FILTER_OPERATORS = Object.freeze({
  GT: "gt",
  GTE: "gte",
  LT: "lt",
  LTE: "lte",
  EQ: "eq",
  NEQ: "neq",
  BETWEEN: "between", // filterValue: [min, max], inclusive of both bounds
  IN: "in", // filterValue: array — sector/industry membership, market-cap band labels, ...
});

const KNOWN_OPERATORS = new Set(Object.values(FILTER_OPERATORS));

// A company's field can be null/undefined for entirely ordinary reasons (metric not yet ingested
// for this company, sector without this operational metric, no valuation snapshot on file yet,
// ...). EVERY operator treats that as "cannot confirm this company meets the screen" and returns
// false — never true, never coerced to 0. This deliberately includes `neq`: "missing != X" reads
// as technically true, but returning true there would let a company silently satisfy an
// EXCLUSION-style filter (e.g. "sector != Banks") purely because we don't know its sector, not
// because we confirmed it isn't Banks — exactly the "missing data silently treated as passing"
// failure mode this function must never produce. A caller that genuinely wants "field is missing"
// semantics should express that as its own explicit concern rather than overload neq.
//
// Operator-name validation happens unconditionally, before the null short-circuit — a bad
// operator string is always a caller bug regardless of whether this particular company has data.
// A malformed `between`/`in` filterValue, by contrast, is only validated once we get past the
// null short-circuit, since there's nothing to validate against for a company with no data for
// this field either way (it'll surface the first time the same filter runs against a company that
// does have the field populated).
export function evaluateFilter(fieldValue, operator, filterValue) {
  if (!KNOWN_OPERATORS.has(operator)) {
    throw new Error(`Unknown filter operator: ${operator}`);
  }
  if (fieldValue == null) return false;

  switch (operator) {
    case FILTER_OPERATORS.GT:
      return fieldValue > filterValue;
    case FILTER_OPERATORS.GTE:
      return fieldValue >= filterValue;
    case FILTER_OPERATORS.LT:
      return fieldValue < filterValue;
    case FILTER_OPERATORS.LTE:
      return fieldValue <= filterValue;
    case FILTER_OPERATORS.EQ:
      return fieldValue === filterValue;
    case FILTER_OPERATORS.NEQ:
      return fieldValue !== filterValue;
    case FILTER_OPERATORS.BETWEEN: {
      if (!Array.isArray(filterValue) || filterValue.length !== 2) {
        throw new Error(`'between' requires filterValue to be [min, max], got: ${JSON.stringify(filterValue)}`);
      }
      const [min, max] = filterValue;
      return fieldValue >= min && fieldValue <= max;
    }
    case FILTER_OPERATORS.IN: {
      if (!Array.isArray(filterValue)) {
        throw new Error(`'in' requires filterValue to be an array, got: ${JSON.stringify(filterValue)}`);
      }
      return filterValue.includes(fieldValue);
    }
    default:
      // Unreachable — KNOWN_OPERATORS already guarded against this — but a silent fallthrough
      // returning undefined would be worse than a loud error if a future operator is ever added
      // to FILTER_OPERATORS without a matching case here.
      throw new Error(`Operator ${operator} is declared in FILTER_OPERATORS but has no evaluateFilter case.`);
  }
}

function isNestedGroup(node) {
  return Boolean(node) && typeof node === "object" && Array.isArray(node.filters);
}

// filterGroup: { combinator: 'AND'|'OR', filters: [ {field, operator, value} | nestedFilterGroup ] }
// A leaf filter is distinguished from a nested group by shape (a group has a `.filters` array; a
// leaf has `.field`/`.operator`), not by an explicit `type` tag — keeps EXAMPLE_SCREENS and any
// future API payload free of boilerplate. Nesting is unbounded, so callers can express arbitrary
// combinations like (A AND B) OR C by putting a group node inside another group's `filters` array.
// An empty `filters` array uses the standard boolean-algebra identity for its combinator (empty
// AND = true, empty OR = false) rather than a special case — mathematically the same as "no
// constraint" for AND and "impossible to satisfy with zero options" for OR.
export function evaluateFilterGroup(companyFields, filterGroup) {
  if (!filterGroup || !Array.isArray(filterGroup.filters)) {
    throw new Error("filterGroup must be shaped { combinator: 'AND'|'OR', filters: [...] }");
  }
  const { combinator, filters } = filterGroup;
  if (combinator !== "AND" && combinator !== "OR") {
    throw new Error(`Unknown combinator: ${combinator} (expected 'AND' or 'OR')`);
  }

  const results = filters.map((node) =>
    isNestedGroup(node)
      ? evaluateFilterGroup(companyFields, node)
      : evaluateFilter(companyFields[node.field], node.operator, node.value)
  );
  return combinator === "AND" ? results.every(Boolean) : results.some(Boolean);
}

// companies: [{ companyId, ...fields }]. Filters, then sorts, then limits — in that order, so
// `limit` always keeps the best (or worst) matches by `sortBy`, never an arbitrary prefix of the
// unsorted matches.
export function runScreener(companies, filterGroup, { sortBy, sortDirection = "desc", limit } = {}) {
  const totalCount = companies.length;
  let results = companies.filter((company) => evaluateFilterGroup(company, filterGroup));
  const matchedCount = results.length;

  if (sortBy) {
    const dir = sortDirection === "asc" ? 1 : -1;
    results = [...results].sort((a, b) => {
      const av = a[sortBy];
      const bv = b[sortBy];
      // Null/undefined always sort last, in BOTH directions — never let a missing metric look
      // like a leader (desc) or a laggard worth flagging (asc). "Last regardless of direction" is
      // the only placement that isn't itself an implicit claim about the company's standing.
      const aMissing = av == null;
      const bMissing = bv == null;
      if (aMissing && bMissing) return 0;
      if (aMissing) return 1;
      if (bMissing) return -1;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }

  const safeLimit = Number.isFinite(limit) ? Math.max(0, limit) : undefined;
  if (safeLimit !== undefined) results = results.slice(0, safeLimit);

  return { results, matchedCount, totalCount };
}

// Reference/documentation screens matching the mission's own examples, so a future API layer has
// real, working filter groups to point to instead of just prose. Field names here (roce,
// debtToEquity, salesGrowth5y, marketCap, promoterHoldingPercent, operatingCashFlow) are
// illustrative — the future metrics-integration layer decides the exact field names it annotates
// companies with before calling runScreener; this module has no opinion on where the numbers come
// from, only on how they're compared.
export const EXAMPLE_SCREENS = Object.freeze({
  highRoce: {
    label: "High ROCE (> 20%)",
    description: "Return on capital employed above 20%.",
    filterGroup: { combinator: "AND", filters: [{ field: "roce", operator: FILTER_OPERATORS.GT, value: 20 }] },
  },
  lowDebtToEquity: {
    label: "Low debt (Debt/Equity < 0.5)",
    description: "Conservatively leveraged balance sheet.",
    filterGroup: { combinator: "AND", filters: [{ field: "debtToEquity", operator: FILTER_OPERATORS.LT, value: 0.5 }] },
  },
  strongSalesGrowth: {
    label: "Strong 5-year sales growth (> 15%)",
    description: "5-year CAGR of sales/revenue above 15%.",
    filterGroup: { combinator: "AND", filters: [{ field: "salesGrowth5y", operator: FILTER_OPERATORS.GT, value: 15 }] },
  },
  largeCap: {
    label: "Large cap (market cap > Rs 20,000 Cr)",
    description: "Market capitalization above Rs 20,000 crore.",
    filterGroup: { combinator: "AND", filters: [{ field: "marketCap", operator: FILTER_OPERATORS.GT, value: 20000 }] },
  },
  highPromoterHolding: {
    label: "High promoter holding (> 50%)",
    description: "Promoter holding above 50% of equity.",
    filterGroup: { combinator: "AND", filters: [{ field: "promoterHoldingPercent", operator: FILTER_OPERATORS.GT, value: 50 }] },
  },
  positiveOperatingCashFlow: {
    label: "Positive operating cash flow",
    description: "Operating cash flow greater than zero.",
    filterGroup: { combinator: "AND", filters: [{ field: "operatingCashFlow", operator: FILTER_OPERATORS.GT, value: 0 }] },
  },
  // Bonus: demonstrates nested-group composition — quality AND (conservatively levered OR
  // already self-funding) — the kind of compound question a real screener user would ask, and
  // proof evaluateFilterGroup's nesting actually works end to end through runScreener.
  qualityAndSafe: {
    label: "Quality & safe (ROCE > 20% AND (Debt/Equity < 0.5 OR operating cash flow positive))",
    description: "High-quality businesses that are either conservatively levered or already self-funding.",
    filterGroup: {
      combinator: "AND",
      filters: [
        { field: "roce", operator: FILTER_OPERATORS.GT, value: 20 },
        {
          combinator: "OR",
          filters: [
            { field: "debtToEquity", operator: FILTER_OPERATORS.LT, value: 0.5 },
            { field: "operatingCashFlow", operator: FILTER_OPERATORS.GT, value: 0 },
          ],
        },
      ],
    },
  },
});
