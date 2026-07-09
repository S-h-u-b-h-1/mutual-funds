"use client";
import { useEffect, useState } from "react";
import { track } from "../lib/track";
import Badge from "./ui/Badge";
import SectionHeader from "./ui/SectionHeader";
import { getWatchlist } from "../lib/cloudSync";

// Local-only on purpose (not routed through cloudSync) — a derived diff-baseline cache specific
// to this browser, not user-authored data. Re-derives fine from scratch on a new device.
const SNAPSHOT_KEY = "mfp_watchlist_snapshot"; // { [code]: last-seen intelligence snapshot }

// Watchlist Intelligence (Personal Operating System sprint, Phase 2 + 9) — "yesterday → today →
// reason", but honestly built: the server has no per-user history, so THIS browser's previous
// snapshot (saved locally the last time this component rendered) is the real "yesterday". A
// first-ever visit has nothing to diff against and says so, rather than faking a baseline.
const MEANINGFUL = { health: 3, attention: 8, amcPercentile: 3 };

function diffFund(curr, prev) {
  if (!prev) return { isFirstView: true, reasons: [] };
  const reasons = [];
  if (curr.healthScore != null && prev.healthScore != null) {
    const d = curr.healthScore - prev.healthScore;
    if (Math.abs(d) >= MEANINGFUL.health) reasons.push({ metric: "Health score", from: prev.healthScore, to: curr.healthScore, tone: d > 0 ? "pos" : "neg" });
  }
  if (curr.attentionScore != null && prev.attentionScore != null) {
    const d = curr.attentionScore - prev.attentionScore;
    if (Math.abs(d) >= MEANINGFUL.attention) reasons.push({ metric: "Attention score", from: prev.attentionScore, to: curr.attentionScore, tone: d > 0 ? "warn" : "pos" });
  } else if (curr.attentionScore != null && prev.attentionScore == null) {
    reasons.push({ metric: "Attention score", from: "none", to: curr.attentionScore, tone: "warn", note: curr.attentionReason });
  }
  if (curr.amcPercentile != null && prev.amcPercentile != null) {
    const d = curr.amcPercentile - prev.amcPercentile;
    if (Math.abs(d) >= MEANINGFUL.amcPercentile) reasons.push({ metric: "AMC standing (percentile)", from: prev.amcPercentile, to: curr.amcPercentile, tone: d > 0 ? "pos" : "neg" });
  }
  if (curr.topNews && (!prev.topNews || prev.topNews.url !== curr.topNews.url)) {
    reasons.push({ metric: "New linked news", from: null, to: curr.topNews.title, tone: "warn", isNews: true, url: curr.topNews.url, source: curr.topNews.source });
  }
  return { isFirstView: false, reasons };
}

function Row({ f, diff }) {
  return (
    <div className="border-b border-line/60 py-3.5 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <a href={`/fund/${f.code}`} className="truncate text-[13px] font-medium text-ink hover:text-accent-soft">{f.name.replace(/ - (Direct|Regular).*/i, "")}</a>
        {f.priorityTier && <Badge tone={f.priorityTier === "High Research Priority" ? "neg" : f.priorityTier === "Medium Research Priority" ? "warn" : "pos"}>{f.priorityTier}</Badge>}
      </div>
      {diff.isFirstView ? (
        <p className="mt-1 text-[11.5px] text-ink-faint">First time tracking this fund on this browser — today&rsquo;s real state shown; changes will appear from your next visit.</p>
      ) : diff.reasons.length === 0 ? (
        <p className="mt-1 text-[11.5px] text-ink-faint">No material change since your last visit.</p>
      ) : (
        <div className="mt-1.5 space-y-1">
          {diff.reasons.map((r, i) => (
            <p key={i} className={`text-[11.5px] leading-relaxed ${r.tone === "pos" ? "text-pos" : r.tone === "neg" ? "text-neg" : "text-warn"}`}>
              <span className="text-ink-muted">{r.metric}:</span>{" "}
              {r.isNews ? (
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted hover:text-ink">
                  &ldquo;{r.to}&rdquo; ({r.source})
                </a>
              ) : (
                <>{r.from} → {r.to}</>
              )}
              {r.note && <span className="text-ink-faint"> — {r.note}</span>}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export default function WatchlistIntelligence() {
  const [state, setState] = useState({ loading: true, funds: [], diffs: {} });

  useEffect(() => {
    let cancelled = false;
    getWatchlist().then((list) => {
      if (cancelled) return;
      const codes = list.map((i) => i.code);
      if (!codes.length) { setState({ loading: false, funds: [], diffs: {} }); return; }
      loadIntelligence(codes);
    });
    return () => { cancelled = true; };
  }, []);

  function loadIntelligence(codes) {
    fetch(`/api/watchlist-intelligence?codes=${codes.join(",")}`)
      .then((r) => r.json())
      .then((data) => {
        const funds = (data.funds || []).filter((f) => !f.missing);
        let prevSnapshot = {};
        try { prevSnapshot = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || "{}"); } catch {}
        const diffs = {};
        for (const f of funds) diffs[f.code] = diffFund(f, prevSnapshot[f.code]);
        const changedCount = funds.filter((f) => !diffs[f.code].isFirstView && diffs[f.code].reasons.length > 0).length;
        if (changedCount > 0) track("watchlist_intelligence_changes", { count: changedCount });

        const nextSnapshot = {};
        for (const f of funds) nextSnapshot[f.code] = f;
        try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(nextSnapshot)); } catch {}

        setState({ loading: false, funds, diffs });
      })
      .catch(() => setState({ loading: false, funds: [], diffs: {} }));
  }

  if (state.loading || !state.funds.length) return null;

  return (
    <section className="mt-7">
      <SectionHeader eyebrow="your watched funds · real signals since your last visit" title="Watchlist Intelligence" />
      <div className="glass px-5">
        {state.funds.map((f) => <Row key={f.code} f={f} diff={state.diffs[f.code]} />)}
      </div>
    </section>
  );
}
