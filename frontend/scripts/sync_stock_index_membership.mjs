#!/usr/bin/env node
// Stock Intelligence Engine mission, SLICE 1: turns the collected universe snapshot
// (app/data/stock_universe.json, produced by ../scripts/collect_stock_universe.py from NSE
// Indices' and BSE Indices' own official constituent feeds) into real rows in `companies` +
// `stock_index_memberships`. Requires DATABASE_URL. Idempotent — safe to re-run against the same
// or a refreshed snapshot; syncIndexMembership() only opens/closes what actually changed.
import snapshot from "../app/data/stock_universe.json" with { type: "json" };
import { syncIndexMembership, loadCompanyIndex } from "../app/lib/stocks/indexMembership.js";

function niftyConstituents(index) {
  return index.constituents.map((c) => ({ name: c.name, isin: c.isin || null, nseSymbol: c.nseSymbol || null, bseCode: null }));
}

function bseConstituents(index) {
  return index.constituents.map((c) => ({ name: c.name, isin: null, nseSymbol: null, bseCode: c.bseCode || null }));
}

// One shared companyIndex across both syncs: 150 sequential per-constituent lookup queries (the
// first version of this script) measured well past a minute against Neon's real network latency.
// Loading the full company table ONCE and resolving both NIFTY 50 and BSE 100 against the same
// in-memory index — updated in place as each sync creates/backfills companies — cuts this to one
// bulk read plus only the writes actually needed (indexMembership.js's own header explains why).
async function syncOne(indexKey, indexName, buildConstituents, companyIndex) {
  const index = snapshot.indices[indexKey];
  if (!index) throw new Error(`sync_stock_index_membership: snapshot has no '${indexKey}' index.`);
  const result = await syncIndexMembership({
    indexKey,
    indexName,
    provider: index.provider,
    constituents: buildConstituents(index),
    source: index.provider,
    sourceUrl: index.sourceUrl,
    sourceEffectiveDate: index.sourceEffectiveDate,
    sourceChecksumSha256: index.sourceChecksumSha256,
    retrievedAt: snapshot.retrievedAt,
    companyIndex,
  });
  console.log(JSON.stringify({ indexKey, ...result }));
  return result;
}

const companyIndex = await loadCompanyIndex();
const niftyResult = await syncOne("NIFTY50", "NIFTY 50", niftyConstituents, companyIndex);
const bseResult = await syncOne("BSE100", "BSE 100", bseConstituents, companyIndex);

const failed = [niftyResult, bseResult].some((r) => r.total === 0);
if (failed) {
  console.error("::error::sync_stock_index_membership: an index synced to zero members — refusing to treat this as success.");
  process.exit(1);
}
process.exit(0);
