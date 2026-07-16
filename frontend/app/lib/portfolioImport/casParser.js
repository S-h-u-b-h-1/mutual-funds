// CAMS / KFin / MF Central Consolidated Account Statement (CAS) text parser.
//
// Built against the well-documented, industry-standard CAS layout — CAMS and KFin Technologies
// jointly issue the large majority of India's MF CAS statements in this same general structure
// (investor header, one block per folio, one sub-block per scheme within a folio, a transaction
// table, a closing-balance/valuation line); MF Central's own "Portfolio Summary" export follows a
// closely related layout. NOT verified against a real sample PDF — no real CAS was available
// while building this (same disclosure convention as fieldAliases.js's COMMON_ALIASES). Verify
// against a real statement before trusting output from this pipeline with real money data.
//
// Deliberately structural rather than source-specific: the three registrars' statements share
// enough of the same underlying anatomy that one shared extractor handles all three, with only
// the provider-detection signature differing — never a parallel parser per registrar.
import { parseFlexibleDate, parseFlexibleNumber } from "./fieldAliases.js";

const PROVIDER_SIGNATURES = {
  cams: /computer age management services|camsonline|cams\s*cas|www\.camsonline\.com/i,
  kfin: /kfin\s*technologies|kfintech|karvy computershare|www\.kfintech\.com/i,
  mfcentral: /mf\s*central|mfcentral|www\.mfcentral\.com/i,
};

export function detectProvider(text) {
  for (const [provider, re] of Object.entries(PROVIDER_SIGNATURES)) {
    if (re.test(text)) return provider;
  }
  return null;
}

// Derives plan/option/demat from the scheme name text the row already carries — these are never
// merged (Direct vs Regular, Growth vs IDCW are different holdings even under the same AMC), so
// this is read-only classification of already-extracted text, not a second extraction pass.
// "Dividend" is AMFI's pre-2021 name for what's now called IDCW; both map to the same option so a
// statement generated before the rename doesn't silently fall through as unrecognized.
function derivePlanOption(schemeName) {
  const s = String(schemeName || "");
  const plan = /\bdirect\b/i.test(s) ? "Direct" : /\bregular\b/i.test(s) ? "Regular" : null;
  const option = /\bidcw\b/i.test(s) ? "IDCW" : /\bdividend\b/i.test(s) ? "IDCW" : /\bgrowth\b/i.test(s) ? "Growth" : null;
  const demat = /\(\s*non\s*-?\s*demat\s*\)/i.test(s) ? false : /\(\s*demat\s*\)/i.test(s) ? true : null;
  return { plan, option, demat };
}

// The document's own declared grand totals, when present — a Consolidated Account Summary's
// footer row, glued the same way data rows are: "Total<marketValueTotal><costValueTotal>" with
// no separating whitespace, matching the header's own column order ("Market Value...Cost Value").
// Found and verified against the one real sample checked: the second glued number matched the
// independently-computed sum of extracted per-row cost values exactly, confirming this order (not
// assumed from the header text alone, which is itself glued/ambiguous). This is the one real
// reconciliation ground-truth this document type offers for cost; the market-value total lets a
// units x statement-NAV check be validated against the statement's own numbers too, rather than
// only against today's live NAV (which is expected to differ, being a different date).
// Grouping-style-agnostic ([\d,]+ tolerates either Indian lakh-grouping or Western
// thousands-grouping) since this footer used Western grouping despite Indian grouping in the
// per-row data above it.
const DECLARED_TOTAL_RE = /\btotal\s*([\d,]+\.\d{2})([\d,]+\.\d{2})?/i;
function extractStatementDeclaredTotal(text) {
  const m = text.match(DECLARED_TOTAL_RE);
  if (!m) return { marketValueTotal: null, costValueTotal: null };
  return {
    marketValueTotal: parseFlexibleNumber(m[1]),
    costValueTotal: m[2] ? parseFlexibleNumber(m[2]) : null,
  };
}

const STATEMENT_DATE_RE = /\bas\s*on\s*(\d{1,2}-[A-Za-z]{3}-\d{4})/i;
function extractStatementDate(text) {
  const m = text.match(STATEMENT_DATE_RE);
  return m ? parseFlexibleDate(m[1]) : null;
}

