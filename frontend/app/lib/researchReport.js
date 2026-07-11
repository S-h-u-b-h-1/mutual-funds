// Professional Research Report (Phase 10 of the Fund Research Engine mission) — the structured
// object an institutional report/PDF export would be built from. Pure composition: every field
// here is a pointer into something already computed elsewhere on the fund page (fundHealth,
// fundAnalysis, investorAnalyst, fundDNA, qualityEngine, decisionEngine, rollingReturns,
// marketImpact) — nothing is recalculated, so this can never drift from what the page itself
// shows. Structuring this now (rather than shipping a PDF renderer) is the deliberate scope: the
// same object can back a print view, a PDF export, or an API response later without touching any
// of the underlying engines.
export function buildResearchReport(f, {
  cohort, thesis, strengthsWeak, fit, dna, quality, decisionSupport, health,
  rets, bench, calReturns, rollReturns, riskStats, sharpe, sortino,
  completeness, readiness, relatedNews, newsInsights, priority,
} = {}) {
  const name = f.name.replace(/ - (Direct|Regular).*/i, "");

  return {
    generatedFor: { code: f.code, name, amc: f.amc, category: f.category, plan: f.plan, navDate: f.navDate },

    executiveSummary: {
      headline: `${name} — ${f.category} (${f.plan})`,
      thesis,
      healthScore: health ? { overall: health.overall, grade: health.grade, confidence: health.confidence } : null,
      researchPriority: priority ? { score: priority.score, tier: priority.tier } : null,
    },

    investmentThesis: thesis,

    fundDNA: dna ? { dimensions: dna.dimensions, coverage: `${dna.availableCount}/${dna.totalCount}` } : null,

    performanceSummary: {
      returns: rets, // real return windows only (visibleReturns) — a window with no data is absent, not zero
      categoryRank: f.catRank != null ? { rank: f.catRank, of: f.catSize, percentile: f.catPct } : null,
      trend: f.trend,
    },

    riskSummary: {
      volatility90d: f.vol90, downsideVolatility90d: f.dvol90, maxDrawdown90d: f.maxdd90,
      sharpe, sortino,
      beta: riskStats?.beta ?? null, alpha: riskStats?.alpha ?? null, informationRatio: riskStats?.informationRatio ?? null,
      betaAlphaCaveat: riskStats ? `Measured against ${riskStats.indexUsed} (price index, not the fund's official TRI benchmark) over ${riskStats.overlapDays} trading days.` : null,
    },

    consistency: { rating: f.consistency, observedDays: f.quality?.obs ?? null },

    drawdown: { maxDrawdown90d: f.maxdd90, currentDrawdownFromHigh: f.ddFromHigh, negativeDays: f.negDays, observedDays: f.quality?.obs ?? null },

    rollingReturns: rollReturns?.length ? { periods: rollReturns.length, min: Math.min(...rollReturns.map((r) => r.return)), max: Math.max(...rollReturns.map((r) => r.return)) } : null,

    calendarReturns: calReturns,

    benchmarkAnalysis: { benchmark: f.benchmark, benchmarkStandard: f.benchmarkStd, vsPeerCohort: bench },

    strengths: strengthsWeak?.strengths ?? [],
    weaknesses: strengthsWeak?.risks ?? [],

    investorSuitability: fit ?? [],

    thingsToMonitor: [
      decisionSupport?.monitor,
      strengthsWeak?.recentDeterioration,
      ...(strengthsWeak?.watch ?? []),
    ].filter(Boolean),

    recentNews: (relatedNews ?? []).map((n) => ({
      title: n.title, source: n.source?.name ?? null, publishedAt: n.publishedAt,
      insight: newsInsights?.[n.id] ?? null,
    })),

    researchConfidence: quality ? { level: quality.confidence, coverage: `${quality.coverage}/${quality.totalPossible}` } : null,

    dataCompleteness: completeness ? { score: completeness.score, dimensions: completeness.dims } : null,
    researchReadiness: readiness ? { answered: readiness.answered, total: readiness.total, questions: readiness.questions } : null,
  };
}
