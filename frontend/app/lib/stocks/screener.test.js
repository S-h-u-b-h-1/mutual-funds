// Pure-function tests — no DB required (the screener engine is deliberately metric-source-
// agnostic; see screener.js's header). vitest's global setup still requires DATABASE_URL/
// TEST_DATABASE_URL to be set for the run as a whole (see vitest.config.js/testDbGuard.js), but
// nothing in this file touches the database itself.
import { describe, it, expect } from "vitest";
import { FILTER_OPERATORS, evaluateFilter, evaluateFilterGroup, runScreener, EXAMPLE_SCREENS } from "./screener.js";

describe("FILTER_OPERATORS", () => {
  it("exposes exactly the eight required operators", () => {
    expect(new Set(Object.values(FILTER_OPERATORS))).toEqual(
      new Set(["gt", "gte", "lt", "lte", "eq", "neq", "between", "in"])
    );
  });
});

describe("evaluateFilter", () => {
  it("gt/gte/lt/lte/eq/neq compare fieldValue against filterValue", () => {
    expect(evaluateFilter(25, FILTER_OPERATORS.GT, 20)).toBe(true);
    expect(evaluateFilter(20, FILTER_OPERATORS.GT, 20)).toBe(false);
    expect(evaluateFilter(20, FILTER_OPERATORS.GTE, 20)).toBe(true);
    expect(evaluateFilter(15, FILTER_OPERATORS.LT, 20)).toBe(true);
    expect(evaluateFilter(21, FILTER_OPERATORS.LT, 20)).toBe(false);
    expect(evaluateFilter(20, FILTER_OPERATORS.LTE, 20)).toBe(true);
    expect(evaluateFilter(5, FILTER_OPERATORS.EQ, 5)).toBe(true);
    expect(evaluateFilter(5, FILTER_OPERATORS.EQ, 6)).toBe(false);
    expect(evaluateFilter(5, FILTER_OPERATORS.NEQ, 6)).toBe(true);
    expect(evaluateFilter(5, FILTER_OPERATORS.NEQ, 5)).toBe(false);
  });

  it("between is inclusive of both bounds", () => {
    expect(evaluateFilter(10, FILTER_OPERATORS.BETWEEN, [10, 20])).toBe(true);
    expect(evaluateFilter(20, FILTER_OPERATORS.BETWEEN, [10, 20])).toBe(true);
    expect(evaluateFilter(15, FILTER_OPERATORS.BETWEEN, [10, 20])).toBe(true);
    expect(evaluateFilter(21, FILTER_OPERATORS.BETWEEN, [10, 20])).toBe(false);
    expect(evaluateFilter(9, FILTER_OPERATORS.BETWEEN, [10, 20])).toBe(false);
  });

  it("between throws on a malformed filterValue (not a [min, max] pair)", () => {
    expect(() => evaluateFilter(10, FILTER_OPERATORS.BETWEEN, 10)).toThrow(/min, max/);
    expect(() => evaluateFilter(10, FILTER_OPERATORS.BETWEEN, [10])).toThrow(/min, max/);
    expect(() => evaluateFilter(10, FILTER_OPERATORS.BETWEEN, [1, 2, 3])).toThrow(/min, max/);
  });

  it("in checks array membership", () => {
    expect(evaluateFilter("Banks", FILTER_OPERATORS.IN, ["Banks", "NBFC"])).toBe(true);
    expect(evaluateFilter("Cement", FILTER_OPERATORS.IN, ["Banks", "NBFC"])).toBe(false);
  });

  it("in throws on a malformed filterValue (not an array)", () => {
    expect(() => evaluateFilter("Banks", FILTER_OPERATORS.IN, "Banks")).toThrow(/array/);
  });

  it("throws on an unknown operator", () => {
    expect(() => evaluateFilter(10, "startswith", 1)).toThrow(/Unknown filter operator/);
  });

  it("a missing field (null or undefined) never passes ANY operator, including neq — never silently treated as 0 or true", () => {
    const filterValueByOperator = {
      [FILTER_OPERATORS.GT]: 0,
      [FILTER_OPERATORS.GTE]: 0,
      [FILTER_OPERATORS.LT]: 100,
      [FILTER_OPERATORS.LTE]: 100,
      [FILTER_OPERATORS.EQ]: 5,
      [FILTER_OPERATORS.NEQ]: 5,
      [FILTER_OPERATORS.BETWEEN]: [0, 100],
      [FILTER_OPERATORS.IN]: [1, 2, 3],
    };
    for (const [operator, filterValue] of Object.entries(filterValueByOperator)) {
      expect(evaluateFilter(null, operator, filterValue)).toBe(false);
      expect(evaluateFilter(undefined, operator, filterValue)).toBe(false);
    }
  });
});

