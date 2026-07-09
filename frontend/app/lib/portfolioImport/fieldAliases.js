// Shared pool of header-name variants seen across Indian broker/RTA mutual-fund holding exports.
// Best-effort, built from commonly documented export conventions — NOT verified against a real
// Groww/Coin/Kuvera/ET Money export file. Loud, clear failure (see csv.js's "no header row found"
// path) is the safety net if a real export uses column names outside this list; nothing here
// silently guesses a column mapping. Verify against a real sample before trusting output from
// this pipeline with real money data.
//
// All aliases must already be lowercase/space-normalized — they are matched against
// normalizeHeader()'d columns, never raw text.
export const COMMON_ALIASES = {
  schemeName: ["scheme name", "fund name", "fund", "scheme", "name of the fund", "instrument name"],
  isin: ["isin", "isin code"],
  units: ["units", "unit", "qty", "quantity", "units held"],
  folioNumber: ["folio no", "folio number", "folio", "folio no."],
  avgCost: ["avg cost", "average cost", "avg buy price", "avg. nav", "average nav", "purchase nav", "avg cost per unit"],
  purchaseValue: ["invested value", "invested amount", "purchase value", "cost value", "total invested", "amount invested"],
  currentValue: ["current value", "market value", "current val", "present value"],
  purchaseDate: ["purchase date", "date", "investment date", "transaction date", "buy date"],
};

// Every DD-MM-YYYY-family and ISO date string this pipeline is likely to meet. Returns null
// (never a guessed date) when the input doesn't match a known pattern, so a bad date fails the
// row's validation loudly instead of silently landing on the wrong day.
export function parseFlexibleDate(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); // ISO
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/); // DD-MM-YYYY or DD/MM/YYYY
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/); // DD-Mon-YYYY (e.g. 05-Jan-2024)
  if (m) {
    const months = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
    const mon = months[m[2].toLowerCase()];
    if (mon) return `${m[3]}-${mon}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

export function parseFlexibleNumber(raw) {
  if (raw == null || raw === "") return null;
  const cleaned = String(raw).replace(/[,₹\s]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
