# Financial News Source Report

Investigated and verified live during the realtime-market-intelligence sprint (2026-07-02).
Every source below was actually fetched and inspected — nothing here is assumed. Sources that
looked promising but didn't work are listed too, so nobody re-discovers the same dead end.

Guiding constraint from the mission brief: *"Do not scrape aggressively. Respect source terms.
Prefer RSS, APIs, official public feeds, and lightweight fetches."* Every source implemented
below is RSS, a public JSON API, or an official regulator feed — none involve HTML scraping,
header-spoofing to bypass a block, or proxies. Where a source blocked us (403), we treated that
as a hard stop and documented it as unavailable rather than working around it.

## Implemented — active in `scripts/ingest_news.py`

| Source | Access method | Credibility | Update cadence | Fields available | Status |
|---|---|---|---|---|---|
| Economic Times — Markets | RSS (`/markets/rssfeeds/1977021501.cms`) | tier1_business | Continuous, tens of items/day | title, link, description, pubDate | ✅ Implemented |
| Economic Times — Mutual Funds | RSS (`/mf/rssfeeds/359241701.cms`) | tier1_business | Several/day | title, link, description, pubDate | ✅ Implemented |
| Economic Times — Economy | RSS (`/news/economy/rssfeeds/1373380680.cms`) | tier1_business | Several/day | title, link, description, pubDate | ✅ Implemented |
| Mint (Livemint) — Markets | RSS (`livemint.com/rss/markets`) | tier1_business | Continuous | title, link, description, pubDate | ✅ Implemented |
| Mint (Livemint) — Money | RSS (`livemint.com/rss/money`) | tier1_business | Continuous | title, link, description, pubDate | ✅ Implemented |
| CNBC-TV18 — Markets | RSS (`cnbctv18.com/commonfeeds/v1/cne/rss/market.xml`) | tier1_business | Continuous, high volume (~200 items/pull) | title, link, description, pubDate | ✅ Implemented |
| RBI — Press Releases | RSS (`rbi.org.in/pressreleases_rss.xml`) | official (regulator) | Multiple/day on policy days, sparse otherwise | title, link, description, pubDate | ✅ Implemented |
| SEBI — Press Releases | RSS (`sebi.gov.in/sebirss.xml`) | official (regulator) | Several/week | title, link, description, pubDate | ✅ Implemented |

