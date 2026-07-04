# MF Pulse — Decision Support Sprint: Final Audit

> **Positioning:** Decision support, not advice. Every surface answers *"what deserves my
> research attention, and why"* — never *"what should I buy."* Suasion Securities remains the
> only place a real recommendation can come from, and only after the reader asks for one.

## What shipped this sprint

| Phase | Feature | Real data backing | Verdict |
|---|---|---|---|
| 1 | Research Priority Score (0–100, 4-signal weighted blend) | Attention Score (real rank movement), AMC percentile, news relevance, own-trend — coverage varies per fund, shown honestly via confidence label | Real, deterministic, self-explaining |
| 2 | "Why This Fund Deserves Attention" (fund pages) | Category rank 3M→1M, top linked news article, cross-AMC standing — each with metric/source/timestamp | Real; extends existing `attention_score()` engine rather than duplicating it |
| 3 | Today's Research Queue | Same `daily.explained` engine already on the homepage | Confirmed pre-existing, not rebuilt; added missing cross-link to `/dashboard` |
| 4 | Workflow cross-link audit | 7-link chain (Market→Category→AMC→Fund→Compare→Research→Watchlist→Advisor) | 6 of 7 already real; fixed the one real gap (Compare→Research); rejected a false-positive (Watchlist — `WatchButton.jsx` already covers fund/AMC pages, full widget correctly stays homepage-only) |
| 5 | Decision Timeline | Fund-page attention reasons, now sorted chronologically (most recent first) | **Deliberately not a separate component** — see Honest Scoping below |
| 6+9 | Research History + personalization | `sessionMemory.js` (localStorage): recent views, searches, comparisons, preferred categories/AMCs | Real, anonymous, already existed; extended with comparison tracking |
| 7 | Confidence labels (High/Medium/Limited Data) | Coverage-count + freshness-gated, never a performance claim | Real, applied everywhere Research Priority Score appears |
| 8 | Discovery Engine | Added "Steady compounders" (consistency × real 3M return) to existing `/discover` | One new, genuinely differentiated angle — see Honest Scoping for what was deliberately excluded |
| 10 | Research Dashboard (`/dashboard`) | Reuses Research Queue, category/AMC rotation, Research History, Saved Comparisons, headlines | Real; zero new data sources, one new lens |
| 11 | Suasion CTA engagement gate | `AdvisorSoftCTA` now hidden until 3+ funds/AMCs/categories viewed (localStorage) | Verified: hidden at 1 view, shown at 4, correct contextual headline per page |

## Quality evaluation

**Investor usefulness — high.** A visitor can now find *"what's worth investigating today"* (Queue), *"why this specific fund"* (Attention reasons + Priority Score), and *"where do I go next"* (workflow chain, Dashboard) without hitting a dead end.

**Advisor/analyst usefulness — medium-high.** AMC standing, category rotation, and Steady Compounders give an advisor real conversation-starters. Ceiling is the same one that limits everything else this audit: metadata (manager, holdings, benchmark identity) is real for 152 of 14,208 funds.

**Decision support quality — high, honestly bounded.** Every score explains itself (breakdown, source, timestamp). Confidence labels mean the system never implies certainty it doesn't have — verified concretely: 572 funds have a real Attention Score, 1,175 have real category percentile, 4,002 have real consistency; everything else correctly shows "Limited Data" rather than a fabricated number.

**Workflow quality — high.** The 7-step chain audit found 6 real links out of the box and one genuine gap, now fixed. No page in the golden path (Market → Fund → Compare → Advisor) strands the user.

**Retention potential — medium, growing.** Research History, Saved Comparisons, and the Dashboard give a real reason to return (localStorage persists across visits on the same browser). Ceiling: no accounts yet, so nothing survives a browser switch — Phase 6's own design already anticipated this ("anonymous today, user-specific after login").

**Commercial readiness — medium.** The Suasion pipeline (lead form → `advisor_leads`, interest-area tagging, now-qualified by engagement) is real and already wired to a real backend table. What's missing for real commercial scale is broader factsheet coverage (see Q4) and accounts (so a lead can be tied to a research history, not just a form submission).

## Noisy/redundant features considered — and rejected

