# MF Pulse — Product Experience Roadmap (30-Day Execution Plan)

**Document Date**: 2026-07-29  
**Goal**: Transform MF Pulse from a fast research tool into the premier Indian Mutual Fund Operating System.

---

## 1. Priority Execution Matrix

```
[P0: Frictionless Core Flow] ──▶ [P1: Portfolio Intelligence & AI] ──▶ [P2: Timeline & Discovery] ──▶ [P3: Institutional Monetization]
```

---

## 2. Phase Breakdown

### P0 — Core Customer Flow & Transaction Integrity (Days 1–7)
- **Zero-Friction Search-to-Invest**: Ensure scheme search by human name leads directly to purchase/SIP drawer with pre-filled scheme parameters.
- **CAS PDF One-Click Import**: Streamline CAS upload error messages and show progress state during multi-report parsing.
- **Onboarding Progress Bar**: Display a visual 11-step progress bar on `/invest/onboarding` so users know their exact readiness percentage.

### P1 — Portfolio Intelligence, Research & AI (Days 8–18)
- **Scheme Overlap Visualizer**: Analyze portfolio holdings across equity funds to calculate true stock-level concentration (e.g. *"4 of your 5 funds hold HDFC Bank, accounting for 18% of your portfolio"*).
- **MF Pulse AI Assistant ("Ask Pulse")**: Conversational RAG interface allowing investors to query scheme SID/KIM documents, compare funds, and understand exit loads in plain English.
- **Rolling Returns & Downside Protection Metrics**: Add 3Y/5Y rolling return consistency charts and downside capture ratios to `/fund/[scheme_code]`.
- **Investor Education Snippets**: Contextual tooltips explaining XIRR vs CAGR, Direct vs Regular expense ratio savings, and Growth vs IDCW taxation.

### P2 — Discovery, Timeline & Advisor Workspace (Days 19–25)
- **Thematic Fund Buckets**: Introduce narrative discovery sections on `/discover` (e.g. *"Low Expense Ratio Champions"*, *"High Active Share Outperformers"*, *"Tax Saver ELSS Top Picks"*).
- **Scheme Activity Timeline**: Create a dedicated timeline feed for fund manager updates, AMC SID addendums, and benchmark changes.
- **Advisor Client Roster Enhancements**: Expand `/advisor/workspace` to allow advisors to send 1-click SIP recommendation links to assigned investors.
- **Operations Queue Exception Workflows**: Provide 1-click resolution actions for pending KYC verification and failed payment callbacks on `/operations`.

### P3 — Premium Features & Monetization (Days 26–30)
- **Consolidated Family Portfolio View**: Allow investors to aggregate multiple CAS statements for family members under a single dashboard.
- **Tax Loss Harvesting & Capital Gains Reports**: Generate downloadable PDF tax reports detailing realized short-term (STCG) and long-term (LTCG) capital gains.

---

## 3. Top 5 Highest-ROI Changes

1. **Portfolio Overlap Analyzer**: Immediate clarity on duplicate stock exposure across mutual funds.
2. **"Ask Pulse" AI Assistant**: RAG over fund documents to answer complex investor questions instantly.
3. **Thematic Discovery Buckets**: Replaces cold numbers with relatable investment narratives.
4. **Scheme Change Timeline**: Keeps investors informed about fund manager transitions and SID addendums.
5. **1-Click Advisor Recommendation Links**: Bridges the gap between advisors and client execution.
