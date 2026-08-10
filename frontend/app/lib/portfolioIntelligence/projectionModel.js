import { getFund } from "../funds";
import { categoryToCanonicalBucket, isEquityBucket } from "./categoryBuckets";

const ASSUMPTION_VERSION = "2026.08";

// Nominal long-run planning priors. These are transparent model inputs, not market calls.
const BUCKETS = {
  "Large Cap": { annualReturn: 10.5, volatility: 16 },
  "Mid Cap": { annualReturn: 11.5, volatility: 21 },
  "Small Cap": { annualReturn: 12, volatility: 25 },
  Index: { annualReturn: 10.5, volatility: 16 },
  International: { annualReturn: 9.5, volatility: 19 },
  "Equity — Other": { annualReturn: 10, volatility: 19 },
  Hybrid: { annualReturn: 8.5, volatility: 11 },
  Debt: { annualReturn: 6.5, volatility: 5 },
  Gold: { annualReturn: 7, volatility: 17 },
  Unknown: { annualReturn: 7.5, volatility: 18 },
};

const STRESS_SCENARIOS = {
  "Equity sell-off": { "Large Cap": -30, "Mid Cap": -38, "Small Cap": -45, Index: -30, International: -28, "Equity — Other": -32, Hybrid: -18, Debt: -4, Gold: 4, Unknown: -22 },
  "Rates and credit shock": { "Large Cap": -12, "Mid Cap": -15, "Small Cap": -18, Index: -12, International: -10, "Equity — Other": -14, Hybrid: -9, Debt: -8, Gold: 3, Unknown: -10 },
  "Inflation and currency shock": { "Large Cap": -10, "Mid Cap": -12, "Small Cap": -15, Index: -10, International: 5, "Equity — Other": -11, Hybrid: -7, Debt: -5, Gold: 12, Unknown: -7 },
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value, digits = 2) => Number(value.toFixed(digits));

function cagr(totalReturnPct, years) {
  const growth = 1 + Number(totalReturnPct) / 100;
  return Number.isFinite(growth) && growth > 0 ? (Math.pow(growth, 1 / years) - 1) * 100 : null;
}

function annualizeShortReturn(returnPct, months) {
  const growth = 1 + Number(returnPct) / 100;
  return Number.isFinite(growth) && growth > 0 ? (Math.pow(growth, 12 / months) - 1) * 100 : null;
}

function observedReturn(fund) {
  const evidence = [];
  if (fund?.r3y != null) evidence.push({ value: clamp(cagr(fund.r3y, 3), -20, 30), weight: 0.55, window: "3Y CAGR" });
  if (fund?.r1y != null) evidence.push({ value: clamp(Number(fund.r1y), -25, 35), weight: 0.3, window: "1Y" });
  if (fund?.r3m != null) evidence.push({ value: clamp(annualizeShortReturn(fund.r3m, 3), -20, 30), weight: 0.15, window: "3M annualised" });
  const valid = evidence.filter((item) => Number.isFinite(item.value));
  if (!valid.length) return { value: null, windows: [] };
  const totalWeight = valid.reduce((sum, item) => sum + item.weight, 0);
  return { value: valid.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight, windows: valid.map((item) => item.window) };
}

function evidenceCredibility(fund) {
  if (!fund) return 0;
  let value = 0;
  if (fund.r3y != null) value += 0.28;
  if (fund.r1y != null) value += 0.12;
  if (fund.r3m != null) value += 0.05;
  if ((fund.quality?.obs || 0) >= 60) value += 0.05;
  return Math.min(0.5, value);
}

