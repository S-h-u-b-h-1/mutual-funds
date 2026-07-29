# Multibagg.ai vs MF Pulse — Comprehensive Competitive Study & UX Research

**Research Date**: 2026-07-29  
**Target Benchmarks**: Multibagg.ai (`https://www.multibagg.ai`) vs MF Pulse (`https://mf-pulse.vercel.app`)  
**Methodology**: Public Surface Audit, Information Architecture Reverse-Engineering & Comparative Data Modeling  
*(Note: Zero proprietary assets copied; all analysis grounded strictly in publicly accessible UX/UI semantics).*

---

## 1. Executive Summary & Core Insights

Multibagg.ai is a fast-growing, AI-native Indian equity research platform (featured on *Shark Tank India Season 5*). It positions itself as an intelligent workspace for stock market investors by combining **corporate filing search (concalls, annual reports)**, **AI-driven thematic discovery**, **real-time announcement timelines**, and **conversational AI ("Ask Iris")**.

While Multibagg targets **direct equities, IPOs, and ETFs**, MF Pulse targets **mutual funds, AMCs, SIPs, portfolio revaluation, and transaction execution**.

Despite operating in different asset classes, Multibagg's UX patterns offer profound lessons for mutual fund investors—specifically around **reducing cognitive overload**, **surfacing timely catalyst events**, and **transforming static holdings into active intelligence**.

---

## 2. Research Questions: Multibagg Experience Breakdown

### Q1: Why does Multibagg feel smooth?
- **Next.js App Router Architecture**: Uses aggressive client-side route prefetching and streaming UI chunks.
- **Glassmorphism & Micro-animations**: Employs dark-mode default aesthetics with subtle border glows, skeleton loaders, and non-blocking background AI streaming responses.
- **Unified Command Bar**: A global persistent search shortcut ("Search stocks, ETFs, IPOs & more") accessible across every page.

### Q2: What is the primary Information Architecture (IA)?
Multibagg's IA is structured into 4 distinct pillars:
1. **Intelligence Hub**: Ask Iris (Conversational AI), Timeline (NSE/BSE filings feed), Alerts.
2. **Investors' Suite**: Portfolio Dashboard, Watchlist, Discovery (Thematic buckets like EV, Semiconductors, Defense).
3. **Market Pulse / Toolkit**: Market Explorer, Stock Screener, Concall Monitor, Earnings Tracker, FII/DII flow activity, Bulk & Block deals.
4. **Gamified Onboarding**: Quest (Daily engagement streak, diamond rewards, platform feature discovery).

### Q3: What are the main user journeys?
1. **Search & Evaluate**: Home → Search Stock → Stock Detail (Fundamentals, Concalls, Valuation) → Add to Watchlist / Portfolio.
2. **Thematic Discovery**: Home → Discovery → Select Theme (e.g. "Defense / Drones") → Filter Companies → Iris AI Analysis.
3. **Event Monitoring**: Investor's Suite → Timeline → Filter by Portfolio/Watchlist → Read Summarized Exchange Filings / Concalls.
4. **AI Deep Dive**: Ask Iris → Select Prompt ("Analyze Q3 concall for TATA Motors") → Grounded Document Analysis.

### Q4: How does it get users from research to portfolio?
- **One-Click Watchlist / Holding Addition**: Every stock detail page features an omnipresent "+ Add to Portfolio / Watchlist" trigger.
- **Contextual Prompts**: When viewing a stock, Iris suggests: "Add to portfolio to track filings in your personalized Timeline."

### Q5: How does it get users from portfolio to insight?
- **Portfolio Health & Risk Decomposition**: Portfolio is not just a value tracker; it breaks down sector concentration, market-cap drift, and earnings surprise risk.
- **Timeline Filtering**: Automatically filters exchange announcements to match only the companies inside the user's uploaded portfolio.

### Q6: How does it introduce AI?
- **Ask Iris Interface**: Positioned as a core navigation item (not a hidden chat widget).
- **Grounded Citation Engine**: Iris cites exact pages from annual reports, BSE filings, and earnings call transcripts (100,000+ indexed documents).

### Q7: How does it teach investors?
- **Concall Monitor & Summaries**: Translates 60-minute dense management conference calls into 3-minute executive bullet points.
- **Quest System**: Educational onboarding cards that reward users for exploring screeners, setting alerts, and linking portfolios.

