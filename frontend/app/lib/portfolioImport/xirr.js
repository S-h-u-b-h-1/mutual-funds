// XIRR (money-weighted return) via Newton-Raphson. Standard financial definition: the single
// annualized rate r such that sum(cashflow_i / (1+r)^(days_i/365)) == 0, where outflows
// (purchases) are negative and inflows (redemptions, dividends, and a final terminal cash flow
// equal to current market value) are positive.
//
// Returns null — never a fabricated or best-guess number — when: fewer than 2 cash flows, no
// sign change (nothing to compute a rate of return over), the solver doesn't converge to a
// verified near-zero NPV, or the converged rate is outside a plausible range (a solver artifact,
// not a real return). A null XIRR must be shown as "not available," never coerced to 0%.

function daysBetween(fromDate, toDate) {
  return (new Date(toDate) - new Date(fromDate)) / 86400000;
}

function npv(rate, flows, t0) {
  return flows.reduce((sum, cf) => sum + cf.amount / Math.pow(1 + rate, daysBetween(t0, cf.date) / 365), 0);
}

function npvDerivative(rate, flows, t0) {
  return flows.reduce((sum, cf) => {
    const t = daysBetween(t0, cf.date) / 365;
    return t === 0 ? sum : sum - (t * cf.amount) / Math.pow(1 + rate, t + 1);
  }, 0);
}

/**
 * @param {{date: string, amount: number}[]} cashflows - date: ISO string, amount: negative=outflow, positive=inflow
 * @returns {number|null} annualized return as a percentage (e.g. 12.34), or null if not computable
 */
export function computeXirr(cashflows) {
  const flows = (cashflows || [])
    .filter((cf) => cf && cf.amount != null && cf.date && Number.isFinite(cf.amount))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (flows.length < 2) return null;
  if (!flows.some((cf) => cf.amount < 0) || !flows.some((cf) => cf.amount > 0)) return null;

  const t0 = flows[0].date;
  let rate = 0.1;
  let converged = false;
  for (let i = 0; i < 100; i++) {
    const f = npv(rate, flows, t0);
    const df = npvDerivative(rate, flows, t0);
    if (Math.abs(df) < 1e-10) break;
    const nextRate = rate - f / df;
    if (!Number.isFinite(nextRate) || nextRate <= -0.999) break;
    if (Math.abs(nextRate - rate) < 1e-7) {
      rate = nextRate;
      converged = true;
      break;
    }
    rate = nextRate;
  }
  if (!converged) return null;

  // Verify: NPV at the solved rate must be near zero relative to the size of the cash flows
  // (Newton's method can converge to a numerically-stationary point that isn't a true root), and
  // the rate itself must be in a plausible range for a real investment return.
  const totalFlow = flows.reduce((s, cf) => s + Math.abs(cf.amount), 0);
  if (Math.abs(npv(rate, flows, t0)) > Math.max(1, totalFlow * 0.001)) return null;
  if (rate < -0.99 || rate > 50) return null;

  return +(rate * 100).toFixed(2);
}
