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
    .find((l) => l.length > 3 && l.length < 80 && /^[A-Za-z][A-Za-z .]+$/.test(l) && !/email|pan|mobile|statement|account|consolidated|registrar|summary|computer age|management services|kfin technologies|karvy|mf\s*central/i.test(l));
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

/**
 * Parses raw CAS text (already extracted from an unlocked PDF — see casPdf.js) into holdings +
 * transaction history + investor identity. Never guesses a value it can't find: a block missing
 * a required field is skipped with a warning, not filled in with a placeholder.
 * @returns {{ investor: object, provider: string|null, rows: object[], transactions: object[], warnings: string[] }}
 */
export function parseCasText(text) {
  const provider = detectProvider(text);
  const investor = extractInvestor(text);
  const blocks = splitBlocks(text);
  const rows = [];
  const allTransactions = [];
  const warnings = [];

  if (blocks.length === 0) {
    warnings.push("No folio/scheme sections could be identified in this statement — it may not be a supported CAS format, or PDF text extraction lost the document's structure.");
  }

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
    });
    allTransactions.push(...transactions);
  }

  return { investor, provider, rows, transactions: allTransactions, warnings };
}