### Q8: How does it handle empty states?
- **Sample/Demo Datasets**: Rather than a blank canvas, empty portfolios display a "Load Sample Portfolio" or "Explore Popular Watchlists" CTA with immediate preview charts.

### Q9: How does it use search?
- **Omnipresent Search Modal**: Pressing `/` or clicking the top search bar opens a rich modal with recent searches, trending themes, and quick stock metrics.

### Q10: How does it use Timeline?
- **Chronological Filing Stream**: Consolidates corporate announcements, insider trades, and board meetings into a Twitter/X-style feed tagged by sentiment and urgency.

### Q11: How does it use Discovery?
- **Thematic Buckets**: Replaces cold screeners with narrative themes (e.g. "India Semiconductor Push", "AI Infrastructure").

### Q12: How does it use Alerts?
- **Multi-Channel Triggers**: Triggers on price breakouts, concall transcript uploads, FII institutional movements, and earnings release dates.

### Q13: How does it use Onboarding/Quest?
- **Progressive Unlocking**: Users earn "Diamonds" by performing actions (e.g. creating 1st watchlist, running 1st screener), gamifying power-user features.

### Q14: How much data is shown per screen?
- **High Density with Accordions**: Uses visual hierarchy (large key metrics at top, collapsible tabs for financials, transcripts, and peer comparisons below).

### Q15: What is progressive vs immediately visible?
- **Immediately Visible**: Price, 1D/1Y return, P/E ratio, market cap, AI summary snippet.
- **Progressive**: Detailed balance sheets, concall transcripts, historical FII data, technical indicators.

### Q16: What might its backend/data architecture look like?
- **Exchange Ingestion**: Real-time websocket feed from NSE/BSE.
- **Document Processing Pipeline**: OCR + PDF parser + vector database (Pinecone/Qdrant) for filings and concall transcripts.
- **Relational DB**: Postgres for user accounts, portfolios, watchlists, and transaction ledgers.

### Q17: What freshness model does its UX imply?
- **Live / Delayed Feeds**: Live tick data for prices during market hours; instant indexing (within 5 minutes) for corporate filings.

### Q18: What portfolio-sync model does it imply?
- **Broker API Integration**: Supports direct broker login (Zerodha, Groww, AngelOne) via OAuth + CAS PDF fallback.

### Q19: What capabilities translate well from stocks to mutual funds?
- **Thematic Discovery**: Grouping funds by themes (e.g. "Flexi-Cap Multibaggers", "High Active Share", "Low Expense Champions").
- **Portfolio Timeline**: Fund manager changes, portfolio constituent shifts, AMC regulatory notices, quarterly scheme commentary.
- **AI Research Assistant**: Conversational fund comparison, scheme overlap analysis, SID/KIM document querying.

### Q20: What capabilities do NOT translate well?
- **Intraday Price Breakouts / Concall Summaries**: Mutual funds price once per day (NAV); AMCs do not host quarterly earnings calls for individual funds.
- **Technical Charting Patterns**: Candlestick patterns (RSI, MACD) are meaningless for long-term mutual fund NAVs.

---

## 3. Section-by-Section Feature Comparison Matrix

