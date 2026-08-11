const finite = (value) => value !== null && value !== undefined && Number.isFinite(Number(value));
const value = (metric) => metric?.value;

function trend(statements, key) {
  const rows = statements
    .filter((statement) => finite(statement?.fields?.[key]))
    .sort((a, b) => Number(a.fiscalYear) - Number(b.fiscalYear));
  if (rows.length < 2) return null;
  const first = Number(rows[0].fields[key]);
  const last = Number(rows.at(-1).fields[key]);
  const years = Number(rows.at(-1).fiscalYear) - Number(rows[0].fiscalYear);
  if (first <= 0 || last <= 0 || years <= 0) return { first, last, years, cagr: null };
  return { first, last, years, cagr: (Math.pow(last / first, 1 / years) - 1) * 100 };
}

export function buildCompanyAnalysis({ pnlStatements = [], metrics = null, valuation = null, peers = [] } = {}) {
  const strengths = [];
  const risks = [];
  const questions = [];
  const revenue = trend(pnlStatements, "revenue");
  const profit = trend(pnlStatements, "net_profit");

  if (finite(revenue?.cagr)) {
    const message = `Revenue compounded at ${revenue.cagr.toFixed(1)}% across ${revenue.years} years of sourced statements.`;
    (revenue.cagr >= 8 ? strengths : revenue.cagr < 0 ? risks : questions).push(message);
  }
  if (finite(profit?.cagr)) {
    const message = `Net profit compounded at ${profit.cagr.toFixed(1)}% across the available ${profit.years}-year history.`;
    (profit.cagr >= 10 ? strengths : profit.cagr < 0 ? risks : questions).push(message);
  }
  if (finite(value(metrics?.roce))) (Number(value(metrics.roce)) >= 15 ? strengths : risks).push(`ROCE is ${Number(value(metrics.roce)).toFixed(1)}%; compare persistence and the sector's capital intensity before judging it.`);
  if (finite(value(metrics?.cfoToPat))) (Number(value(metrics.cfoToPat)) >= 0.8 ? strengths : risks).push(`Operating cash flow is ${Number(value(metrics.cfoToPat)).toFixed(2)}× reported profit, a direct check on cash conversion.`);
  if (finite(value(metrics?.debtToEquity))) (Number(value(metrics.debtToEquity)) <= 0.5 ? strengths : risks).push(`Debt/equity is ${Number(value(metrics.debtToEquity)).toFixed(2)}×; interpret it with interest cover and sector norms.`);

  const peerPes = peers.map((peer) => peer?.valuation?.pe).filter(finite).map(Number).sort((a, b) => a - b);
  if (finite(valuation?.pe) && peerPes.length >= 2) {
    const middle = Math.floor(peerPes.length / 2);
    const median = peerPes.length % 2 ? peerPes[middle] : (peerPes[middle - 1] + peerPes[middle]) / 2;
    const premium = ((Number(valuation.pe) / median) - 1) * 100;
    questions.push(`P/E is ${Math.abs(premium).toFixed(0)}% ${premium >= 0 ? "above" : "below"} the median of ${peerPes.length} available same-industry peers; investigate whether growth and quality justify the gap.`);
  }

  if (!revenue) questions.push("A multi-year revenue trend is not available yet; growth quality cannot be judged responsibly.");
  if (!profit) questions.push("A multi-year profit trend is not available yet; earnings consistency remains unverified.");
  if (!finite(value(metrics?.cfoToPat))) questions.push("Cash-flow coverage is incomplete, so reported profit has not yet been reconciled with operating cash generation.");

  return {
    strengths: strengths.slice(0, 4),
    risks: risks.slice(0, 4),
    questions: questions.slice(0, 4),
    coverage: { pnlYears: pnlStatements.length, peerValuations: peerPes.length, hasValuation: Boolean(valuation) },
  };
}