const ISIN_RE = /\bIN[A-Z0-9]{10}\b/;
const ISIN_RE_G = new RegExp(ISIN_RE.source, "g");
const FOLIO_RE = /Folio\s*No\s*[:.]?\s*([A-Za-z0-9/\-]+)/i;
const FOLIO_RE_G = new RegExp(FOLIO_RE.source, "gi");
const PAN_RE = /\bPAN\s*[:.]?\s*([A-Z]{5}\d{4}[A-Z])\b/;
const EMAIL_RE = /Email\s*(?:Id)?\s*[:.]?\s*(\S+@\S+\.[a-z]{2,})/i;
const MOBILE_RE = /Mobile\s*(?:No)?\s*[:.]?\s*(?:\+?91[-\s]?)?(\d{10})\b/i;

// The four numeric transaction columns (amount, units, NAV, running balance) are always in this
// left-to-right order in every registrar's CAS, even though column widths vary — PDF text
// extraction collapses table columns to whitespace-separated tokens, so this matches on shape
// (date, free-text description, four decimal numbers) rather than fixed column positions.
const TXN_ROW_RE = /^(\d{2}[-/][A-Za-z]{3}[-/]\d{4}|\d{2}[-/]\d{2}[-/]\d{4})\s+(.+?)\s+(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{3,4})\s+([\d,]+\.\d{4})\s+(-?[\d,]+\.\d{3,4})\s*$/;

const TXN_TYPE_MAP = [
  [/switch\s*-?\s*in/i, "switch_in"],
  [/switch\s*-?\s*out/i, "switch_out"],
  [/dividend.*reinvest|idcw.*reinvest/i, "dividend_reinvest"],
  [/dividend|idcw/i, "dividend_payout"],
  [/redemption|repurchase/i, "redemption"],
  [/purchase|subscription|\bsip\b|systematic investment/i, "purchase"],
];
function classifyTransaction(desc) {
  for (const [re, type] of TXN_TYPE_MAP) if (re.test(desc)) return type;
  return null; // unrecognized line — never guessed; caller reports it as a warning and excludes it
}

function extractInvestor(text) {
  const pan = text.match(PAN_RE)?.[1] || null;
  const email = text.match(EMAIL_RE)?.[1] || null;
  const mobile = text.match(MOBILE_RE)?.[1] || null;
  // Best-effort only: the investor's name sits on its own line in the header block (before the
  // first "Folio No"), closer to the folio section than to the registrar's own letterhead at the
  // very top — searched from the END of the header backward for that reason, and the registrar's
  // own branding lines are explicitly excluded (found via a failing test: a forward search
  // without this exclusion matched "Computer Age Management Services Limited" as the "investor
  // name"). No registrar labels the investor's name explicitly, so this stays a heuristic —
  // absence is reported as null, never fabricated.
  const headerEnd = text.search(FOLIO_RE);
  const headerText = headerEnd > 0 ? text.slice(0, headerEnd) : text.slice(0, 2000);
  const nameLine = [...headerText.split("\n")]
    .map((l) => l.trim())
    .reverse()
    .find((l) => l.length > 3 && l.length < 80 && /^[A-Za-z][A-Za-z .]+$/.test(l) && !isColumnHeaderLine(l) && !/email|pan|mobile|statement|account|consolidated|registrar|summary|computer age|management services|kfin technologies|karvy|mf\s*central/i.test(l));
  return { name: nameLine || null, email, mobile, pan };
}

// Splits the raw text into one block per (folio, scheme): folios delimit outer sections; within a
// folio, every scheme is listed back-to-back with no other section type interleaved, so each
// scheme's block runs from its ISIN occurrence to the next ISIN (or the end of the folio).
function splitBlocks(text) {
  const parts = text.split(FOLIO_RE_G);
  const blocks = [];
  for (let i = 1; i + 1 < parts.length; i += 2) {
    const folioNumber = parts[i];
    const blockText = parts[i + 1] || "";
    const isinPositions = [...blockText.matchAll(ISIN_RE_G)].map((m) => m.index);
    for (let j = 0; j < isinPositions.length; j++) {
      // Each scheme's slice starts right after the PREVIOUS scheme's ISIN (or the folio's own
      // start, for the first scheme) — not at its own ISIN's position — so the scheme-name text,
      // which sits BEFORE the ISIN on the statement, is actually included in the block instead of
      // being cut off. Found via a failing test: slicing from the ISIN itself left every block
      // starting mid-line with no scheme name ever extractable.
      const start = j === 0 ? 0 : isinPositions[j - 1] + 12;
      const end = j + 1 < isinPositions.length ? isinPositions[j + 1] : blockText.length;
      blocks.push({ folioNumber, isin: blockText.slice(isinPositions[j], isinPositions[j] + 12), text: blockText.slice(start, end) });
    }
  }
  return blocks;
}

