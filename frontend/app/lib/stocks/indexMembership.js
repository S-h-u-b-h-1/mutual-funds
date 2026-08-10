// Stock Intelligence Engine mission, Phase 1/2 (SLICE 1): canonical index membership. Turns a
// collected universe snapshot (frontend/app/data/stock_universe.json, built by
// scripts/collect_stock_universe.py from NSE Indices / BSE Indices' own official constituent
// feeds) into real rows in `companies` + `stock_index_memberships`
// (sql/neon/037_stock_index_membership.sql) — the piece that was missing everywhere in this
// codebase before this pass (confirmed by grep across sql/neon/*.sql and frontend/app/lib/stocks
// before writing this: zero index-membership schema or code existed anywhere).
//
// Deliberately does NOT attempt sector/industry classification from the snapshot's free-text
// `industry` field — NIFTY 50 and BSE 100 use two different, not directly reconcilable taxonomies
// (e.g. the same company is "Metals & Mining" in one feed and "Commodities" in the other), and
// guessing a mapping here risks exactly the near-duplicate-category drift
// sql/neon/035_stock_intelligence_foundation.sql's own header comment says this schema was
// designed to avoid. companies.sector_id/industry_id stay null from this ingestion path; a
// dedicated sector/industry classification pass is separate, later work. The raw industry string
// is not lost — it's preserved in the committed snapshot JSON for that future pass to read.
import { query, withTransaction } from "../db.js";
import { createCompany, renameCompanyIdentifier, normalizeCompanyName } from "./companyService.js";

export async function getOrCreateIndex({ key, name, provider }) {
  if (!key || !name || !provider) throw new Error("getOrCreateIndex requires key, name, and provider.");
  const r = await query(
    `insert into stock_indices (key, name, provider) values ($1, $2, $3)
     on conflict (key) do update set name = excluded.name, provider = excluded.provider
     returning id, key, name, provider, created_at`,
    [key, name, provider]
  );
  return { id: r.rows[0].id, key: r.rows[0].key, name: r.rows[0].name, provider: r.rows[0].provider };
}

export async function listIndices() {
  const r = await query(`select id, key, name, provider, created_at from stock_indices order by key asc`);
  return r.rows.map((row) => ({ id: row.id, key: row.key, name: row.name, provider: row.provider, createdAt: row.created_at }));
}

function shapeMembership(row) {
  return {
    companyId: row.company_id,
    joinedAt: row.joined_at,
    leftAt: row.left_at,
    isCurrent: row.is_current,
    source: row.source,
    sourceEffectiveDate: row.source_effective_date,
  };
}

export async function getIndexMembers(indexKey) {
  // joined_at/left_at/source_effective_date are `date` columns — cast to text so JS gets a plain
  // "YYYY-MM-DD" string, not a Date object node-postgres reconstructs at LOCAL midnight (the
  // gotcha documented in memory mfpulse-invest-phase3-gate: comparing/formatting that Date object
  // downstream silently shifts by a day whenever the reading process's local timezone isn't UTC,
  // and it's never `===` a "YYYY-MM-DD" string regardless of timezone since the types differ).
  const r = await query(
    `select m.company_id, m.joined_at::text as joined_at, m.left_at::text as left_at, m.is_current,
            m.source, m.source_effective_date::text as source_effective_date,
            c.legal_name, c.display_name, c.isin, c.nse_symbol, c.bse_code
     from stock_index_memberships m
     join stock_indices i on i.id = m.index_id
     join companies c on c.id = m.company_id
     where i.key = $1 and m.is_current
     order by c.display_name asc`,
    [indexKey]
  );
  return r.rows.map((row) => ({
    ...shapeMembership(row),
    legalName: row.legal_name,
    displayName: row.display_name,
    isin: row.isin,
    nseSymbol: row.nse_symbol,
    bseCode: row.bse_code,
  }));
}

