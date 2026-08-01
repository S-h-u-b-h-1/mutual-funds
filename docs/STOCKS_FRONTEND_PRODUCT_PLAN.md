# Stocks Frontend Product Plan

Date: 2026-08-01

## Product boundary

Stocks is a first-class MF Pulse product area for research, discovery, portfolio intelligence,
watchlist and learning. It is intentionally separate from mutual-fund execution under Suasion
Invest. The frontend must not expose Buy, Sell or Place Order controls until a real stock broking
backend exists.

## Public benchmark takeaways

- Tijori-inspired pattern: operational metrics, sector intelligence, raw-material context,
  source links, timeline and watchlist.
- Screener-inspired pattern: long financial history, deterministic screening, filings/events,
  peer comparison and watchlist.
- ValuePickr-inspired pattern: deep thesis culture, management quality, risks, annual-report
  reading and learning frameworks.

These are product patterns only. MF Pulse should retain its own visual system and must not copy
branding, layout or proprietary data.

## Implemented frontend routes

- `/stocks` — stock research home, company discovery, screens, learning entry points and explicit
  no-trading boundary.
- `/stocks/screener` — backend-screen driven UI with criteria explanation and honest no-match
  states.
- `/stocks/sectors` — sector directory using sector/company/operating-metric contracts.
- `/markets` — market context landing page.
- `/markets/raw-materials` — commodity contract-ready surface with no live-feed claim.
- `/learn/stocks` — stock research learning frameworks and private-note taxonomy.

## Backend dependencies still required for complete public launch

- Populated company universe with sector/industry mapping.
- Financial statements and precomputed metrics coverage for common screens such as ROCE, debt,
  growth, cash-flow and dividend yield.
- Licensed/public price feed with source, as-of time and freshness.
- Company timeline ingestion for results, filings, concalls, corporate actions, management changes
  and important announcements.
- Commodity contracts for commodity, price, unit, location, date, trend and source.
- User-facing stock watchlist and private research-note API integration.
- Stock portfolio APIs for holdings, average cost, current value, gain/loss and allocation once
  backend price truth exists.
