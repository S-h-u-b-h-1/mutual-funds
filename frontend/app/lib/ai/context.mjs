import { boundEvidence, freshness } from "./safety.mjs";

export const METHOD = `MF Pulse calculates historical NAV returns from AMFI. 1D, 1W, 1M, 3M, 6M and 1Y returns are cumulative; 3Y and 5Y are annualised CAGR. Missing metrics are unavailable, not zero. Peer cohorts separate category and Direct/Regular plans. Category summaries can include both plan variants, so they are not counts of unique investment ideas. IDCW NAV returns exclude distributions and are unsuitable for simple performance comparison. Compare like-for-like category, plan, option, return window, NAV date, volatility and drawdown. These historical measures do not establish future performance or personal suitability. A category-standard benchmark name does not supply benchmark index returns. Risk regime is a deterministic breadth label: Risk-On at >=55%, Risk-Off below 45%, Neutral otherwise. It is not a forecast. Movement explanations compare 1M rank with 3M rank, not yesterday's rank. AMC equity indices normalise each scheme to 100 at the start then average; index changes are points, not an investable portfolio return. Flow z-score = (latest minus trailing mean) / standard deviation; absolute z >=1.8 is flagged, requiring at least 4 months. All flow evidence is SAMPLE, not authoritative live SEBI data.`;
const pick = (row, fields) =>
  Object.fromEntries(
    fields.filter((k) => row?.[k] != null).map((k) => [k, row[k]]),
  );