// A bulk sync (NIFTY 50 alone is 50 rows, BSE 100 another 100) resolving each constituent via
// getCompanyByIdentifier's live per-row queries means 150+ sequential round trips to Neon before a
// single write even happens -- measured, this hung well past a minute. loadCompanyIndex() fetches
// every company ONCE and resolves all 150 constituents against in-memory maps instead; the DB is
// only touched again for the (typically few, after the first run) companies that actually need a
// create or identifier backfill.
export async function loadCompanyIndex() {
  const r = await query(`select ${COMPANY_COLUMNS_FOR_INDEX} from companies`);
  const byIsin = new Map(), byNseSymbol = new Map(), byBseCode = new Map(), byNormalizedName = new Map();
  for (const row of r.rows) {
    if (row.isin) byIsin.set(row.isin, row);
    if (row.nse_symbol) byNseSymbol.set(row.nse_symbol, row);
    if (row.bse_code) byBseCode.set(row.bse_code, row);
    const legalKey = normalizeCompanyName(row.legal_name);
    const displayKey = normalizeCompanyName(row.display_name);
    if (legalKey) byNormalizedName.set(legalKey, row);
    if (displayKey) byNormalizedName.set(displayKey, row);
  }
  return { byIsin, byNseSymbol, byBseCode, byNormalizedName };
}

const COMPANY_COLUMNS_FOR_INDEX = "id, legal_name, display_name, isin, nse_symbol, bse_code";

// Resolves a snapshot constituent row against the pre-loaded company index, creating a company if
// genuinely new or backfilling a missing identifier onto an existing one (e.g. a BSE-100 row
// supplies a bse_code for a company NIFTY 50 already created with only isin/nse_symbol) — never
// creates a second row for a company the index already knows about. Mutates `companyIndex` in
// place with any newly-created/updated row so a later constituent in the SAME sync pass resolving
// to the same company (shouldn't happen within one index's own list, but the same companyIndex
// gets reused across NIFTY 50 and BSE 100 in one script run — see sync_stock_index_membership.mjs
// — so a company NIFTY 50 just created must be visible when BSE 100 processes it next) sees it.
// Real, discovered-not-hypothesized data-quality issue: BSE's own SCRIPNAME field is fixed-width
// truncated (empirically ~30 chars — e.g. "Adani Ports and Special Economic Zone Ltd." arrives as
// "ADANI PORTS AND SPECIAL ECONOM"), so an exact normalized-name match against the SAME company's
// full name from NSE's feed fails outright — not a formatting difference the 3rd tier's exact
// match was built for, a genuinely different (shorter) string. This is a 4th, narrower tier: only
// fires when the exact match already failed, and only accepts a prefix match that is UNAMBIGUOUS
// (exactly one existing company's normalized name starts with this shorter one) — a short or
// ambiguous prefix (e.g. two different "TATA..." companies) returns no match rather than guessing,
// so an under-confident non-match (a new company row) is the failure mode, never a wrong merge.
const MIN_PREFIX_MATCH_LENGTH = 12;
function findByNormalizedNamePrefix(companyIndex, normalizedName) {
  if (normalizedName.length < MIN_PREFIX_MATCH_LENGTH) return null;
  let match = null;
  for (const [candidateKey, candidateRow] of companyIndex.byNormalizedName) {
    if (candidateKey.startsWith(normalizedName) || normalizedName.startsWith(candidateKey)) {
      if (match && match.id !== candidateRow.id) return null; // ambiguous — do not guess
      match = candidateRow;
    }
  }
  return match;
}

