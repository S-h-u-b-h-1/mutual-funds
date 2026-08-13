import snapshot from "../../data/stock_universe.json";

export const STOCK_INDEX_KEYS = ["NIFTY50", "BSE100"];

export function getStockUniverseSnapshot() {
  return snapshot;
}

export function getIndexUniverse(indexKey = "NIFTY50") {
  const safeKey = STOCK_INDEX_KEYS.includes(indexKey) ? indexKey : "NIFTY50";
  return { key: safeKey, ...snapshot.indices[safeKey] };
}

export function searchIndexUniverse({ indexKey = "NIFTY50", query = "" } = {}) {
  const index = getIndexUniverse(indexKey);
  const needle = String(query).trim().toLowerCase();
  if (!needle) return index.constituents;
  return index.constituents.filter((company) =>
    [company.name, company.industry, company.nseSymbol, company.bseCode, company.isin]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle))
  );
}

export function getStockUniverseSummary() {
  const indices = STOCK_INDEX_KEYS.map(getIndexUniverse);
  return {
    retrievedAt: snapshot.retrievedAt,
    records: indices.reduce((total, index) => total + index.constituentCount, 0),
    indices: indices.length,
    identifiers: indices.reduce(
      (total, index) => total + Object.values(index.identifierCoverage).reduce((sum, count) => sum + count, 0),
      0
    ),
  };
}

function normalizeIdentifier(value) {
  try {
    return decodeURIComponent(String(value || "")).trim().toUpperCase();
  } catch {
    return "";
  }
}

function normalizeCompanyName(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/\b(?:LTD|LIMITED)\.?\b/g, "")
    .replace(/&/g, "AND")
    .replace(/[^A-Z0-9]+/g, "")
    .trim();
}

export function getCompanyResearch(identifier) {
  const needle = normalizeIdentifier(identifier);
  if (!needle) return null;

  const allRecords = STOCK_INDEX_KEYS.flatMap((indexKey) => {
    const index = getIndexUniverse(indexKey);
    return index.constituents.map((company) => ({ company, index }));
  });
  const seed = allRecords.find(({ company }) =>
    [company.nseSymbol, company.bseCode, company.isin].filter(Boolean).some((value) => String(value).toUpperCase() === needle)
  );
  if (!seed) return null;

  const seedName = normalizeCompanyName(seed.company.name);
  const matches = allRecords.filter(({ company }) => {
    const candidateName = normalizeCompanyName(company.name);
    const sameStructuredIdentifier = [company.nseSymbol, company.bseCode, company.isin]
      .filter(Boolean)
      .some((value) => [seed.company.nseSymbol, seed.company.bseCode, seed.company.isin].filter(Boolean).includes(value));
    const sameUnambiguousName = Math.min(seedName.length, candidateName.length) >= 12 &&
      (seedName.startsWith(candidateName) || candidateName.startsWith(seedName));
    return sameStructuredIdentifier || sameUnambiguousName;
  });

  const preferred = matches.find(({ company }) => company.isin) || matches[0];
  const identity = preferred.company;
  const memberships = matches.map(({ index, company }) => ({
    key: index.key,
    name: index.name,
    provider: index.provider,
    sourceUrl: index.sourceUrl,
    sourceEffectiveDate: index.sourceEffectiveDate,
    industry: company.industry,
  }));

  return {
    ...identity,
    bseCode: identity.bseCode || matches.find(({ company }) => company.bseCode)?.company.bseCode || null,
    memberships,
    retrievedAt: snapshot.retrievedAt,
  };
}

export function companyResearchHref(company) {
  const identifier = company.nseSymbol || company.bseCode || company.isin;
  return identifier ? `/stocks/company/${encodeURIComponent(identifier)}` : null;
}

export function getTradingViewSymbol(company) {
  if (company?.nseSymbol) return `NSE:${String(company.nseSymbol).toUpperCase()}`;
  if (company?.bseCode) return `BSE:${String(company.bseCode).toUpperCase()}`;
  return null;
}

export function getCompanyPeers(company, limit = 8) {
  if (!company) return [];
  const identity = new Set([company.nseSymbol, company.bseCode, company.isin].filter(Boolean).map(String));
  const seen = new Set();
  return STOCK_INDEX_KEYS.flatMap((key) => getIndexUniverse(key).constituents)
    .filter((candidate) => candidate.industry === company.industry)
    .filter((candidate) => ![candidate.nseSymbol, candidate.bseCode, candidate.isin].filter(Boolean).some((value) => identity.has(String(value))))
    .filter((candidate) => {
      const key = candidate.isin || candidate.nseSymbol || candidate.bseCode || normalizeCompanyName(candidate.name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

export function getOfficialCompanyResearchLinks(company) {
  const symbol = company?.nseSymbol ? encodeURIComponent(company.nseSymbol) : null;
  const links = [];
  if (symbol) {
    links.push(
      { label: "NSE announcements", detail: "Board decisions, orders, management changes and other disclosures.", href: `https://www.nseindia.com/companies-listing/corporate-filings-announcements?symbol=${symbol}&tabIndex=equity` },
      { label: "NSE financial results", detail: "Exchange-filed quarterly and annual financial results.", href: `https://www.nseindia.com/companies-listing/corporate-filings-financial-results?symbol=${symbol}` },
      { label: "NSE shareholding", detail: "Promoter, institutional and public ownership disclosures.", href: `https://www.nseindia.com/companies-listing/corporate-filings-shareholding-pattern?symbol=${symbol}` }
    );
  }
  if (company?.bseCode) {
    links.push({ label: "BSE corporate filings", detail: `Cross-check disclosures using BSE security code ${company.bseCode}.`, href: "https://www.bseindia.com/corporates/ann.html" });
  }
  return links;
}
