// Decimal-safe summation for persisted financial values (Portfolio Accounting Mission, Phase 7:
// "never use binary floating-point carelessly for persisted financial values").
//
// A single units x NAV multiplication is exact enough for any realistic holding (IEEE-754 double
// precision carries ~15-17 significant digits; a portfolio value would need to exceed roughly
// 100 crore before losing paisa-level precision in one multiplication) — the real exposure is
// SUMMING many such values, where repeated floating-point addition can accumulate rounding error
// across dozens of holdings. sumCurrency avoids that by summing in integer paise (rupee value x
// 100, rounded to the nearest integer, added as integers, divided back down at the end) rather
// than summing floating-point rupee values directly — the standard integer-minor-unit technique
// used in real accounting systems, not a new dependency.
export function toPaise(rupees) {
  return Math.round(Number(rupees) * 100);
}

export function fromPaise(paise) {
  return +(paise / 100).toFixed(2);
}

/**
 * @param {number[]} values - rupee amounts (nulls/NaN are skipped, not coerced to 0)
 * @returns {number} the sum, rounded to paise
 */
export function sumCurrency(values) {
  let totalPaise = 0;
  for (const v of values) {
    if (v == null || Number.isNaN(Number(v))) continue;
    totalPaise += toPaise(v);
  }
  return fromPaise(totalPaise);
}

/**
 * @param {number} numerator
 * @param {number} denominator
 * @returns {number|null} percentage rounded to 2dp, or null if denominator is zero/absent
 */
export function safePercent(numerator, denominator) {
  if (denominator == null || denominator === 0 || numerator == null) return null;
  return +((numerator / denominator) * 100).toFixed(2);
}