function extractSchemeName(blockText) {
  // The scheme name is the text immediately before "ISIN:" on the same line, or the line above it
  // when the ISIN sits on its own line — both patterns appear across registrars. A block with no
  // extractable name is reported by the caller and excluded, never mis-attributed to a guess.
  const beforeIsin = blockText.slice(0, blockText.search(ISIN_RE));
  const lines = beforeIsin.split("\n").map((l) => l.trim()).filter(Boolean);
  const candidate = [...lines].reverse().find((l) => l.length > 8 && !/^(isin|advisor|nav on|registrar)/i.test(l));
  return candidate ? candidate.replace(/\(?\s*ISIN.*$/i, "").trim() : null;
}

function extractTransactions(blockText, folioNumber, isin, schemeName) {
  const transactions = [];
  const warnings = [];
  for (const line of blockText.split("\n")) {
    const m = line.match(TXN_ROW_RE);
    if (!m) continue;
    const [, rawDate, desc, amount, units, nav] = m;
    const transactionType = classifyTransaction(desc);
    if (!transactionType) {
      warnings.push(`Unrecognized transaction line for "${schemeName || isin}", excluded: "${desc.trim()}"`);
      continue;
    }
    const transactionDate = parseFlexibleDate(rawDate.replace(/\//g, "-"));
    if (!transactionDate) {
      warnings.push(`Unparseable transaction date "${rawDate}" for "${schemeName || isin}", excluded.`);
      continue;
    }
    transactions.push({
      schemeName,
      isin,
      folioNumber,
      transactionType,
      transactionDate,
      amount: parseFlexibleNumber(amount),
      units: parseFlexibleNumber(units),
      navValue: parseFlexibleNumber(nav),
    });
  }
  return { transactions, warnings };
}

function extractClosingBalance(blockText) {
  const unitsMatch = blockText.match(/Closing\s*(?:Unit)?\s*Balance\s*[:.]?\s*(-?[\d,]+\.\d{3,4})/i);
  const costMatch = blockText.match(/(?:Total\s*)?Cost\s*Value\s*[:.]?\s*(?:INR)?\s*(-?[\d,]+\.\d{2})/i);
  const valueMatch = blockText.match(/Market\s*Value(?:\s*on\s*[\d/\-A-Za-z]+)?\s*[:.]?\s*(?:INR)?\s*(-?[\d,]+\.\d{2})/i);
  return {
    units: unitsMatch ? parseFlexibleNumber(unitsMatch[1]) : null,
    costValue: costMatch ? parseFlexibleNumber(costMatch[1]) : null,
    marketValueReported: valueMatch ? parseFlexibleNumber(valueMatch[1]) : null,
  };
}

// --------------------------------------------------------------------------------------------
// Summary-format extraction — for a Consolidated Account SUMMARY (current holdings snapshot: no
// transaction ledger, just units/NAV/value per scheme), as distinct from the fuller transaction-
// history CAS the functions above target. Added after finding, against a real sample, that
// PDF-to-text extraction glues visually-adjacent table cells together with NO separating
// whitespace — including the registrar name directly onto the ISIN that follows it (e.g.
// "CAMSINF209KA1WO4"), which is why a word-boundary-anchored ISIN search finds nothing in this
// format. Field boundaries in the glued numeric run are recovered using each field's STANDARD
// precision, not guessed: unit balances are conventionally shown to 3-4 decimals, NAV to 3-4, and
// currency amounts to 2 — anchoring on the literal "-Mon-" in the NAV date and on these decimal
// widths is what makes an otherwise-ambiguous run of digits parseable. The final currency amount
// after the ISIN is the statement's Cost Value column, not current market value; mapping it to
// purchaseValue lets the shared normalizer derive avgCost and makes invested value/current gain
// available on the dashboard.
const REGISTRAR_NAMES = "CAMS|KFINTECH";
// NAV decimal precision found to vary between 3 and 4 digits within the same real statement
// (found via digit-run-length-only diagnostics, no content inspected) — not always the
// AMFI-standard 4, so this can't be hardcoded to exactly 4 without silently dropping real rows.
const SUMMARY_ROW_RE = new RegExp(
  `([\\d,]+\\.\\d{3,4})(\\d{1,2}-[A-Za-z]{3}-\\d{4})([\\d,]+\\.\\d{3,4})(${REGISTRAR_NAMES})([A-Z]{2}[A-Z0-9]{10})([\\d,]+\\.\\d{2})`,
  "g"
);
// A folio-and-value line, per the observed header order "Market Value | Folio No.": mostly digits
// and punctuation, with a "/" marking the folio's own sub-account suffix (e.g. "1234567/0") — the
// one part of this glued line that's unambiguous, since it's the only "/"-delimited digit token.
const FOLIO_TOKEN_RE = /(\d{5,10})\s*\/\s*\d+/;
const MOSTLY_NUMERIC_LINE_RE = /^[\d,./\s-]+$/;
// A table's own column-header row, glued the same way data rows are (e.g. "NAV DateNAVRegistrar
// (INR) ISINCost Value (INR)") — checked as plain substrings on whitespace-stripped text, not a
// \b-bounded regex, because the glued words themselves have no internal word boundary for \b to
// anchor on (found via a test fixture where a compact header sat close enough to the first
// holding to fall inside the scheme-name lookback window). Deliberately excludes a bare "nav" —
// real AMCs exist whose name starts with those letters (e.g. Navi Mutual Fund) — the remaining,
// more distinctive keywords are enough to reach the 2-match threshold on an actual header line
// without risking a false positive on a real scheme name.
const COLUMN_HEADER_KEYWORDS = ["navdate", "unitbalance", "marketvalue", "costvalue", "schemename", "foliono", "registrar", "isin"];
function isColumnHeaderLine(line) {
  const compact = line.toLowerCase().replace(/[\s()]/g, "");
  return COLUMN_HEADER_KEYWORDS.filter((kw) => compact.includes(kw)).length >= 2;
}

// Hard privacy guard, not just a quality check: found live (2026-07-15) that a boundary bug
// could pull the document's own investor-identity header into this field. Even with that bug
// fixed, this stays as defense in depth — anything that resolves to a "scheme name" containing an
// identity marker is rejected outright (never returned, never logged) rather than trusted, since
// a scheme name is fund data, not personal data, and should never contain either.
const IDENTITY_MARKER_RE = /@|\bmobile\b|\bemail\b|\bpan\s*:|\baddress\b|\bfolio\s*no\b/i;

// Returns { name, demat } rather than a bare string: the demat flag has to be read off the
// pre-strip text, since the returned display name has "(Non-Demat)"/"(Demat)" removed for
// readability. Deriving it from `name` after that strip would always see "(Non-Demat)" as
// already-gone and misreport it as unknown (found live: this was exactly wrong until fixed).
function cleanSchemeNameLines(lines) {
  const withNormalizedSuffix = lines
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !MOSTLY_NUMERIC_LINE_RE.test(l))
    .filter((l) => !isColumnHeaderLine(l))
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/\(\s*Non\s*-?\s*Demat\s*\)?\s*$/i, "(Non-Demat)") // rejoin a "(Non" / "Demat)" split across two lines
    .trim();
  const demat = /\(\s*non\s*-?\s*demat\s*\)/i.test(withNormalizedSuffix)
    ? false
    : /\(\s*demat\s*\)/i.test(withNormalizedSuffix)
      ? true
      : null;
  const name = withNormalizedSuffix.replace(/\(Non-Demat\)\s*$/i, "").trim();
  if (!name || name.length > 150 || IDENTITY_MARKER_RE.test(name)) return null;
  return { name, demat };
}

function extractSummaryHoldings(text) {
  const rows = [];
  const lines = text.split("\n");
  // Map each line's index to its starting character offset, so a regex match's character
  // position can be resolved back to "which line is this on" and "what came before it".
  const lineOffsets = [];
  let offset = 0;
  for (const l of lines) {
    lineOffsets.push(offset);
    offset += l.length + 1;
  }
  const lineIndexAt = (pos) => {
    let lo = 0, hi = lineOffsets.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (lineOffsets[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  const matches = [...text.matchAll(SUMMARY_ROW_RE)];
  let searchFrom = 0;
  for (const m of matches) {
    const [, units, navDate, nav, registrar, isin, costValue] = m;

    // Precise CHARACTER-offset slice between the previous match's end and this match's start —
    // not a line-index slice. Line-index slicing was the actual bug (found via numeric-only
    // tracing, no content involved): rounding a character position down to "which line contains
    // it" and slicing from there re-includes the WHOLE of that line, including the previous
    // match's own text if the previous match doesn't end exactly at a line boundary — which is
    // exactly what happened, and is how investor-header text (for the first match) and prior
    // holdings' own glued data (for later matches) ended up misidentified as a "scheme name".
    // Bounded to the last few non-empty lines of that gap, not the whole gap, so a large distance
    // (e.g. the document header before the very first match) can never be swept in wholesale.
    const gapText = text.slice(searchFrom, m.index);
    const gapLines = gapText.split("\n").map((l) => l.trim()).filter(Boolean);
    const candidateLines = gapLines.slice(-4); // scheme names wrap at most ~2 lines in practice; 4 is generous headroom, not "the whole gap"
    const folioMatch = candidateLines.join(" ").match(FOLIO_TOKEN_RE);
    const cleaned = cleanSchemeNameLines(candidateLines);

    if (!cleaned) {
      rows._warnings ||= [];
      rows._warnings.push(`Could not extract a scheme name for ISIN ${isin} — this holding was skipped.`);
    } else {
      const { plan, option } = derivePlanOption(cleaned.name);
      rows.push({
        schemeName: cleaned.name,
        isin,
        folioNumber: folioMatch ? folioMatch[1] : null,
        units: parseFlexibleNumber(units),
        navDate: parseFlexibleDate(navDate),
        nav: parseFlexibleNumber(nav),
        registrar: registrar.toUpperCase(),
        purchaseValue: parseFlexibleNumber(costValue),
        marketValueReported: null,
        plan,
        option,
        demat: cleaned.demat,
      });
    }
    searchFrom = m.index + m[0].length;
  }
  return rows;
}

/**
 * Parses raw CAS text (already extracted from an unlocked PDF — see casPdf.js) into holdings +
 * transaction history + investor identity. Never guesses a value it can't find: a block missing
 * a required field is skipped with a warning, not filled in with a placeholder. Tries the
 * transaction-ledger format first (full CAS with purchase/redemption history); if that finds
 * nothing, falls back to the Consolidated Account Summary format (current-holdings snapshot) —
 * see extractSummaryHoldings's own comment for why these need genuinely different extraction, not
 * one shared regex.
 * @returns {{ investor: object, provider: string|null, rows: object[], transactions: object[], warnings: string[] }}
 */
export function parseCasText(text) {
  const provider = detectProvider(text);
  const investor = extractInvestor(text);
  const statementDate = extractStatementDate(text);
  const blocks = splitBlocks(text);
  const rows = [];
  const allTransactions = [];
  const warnings = [];

  for (const block of blocks) {
    const schemeName = extractSchemeName(block.text);
    if (!schemeName) {
      warnings.push(`Could not extract a scheme name for ISIN ${block.isin} in folio ${block.folioNumber} — this holding was skipped.`);
      continue;
    }

    const { transactions, warnings: txnWarnings } = extractTransactions(block.text, block.folioNumber, block.isin, schemeName);
    const closing = extractClosingBalance(block.text);
    warnings.push(...txnWarnings);

    if (closing.units == null) {
      warnings.push(`No closing unit balance found for "${schemeName}" (folio ${block.folioNumber}) — this holding was skipped rather than estimated from transaction history.`);
      continue;
    }

    rows.push({
      schemeName,
      isin: block.isin,
      folioNumber: block.folioNumber,
      units: closing.units,
      purchaseValue: closing.costValue,
      // Reported by the statement itself, kept only as a sanity cross-check — the app always
      // computes its own currentValue from live NAV (see normalizer.js's buildHolding), never
      // trusting a source-reported valuation as of some other date.
      marketValueReported: closing.marketValueReported,
      ...derivePlanOption(schemeName),
    });
    allTransactions.push(...transactions);
  }

  if (rows.length === 0) {
    const summaryRows = extractSummaryHoldings(text);
    if (summaryRows._warnings) warnings.push(...summaryRows._warnings);
    if (summaryRows.length > 0) {
      return {
        investor, provider, statementDate, rows: summaryRows, transactions: [], warnings, format: "summary",
        statementDeclaredTotal: extractStatementDeclaredTotal(text),
      };
    }
    warnings.push("No folio/scheme sections could be identified in this statement in either the transaction-ledger or summary format — it may not be a supported CAS layout, or PDF text extraction lost the document's structure.");
  }

  return {
    investor, provider, statementDate, rows, transactions: allTransactions, warnings, format: rows.length ? "ledger" : "none",
    // The ledger format has no single document-level declared total the way the Summary
    // footer does — each block's own Market Value/Cost Value line (closing.marketValueReported/
    // closing.costValue, already on each row above) is that format's reconciliation ground truth
    // instead, so this stays null there rather than searching for a different kind of total.
    statementDeclaredTotal: { marketValueTotal: null, costValueTotal: null },
  };
}
