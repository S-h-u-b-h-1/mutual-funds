import "server-only";
import daily from "../../data/daily.json";
import performance from "../../data/performance.json";
import trend from "../../data/amc_trend.json";
import { getFund, allFunds, cohortOf, asOf as fundsDatasetAsOf } from "../funds";
import {
  visibleReturns,
  benchmarkRows,
  riskInterpretation,
} from "../fundAnalysis";
import { marketIntel } from "../intel";
import { sb } from "../supabase";
import { requireUser } from "../apiAuth";
import { getResearchProfileState } from "../profileGovernanceService";
import { getPortfolio } from "../invest/portfolioService";
import { advisoryCandidateSet } from "../advisoryCandidates";
import { buildRiskProfile, buildShortlist } from "../advisoryEngine";
import { buildContext } from "./context.mjs";

const dateOnly = (value) => value ? new Date(value).toISOString().slice(0, 10) : null;
const compactAllocation = (rows = []) => rows.slice(0, 8).map((row) => ({
  label: row.label || row.name || row.category || row.key,
  weight: row.weight ?? row.percentage ?? row.pct ?? row.value,
}));

async function personalContext() {
  const user = await requireUser();
  if (!user) return { authenticated: false };
  const [profileResult, portfolioResult] = await Promise.allSettled([
    getResearchProfileState(user.id),
    getPortfolio(user.id),
  ]);
  const profile = profileResult.status === "fulfilled" ? profileResult.value.profile : null;
  const rawPortfolio = portfolioResult.status === "fulfilled" ? portfolioResult.value : null;
  const summary = rawPortfolio?.summary;
  const portfolio = summary?.holdingsCount ? {
    holdingsCount: summary.holdingsCount,
    healthScore: summary.healthScore,
    qualityScore: summary.qualityScore,
    effectiveHoldings: summary.effectiveHoldings,
    effectiveAmcs: summary.effectiveAmcs,
    effectiveCategories: summary.effectiveCategories,
    latestOfficialNavDate: summary.latestOfficialNavDate,
    valuationConfidence: summary.valuationConfidence,
    latestNavCoveragePct: summary.latestNavCoveragePct,
    staleHoldingCount: summary.staleHoldingCount,
    unresolvedCount: rawPortfolio.unresolved?.length || 0,
    categoryAllocation: compactAllocation(rawPortfolio.allocation?.category),
    strengths: rawPortfolio.strengths || [],
    weaknesses: rawPortfolio.weaknesses || [],
    bottomLine: rawPortfolio.bottomLine || null,
  } : null;
  const risk = profile?.advisoryAnswers ? buildRiskProfile(profile.advisoryAnswers) : null;
  const shortlist = risk ? buildShortlist(advisoryCandidateSet(), risk).map((fund) => ({
    code: fund.code,
    name: fund.name,
    category: fund.category,
    navDate: fund.navDate,
    fitScore: fund.fitScore,
    reasons: fund.reasons,
    r1y: fund.r1y,
    r3y: fund.r3y,
    r5y: fund.r5y,
    vol90: fund.vol90,
    maxdd90: fund.maxdd90,
  })) : [];
  return {
    authenticated: true,
    profile: profile ? {
      primaryGoal: profile.primaryGoal,
      experience: profile.experience,
      riskComfort: profile.riskComfort,
      horizon: profile.horizon,
      preferredCategories: profile.preferredCategories,
      riskScore: profile.riskScore,
      riskProfile: profile.riskProfile,
    } : null,
    profileAsOf: dateOnly(profile?.updatedAt),
    portfolio,
    portfolioAsOf: rawPortfolio?.dataQuality?.datasetAsOf || summary?.latestOfficialNavDate,
    shortlist,
    shortlistAsOf: fundsDatasetAsOf,
  };
}
export const contextFor = (request) =>
  buildContext(request, {
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
    personalContext,
  });