function correlation(a, b) {
  if (a === b) return a === "Unknown" ? 0.65 : 0.82;
  if (isEquityBucket(a) && isEquityBucket(b)) return a === "International" || b === "International" ? 0.6 : 0.72;
  if (a === "Hybrid" || b === "Hybrid") {
    const other = a === "Hybrid" ? b : a;
    if (isEquityBucket(other)) return 0.65;
    if (other === "Debt") return 0.4;
    if (other === "Gold") return 0.2;
  }
  if ((isEquityBucket(a) && b === "Debt") || (isEquityBucket(b) && a === "Debt")) return 0.18;
  if ((isEquityBucket(a) && b === "Gold") || (isEquityBucket(b) && a === "Gold")) return 0.08;
  if ((a === "Debt" && b === "Gold") || (b === "Debt" && a === "Gold")) return 0.1;
  return 0.3;
}

function normalCdf(x) {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * z);
  const polynomial = (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  const erf = 1 - polynomial * Math.exp(-z * z);
  return 0.5 * (1 + sign * erf);
}

function scenarioRange(totalValue, annualReturnPct, volatilityPct, years) {
  const mu = annualReturnPct / 100;
  const sigma = volatilityPct / 100;
  const logDrift = Math.log(Math.max(0.01, 1 + mu)) - 0.5 * sigma * sigma;
  const spread = sigma * Math.sqrt(years) * 1.15; // fat-tail guard for short observed histories
  const quantile = (z) => Math.exp(logDrift * years + z * spread) - 1;
  const low = quantile(-1.2816);
  const median = quantile(0);
  const high = quantile(1.2816);
  const lossProbability = sigma > 0 ? normalCdf((-logDrift * Math.sqrt(years)) / (sigma * 1.15)) : mu < 0 ? 1 : 0;
  return {
    years,
    lowReturnPct: round(low * 100, 1),
    centralReturnPct: round(median * 100, 1),
    highReturnPct: round(high * 100, 1),
    lowValue: round(totalValue * (1 + low), 0),
    centralValue: round(totalValue * (1 + median), 0),
    highValue: round(totalValue * (1 + high), 0),
    probabilityOfLossPct: round(clamp(lossProbability * 100, 0, 100), 1),
  };
}

