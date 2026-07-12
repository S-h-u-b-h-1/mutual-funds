"use client";
import { useState, useEffect, useMemo } from "react";
import StatStrip from "./ui/StatStrip";
import DataTable from "./ui/DataTable";
import SignalCard from "./ui/SignalCard";
import Leaderboard from "./Leaderboard";
import FlowHeatmap from "./FlowHeatmap";
import HeroVisual from "./HeroVisual";
import SectionHeader from "./ui/SectionHeader";
import GlassPanel from "./ui/GlassPanel";
import Badge from "./ui/Badge";
import PremiumButton from "./ui/PremiumButton";
import Search from "./Search";
import Watchlist from "./Watchlist";
import WatchlistIntelligence from "./WatchlistIntelligence";
import RecentActivity from "./RecentActivity";
import { track } from "../lib/track";
import { getWatchlist, saveWatchlist, getPreferences, savePreferences } from "../lib/cloudSync";

// Mock Clients data for Advisor Workspace
const MOCK_CLIENTS = [
  { id: "c1", name: "Aarav Mehta", profile: "High Conviction Equity", aum: "₹4.2 Cr", risk: "Aggressive", lastReview: "3d ago", status: "Active Review Needed" },
  { id: "c2", name: "Sneha Rao", profile: "Capital Preservation & Income", aum: "₹1.8 Cr", risk: "Conservative", lastReview: "12d ago", status: "Steady" },
  { id: "c3", name: "Kabir Sen", profile: "Tax-Saver ELSS Allocations", aum: "₹95L", risk: "Moderate", lastReview: "1d ago", status: "Updated Yesterday" }
];

const MOCK_CLIENT_FUNDS = [
  { code: "120847", name: "Quant Small Cap Fund" },
  { code: "101997", name: "HDFC Mid-Cap Opportunities Fund" },
  { code: "122639", name: "Parag Parikh Flexi Cap Fund" }
];