describe("evaluateFilterGroup", () => {
  const fields = { roce: 25, debtToEquity: 0.3, sector: "Banks" };

  it("AND requires every filter to pass", () => {
    const group = {
      combinator: "AND",
      filters: [
        { field: "roce", operator: FILTER_OPERATORS.GT, value: 20 },
        { field: "debtToEquity", operator: FILTER_OPERATORS.LT, value: 0.5 },
      ],
    };
    expect(evaluateFilterGroup(fields, group)).toBe(true);

    const failing = { combinator: "AND", filters: [...group.filters, { field: "roce", operator: FILTER_OPERATORS.GT, value: 100 }] };
    expect(evaluateFilterGroup(fields, failing)).toBe(false);
  });

  it("OR requires at least one filter to pass", () => {
    const group = {
      combinator: "OR",
      filters: [
        { field: "roce", operator: FILTER_OPERATORS.GT, value: 100 }, // fails
        { field: "sector", operator: FILTER_OPERATORS.EQ, value: "Banks" }, // passes
      ],
    };
    expect(evaluateFilterGroup(fields, group)).toBe(true);

    const allFail = { combinator: "OR", filters: [{ field: "roce", operator: FILTER_OPERATORS.GT, value: 100 }] };
    expect(evaluateFilterGroup(fields, allFail)).toBe(false);
  });

  it("supports a nested group: (A AND B) OR C", () => {
    const matches = {
      combinator: "OR",
      filters: [
        {
          combinator: "AND",
          filters: [
            { field: "roce", operator: FILTER_OPERATORS.GT, value: 100 }, // fails
            { field: "debtToEquity", operator: FILTER_OPERATORS.LT, value: 0.5 }, // passes
          ],
        },
        { field: "sector", operator: FILTER_OPERATORS.EQ, value: "Banks" }, // passes -> outer OR true
      ],
    };
    expect(evaluateFilterGroup(fields, matches)).toBe(true);

    const noneMatch = {
      combinator: "OR",
      filters: [
        { combinator: "AND", filters: [{ field: "roce", operator: FILTER_OPERATORS.GT, value: 100 }] },
        { field: "sector", operator: FILTER_OPERATORS.EQ, value: "Cement" },
      ],
    };
    expect(evaluateFilterGroup(fields, noneMatch)).toBe(false);
  });

  it("empty filters array uses the boolean-algebra identity for its combinator (empty AND = true, empty OR = false)", () => {
    expect(evaluateFilterGroup(fields, { combinator: "AND", filters: [] })).toBe(true);
    expect(evaluateFilterGroup(fields, { combinator: "OR", filters: [] })).toBe(false);
  });

  it("rejects a malformed filterGroup", () => {
    expect(() => evaluateFilterGroup(fields, { combinator: "XOR", filters: [] })).toThrow(/combinator/);
    expect(() => evaluateFilterGroup(fields, {})).toThrow();
  });
});

describe("runScreener", () => {
  const companies = [
    { companyId: "c1", roce: 25, marketCap: 100 },
    { companyId: "c2", roce: 15, marketCap: 300 },
    { companyId: "c3", roce: 30, marketCap: null },
    { companyId: "c4", roce: null, marketCap: 50 },
  ];
  const passAll = { combinator: "AND", filters: [] };

  it("filters, reporting matchedCount/totalCount separately from the returned array", () => {
    const group = { combinator: "AND", filters: [{ field: "roce", operator: FILTER_OPERATORS.GT, value: 20 }] };
    const { results, matchedCount, totalCount } = runScreener(companies, group);
    expect(totalCount).toBe(4);
    expect(matchedCount).toBe(2); // c1 (25), c3 (30) — c4's null roce never passes
    expect(results.map((c) => c.companyId).sort()).toEqual(["c1", "c3"]);
  });

  it("sorts by the given field; null/undefined always sort last, regardless of direction", () => {
    const desc = runScreener(companies, passAll, { sortBy: "marketCap", sortDirection: "desc" });
    expect(desc.results.map((c) => c.companyId)).toEqual(["c2", "c1", "c4", "c3"]); // 300, 100, 50, null last

    const asc = runScreener(companies, passAll, { sortBy: "marketCap", sortDirection: "asc" });
    expect(asc.results.map((c) => c.companyId)).toEqual(["c4", "c1", "c2", "c3"]); // 50, 100, 300, null STILL last
  });

  it("limits the returned array without changing matchedCount/totalCount", () => {
    const { results, matchedCount, totalCount } = runScreener(companies, passAll, { sortBy: "roce", sortDirection: "desc", limit: 2 });
    expect(results).toHaveLength(2);
    expect(matchedCount).toBe(4); // all 4 pass the empty filter group
    expect(totalCount).toBe(4);
    expect(results.map((c) => c.companyId)).toEqual(["c3", "c1"]); // roce 30, 25 — highest first
  });

  it("no sortBy leaves matches in their original relative order", () => {
    const { results } = runScreener(companies, passAll);
    expect(results.map((c) => c.companyId)).toEqual(["c1", "c2", "c3", "c4"]);
  });
});

describe("EXAMPLE_SCREENS", () => {
  const companies = [
    { companyId: "quality-co", roce: 28, debtToEquity: 0.2, salesGrowth5y: 22, marketCap: 40000, promoterHoldingPercent: 58, operatingCashFlow: 900 },
    { companyId: "weak-co", roce: 8, debtToEquity: 1.4, salesGrowth5y: 2, marketCap: 800, promoterHoldingPercent: 30, operatingCashFlow: -100 },
    { companyId: "no-data-co", roce: null, debtToEquity: null, salesGrowth5y: null, marketCap: null, promoterHoldingPercent: null, operatingCashFlow: null },
  ];

  it("exports at least the mission's six reference screens, each a working filter group", () => {
    for (const key of ["highRoce", "lowDebtToEquity", "strongSalesGrowth", "largeCap", "highPromoterHolding", "positiveOperatingCashFlow"]) {
      expect(EXAMPLE_SCREENS[key]).toBeDefined();
      expect(EXAMPLE_SCREENS[key].filterGroup).toBeDefined();
    }
  });

  it("highRoce (ROCE > 20%) matches only the quality company — not the weak or no-data company", () => {
    const { results } = runScreener(companies, EXAMPLE_SCREENS.highRoce.filterGroup);
    expect(results.map((c) => c.companyId)).toEqual(["quality-co"]);
  });

  it("qualityAndSafe (nested AND/OR) matches only the quality company", () => {
    const { results } = runScreener(companies, EXAMPLE_SCREENS.qualityAndSafe.filterGroup);
    expect(results.map((c) => c.companyId)).toEqual(["quality-co"]);
  });
});
