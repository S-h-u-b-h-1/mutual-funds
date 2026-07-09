// PortfolioParser — the adapter dispatcher. Picks the right per-source parser (GrowwParser /
// CoinParser / KuveraParser / EtMoneyParser / ManualParser), then always runs its output through
// the one shared Normalizer, so scheme resolution, enrichment, and weight computation exist in
// exactly one place regardless of source.
import { parseGrowwCsv } from "./growwParser";
import { parseCoinCsv } from "./coinParser";
import { parseKuveraCsv } from "./kuveraParser";
import { parseEtMoneyCsv } from "./etmoneyParser";
import { parseManualEntries } from "./manualParser";
import { normalizeHoldings } from "./normalizer";
import { PORTFOLIO_SOURCES } from "../portfolioSchema";

const SOURCE_PARSERS = {
  groww: parseGrowwCsv,
  coin: parseCoinCsv,
  kuvera: parseKuveraCsv,
  etmoney: parseEtMoneyCsv,
  manual: parseManualEntries,
};

/**
 * @param {string} source one of PORTFOLIO_SOURCES' keys
 * @param {string|Object[]} input CSV file text for csv sources, or an array of holding objects for 'manual'
 * @returns {{holdings: import('../portfolioSchema').Holding[], errors: Object[], warnings: string[]}}
 */
export function parsePortfolio(source, input) {
  if (!PORTFOLIO_SOURCES[source]) {
    return { holdings: [], errors: [], warnings: [`Unknown source "${source}". Supported: ${Object.keys(PORTFOLIO_SOURCES).join(", ")}.`] };
  }
  const { rows, warnings } = SOURCE_PARSERS[source](input);
  const { holdings, errors } = normalizeHoldings(rows, source);
  return { holdings, errors, warnings };
}

export { PORTFOLIO_SOURCES };