| Feature / Page Area | Multibagg.ai | MF Pulse (Production) | Comparative Classification |
|---|---|---|---|
| **Homepage** | Interactive hero with Iris AI chat preview, trending themes, Shark Tank banner | Live Terminal market workspace, ticker tape, daily brief, sector signals | **ROUGHLY EQUAL** (Different Asset Classes) |
| **Navigation & Shell** | Clean dark header, search input, top menu + drawer | Sticky `NavChrome` with Market Status badge, Invest hub, Quick Search | **ROUGHLY EQUAL** |
| **Search Experience** | Global modal searching stocks, ETFs, IPOs | Instant name-first search (`/funds`) supporting scheme names & AMCs | **MF PULSE STRONGER** (Scheme Name Search) |
| **Fund / Asset Detail Page** | Deep stock fundamental tabs, concall transcripts, peer charts | Detailed fund metrics, NAV history, expense ratio, holdings breakdown, riskometer | **ROUGHLY EQUAL** |
| **AMC / Company Page** | Detailed sector/industry index & concall monitor | AMC list, category breakdown, performance benchmarks | **MULTIBAGG STRONGER** (Concall/Document depth) |
| **Portfolio Dashboard** | Broker sync, asset allocation, sector drift, risk breakdown | Consolidated portfolio, XIRR, invested vs current value, holding breakdown | **MF PULSE STRONGER** (Execution & Account Readiness) |
| **Portfolio Import** | Broker OAuth sync + CAS import | CAMS / KFintech CAS PDF parser, multi-report handling, ISIN mapping | **MF PULSE STRONGER** (Native CAS Import Engine) |
| **Timeline Feed** | Real-time NSE/BSE corporate filings, insider trades feed | Market story, category signals, daily financial news feed | **MULTIBAGG STRONGER** (Filing Timeline) |
| **Watchlist & Alerts** | Multi-list watchlists, price & filing alert notifications | Personal watchlist, holding alerts, event bus dispatch | **ROUGHLY EQUAL** |
| **AI Experience** | Ask Iris (Vector search over 100k corporate documents) | Morning Brief summaries, category signal highlights | **MULTIBAGG STRONGER** (Ask Iris Conversational AI) |
| **Invest & Execution** | Direct broker execution links (redirect to Zerodha/Upstox) | Full native order engine (Purchase, SIP, Redeem, Switch, Payment attempt) | **MF PULSE STRONGER** (Native Transaction Engine) |
| **Onboarding & Compliance**| Gamified Quest system (Diamonds, daily rewards) | 11-step formal compliance (PAN, Bank, Nominee, FATCA, PEP, Risk Profile) | **MF PULSE STRONGER** (Regulatory Compliance Engine) |
| **Workspaces (Advisor/Ops)**| Single-investor focused (B2C) | Multi-role workspaces (Investor, Advisor, Operations, Management) | **MF PULSE STRONGER** (Institutional Workspaces) |
| **Mobile & Responsive** | Fully responsive dark UI, mobile drawer | Responsive flex layouts across 9 viewports, zero navbar overlap | **ROUGHLY EQUAL** |

---

## 4. Customer Value Loop Mapping

### Multibagg's Stock Investor Loop
```
Search Stock / Theme
        │
        ▼
Ask Iris / Read Concall
        │
        ▼
Add to Watchlist / Sync Broker
        │
        ▼
Receive Filing Timeline Alerts
        │
        ▼
Adjust Equity Allocation
```

### Best MF Pulse Mutual Fund Investor Loop
```
Learn & Discover (Categories & Themes)
        │
        ▼
Compare Funds & Fund Manager Track Record
        │
        ▼
Import Existing CAS Portfolio
        │
        ▼
Understand Portfolio Overlap & Revaluation
        │
        ▼
Complete 11-Step Onboarding Readiness
        │
        ▼
Execute Purchase / SIP / Switch / Redeem
        │
        ▼
Track Revalued Portfolio & Timeline Activity
```

---

## 5. Feature Translation Framework (Stock → Mutual Fund)

1. **Company Concall Transcripts → AMC Scheme Commentary & Manager Change Notices**: Synthesize monthly AMC factsheets and fund manager interviews into digestible summaries.
2. **Stock Screeners → Mutual Fund Matrix Screener**: Filter funds by Active Share, Rolling Returns Consistency, Sharpe Ratio, Expense Ratio, and Downside Capture.
3. **Corporate Filing Timeline → Scheme Change & Regulatory Timeline**: Track SID/KIM addendums, benchmark changes, exit-load structure updates, and fundamental attribute changes.
4. **Ask Iris Stock AI → MF Pulse AI Portfolio Advisor**: Natural language assistant to answer questions like: *"Which of my 5 funds have overlapping stocks?"* or *"Compare Parag Parikh vs HDFC Flexi Cap."*

---

## 6. Data Architecture Comparison

| System Domain | Multibagg (Observed / Inferred) | MF Pulse (Observed & Verified) |
|---|---|---|
| **Market Data Ingestion** | Websocket stream from NSE/BSE + corporate filing scrapers | AMFI daily `NAVAll.txt` + Postgres `fact_nav_daily` (145k rows) |
| **Portfolio Sync** | Broker OAuth APIs (Kite Connect, Groww) + PDF import | Native CAMS/KFintech CAS PDF parser with ISIN & scheme resolution |
| **Event Timeline** | Vector database (Pinecone) over 100k SEC/BSE filings | EventBus event dispatch, Postgres `jobs` queue, category signals |
| **AI Context Engine** | RAG (Retrieval-Augmented Generation) on corporate PDFs | Static JSON bundles (`funds.json`, `daily.json`) + LLM signals |
| **Freshness Model** | Real-time intra-day prices + instant filing ingestion | Daily end-of-day NAV snapshot with automated GHA deployment |