const normal = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Dependencies supplied by the Next server adapter; pure context selection stays testable offline.
export async function buildContext(request, deps, now = Date.now()) {
  const {
    daily,
    performance,
    trend,
    getFund,
    allFunds,
    cohortOf,
    visibleReturns,
    benchmarkRows,
    riskInterpretation,
    marketIntel,
    sb,
  } = deps;
  const evidence = [],
    limitations = [];
  const add = (
    type,
    value,
    asOf,
    href,
    sample = false,
    source = "MF Pulse calculation · AMFI NAV",
  ) =>
    evidence.push({
      type,
      source,
      asOf: asOf || null,
      freshness: asOf ? freshness(asOf, now) : "not_applicable",
      isSample: sample,
      href,
      text:
        (sample
          ? "SAMPLE — illustrative, not live/authoritative SEBI data. "
          : "") + (typeof value === "string" ? value : JSON.stringify(value)),
    });
  add(
    "methodology",
    METHOD,
    null,
    "/methodology",
    false,
    "MF Pulse methodology",
  );
  const followup =
    /^(why|how so|explain (more|that|it)|what (about|does that)|and |tell me more|simplify|make (that|it))/i.test(
      request.message.trim(),
    );
  const previous = followup
    ? [...request.history].reverse().find((h) => h.role === "user")?.content ||
      ""
    : "";
  const retrievalQuestion = `${previous} ${request.message}`;
  const q = normal(retrievalQuestion);
  const pc = request.pageContext;
  const wantsPersonal =
    ["profile", "portfolio"].includes(pc.type) ||
    /\b(my|profile|portfolio|recommend|advisor|advice|shortlist|goal|allocation|holding|update)\b/.test(q);
  let personal = null;
  if (wantsPersonal && deps.personalContext) {
    try {
      personal = await deps.personalContext();
    } catch {
      limitations.push("Saved profile and portfolio context could not be loaded for this answer.");
    }
  }
  if (personal?.authenticated === false) {
    limitations.push("Sign in to let Pulse AI use your saved research profile and portfolio summary.");
  } else if (personal) {
    if (personal.profile)
      add("investor_profile", personal.profile, personal.profileAsOf, "/profile", false, "Saved MF Pulse research profile");
    else limitations.push("No saved research profile is available. Complete the risk profile before asking for profile-based guidance.");
    if (personal.portfolio)
      add("portfolio_summary", personal.portfolio, personal.portfolioAsOf, "/invest/portfolio", false, "MF Pulse portfolio analytics");
    else limitations.push("No usable portfolio is available. Connect or import holdings for portfolio-specific guidance.");
    if (personal.shortlist?.length)
      add("profile_shortlist", personal.shortlist, personal.shortlistAsOf, "/advisor", false, "Deterministic MF Pulse advisory ranking");
  }
  let codes = [...pc.codes],
    amcs = [...pc.amcs];
  // Explicit codes from current message override prior page context; never accept client metrics.
  const mentioned =
    request.message.match(/\b\d{6}\b/g) ||
    (followup ? previous.match(/\b\d{6}\b/g) : null);
  if (mentioned?.length) {
    codes = [...new Set(mentioned)].slice(0, 2);
    amcs = [];
  }
  let ambiguous = false;
  if (!codes.length && !amcs.length) {
    // Exact full scheme names only: partial names can select the wrong plan/option.
    const exact = allFunds().filter((f) => q.includes(normal(f.name)));
    if (exact.length && exact.length <= 2) codes = exact.map((f) => f.code);
    else if (exact.length > 2) ambiguous = true;
    const namedAmcs = Object.keys(trend.amcs).filter((a) => {
      const name = normal(a.replace(" Mutual Fund", ""));
      return name.length >= 3 && ` ${q} `.includes(` ${name} `);
    });
    if (
      !codes.length &&
      !ambiguous &&
      namedAmcs.length <= 4 &&
      /\bamc\b/.test(q)
    )
      amcs = namedAmcs;
    if (
      !codes.length &&
      /\bfund\b/.test(q) &&
      namedAmcs.length &&
      !/\b(compare|how|metrics|category|categories)\b/.test(q)
    )
      ambiguous = true;
  }
  let intent = "unsupported";
  if (ambiguous) {
    intent = "fund";
    limitations.push(
      "The fund name is ambiguous. Open its fund page and use Ask Pulse AI, or specify the exact six-digit scheme code and plan.",
    );
  } else if (codes.length) {
    intent = codes.length > 1 ? "comparison" : "fund";
    for (const code of codes) {
      const f = getFund(code);
      if (!f) {
        limitations.push(
          `Scheme ${code} is absent from the MF Pulse analytics snapshot.`,
        );
        continue;
      }
      const cohort = cohortOf(f);
      add(
        "scheme_nav",
        pick(f, [
          "code",
          "name",
          "amc",
          "category",
          "assetClass",
          "plan",
          "option",
          "nav",
          "navDate",
          "isIdcw",
        ]),
        f.navDate,
        `/fund/${code}`,
        false,
        "AMFI NAV · bundled snapshot",
      );
      add(
        "scheme_performance",
        {
          code,
          name: f.name,
          returns: visibleReturns(f).map(([window, value, unit]) => ({
            window,
            value: Number(value.toFixed(2)),
            unit: unit || "% cumulative",
          })),
          ...pick(f, [
            "r1d",
            "catRank",
            "catSize",
            "catPct",
            "trend",
            "vol90",
            "maxdd90",
            "ddFromHigh",
          ]),
          peerComparison: benchmarkRows(f, cohort).map((r) => ({
            ...r,
            fund: Number(r.fund.toFixed(2)),
            peer: Number(r.peer.toFixed(2)),
            delta: Number(r.delta.toFixed(2)),
          })),
          riskExplanation: riskInterpretation(f),
          limitation:
            "Omitted return windows and risk values are unavailable. Ranking is within category and plan. No benchmark index series or personalised suitability supplied.",
        },
        f.navDate,
        `/fund/${code}`,
      );
      const movement = daily.explained?.find((r) => r.entity_id === code);
      if (movement) add("rank_movement", movement, daily.asOf, `/fund/${code}`);
      else if (/rank|move|climb/.test(q))
        limitations.push(
          `No stored rank-movement explanation is available for scheme ${code}; current rank is not proof of a day-over-day change.`,
        );
    }
  } else if (amcs.length) {
    intent = amcs.length > 1 ? "comparison" : "amc";
    for (const name of amcs) {
      const pts = trend.amcs[name];
      if (!pts?.length) {
        limitations.push(
          "A selected AMC was not found in the stored comparison dataset. Return to Compare to select it.",
        );
        continue;
      }
      const calculated = marketIntel({ [name]: pts }).gainers[0];
      add(
        "amc_comparison",
        {
          amc: name,
          windowStart: pts[0][0],
          indexChangePoints: Number(calculated.change.toFixed(2)),
          note: "Same 30-day index calculation as Compare; not a fund return.",
        },
        pts.at(-1)[0],
        `/amc/${encodeURIComponent(name)}`,
      );
      const perf = performance.amcs.find(
        (r) => r.amc === name.replace(" Mutual Fund", ""),
      );
      if (perf) add("amc_performance", perf, performance.asOf, "/performance");
    }
    // Same view as Compare, filtered by exact selected identifiers after a bounded read.
    try {
      const rows = await sb(
        "mv_amc_summary?select=amc_name,asset_class,schemes,latest_nav_date&limit=500",
        { revalidate: 60, signal: AbortSignal.timeout(4000) },
      );
      for (const name of amcs) {
        const selected = rows.filter((r) => r.amc_name === name);
        if (selected.length)
          add(
            "amc_scheme_mix",
            selected,
            selected
              .map((r) => r.latest_nav_date)
              .filter(Boolean)
              .sort()
              .at(-1),
            "/compare",
            false,
            "AMFI · Supabase summary",
          );
      }
    } catch {
      limitations.push(
        "Supabase scheme mix is unavailable; only dated bundled AMC analytics can be explained.",
      );
    }
  } else if (wantsPersonal) {
    intent = pc.type === "portfolio" || /\bportfolio|allocation|holding\b/.test(q) ? "portfolio" : "profile";
  } else if (
    pc.type === "signal" ||
    /\b(flow|flows|signal|signals|z score)\b/.test(q)
  ) {
    intent = "signal";
    try {
      const rows = await sb(
        "v_signals?select=amc_name,asset_class,month,net_flow_cr,z_score,signal&limit=50",
        { revalidate: 60, signal: AbortSignal.timeout(4000) },
      );
      const selected = rows
        .filter((r) => Number.isFinite(Number(r.z_score)))
        .sort(
          (a, b) => Math.abs(Number(b.z_score)) - Math.abs(Number(a.z_score)),
        )
        .slice(0, 3);
      for (const r of selected)
        add(
          "flow_signal",
          pick(r, [
            "amc_name",
            "asset_class",
            "month",
            "net_flow_cr",
            "z_score",
            "signal",
          ]),
          r.month,
          "/signals",
          true,
          "SEBI-style flow dataset · SAMPLE",
        );
      if (!selected.length)
        limitations.push("No flow signals are available from MF Pulse.");
    } catch {
      limitations.push(
        "Supabase flow signals are unavailable; MF Pulse cannot provide their current values.",
      );
    }
  } else if (/\b(categor|small cap|flexi cap)/.test(q)) {
    intent = "category";
    const named = performance.categories.filter((r) =>
      q.includes(normal(r.category)),
    );
    for (const row of named.length ? named : performance.categories.slice(0, 6))
      add(
        "category_momentum",
        pick(row, ["category", "count", "avg", "median", "breadth"]),
        performance.asOf,
        `/categories/${encodeURIComponent(row.category)}`,
      );
    limitations.push(
      "Category average, median and breadth describe 1-month NAV performance in the tracked equity Growth cohort; not recommendations or a forecast.",
    );
  } else if (
    /\b(how|compare|comparison|metrics|methodology|risk|risks)\b/.test(q) &&
    !/regime|market|today|breadth/.test(q)
  ) {
    intent = "methodology";
    limitations.push(
      "For specific fund comparisons provide two six-digit scheme codes. AMC selection is available on Compare. No personal suitability assessment or full category risk taxonomy is supplied.",
    );
  } else if (
    /\b(today|market|breadth|regime|dashboard|attention|beginner|investing|explain this data|mutual funds)\b/.test(
      q,
    )
  ) {
    intent = "market";
    add(
      "market_breadth",
      {
        advancers: daily.advancers,
        decliners: daily.decliners,
        breadthPercent: daily.breadth1d,
        note: "Equity Growth scheme variants; unchanged schemes may exist, so advancers plus decliners is not necessarily the total. Snapshot, not real-time.",
      },
      daily.asOf,
      "/",
    );
    if (daily.industry) add("risk_regime", daily.industry, daily.asOf, "/");
    for (const item of (daily.explained || []).slice(0, 3))
      add("attention", item, daily.asOf, `/fund/${item.entity_id}`);
    add(
      "daily_movers",
      {
        gainers: daily.gainers.slice(0, 2),
        fallers: daily.fallers.slice(0, 2),
      },
      daily.asOf,
      "/",
    );
    try {
      const rows = await sb(
        "mv_asset_class_summary?select=asset_class,latest_nav_date&limit=10",
        { revalidate: 60, signal: AbortSignal.timeout(4000) },
      );
      const date = rows
        .map((r) => r.latest_nav_date)
        .filter(Boolean)
        .sort()
        .at(-1);
      if (date)
        add(
          "database_freshness",
          `Latest NAV date reported by Supabase: ${date}. This does not refresh the older bundled performance calculations.`,
          date,
          "/data-status",
          false,
          "AMFI · Supabase summary",
        );
    } catch {
      limitations.push(
        "Live database freshness could not be checked. Bundled analytics keep their own as-of date.",
      );
    }
  } else {
    limitations.push(
      "MF Pulse does not currently have enough data for this question. Ask about your saved profile or portfolio, market breadth, categories, AMCs, flow signals, methodology, or specify a six-digit fund code. External news, causes and forecasts are not available.",
    );
  }
  if (
    evidence.some((e) => e.freshness === "stale" || e.freshness === "delayed")
  )
    limitations.push(
      "Some supplied snapshots are stale or delayed; they cannot establish what happened today. Use each evidence date, not the request date.",
    );
  if (limitations.length)
    add(
      "limitations",
      limitations.join(" "),
      null,
      "/data-status",
      false,
      "MF Pulse data availability",
    );
  const bounded = boundEvidence(evidence);
  return {
    intent,
    evidence: bounded,
    limitations,
    asOf: [...new Set(bounded.map((e) => e.asOf).filter(Boolean))].sort(),
    isSampleDataIncluded: bounded.some((e) => e.isSample),
  };
}