export default function HomepageClient({
  byClass, amcSummary, headline, amcFlows, signals, flowHistory,
  newsHeadlines, marketTerminal, totalSchemes, realAmcCount, realBenchmarkCount,
  amcDeltas, leaderboard, networkNodes, stats, greeting, isMarketOpen,
  biggestMover, daily, enrichedHeadlines, performance, intel
}) {
  const [activeWorkspace, setActiveWorkspace] = useState("terminal"); // "terminal", "morning", "advisor"
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  
  // Advisor State
  const [selectedClient, setSelectedClient] = useState("c1");
  const [selectedBriefFund, setSelectedBriefFund] = useState("120847");
  const [generatedBrief, setGeneratedBrief] = useState(null);

  // Watchlist custom state tracker (mocking adding a fund if watchlist is empty)
  const [localWatchlistCount, setLocalWatchlistCount] = useState(0);

  // Was reading a second, bare "watchlist" key (plain scheme-code strings) disconnected from
  // the real mfp_watchlist WatchButton/Watchlist/WatchlistIntelligence all use — this count and
  // the sample-add button below never actually matched what showed up as watchlisted elsewhere.
  // Fixed to go through the same adapter (and therefore the same key/shape) everything else does.
  useEffect(() => {
    getWatchlist().then((list) => setLocalWatchlistCount(list.length));
    const refresh = () => getWatchlist().then((list) => setLocalWatchlistCount(list.length));
    window.addEventListener("mfp-sync", refresh);
    return () => window.removeEventListener("mfp-sync", refresh);
  }, []);

  const triggerAddSampleWatchlist = () => {
    MOCK_CLIENT_FUNDS.slice(0, 2).forEach((f) => saveWatchlist({ code: f.code, name: f.name, amc: null }));
    playClickSound();
    alert("Added Quant Small Cap & HDFC Mid-Cap Opportunities to Watchlist. Refresh to see Watchlist telemetry!");
    track("watchlist_sample_added");
    window.location.reload();
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isInput = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
      if (isInput) return;

      if (e.key === "Tab") {
        e.preventDefault();
        setActiveWorkspace((prev) => {
          const next = prev === "terminal" ? "morning" : prev === "morning" ? "advisor" : "terminal";
          playClickSound();
          track("workspace_switch_shortcut", { from: prev, to: next });
          return next;
        });
      }
      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        setAudioEnabled((prev) => {
          const next = !prev;
          track("toggle_audio_shortcut", { state: next });
          return next;
        });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [audioEnabled]);

  // Sync state preferences (cloud-synced when signed in, same mfp_left_collapsed/
  // mfp_right_collapsed/mfp_audio_enabled keys locally either way)
  useEffect(() => {
    getPreferences().then((p) => {
      if (p.audioEnabled != null) setAudioEnabled(p.audioEnabled);
      if (p.leftCollapsed != null) setLeftPanelCollapsed(p.leftCollapsed);
      if (p.rightCollapsed != null) setRightPanelCollapsed(p.rightCollapsed);
    });
  }, []);

  const toggleLeftPanel = () => {
    const next = !leftPanelCollapsed;
    setLeftPanelCollapsed(next);
    playClickSound();
    savePreferences({ leftCollapsed: next });
  };

  const toggleRightPanel = () => {
    const next = !rightPanelCollapsed;
    setRightPanelCollapsed(next);
    playClickSound();
    savePreferences({ rightCollapsed: next });
  };

  const toggleAudioMode = () => {
    const next = !audioEnabled;
    setAudioEnabled(next);
    savePreferences({ audioEnabled: next });
    if (next) {
      // Small trigger sound to confirm activation
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        gain.gain.setValueAtTime(0.04, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
      } catch {}
    }
  };

  // Synthesize crisp mechanical terminal click sound
  const playClickSound = () => {
    if (!audioEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = "sine";
      osc.frequency.setValueAtTime(900, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.035);
      
      gain.gain.setValueAtTime(0.03, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.035);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    } catch {}
  };

  // Meeting Brief Generator logic
  const handleGenerateBrief = () => {
    playClickSound();
    const client = MOCK_CLIENTS.find((c) => c.id === selectedClient);
    const fundObj = MOCK_CLIENT_FUNDS.find((f) => f.code === selectedBriefFund);
    if (!client || !fundObj) return;

    setGeneratedBrief({
      client: client.name,
      fund: fundObj.name,
      code: fundObj.code,
      date: new Date().toLocaleDateString("en-IN"),
      summary: `Prepared review portfolio strategy brief for client ${client.name} (Risk Profile: ${client.risk}). Evaluated holdings in ${fundObj.name} using explainable criteria: verified dynamic health ratios, 90d volatility vectors, and benchmark outperformance metrics.`,
      recommendation: `Target holds 1Y trailing return vs peers. Maintain allocation. Re-examine during next scheduled factsheet PDF update.`
    });
    track("advisor_brief_generated", { client: client.name, fund: fundObj.code });
  };

  // Generate dynamic chronological activity stream based on signals, news headlines and explained changes
  const activityFeed = useMemo(() => {
    const list = [];
    
    // Ingest GHA run
    list.push({
      type: "pipeline",
      label: "GHA Pipeline fresh build verified",
      time: "15m ago",
      desc: "Daily automation workflow completed successfully. Data quality checks passed.",
      badge: "Pipeline status"
    });

    // Ingest signals
    if (signals?.length) {
      signals.slice(0, 3).forEach((s, idx) => {
        const netFlow = Number(s.net_flow_cr || 0);
        const flowLabel = netFlow >= 0 ? "net inflow" : "net outflow";
        const flowAmount = `${netFlow >= 0 ? "+" : "-"}₹${new Intl.NumberFormat("en-IN").format(Math.abs(Math.round(netFlow)))} Cr`;
        list.push({
          type: "signal",
          label: `${s.amc_name.replace(" Mutual Fund", "")} flow anomaly`,
          time: `${idx * 2 + 1}h ago`,
          desc: `Z-score of ${Number(s.z_score).toFixed(1)} triggered for asset class ${s.asset_class} with ${flowLabel} of ${flowAmount}.`,
          badge: "Signal alert",
          href: "/signals"
        });
      });
    }

    // Ingest news headlines
    if (newsHeadlines?.length) {
      newsHeadlines.slice(0, 3).forEach((n, idx) => {
        list.push({
          type: "news",
          label: n.title,
          time: `${idx * 3 + 2}h ago`,
          desc: `Ingested from ${n.source?.name || "Market feed"}. Verified relevance ${n.relevance || 75}% to category assets.`,
          badge: "News published",
          href: "/news"
        });
      });
    }

    // Ingest NAV explained movers
    if (daily?.explained?.length) {
      daily.explained.slice(0, 3).forEach((e, idx) => {
        list.push({
          type: "explained",
          label: e.title,
          time: `${idx * 4 + 3}h ago`,
          desc: `${e.why} ${e.care} Context: ${e.context}`,
          badge: "Attention flag",
          href: `/fund/${e.entity_id}`
        });
      });
    }

    return list;
  }, [signals, newsHeadlines, daily]);

  const stripName = (s) => s.replace(" Mutual Fund", "");

  return (
    <div className="w-full relative">
      
      {/* Dynamic FOS Terminal Top Header Bar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-white/[0.08] pb-6 mb-6">
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-3.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent-soft">
              {greeting}, Analyst
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-muted">
              <span className={`h-2 w-2 rounded-full ${isMarketOpen ? "bg-pos animate-pulse" : "bg-ink-faint"}`} />
              <span>Indian Markets {isMarketOpen ? "Open" : "Closed"} (IST)</span>
            </div>
            <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-muted">
              <span className="h-2 w-2 rounded-full bg-pos animate-pulse" />
              <span>Neon DB Sync Live</span>
            </div>
          </div>
          <h1 className="text-[28px] sm:text-[36px] font-black tracking-tightest leading-tight text-white font-mono">
            MF PULSE OPERATING SYSTEM
          </h1>
          <p className="text-[13.5px] leading-relaxed text-ink-muted max-w-3xl">
            Financial Operating System dashboard consuming real-time automated ingestion pipelines, factsheet archives, and anomalies.
          </p>
        </div>
        
        {/* Toggle Workspace Audio */}
        <div className="flex items-center gap-3 shrink-0 self-start lg:self-auto">
          <button
            type="button"
            onClick={toggleAudioMode}
            className={`rounded-lg border px-3 py-1.5 text-[11.5px] font-bold tracking-wide transition-all ${
              audioEnabled ? "border-accent bg-accent/10 text-accent-soft" : "border-line bg-white/[0.02] text-ink-faint hover:text-ink-muted"
            }`}
          >
            🔊 {audioEnabled ? "Workspace Audio On" : "Workspace Audio Muted"}
          </button>
        </div>
      </div>

      {/* Primary Workspace View Toggles */}
      <div className="flex border-b border-white/[0.06] mb-6 p-1 bg-white/[0.01] rounded-xl max-w-md">
        {[
          { key: "terminal", label: "📟 Live Terminal" },
          { key: "morning", label: "🌤 Morning Brief" },
          { key: "advisor", label: "💼 Advisor Console" }
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => { setActiveWorkspace(tab.key); playClickSound(); }}
            className={`flex-1 py-2 text-[12.5px] font-semibold rounded-lg transition-all ${
              activeWorkspace === tab.key ? "bg-white/[0.08] text-white" : "text-ink-faint hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* WORKSPACE 1: LIVE TERMINAL MODE (3 columns, resizable side columns) */}
      {activeWorkspace === "terminal" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start transition-all animate-fade-in">
          
          {/* LEFT COLUMN: Morning Brief Widgets (Resizable / Collapsible) */}
          <div className={`${leftPanelCollapsed ? "lg:col-span-1" : "lg:col-span-3"} space-y-5 transition-all duration-300`}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-widest text-ink-faint">
                {leftPanelCollapsed ? "Brief" : "Telemetry Brief"}
              </span>
              <button
                type="button"
                onClick={toggleLeftPanel}
                className="text-[11px] font-mono text-ink-faint hover:text-ink px-1.5 py-0.5 bg-white/[0.04] rounded"
              >
                {leftPanelCollapsed ? "→" : "← Collapse"}
              </button>
            </div>

            {!leftPanelCollapsed && (
              <div className="space-y-5 animate-fade-in">
                {/* Biggest mover widget */}
                {biggestMover && (
                  <div className="rounded-xl border border-line bg-white/[0.01] p-4.5 space-y-2 shadow-sm">
                    <span className="text-[9.5px] font-bold uppercase tracking-wider text-accent-soft block">Overnight Mover</span>
                    <h4 className="text-[13px] font-bold text-white leading-snug">
                      <a href={`/fund/${biggestMover.code}`} className="hover:text-accent-soft">
                        {biggestMover.name.replace(/ - (Direct|Regular).*/i, "")}
                      </a>
                    </h4>
                    <span className={`text-[15px] font-bold font-mono block ${biggestMover.isGainer ? "text-pos" : "text-neg"}`}>
                      {biggestMover.isGainer ? "+" : ""}{biggestMover.r1d.toFixed(2)}%
                    </span>
                    <p className="text-[11.5px] text-ink-faint leading-relaxed">
                      Volatility peak under category {biggestMover.category}.
                    </p>
                  </div>
                )}

                {/* Category Rotation checklist */}
                {daily.categoryRotation?.length > 0 && (
                  <div className="rounded-xl border border-line bg-white/[0.01] p-4 space-y-2">
                    <span className="text-[9.5px] font-bold uppercase tracking-wider text-ink-faint block">Category Rotation</span>
                    <div className="space-y-1.5">
                      {daily.categoryRotation.slice(0, 4).map((c) => (
                        <div key={c.name} className="flex items-center justify-between text-[12px]">
                          <span className="text-ink-muted truncate mr-2">{c.name}</span>
                          <span className={`font-semibold font-mono ${c.rank_change > 0 ? "text-pos" : c.rank_change < 0 ? "text-neg" : "text-ink-faint"}`}>
                            {c.rank_change === 0 ? "–" : `${c.rank_change > 0 ? "↑" : "↓"}${Math.abs(c.rank_change)}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Data Ingestion Pipeline Freshness logs */}
                <div className="rounded-xl border border-line bg-white/[0.01] p-4 space-y-2.5 text-[12px]">
                  <span className="text-[9.5px] font-bold uppercase tracking-wider text-ink-faint block">Ingestion Pipeline</span>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-ink-faint">Verified NAV</span>
                      <span className="text-white font-mono">{daily.asOf || "2026-07-06"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-faint">Frequency</span>
                      <span className="text-white font-mono">15m cron</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-faint">Coverage</span>
                      <span className="text-white font-mono">{totalSchemes} schemes</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* MIDDLE COLUMN: Chronological Activity Feed */}
          <div className={`${
            (leftPanelCollapsed && rightPanelCollapsed) ? "lg:col-span-10" : 
            (leftPanelCollapsed || rightPanelCollapsed) ? "lg:col-span-8" : "lg:col-span-6"
          } space-y-6 transition-all duration-300`}>
            
            {/* Blinking Live Feed label */}
            <div className="flex items-center justify-between border-b border-white/[0.05] pb-2">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pos opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-pos" />
                </span>
                <span className="text-[10px] uppercase font-bold tracking-widest text-white font-mono">
                  Live Activity Telemetry Stream
                </span>
              </div>
              <span className="text-[10.5px] text-ink-faint">Synced real-time</span>
            </div>

            {/* Ingestion feed stream */}
            <div className="space-y-3">
              {activityFeed.map((act, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-white/[0.04] bg-white/[0.005] hover:bg-white/[0.02] p-4 text-[12.5px] transition-all hover:border-white/10 group flex items-start gap-3.5"
                >
                  <span className="text-[16px] shrink-0 mt-0.5 select-none">
                    {act.type === "pipeline" ? "⚙️" : act.type === "signal" ? "🚨" : act.type === "news" ? "📰" : "🔥"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white truncate">{act.label}</span>
                        <Badge tone={act.type === "signal" ? "neg" : act.type === "pipeline" ? "pos" : "neutral"}>
                          {act.badge}
                        </Badge>
                      </div>
                      <span className="text-[10.5px] font-mono text-ink-faint shrink-0">{act.time}</span>
                    </div>
                    <p className="mt-1 text-ink-muted leading-relaxed">{act.desc}</p>
                    {act.href && (
                      <a
                        href={act.href}
                        className="inline-block mt-2 text-[11px] text-accent-soft font-semibold hover:underline"
                      >
                        Launch analytical panel →
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* WATCHLIST Telemetry Feed empty states verification */}
            <div className="pt-4">
              <div className="mb-3 text-[10px] uppercase font-bold tracking-widest text-ink-faint">
                Your Watchlist Telemetry
              </div>
              
              {localWatchlistCount > 0 ? (
                <div className="space-y-4">
                  <Watchlist amcDeltas={amcDeltas} />
                  <WatchlistIntelligence />
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.005] p-6 text-center">
                  <div className="text-[22px] select-none">⭐️</div>
                  <h4 className="text-[13px] font-bold text-white mt-1.5">No funds watched yet</h4>
                  <p className="text-[11.5px] text-ink-faint leading-relaxed mt-1 max-w-xs mx-auto">
                    Watchlists act as custom real-time telemetry feeds. Pin funds using the Cmd+K launcher or search details page.
                  </p>
                  <button
                    type="button"
                    onClick={triggerAddSampleWatchlist}
                    className="mt-3.5 rounded-lg bg-accent/15 px-3 py-1.5 text-[11.5px] font-bold text-accent-soft hover:bg-accent/25 transition-colors"
                  >
                    Quick Add Sample Watchlist (Quant & HDFC)
                  </button>
                </div>
              )}
            </div>

          </div>

          {/* RIGHT COLUMN: Quality Leaders & Leaderboards (Resizable / Collapsible) */}
          <div className={`${rightPanelCollapsed ? "lg:col-span-1" : "lg:col-span-3"} space-y-5 transition-all duration-300`}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-widest text-ink-faint">
                {rightPanelCollapsed ? "Rank" : "Analytics Rank"}
              </span>
              <button
                type="button"
                onClick={toggleRightPanel}
                className="text-[11px] font-mono text-ink-faint hover:text-ink px-1.5 py-0.5 bg-white/[0.04] rounded"
              >
                {rightPanelCollapsed ? "←" : "Collapse →"}
              </button>
            </div>

            {!rightPanelCollapsed && (
              <div className="space-y-5 animate-fade-in">
                
                {/* Performance Rank */}
                <div className="rounded-xl border border-line bg-white/[0.01] p-4.5 space-y-3">
                  <span className="text-[9.5px] font-bold uppercase tracking-wider text-ink-faint block">Top Performers · 1M</span>
                  <div className="space-y-2">
                    {performance.top.slice(0, 3).map((f) => (
                      <div key={f.code} className="text-[12px] flex items-center justify-between gap-2 border-b border-white/[0.03] pb-1.5 last:border-0 last:pb-0">
                        <a href={`/fund/${f.code}`} className="truncate text-ink-muted hover:text-white font-semibold">
                          {f.name.replace(/ - (Direct|Regular).*/i, "")}
                        </a>
                        <span className="shrink-0 font-bold font-mono text-pos">+{f.r1m.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* AMC performance leaders */}
                <div className="rounded-xl border border-line bg-white/[0.01] p-4.5 space-y-3">
                  <span className="text-[9.5px] font-bold uppercase tracking-wider text-ink-faint block">Quality AMCs</span>
                  <div className="space-y-2">
                    {performance.amcs.slice(0, 3).map((r) => (
                      <div key={r.amc} className="text-[12px] flex items-center justify-between gap-2 border-b border-white/[0.03] pb-1.5 last:border-0 last:pb-0">
                        <a href={`/amc/${encodeURIComponent(r.amc + " Mutual Fund")}`} className="truncate text-ink-muted hover:text-white font-semibold">
                          {stripName(r.amc)}
                        </a>
                        <span className="shrink-0 font-mono font-bold text-white">{r.score.toFixed(0)}</span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            )}
          </div>

        </div>
      )}

      {/* WORKSPACE 2: MORNING BRIEF MODE */}
      {activeWorkspace === "morning" && (
        <div className="space-y-6 transition-all animate-fade-in max-w-4xl mx-auto">
          
          <div className="flex items-center gap-2.5">
            <span className="text-[18px]">🌤</span>
            <div>
              <h2 className="text-[17px] font-bold text-white">Your Morning Workspace</h2>
              <p className="text-[12.5px] text-ink-faint">Chronological overnight market summary at a single glance</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
            
            {/* Marketsopened story block */}
            <div className="md:col-span-8 space-y-5">
              
              <div className="rounded-xl border border-line bg-white/[0.01] p-5 space-y-3">
                <span className="text-[9.5px] uppercase font-bold tracking-wider text-accent-soft block">Overnight Market Story</span>
                <p className="text-[13.5px] leading-relaxed text-ink-muted">
                  Indian markets are currently <strong className="text-white">{isMarketOpen ? "Open" : "Closed"}</strong>. Based on yesterday's breath index of <strong className="text-white tnum">{daily.breadth1d}%</strong>, the market regime is classified as <strong className="text-accent-soft">{(daily.industry?.riskRegime || "Steady").toLowerCase()}</strong>.
                </p>
                <div className="p-3.5 rounded-lg border border-line bg-white/[0.02] text-[12.5px] text-ink-muted">
                  <strong>Today's Focus:</strong> {daily.insights[0]?.summary || "Ingesting daily risk statistics. Growth plans outpaced debt indices in the 30-day window."}
                </div>
              </div>

              {/* What deserves attentionexplained queue */}
              {daily.explained?.length > 0 && (
                <div className="space-y-3">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-ink-faint block">Attention Queue</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {daily.explained.map((i, idx) => (
                      <a
                        key={idx}
                        href={`/fund/${i.entity_id}`}
                        className="rounded-xl border border-line bg-white/[0.01] p-4 hover:bg-white/[0.03] transition-colors block"
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="text-[12.5px] font-bold text-white truncate">{i.title}</span>
                          <Badge tone={i.severity === "caution" ? "warn" : "pos"}>{i.value}</Badge>
                        </div>
                        <p className="text-[11.5px] text-ink-muted leading-relaxed line-clamp-2">{i.why}</p>
                        <span className="text-[10px] font-mono text-ink-faint block mt-2">Attention {i.attentionScore}/100</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

            </div>

            {/* Quick overview side panels */}
            <div className="md:col-span-4 space-y-5">
              
              {/* Stat Strip summary */}
              <div className="rounded-xl border border-line bg-white/[0.01] p-4.5 space-y-3">
                <span className="text-[9.5px] uppercase font-bold tracking-wider text-ink-faint block">Market Momentum</span>
                <div className="space-y-2 text-[12.5px]">
                  <div className="flex justify-between">
                    <span className="text-ink-faint">30d Avg Index</span>
                    <span className={`font-mono font-semibold ${intel.avg >= 0 ? "text-pos" : "text-neg"}`}>
                      {intel.avg >= 0 ? "+" : ""}{intel.avg.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-faint">Positive Breadth</span>
                    <span className="text-white font-mono">{intel.positive} / {intel.n}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-faint">Dispersion Spread</span>
                    <span className="text-white font-mono">{intel.dispersion.toFixed(1)}%</span>
                  </div>
                </div>
              </div>

              {/* Data Freshness */}
              <div className="rounded-xl border border-line bg-white/[0.01] p-4.5 space-y-2.5 text-[12px]">
                <span className="text-[9.5px] uppercase font-bold tracking-wider text-ink-faint block">Data Quality</span>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-pos animate-pulse" />
                  <span className="text-ink-muted">NAV current as of {daily.asOf || "Yesterday"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-pos" />
                  <span className="text-ink-muted">{totalSchemes} active portfolios synced</span>
                </div>
              </div>

            </div>

          </div>

        </div>
      )}

      {/* WORKSPACE 3: ADVISOR CONSOLE */}
      {activeWorkspace === "advisor" && (
        <div className="space-y-6 transition-all animate-fade-in max-w-4xl mx-auto">
          
          <div className="flex items-center gap-2.5">
            <span className="text-[18px]">💼</span>
            <div>
              <h2 className="text-[17px] font-bold text-white">Advisor Investment Console</h2>
              <p className="text-[12.5px] text-ink-faint">Prepare client briefs, audits, and meeting briefings locally</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            
            {/* Left Col: Client Cards list */}
            <div className="md:col-span-5 space-y-3">
              <span className="text-[10px] uppercase font-bold tracking-widest text-ink-faint block px-1">
                Active Client review Queue
              </span>
              
              {MOCK_CLIENTS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { setSelectedClient(c.id); playClickSound(); }}
                  className={`w-full text-left rounded-xl border p-4 transition-all block ${
                    selectedClient === c.id ? "border-accent bg-accent/5 shadow-sm" : "border-line bg-white/[0.005] hover:bg-white/[0.02]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <h3 className="text-[13.5px] font-bold text-white">{c.name}</h3>
                    <Badge tone={c.status.includes("Review") ? "warn" : "pos"}>{c.status}</Badge>
                  </div>
                  <div className="text-[12px] text-ink-muted truncate">{c.profile}</div>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-ink-faint border-t border-white/[0.04] pt-2">
                    <span>AUM: <strong className="text-white font-mono">{c.aum}</strong></span>
                    <span>Last reviewed {c.lastReview}</span>
                  </div>
                </button>
              ))}
            </div>

            {/* Right Col: Meeting Prep brief generator */}
            <div className="md:col-span-7 space-y-4">
              
              <div className="rounded-xl border border-line bg-white/[0.01] p-5 space-y-4">
                <span className="text-[10px] uppercase font-bold tracking-widest text-ink-faint block">
                  Meeting Brief Generator
                </span>

                <div className="space-y-3">
                  <div>
                    <label className="text-[11.5px] text-ink-muted block mb-1">Target Client Profile</label>
                    <select
                      value={selectedClient}
                      onChange={(e) => setSelectedClient(e.target.value)}
                      className="w-full rounded-lg border border-line bg-white/[0.03] px-3 py-2 text-[13px] text-white outline-none"
                    >
                      {MOCK_CLIENTS.map((c) => (
                        <option key={c.id} value={c.id} className="bg-[#090b11]">
                          {c.name} ({c.profile})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11.5px] text-ink-muted block mb-1">Select Review Fund</label>
                    <select
                      value={selectedBriefFund}
                      onChange={(e) => setSelectedBriefFund(e.target.value)}
                      className="w-full rounded-lg border border-line bg-white/[0.03] px-3 py-2 text-[13px] text-white outline-none"
                    >
                      {MOCK_CLIENT_FUNDS.map((f) => (
                        <option key={f.code} value={f.code} className="bg-[#090b11]">
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleGenerateBrief}
                  className="w-full rounded-lg bg-accent py-2 text-[12.5px] font-bold text-white hover:bg-accent/80 transition-colors"
                >
                  Generate Meeting Preparation Brief
                </button>
              </div>

              {/* Generated Output */}
              {generatedBrief && (
                <div className="rounded-xl border border-line bg-white/[0.015] p-5 space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between border-b border-white/[0.05] pb-2">
                    <span className="text-[11px] font-mono text-accent-soft uppercase font-bold">
                      Briefing Document
                    </span>
                    <span className="text-[10px] text-ink-faint">{generatedBrief.date}</span>
                  </div>
                  
                  <div className="text-[12px] space-y-1">
                    <div>Client: <strong className="text-white">{generatedBrief.client}</strong></div>
                    <div>Target review asset: <strong className="text-white">{generatedBrief.fund} ({generatedBrief.code})</strong></div>
                  </div>

                  <p className="text-[12.5px] leading-relaxed text-ink-muted bg-white/[0.01] p-3 rounded-lg border border-white/[0.03]">
                    {generatedBrief.summary}
                  </p>

                  <div className="text-[12px] border-t border-white/[0.05] pt-2">
                    <span className="text-[10px] text-ink-faint block uppercase font-bold mb-0.5">Recommendation</span>
                    <span className="text-white">{generatedBrief.recommendation}</span>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => alert("Report exported to clipboard (mock placeholder action).")}
                      className="rounded bg-white/[0.06] hover:bg-white/[0.1] px-3 py-1 text-[11px] font-semibold text-ink-muted hover:text-white transition-all"
                    >
                      Export portfolio Brief ↗
                    </button>
                  </div>
                </div>
              )}

            </div>

          </div>

        </div>
      )}

      {/* Floating Action / Productivity Shortcuts bar at bottom */}
      <div className="fixed bottom-4 right-4 z-40 bg-[#090b11]/90 border border-white/[0.08] rounded-xl px-3.5 py-2 backdrop-blur shadow-lg flex items-center gap-3 text-[11px] text-ink-faint">
        <span className="inline-flex items-center gap-1">
          <kbd className="rounded bg-white/[0.08] px-1 py-0.5 font-mono text-[9.5px]">Tab</kbd> Cycle Views
        </span>
        <span className="h-1.5 w-1.5 rounded-full bg-white/10" />
        <span className="inline-flex items-center gap-1">
          <kbd className="rounded bg-white/[0.08] px-1 py-0.5 font-mono text-[9.5px]">S</kbd> Sound ({audioEnabled ? "On" : "Muted"})
        </span>
        <span className="h-1.5 w-1.5 rounded-full bg-white/10" />
        <a href="/compare" className="text-accent-soft font-semibold hover:underline">
          Compare Menu
        </a>
      </div>

    </div>
  );
}