export function computePortfolioProjection(holdings, { duplicateExposurePct = null } = {}) {
  const positions = holdings.map((holding) => {
    const fund = getFund(holding.schemeCode);
    const bucket = categoryToCanonicalBucket(holding.category || fund?.category, holding.assetClass || fund?.assetClass);
    const prior = BUCKETS[bucket] || BUCKETS.Unknown;
    const observed = observedReturn(fund);
    const credibility = observed.value == null ? 0 : evidenceCredibility(fund);
    const expectedReturn = prior.annualReturn * (1 - credibility) + (observed.value ?? prior.annualReturn) * credibility;
    return {
      schemeCode: holding.schemeCode,
      schemeName: holding.schemeName,
      weight: Number(holding.weight || 0),
      bucket,
      priorReturnPct: prior.annualReturn,
      observedReturnPct: observed.value == null ? null : round(observed.value),
      expectedReturnPct: round(expectedReturn),
      volatilityPct: Number.isFinite(Number(fund?.vol90)) ? clamp(Number(fund.vol90), 2, 45) : prior.volatility,
      credibilityPct: round(credibility * 100, 0),
      evidenceWindows: observed.windows,
      hasObservedRisk: Number.isFinite(Number(fund?.vol90)),
      hasClassification: bucket !== "Unknown",
    };
  });

  const totalWeight = positions.reduce((sum, item) => sum + item.weight, 0) || 100;
  const normalized = positions.map((item) => ({ ...item, w: item.weight / totalWeight }));
  const annualReturn = normalized.reduce((sum, item) => sum + item.w * item.expectedReturnPct, 0);
  let variance = 0;
  for (const left of normalized) for (const right of normalized) {
    variance += left.w * right.w * (left.volatilityPct / 100) * (right.volatilityPct / 100) * correlation(left.bucket, right.bucket);
  }
  const baseVolatility = Math.sqrt(Math.max(0, variance)) * 100;
  const riskCoveragePct = normalized.reduce((sum, item) => sum + (item.hasObservedRisk ? item.w * 100 : 0), 0);
  const returnCoveragePct = normalized.reduce((sum, item) => sum + (item.observedReturnPct != null ? item.w * 100 : 0), 0);
  const classificationCoveragePct = normalized.reduce((sum, item) => sum + (item.hasClassification ? item.w * 100 : 0), 0);
  const confidenceScore = Math.round(clamp(0.45 * returnCoveragePct + 0.35 * riskCoveragePct + 0.2 * classificationCoveragePct, 0, 82));
  const confidenceLabel = confidenceScore >= 70 ? "Moderate" : confidenceScore >= 45 ? "Limited" : "Low";
  const uncertaintyMultiplier = 1 + (100 - confidenceScore) / 300;
  const volatility = baseVolatility * uncertaintyMultiplier;
  const totalValue = holdings.reduce((sum, item) => sum + Number(item.currentValue || 0), 0);
  const topWeight = Math.max(0, ...positions.map((item) => item.weight));
  const concentrationAmplifier = 1 + Math.max(0, topWeight - 20) / 250 + Math.max(0, Number(duplicateExposurePct || 0) - 10) / 500;

  const stressTests = Object.entries(STRESS_SCENARIOS).map(([name, shocks]) => {
    const impactPct = normalized.reduce((sum, item) => sum + item.w * (shocks[item.bucket] ?? shocks.Unknown), 0) * concentrationAmplifier;
    return { name, impactPct: round(impactPct, 1), valueImpact: round(totalValue * impactPct / 100, 0), endValue: round(totalValue * (1 + impactPct / 100), 0), probability: "Not assigned" };
  });

  const defensiveWeightPct = normalized.filter((item) => ["Debt", "Gold", "Hybrid"].includes(item.bucket)).reduce((sum, item) => sum + item.w * 100, 0);
  const downsideResilienceScore = Math.round(clamp(100 - volatility * 2.2 - Math.max(0, topWeight - 20) * 0.7 + Math.min(20, defensiveWeightPct * 0.25), 0, 100));
  const balanceScore = Math.round(clamp(45 + Math.min(25, new Set(normalized.map((item) => item.bucket).filter((x) => x !== "Unknown")).size * 5) + Math.min(15, defensiveWeightPct * 0.35) - Math.max(0, topWeight - 25), 0, 100));

  return {
    assumptionVersion: ASSUMPTION_VERSION,
    expectedAnnualReturnPct: round(annualReturn, 1),
    modelledAnnualVolatilityPct: round(volatility, 1),
    planningDrawdownPct: round(-Math.min(75, volatility * 1.55), 1),
    confidence: { score: confidenceScore, label: confidenceLabel, returnCoveragePct: round(returnCoveragePct, 1), riskCoveragePct: round(riskCoveragePct, 1), classificationCoveragePct: round(classificationCoveragePct, 1) },
    ranges: [1, 3, 5].map((years) => scenarioRange(totalValue, annualReturn, volatility, years)),
    stressTests,
    resilience: { downsideScore: downsideResilienceScore, balanceScore, defensiveWeightPct: round(defensiveWeightPct, 1) },
    holdingAssumptions: positions,
    methodology: "Category-specific long-run planning priors are conservatively tilted by capped 3Y/1Y/3M observed returns. Risk uses a covariance matrix with category-level correlation assumptions and holding-level observed volatility where available. Ranges are 10th–90th percentile planning bands with an uncertainty inflation; they are not guarantees.",
    limitations: [
      "The model does not predict market timing, regime changes, manager changes, tax, cash flows or investor behaviour.",
      "Category correlations are assumptions because complete aligned daily histories are not yet available for every holding.",
      "New funds inherit their category prior and receive low evidence weight until a track record develops.",
      "Accuracy must be measured with walk-forward backtests before any predictive-accuracy claim is made.",
    ],
  };
}
