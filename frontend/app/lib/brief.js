// Auto-composes a market brief from the actual flow + signal numbers (deterministic,
// rule-based — not a hallucinated LLM summary). Honest "generated from the data".
const inr = (n) => `₹${new Intl.NumberFormat("en-IN").format(Math.round(Math.abs(n)))} Cr`;
const strip = (s) => (s || "").replace(" Mutual Fund", "");

export function buildBrief({ headline = {}, amcFlows = [], signals = [] }) {
  const month = headline.month;
  const equity = Number(headline.equity_net_cr || 0);
  const debt = Number(headline.debt_net_cr || 0);

  const eq = amcFlows
    .filter((r) => r.asset_class === "Equity")
    .map((r) => ({ name: strip(r.amc_name), v: Number(r.net_flow_cr) }))
    .sort((a, b) => b.v - a.v);

  const topIn = eq[0];
  const topOut = eq[eq.length - 1];
  const inflowCount = eq.filter((r) => r.v > 0).length;
  const sig = signals[0];

  const lead =
    `Equity funds recorded net ${equity >= 0 ? "inflows" : "outflows"} of ${inr(equity)} in ${month}, ` +
    `while debt saw net ${debt >= 0 ? "inflows" : "outflows"} of ${inr(debt)}.`;

  const bullets = [];
  if (topIn) bullets.push({ k: "Leading inflow", v: `${topIn.name} · +${inr(topIn.v)}`, tone: "pos" });
  if (topOut && topOut.v < 0) bullets.push({ k: "Largest outflow", v: `${topOut.name} · −${inr(topOut.v)}`, tone: "neg" });
  bullets.push({ k: "Breadth", v: `${inflowCount} of ${eq.length} AMCs saw equity inflows`, tone: "neutral" });
  if (sig)
    bullets.push({
      k: "Standout signal",
      v: `${strip(sig.amc_name)} ${sig.signal === "inflow_surge" ? "inflow surge" : "outflow surge"} · z ${Number(sig.z_score).toFixed(1)}`,
      tone: sig.signal === "inflow_surge" ? "pos" : "neg",
    });

  const paragraphs = [
    lead,
    topIn
      ? `${topIn.name} led category inflows at +${inr(topIn.v)}${
          sig && strip(sig.amc_name) === topIn.name
            ? `, a statistically notable surge (z ${Number(sig.z_score).toFixed(1)} versus trailing months)`
            : ""
        }.${topOut && topOut.v < 0 ? ` ${topOut.name} bucked the trend with a net redemption of ${inr(topOut.v)}.` : ""}`
      : "",
    debt < 0
      ? "Debt continued to see net redemptions, consistent with investors rotating toward equity risk."
      : "Debt saw net additions, suggesting defensive positioning alongside equity flows.",
  ].filter(Boolean);

  const topInflows = eq.filter((r) => r.v > 0).slice(0, 5);
  const topOutflows = eq.filter((r) => r.v < 0).sort((a, b) => a.v - b.v).slice(0, 5);

  const commentary = {
    equity:
      `Equity recorded net ${equity >= 0 ? "inflows" : "outflows"} of ${inr(equity)} for the month, with ` +
      `${inflowCount} of ${eq.length} reporting AMCs in positive territory. ` +
      (topIn ? `${topIn.name} drove the bulk of additions.` : ""),
    debt:
      debt < 0
        ? `Debt saw net redemptions of ${inr(debt)}, consistent with a risk-on rotation toward equity.`
        : `Debt attracted net inflows of ${inr(debt)}, suggesting some defensive allocation alongside equity.`,
  };

  const risks = [
    "Flow figures are monthly and lagging — they describe positioning after the fact, not forward returns.",
    "A single large AMC can dominate the category total; breadth matters as much as the headline number.",
    "Signal z-scores use a short trailing window; treat extreme readings as directional, not precise.",
  ];

  return { month, lead, bullets, paragraphs, equity, debt, topInflows, topOutflows, commentary, risks };
}
