import { parseCsvWithAliases } from "./csv";
import { COMMON_ALIASES } from "./fieldAliases";

// Kuvera's mutual fund holdings export. No verified real sample was available while building
// this — uses the shared alias pool as-is. If a real export's headers don't match, csv.js's
// "no recognizable header row" warning will say so explicitly rather than silently misparsing;
// add Kuvera-specific aliases/overrides here once a real export confirms the actual column names.
export function parseKuveraCsv(text) {
  const { rows, warnings } = parseCsvWithAliases(text, COMMON_ALIASES);
  return { rows, warnings, source: "kuvera" };
}
