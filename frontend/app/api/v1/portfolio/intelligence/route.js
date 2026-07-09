import { requireUser, unauthorized } from "../../../../lib/apiAuth";
import { query } from "../../../../lib/db";
import { getUserHoldings } from "../../../../lib/portfolioImport/holdingsRead";
import { buildHealthReport } from "../../../../lib/portfolioIntelligence/healthReport";

// Computes the full Phase A-D deterministic report fresh from live holdings + live fund data,
// then persists three things as a side effect: a portfolio_metrics row (numeric snapshot, feeds
// the future Phase 8 timeline), one portfolio_events row per available exposure theme, and a
// portfolio_reports row (the full report — report_type 'portfolio_health' distinguishes this from
// the later 'advisor_review' report Phase 9 will build on top of it). Read-only for the request
// itself; every write here is a cache of something already deterministically recomputable from
// portfolio_holdings, never a second source of truth.
export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const { holdings: rawHoldings, unresolved } = await getUserHoldings(user.id);
  if (rawHoldings.length === 0) {
    return Response.json({ error: "No holdings to analyze. Import a portfolio first via POST /api/v1/portfolio/upload." }, { status: 400 });
  }

  const report = buildHealthReport(rawHoldings);
  const a = report._analytics;

  const metricsRow = await query(
    `insert into portfolio_metrics
       (user_id, total_value, volatility, max_drawdown, diversification_score, concentration_score, quality_score, health_score, overlap_pct, details)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     returning id, computed_at`,
    [
      user.id,
      a.totalValue,
      a.volatility,
      a.expectedDrawdown,
      a.diversificationScore,
      a.concentrationScore,
      a.qualityScore,
      a.healthScore,
      a.stockOverlap.duplicateExposurePct,
      JSON.stringify({ healthScoreBreakdown: a.healthScoreBreakdown, effectiveHoldings: a.effectiveHoldings, effectiveAmcs: a.effectiveAmcs, effectiveCategories: a.effectiveCategories }),
    ]
  );

  for (const [theme, t] of Object.entries(report.exposure)) {
    if (!t.available) continue;
    await query(
      `insert into portfolio_events (user_id, theme, exposure_pct, reasoning) values ($1, $2, $3, $4)`,
      [user.id, theme, t.exposurePct, JSON.stringify({ ruleIds: t.ruleIds, contributions: t.contributions })]
    );
  }

  const { _analytics, ...reportForStorage } = report;
  const reportRow = await query(
    `insert into portfolio_reports (user_id, report_type, summary) values ($1, 'portfolio_health', $2) returning id, generated_at`,
    [user.id, JSON.stringify(reportForStorage)]
  );

  await query(
    `insert into portfolio (user_id, total_value, holdings_count, last_computed_at, updated_at)
     values ($1, $2, $3, now(), now())
     on conflict (user_id) do update set total_value = excluded.total_value, holdings_count = excluded.holdings_count, last_computed_at = now(), updated_at = now()`,
    [user.id, a.totalValue, a.holdingsCount]
  );

  return Response.json({
    metricsId: metricsRow.rows[0].id,
    reportId: reportRow.rows[0].id,
    computedAt: metricsRow.rows[0].computed_at,
    unresolvedHoldings: unresolved,
    report: reportForStorage,
  });
}