All 8 re-verified reachable in this session (2026-07-02): each returned HTTP 200 with well-formed
RSS/XML and real, current articles (e.g. CNBC-TV18 returned 200 live items; ET Mutual Funds'
latest was "Edelweiss AMC crosses Rs 1 lakh crore equity AUM milestone"; RBI's latest was a
Citizen's Charter status release). Legality: all are the publisher's own RSS endpoint, designed
for syndication — no terms were bypassed. Fetch pattern is one GET per source per run with a
1-second pause between sources ("light, polite fetcher, not a rapid-fire scraper").

**Limitation, stated plainly:** none of these RSS feeds carry structured sentiment, tickers, or
market-reaction data — that's why `ingestion/market_reaction.py` exists as a separate,
deterministic, keyword-based classification layer on top of the raw title/summary text (see
below). The feeds also only expose a rolling window of recent items (no historical backfill) —
history accumulates in `news_articles` from the point ingestion starts, it isn't backfilled.

## Investigated, verified live, not yet wired into the ingestion script

These are real, working, legitimate sources found during this sprint's investigation. They are
documented here as ready-to-implement rather than implemented now, since Phase 3's schema/scope
was scoped to news articles specifically; wiring these in is a natural next increment.

| Source | Access method | Credibility | What it provides | Status |
|---|---|---|---|---|
| NSE — Corporate Announcements API | JSON API, `nseindia.com/api/corporate-announcements?index=equities` (requires a warm-up GET to the NSE homepage first, to obtain the necessary cookies before the API call succeeds) | official (exchange) | Real corporate announcements/disclosures (earnings, press releases, etc.), including attachment PDF URLs | Verified reachable (200, real live data) — not yet ingested |
| Yahoo Finance — Index quotes | JSON API, `query1.finance.yahoo.com/v8/finance/chart/^NSEI` (Nifty 50), `^BSESN` (Sensex) | tier1_business (aggregator, not a primary source) | Real-time-ish index price, day high/low, 52-week range | Verified reachable (200, real live quote) — not yet ingested; note this is a quote snapshot, not news, so it would feed a market-status widget rather than `news_articles` |

Both are lightweight (single GET, JSON, no scraping of rendered HTML) and consistent with the
"prefer APIs" instruction. Not wiring them in now avoids scope creep on the news-ingestion schema
(they don't produce "articles") — the honest thing is to list them as validated options for a
future increment rather than force-fit them into `news_articles`.

## Investigated, found unavailable — documented, not forced

| Source | What was tried | Result | Why we didn't force it |
|---|---|---|---|
| Moneycontrol RSS | Standard RSS endpoints | HTTP 403 "Access Denied" | Bot-blocked by WAF. Circumventing a 403 with header-spoofing or proxies would violate "respect source terms" — treated as a hard stop, not a puzzle to solve. |
| Business Standard RSS | Standard RSS endpoints | HTTP 403 "Access Denied" | Same as above — bot-blocked, respected as-is. |
| AMFI — RSS feed | `/rssfeed`, `/rss.xml`, `/investor-corner/knowledge-center/rss` | All 404 | No discoverable RSS feed exists. AMFI's actual value to this project is structured NAV data, already ingested separately via `scripts/cloud_pipeline.py` — not news. |
| BSE — Announcements API | `api.bseindia.com/BseIndiaAPI/api/AnnGetData/w?...` | HTTP 404 | Endpoint appears deprecated/wrong. Not chased further since NSE's announcements API (above) already covers the same real need — corporate disclosures — and works. |

## Architecture notes

- **Dedup**: by `url` (unique constraint, `on_conflict=url` + `ignore-duplicates`) as the primary
  key, with a `title_hash` (SHA-256 of the normalized title, first 16 hex chars) stored on every
  article as a fallback signal for catching the same story syndicated under two different URLs.
  A re-run of `ingest_news.py` against unchanged feeds is a no-op for existing articles — history
  is never lost or rewritten.
- **Classification is deterministic, not AI**: `ingestion/market_reaction.py` runs 18 keyword
  rules (`RULES`) over each article's title+summary; every category/entity link that gets stored
  carries the exact `rule_id` that produced it, so nothing in `news_market_links` is a model
  guess — it's traceable to an inspectable keyword match. Sentiment is a keyword lexicon
  (`method: 'keyword_lexicon_v1'` stored on every `news_sentiment` row), explicitly not claimed
  to be an ML sentiment model.
- **Precision over recall, by design**: during verification, one real false positive was found
  and fixed — the `sebi_mf_circular` rule originally matched on "asset management compan[y]",
  which fired on routine AMC business news (e.g. an AUM-milestone story) that has nothing to do
  with SEBI regulation. The rule now requires an explicit SEBI-specific phrase
  ("sebi circular", "sebi mutual fund", "sebi guidelines", etc.). The tradeoff this produces is
  intentional and worth stating honestly: the engine will sometimes miss a real story that uses
  unusual phrasing (e.g. "Eight banks react to their Q1 business updates" does not match
  `banking_earnings`, since it lacks the exact trigger phrases the rule looks for) rather than
  risk a false, misleading connection. Given the "no hallucinated claims" requirement, under-
  connecting is the safer failure mode than over-connecting.
- **Auth**: writes go through the Supabase service-role key (`SUPABASE_SERVICE_ROLE_KEY`),
  scoped to CI only (GitHub Actions secret), same pattern as `scripts/cloud_pipeline.py`. The
  anon key used by the frontend has read-only RLS policies on all 6 news tables — no insert/
  update/delete path exists for it, verified live against `pg_policies` when the schema was
  applied.
