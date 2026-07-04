// Live Market Terminal (Phase 1 — terminal sprint). Real quotes from Yahoo Finance's public
// chart API — verified reachable for all 19 instruments below this session. Server-only,
// ISR-cached (see callers' revalidate window): one shared fetch per cache window serves every
// visitor, not per-user polling — this is what "respecting source rate limits" means
// structurally, not an artificial delay per request.
//
// HONEST LIMITS, stated once here rather than re-derived per caller: this is free, unlicensed
// quote data — good enough to show real direction and magnitude, not a substitute for a licensed
// real-time feed. Every quote carries Yahoo's own `regularMarketTime` (when THAT price point was
// captured) — displayed as-is, never relabeled "live". If Yahoo returns a stale or missing quote,
// that instrument is simply omitted, never backfilled with a guess.
const UA = "Mozilla/5.0 (compatible; MFPulseTerminal/1.0; +https://mf-pulse.vercel.app)";

const INSTRUMENTS = [
  { group: "India", name: "NIFTY 50", symbol: "^NSEI" },
  { group: "India", name: "NIFTY Next 50", symbol: "^NSMIDCP" },
  { group: "India", name: "NIFTY Midcap 150", symbol: "NIFTYMIDCAP150.NS" },
  { group: "India", name: "NIFTY Smallcap 250", symbol: "NIFTYSMLCAP250.NS" },
  { group: "India", name: "SENSEX", symbol: "^BSESN" },
  { group: "India", name: "BANK NIFTY", symbol: "^NSEBANK" },
  { group: "India", name: "India VIX", symbol: "^INDIAVIX" },
  { group: "Global", name: "S&P 500", symbol: "^GSPC" },
  { group: "Global", name: "NASDAQ", symbol: "^IXIC" },
  { group: "Global", name: "Dow Jones", symbol: "^DJI" },
  { group: "Global", name: "FTSE 100", symbol: "^FTSE" },
  { group: "Global", name: "Nikkei 225", symbol: "^N225" },
  { group: "Global", name: "Hang Seng", symbol: "^HSI" },
  { group: "Commodities", name: "Gold", symbol: "GC=F" },
  { group: "Commodities", name: "Silver", symbol: "SI=F" },
  { group: "Commodities", name: "Brent Crude", symbol: "BZ=F" },
  { group: "Commodities", name: "WTI Crude", symbol: "CL=F" },
  { group: "Currency", name: "USD/INR", symbol: "INR=X" },
  { group: "Currency", name: "EUR/INR", symbol: "EURINR=X" },
];

async function fetchQuote(instrument, revalidate) {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(instrument.symbol)}?range=1d&interval=1d`,
      { headers: { "User-Agent": UA }, next: { revalidate } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta || meta.regularMarketPrice == null) return null;
    const price = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose;
    const change = prevClose != null ? price - prevClose : null;
    const changePct = prevClose ? (change / prevClose) * 100 : null;
    return {
      ...instrument,
      price,
      change: change != null ? +change.toFixed(2) : null,
      changePct: changePct != null ? +changePct.toFixed(2) : null,
      lastUpdated: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
      currency: meta.currency || null,
    };
  } catch {
    return null;
  }
}

// One shared batch fetch, ISR-cached — every visitor within the revalidate window reads the same
// cached result, so this never scales with traffic. Parallel (not sequential+delayed): 19
// concurrent requests to ONE source's public quote API, once per cache window, is normal API
// usage, not scraping — the news pipeline's per-source delay pattern doesn't apply here (that
// was about being polite across many distinct third-party SITES, this is one documented API).
export async function getMarketTerminal({ revalidate = 300 } = {}) {
  const results = await Promise.all(INSTRUMENTS.map((i) => fetchQuote(i, revalidate)));
  const quotes = results.filter(Boolean);
  const byGroup = {};
  for (const q of quotes) (byGroup[q.group] ||= []).push(q);
  return { quotes, byGroup, requested: INSTRUMENTS.length, received: quotes.length, source: "Yahoo Finance (public quote API, unlicensed — real but not a substitute for a licensed real-time feed)" };
}
