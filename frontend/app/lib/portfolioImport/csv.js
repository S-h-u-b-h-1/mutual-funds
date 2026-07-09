// Shared CSV tokenization + column-alias matching for every source parser in this directory.
// Using a real RFC4180 parser (not String.split(",")) matters here specifically because
// scheme names routinely contain commas ("XYZ Fund - Regular, Growth") that would otherwise
// silently shift every column in a row.
import Papa from "papaparse";

// Many Indian brokerage/RTA exports prepend a few title/summary lines before the real header
// row (e.g. "Portfolio Statement", "Generated on: ..."). Find the header row by locating the
// first row containing at least MIN_ALIAS_HITS recognized field names, rather than assuming
// row 0 — this is a best-effort accommodation, not a guarantee for every export variant.
const MIN_ALIAS_HITS = 3;

function normalizeHeader(h) {
  return String(h || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * @param {string} text Raw CSV file content
 * @param {Object<string,string[]>} aliasMap canonical field -> array of acceptable header names (already normalizeHeader'd)
 * @returns {{rows: Object[], warnings: string[]}} rows keyed by canonical field name; unmatched columns are dropped, not guessed
 */
export function parseCsvWithAliases(text, aliasMap) {
  const parsed = Papa.parse(String(text || "").trim(), { skipEmptyLines: true });
  const allRows = parsed.data;
  if (!allRows.length) return { rows: [], warnings: ["File is empty."] };

  let headerIdx = -1;
  let columnMap = null; // column index -> canonical field name
  for (let i = 0; i < Math.min(allRows.length, 10); i++) {
    const normalized = allRows[i].map(normalizeHeader);
    const map = {};
    let hits = 0;
    for (let col = 0; col < normalized.length; col++) {
      for (const [field, aliases] of Object.entries(aliasMap)) {
        if (aliases.includes(normalized[col])) {
          map[col] = field;
          hits++;
          break;
        }
      }
    }
    if (hits >= MIN_ALIAS_HITS) {
      headerIdx = i;
      columnMap = map;
      break;
    }
  }

  if (headerIdx === -1) {
    const seenHeaders = allRows[0]?.map(normalizeHeader).join(", ") || "(no rows)";
    return {
      rows: [],
      warnings: [
        `Could not find a recognizable header row in the first 10 lines. Saw columns: "${seenHeaders}". ` +
          `This export format may differ from what this parser expects — do not assume the data below is correct.`,
      ],
    };
  }

  const rows = [];
  const warnings = [];
  for (let i = headerIdx + 1; i < allRows.length; i++) {
    const raw = allRows[i];
    if (!raw || raw.every((c) => String(c ?? "").trim() === "")) continue;
    const row = { _sourceLine: i + 1 };
    for (const [col, field] of Object.entries(columnMap)) {
      row[field] = raw[Number(col)] != null ? String(raw[Number(col)]).trim() : "";
    }
    rows.push(row);
  }
  if (parsed.errors?.length) {
    warnings.push(...parsed.errors.map((e) => `CSV parse warning at row ${e.row}: ${e.message}`));
  }
  return { rows, warnings };
}