async function resolveOrCreateCompany(companyIndex, { name, isin = null, nseSymbol = null, bseCode = null }) {
  const normalizedName = normalizeCompanyName(name);
  const existing =
    (isin && companyIndex.byIsin.get(isin)) ||
    (nseSymbol && companyIndex.byNseSymbol.get(nseSymbol)) ||
    (bseCode && companyIndex.byBseCode.get(bseCode)) ||
    (normalizedName && companyIndex.byNormalizedName.get(normalizedName)) ||
    (normalizedName && findByNormalizedNamePrefix(companyIndex, normalizedName));

  if (existing) {
    if (isin && !existing.isin) {
      await renameCompanyIdentifier(existing.id, { identifierType: "isin", newValue: isin, reason: "backfilled from index-membership ingestion", source: "stock_index_membership_sync" });
      existing.isin = isin;
      companyIndex.byIsin.set(isin, existing);
    }
    if (nseSymbol && !existing.nse_symbol) {
      await renameCompanyIdentifier(existing.id, { identifierType: "nse_symbol", newValue: nseSymbol, reason: "backfilled from index-membership ingestion", source: "stock_index_membership_sync" });
      existing.nse_symbol = nseSymbol;
      companyIndex.byNseSymbol.set(nseSymbol, existing);
    }
    if (bseCode && !existing.bse_code) {
      await renameCompanyIdentifier(existing.id, { identifierType: "bse_code", newValue: bseCode, reason: "backfilled from index-membership ingestion", source: "stock_index_membership_sync" });
      existing.bse_code = bseCode;
      companyIndex.byBseCode.set(bseCode, existing);
    }
    return existing.id;
  }

  const created = await createCompany({ legalName: name, displayName: name, isin, nseSymbol, bseCode });
  const row = { id: created.id, legal_name: name, display_name: name, isin, nse_symbol: nseSymbol, bse_code: bseCode };
  if (isin) companyIndex.byIsin.set(isin, row);
  if (nseSymbol) companyIndex.byNseSymbol.set(nseSymbol, row);
  if (bseCode) companyIndex.byBseCode.set(bseCode, row);
  if (normalizedName) companyIndex.byNormalizedName.set(normalizedName, row);
  return created.id;
}

// The re-ingestion contract this table exists to support: close memberships for companies no
// longer in `constituents`, open new ones for companies newly present, and touch nothing for
// companies unchanged between runs — never a destructive overwrite of the membership list.
// `constituents` items: { name, isin?, nseSymbol?, bseCode? } (industry deliberately not accepted
// here — see the module header comment on why sector/industry classification is out of scope).
// `companyIndex` is optional: pass one loaded via loadCompanyIndex() when syncing multiple
// indices in the same run (so the second index's lookups see companies the first just created,
// with only ONE bulk fetch total) — omit it to have this call load its own, for a single-index
// sync or a test.
export async function syncIndexMembership({
  indexKey, indexName, provider, constituents,
  source, sourceUrl = null, sourceEffectiveDate = null, sourceChecksumSha256 = null, retrievedAt,
  companyIndex = null,
}) {
  if (!indexKey || !indexName || !provider) throw new Error("syncIndexMembership requires indexKey, indexName, and provider.");
  if (!Array.isArray(constituents) || constituents.length === 0) throw new Error("syncIndexMembership requires a non-empty constituents array.");
  if (!source || !retrievedAt) throw new Error("syncIndexMembership requires source and retrievedAt for provenance.");

  const index = await getOrCreateIndex({ key: indexKey, name: indexName, provider });
  const joinedAt = (sourceEffectiveDate || retrievedAt).slice(0, 10);
  const resolvedCompanyIndex = companyIndex || (await loadCompanyIndex());

  const companyIds = [];
  for (const constituent of constituents) {
    const companyId = await resolveOrCreateCompany(resolvedCompanyIndex, constituent);
    companyIds.push(companyId);
  }

  return withTransaction(async (client) => {
    const currentRows = await client.query(
      `select company_id from stock_index_memberships where index_id = $1 and is_current`,
      [index.id]
    );
    const currentIds = new Set(currentRows.rows.map((r) => r.company_id));
    const nextIds = new Set(companyIds);

    const toClose = [...currentIds].filter((id) => !nextIds.has(id));
    const toOpen = [...nextIds].filter((id) => !currentIds.has(id));

    if (toClose.length) {
      await client.query(
        `update stock_index_memberships set is_current = false, left_at = $2
         where index_id = $1 and company_id = any($3::uuid[]) and is_current`,
        [index.id, joinedAt, toClose]
      );
    }
    for (const companyId of toOpen) {
      await client.query(
        `insert into stock_index_memberships
           (index_id, company_id, joined_at, is_current, source, source_url, source_effective_date, source_checksum_sha256, retrieved_at)
         values ($1, $2, $3, true, $4, $5, $6, $7, $8)`,
        [index.id, companyId, joinedAt, source, sourceUrl, sourceEffectiveDate, sourceChecksumSha256, retrievedAt]
      );
    }

    return { indexId: index.id, indexKey, total: nextIds.size, opened: toOpen.length, closed: toClose.length, unchanged: nextIds.size - toOpen.length };
  });
}