- **Homepage / Dashboard / Discover all surface `daily.explained`-derived signals.** Kept — each has a different job (homepage = broadest-audience teaser, Dashboard = personal workspace bundling it with history/comparisons, Discover = one browsing angle among several). Removing any one would create a dead end, not reduce noise.
- **A separate "Decision Timeline" UI component.** Rejected — the existing "Why This Fund Deserves Attention" reasons list already contains the only two real, dated event types (category movement, news). A second component showing the same 1–2 data points under a different name would be redundant chrome, not new information.
- **A bulk "Research completeness" discovery list.** Rejected — `metadata.json` is 100% SBI Mutual Fund (152 of 14,208 funds). Ranking "most researched" today would just rank "is this fund SBI," which isn't a real signal and would erode trust the moment a user noticed the pattern.
- **A bulk "Highest Alpha/Sharpe" or numeric benchmark-relative discovery list.** Rejected — real Alpha/Beta/Treynor (`riskMetrics.js`) requires a full NAV series fetched live per fund, and only applies cleanly against the two indices actually ingested (Nifty 50, Sensex). Computing this in bulk across 14,208 funds isn't honestly possible without new infrastructure this sprint didn't build.

## Honest scoping: Decision Timeline & Discovery Engine

Both were assessed against real data depth before writing any code:

- `factsheet_archive` holds **exactly one snapshot per scheme** (confirmed in `archive_factsheets.py`'s own docstring) — `detect_changes()` is fully built and wired into dual-write, but has nothing to compare yet. Manager/benchmark/holdings-change events will appear automatically the next time the factsheet archiver runs against a scheme it's already snapshotted — no new code needed, just time.
- `rank_snapshots.jsonl` holds **exactly two distinct dates** (2026-06-23, 2026-06-30) — enough for the one rank-transition Attention Score already uses, not enough for a multi-point trend line.
- Given this, Decision Timeline ships as the existing attention-reasons list, now sorted chronologically with an explicit note on what extends it and when — not a new widget overclaiming history that doesn't exist.
- Discovery Engine ships one new angle (Steady Compounders) that's honestly supportable at full scale (2,183 qualifying funds) instead of three angles that would either be thin, misleading, or require infrastructure out of scope.

## The four strategic questions

**1. What decisions can MF Pulse now help an investor make?**
Which fund, category, or AMC deserves a closer look *today*, and why (Research Priority Score + sourced reasons) — not whether to buy it. Whether a fund's recent movement is real signal or noise (attention reasons vs. silence when nothing qualifies). How a fund stacks up against category peers and its AMC's cross-house standing. How a market-moving news event connects to specific categories, AMCs, or funds worth re-examining. Which funds are compounding steadily vs. just having one hot month. Where to pick a multi-session research thread back up.

**2. What decisions does it intentionally avoid making?**
Buy/sell/hold, "best fund," or portfolio allocation — never surfaced anywhere, including in this sprint's new copy ("never what to buy" is printed on the Dashboard itself). It refuses to imply certainty it doesn't have: Confidence labels downgrade to "Limited Data" rather than showing a number backed by thin coverage. It won't fabricate history — Decision Timeline stops exactly where real archived data stops, with that limit stated plainly rather than papered over. It won't rank funds by "research completeness" or Alpha when the underlying data would make that ranking an artifact of which AMC happened to be scraped, not a real signal.

**3. How does this strengthen future Suasion Securities integration?**
The engagement gate means the advisor CTA now only reaches visitors who've done real research (3+ items viewed) — a qualified lead, not a cold one. The sourced, dated "why this deserves attention" reasons give an advisor a ready-made opening line instead of a blind cold-open. The existing interest-area field on the lead form (already tied to Portfolio review / Fund selection / Understanding a fund / General guidance) pre-sorts what the conversation should be about. Longer-term, once accounts exist, a user's Research History becomes literally the brief an advisor would want before a call.

**4. What remaining capabilities are needed before introducing AI-powered research assistance?**
In priority order: (a) factsheet coverage beyond one AMC — an assistant fielding "why did this fund's strategy change" for 99.9% of funds with no factsheet data would have to refuse or guess; (b) a second factsheet-archive cycle, so `detect_changes()` has real transitions to describe instead of none; (c) more rank-snapshot history than two dates, so trend/momentum claims rest on more than one data point; (d) a persisted history of daily market-regime state (today only "now" is kept); (e) the Confidence-label system formalized as a hard constraint the assistant must obey — it should hedge or refuse exactly where the deterministic layer already says "Limited Data," never override that with a fluent-sounding guess. Every one of these is a data-depth gap, not a missing algorithm — the deterministic scoring, sourcing, and confidence infrastructure this sprint built is already the right foundation for an AI layer to sit on top of, once it has more to work with.
