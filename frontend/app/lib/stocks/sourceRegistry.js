// Stock source registry — the public contract for where stock intelligence comes from.
// Keep this list conservative: a URL being publicly viewable does not automatically grant
// bulk collection or redistribution rights. `collectionStatus` therefore describes what MF
// Pulse actually does, not what might technically be scrapable.

export const SOURCE_STATUS = {
  active: { label: "Active feed", tone: "pos", rank: 0 },
  ready: { label: "Ready to connect", tone: "accent", rank: 1 },
  reference: { label: "Direct reference", tone: "neutral", rank: 2 },
  review: { label: "Access review", tone: "warn", rank: 3 },
  licensed: { label: "Licence required", tone: "warn", rank: 4 },
};

export const STOCK_SOURCES = [
  {
    id: "nifty50-constituents",
    name: "NIFTY 50 constituent file",
    publisher: "NSE Indices",
    authority: "index_provider",
    category: "Index universe",
    url: "https://nsearchives.nseindia.com/content/indices/ind_nifty50list.csv",
    format: "Official CSV",
    frequency: "Check daily; changes are event-driven",
    collectionStatus: "active",
    investorValue: "Canonical company name, NSE symbol, industry and ISIN for the current NIFTY 50 universe.",
    usePolicy: "Store constituent facts with retrieval date and source link; do not imply live index weights.",
  },
  {
    id: "bse100-constituents",
    name: "BSE 100 constituents",
    publisher: "BSE Indices",
    authority: "index_provider",
    category: "Index universe",
    url: "https://www.bseindices.com/indices-details/code/22/",
    format: "Official constituent page",
    frequency: "Check daily; changes are event-driven",
    collectionStatus: "active",
    investorValue: "Official membership of the 100-company BSE 100 universe (the product universe requested as ‘Sensex 100’).",
    usePolicy: "Store a dated constituent-metadata snapshot and link the official page; refresh remains manually reviewed while reuse terms are documented.",
  },
  {
    id: "nse-announcements",
    name: "Corporate announcements",
    publisher: "NSE India",
    authority: "exchange",
    category: "Exchange filings",
    url: "https://www.nseindia.com/companies-listing/corporate-filings-announcements?tabIndex=equity",
    format: "Official filing directory with attachments",
    frequency: "Event-driven",
    collectionStatus: "reference",
    investorValue: "Results, board decisions, management changes, orders, capital raising and other company disclosures.",
    usePolicy: "Facts and links only until an approved structured-access contract is documented.",
  },
  {
    id: "nse-results",
    name: "Financial results",
    publisher: "NSE India",
    authority: "exchange",
    category: "Financial statements",
    url: "https://www.nseindia.com/companies-listing/corporate-filings-financial-results",
    format: "Official filings and XBRL/attachments",
    frequency: "Quarterly and event-driven",
    collectionStatus: "reference",
    investorValue: "Primary-source quarterly and annual financial results.",
    usePolicy: "Normalize reported facts while retaining filing date, period, units, restatements and document URL.",
  },
  {
    id: "nse-shareholding",
    name: "Shareholding patterns",
    publisher: "NSE India",
    authority: "exchange",
    category: "Ownership",
    url: "https://www.nseindia.com/companies-listing/corporate-filings-shareholding-pattern",
    format: "Official filing directory",
    frequency: "Quarterly",
    collectionStatus: "reference",
    investorValue: "Promoter, institutional and public ownership disclosures.",
    usePolicy: "Always show the reporting period; never present an old pattern as current.",
  },
  {
    id: "bse-announcements",
    name: "Corporate announcements",
    publisher: "BSE India",
    authority: "exchange",
    category: "Exchange filings",
    url: "https://www.bseindia.com/corporates/ann.html",
    format: "Official filing directory with attachments",
    frequency: "Event-driven",
    collectionStatus: "reference",
    investorValue: "A second exchange record for disclosures, including BSE-only securities and cross-checking.",
    usePolicy: "Facts and links only until an approved structured-access contract is documented.",
  },
  {
    id: "company-ir",
    name: "Company investor-relations pages",
    publisher: "Each covered company",
    authority: "company_primary",
    category: "Company documents",
    url: null,
    format: "Per-company annual reports, presentations, transcripts and press releases",
    frequency: "Event-driven; quarterly review",
    collectionStatus: "ready",
    investorValue: "Management commentary and the original documents behind results, strategy, capital allocation and risks.",
    usePolicy: "Maintain one verified IR URL per company; extract facts and short summaries, link to the original, and do not republish full documents.",
  },
  {
    id: "sebi-rss",
    name: "Press releases and regulatory updates",
    publisher: "SEBI",
    authority: "regulator",
    category: "Regulation",
    url: "https://www.sebi.gov.in/sebirss.xml",
    format: "Official RSS",
    frequency: "Every three hours",
    collectionStatus: "active",
    investorValue: "Regulatory actions and market-structure changes from the primary regulator.",
    usePolicy: "Headline, summary, timestamp and source link with deterministic relevance rules.",
  },
  {
    id: "rbi-rss",
    name: "Press releases",
    publisher: "Reserve Bank of India",
    authority: "regulator",
    category: "Macro and banking",
    url: "https://www.rbi.org.in/pressreleases_rss.xml",
    format: "Official RSS",
    frequency: "Every three hours",
    collectionStatus: "active",
    investorValue: "Monetary policy, banking, liquidity and macro-financial announcements.",
    usePolicy: "Headline, summary, timestamp and source link with deterministic relevance rules.",
  },
  ...[
    ["et-markets", "Economic Times — Markets", "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms"],
    ["et-economy", "Economic Times — Economy", "https://economictimes.indiatimes.com/news/economy/rssfeeds/1373380680.cms"],
    ["mint-markets", "Mint — Markets", "https://www.livemint.com/rss/markets"],
    ["cnbctv18-markets", "CNBC-TV18 — Markets", "https://www.cnbctv18.com/commonfeeds/v1/cne/rss/market.xml"],
    ["ndtv-profit", "NDTV Profit — Latest", "https://feeds.feedburner.com/ndtvprofit-latest"],
    ["businessline-markets", "BusinessLine — Markets", "https://www.thehindubusinessline.com/markets/?service=rss"],
  ].map(([id, name, url]) => ({
    id,
    name,
    publisher: name.split(" — ")[0],
    authority: "business_media",
    category: "Market news",
    url,
    format: "Publisher RSS",
    frequency: "Every three hours",
    collectionStatus: "active",
    investorValue: "Timely reporting and context around companies, sectors, earnings and markets.",
    usePolicy: "Store headline, supplied summary, timestamp and link only; the publisher remains the reading destination.",
  })),
  {
    id: "licensed-prices",
    name: "Live and delayed prices, index values and corporate-action adjusted history",
    publisher: "Exchange-authorised market-data vendor",
    authority: "licensed_vendor",
    category: "Market data",
    url: null,
    format: "Licensed API/feed",
    frequency: "Per contract",
    collectionStatus: "licensed",
    investorValue: "Reliable prices, total returns, valuation snapshots and portfolio marking.",
    usePolicy: "Do not collect or display until a contract explicitly covers end-user redistribution.",
  },
];

export function getStockSourceSummary(sources = STOCK_SOURCES) {
  return sources.reduce(
    (summary, source) => {
      summary.total += 1;
      summary[source.collectionStatus] = (summary[source.collectionStatus] || 0) + 1;
      summary.categories.add(source.category);
      return summary;
    },
    { total: 0, active: 0, ready: 0, reference: 0, review: 0, licensed: 0, categories: new Set() }
  );
}

export function groupedStockSources(sources = STOCK_SOURCES) {
  return [...sources]
    .sort((a, b) => SOURCE_STATUS[a.collectionStatus].rank - SOURCE_STATUS[b.collectionStatus].rank || a.publisher.localeCompare(b.publisher))
    .reduce((groups, source) => {
      (groups[source.category] ||= []).push(source);
      return groups;
    }, {});
}
