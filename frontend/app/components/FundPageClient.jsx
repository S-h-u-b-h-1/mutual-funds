"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import NavChart from "./NavChart";
import VolatilityChart from "./VolatilityChart";
import ProductBreadcrumbs from "./ProductBreadcrumbs";
import GlassPanel from "./ui/GlassPanel";
import Badge from "./ui/Badge";
import WatchButton from "./WatchButton";
import ResearchNotes from "./ResearchNotes";
import MetricTooltip from "./ui/MetricTooltip";
import SectionHeader from "./ui/SectionHeader";
import { track } from "../lib/track";
import { gradeTone } from "../lib/fundHealth";
import { researchSummary } from "../lib/fundAnalysis";
import { relativeTime } from "../lib/news";
import { completenessTone } from "../lib/completeness";
import { TIER_TONE, CONFIDENCE_LABEL, CONFIDENCE_TONE } from "../lib/decisionEngine";
import { QUALITY_LABELS } from "../lib/qualityEngine";
import { TrendArrow, PercentileBar, Sparkline, Gauge } from "./ui/Visualizations";
import { fieldById, computeConfidence } from "../lib/fieldRegistry";
import { metadataStatus } from "../lib/metadata";
import fieldCoverage from "../data/fieldCoverage.json";

// Research Intelligence Upgrade, Mission 1 (Universal Fund Profile) + Mission 5 (Data Quality
// Badges). One field row: value, per-field confidence (universe-wide coverage %, same
// methodology as /internal/data-completeness — not a per-fund guess), and an honest reason when
// this specific fund lacks the value even though the field is tracked. `regId`/`covKey` map to
// fieldRegistry.js's FIELD_REGISTRY / fieldCoverage.json's nested field-group keys.
const CONF_TONE = { High: "pos", Medium: "warn", Low: "warn", "N/A": null };
function ProfileField({ label, value, regId, covKey, format }) {
  const entry = regId ? fieldById(regId) : null;
  const cov = covKey ? fieldCoverage?.fields?.[covKey[0]]?.[covKey[1]] : null;
  const confidence = entry ? computeConfidence(entry, cov?.universe_pct ?? 0) : null;
  const display = value != null && value !== "" ? (format ? format(value) : value) : null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] uppercase tracking-[0.06em] text-ink-faint">{label}</span>
        {confidence && confidence !== "N/A" && (
          <span className={`text-[9.5px] font-semibold ${CONF_TONE[confidence] === "pos" ? "text-pos" : "text-warn"}`}>{confidence}</span>
        )}
      </div>
      {display ? (
        <div className="mt-1 text-[13px] font-semibold text-ink leading-snug">{display}</div>
      ) : (
        <div className="mt-1 text-[12px] text-ink-faint italic">
          {cov && cov.universe_n === 0
            ? "Not yet extracted from any AMC factsheet"
            : "Not disclosed in this fund's factsheet"}
        </div>
      )}
    </div>
  );
}

function fundAgeLabel(launchDate) {
  if (!launchDate) return null;
  const years = (Date.now() - new Date(launchDate).getTime()) / (365.25 * 86400000);
  if (years < 0) return null;
  return years < 1 ? `${Math.round(years * 12)} months` : `${years.toFixed(1)} years`;
}

function expenseRatioDisplay(meta) {
  if (meta.expense_ratio != null) return `${meta.expense_ratio}%`;
  if (meta.regular_expense_ratio != null || meta.direct_expense_ratio != null) {
    const parts = [];
    if (meta.regular_expense_ratio != null) parts.push(`Regular ${meta.regular_expense_ratio}%`);
    if (meta.direct_expense_ratio != null) parts.push(`Direct ${meta.direct_expense_ratio}%`);
    return parts.join(" / ");
  }
  return null;
}

// fund.benchmark (SEBI category-standard mapping, ingestion/benchmarks.py) and meta.benchmark
// (this AMC's own factsheet-disclosed benchmark) are two independently-sourced, both-real values
// that frequently name different indices (e.g. a fund's factsheet may cite an S&P BSE index
// where its category standard is NIFTY-based) — never fabricated, never a data-quality bug in
// either source. fund.benchmark stays labeled as the category standard (matching researchSummary()
// in fundAnalysis.js) rather than stated as plain fact, since it's also what cohort/category
// comparisons elsewhere on this page are keyed to.
function benchmarkStandardClause(fund) {
  return fund.benchmark ? `the ${fund.category} category-standard benchmark (${fund.benchmark})` : "category standards";
}

function benchmarkDivergenceNote(fund, meta) {
  const std = fund.benchmark, fs = meta?.benchmark;
  if (!std || !fs || std.trim().toLowerCase() === fs.trim().toLowerCase()) return null;
  return ` Its own factsheet discloses a different benchmark, ${fs} — see Verified Fund Profile below.`;
}

function benchmarkSummarySentence(fund, cohort, meta) {
  if (!cohort) return "";
  return `It is benchmarked against ${benchmarkStandardClause(fund)} and ranked against a cohort of ${cohort.count} peer funds.${benchmarkDivergenceNote(fund, meta) || ""}`;
}

// Helper components of Design System 2.0
function WorkspaceCard({ title, subtitle, action, children, id, collapsedDefault = false }) {
  const [collapsed, setCollapsed] = useState(collapsedDefault);
  return (
    <div id={id} className="scroll-mt-24 rounded-2xl border border-line-strong bg-surface p-5 sm:p-6 shadow-sm hover:border-line-strong transition-all">
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-line">
        <div>
          <h3 className="text-[14.5px] font-bold text-ink tracking-tight">{title}</h3>
          {subtitle && <p className="text-[11px] text-ink-faint mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3">
          {action}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-[11px] font-mono text-ink-faint hover:text-ink-muted transition-colors px-2 py-0.5 bg-surface-strong rounded"
          >
            {collapsed ? "Expand" : "Collapse"}
          </button>
        </div>
      </div>
      {!collapsed && <div className="transition-all animate-fade-in">{children}</div>}
    </div>
  );
}

function MetricTile({ label, value, sub, tone, tooltip }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3 hover:bg-surface-2 transition-colors relative group">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-ink-faint">
        <span>{label}</span>
        {tooltip && <MetricTooltip>{tooltip}</MetricTooltip>}
      </div>
      <div className={`mt-1.5 text-[22px] font-bold tnum tracking-tight ${
        tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : tone === "warn" ? "text-warn" : "text-ink"
      }`}>
        {value}
      </div>
      {sub && <div className="text-[10.5px] text-ink-faint mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

export default function FundPageClient({
  fund, cohort, history, sig, rets, bench, meta, port, health, notice, fTone, fLabel,
  sharpe, sortino, riskStats, calReturns, rollReturns, comparisons, relatedNews,
  priority, attentionReasons, completeness, readiness, aRank, asOf,
  categoryAvgVol, categoryAvgDvol, categoryAvgMaxdd, categoryAvgConsistency,
  thesis, strengthsWeak, fit, priceContext, dna, quality, decisionSupport, newsInsights, similarPastEvents, report
}) {
  const [viewMode, setViewMode] = useState("workspace"); // "workspace" (tabbed) or "report" (scroll)
  const [activeTab, setActiveTab] = useState("identity"); // tabs: identity, performance, risk, research, news, compare
  const [days, setDays] = useState(91); // Shared range days state for NavChart & VolatilityChart
  const [hoveredDate, setHoveredDate] = useState(null); // Shared date hover coordinate
  const [onboardStep, setOnboardStep] = useState(null); // onboarding wizard step state (null = finished/hidden)
  const [tableSortKey, setTableSortKey] = useState("window"); // Sorting for bench table
  const [tableSortDesc, setTableSortDesc] = useState(false);

  // IntersectionObserver to sync scroll position to TOC in full report mode
  const [activeSection, setActiveSection] = useState("identity");
  
  useEffect(() => {
    if (viewMode !== "report") return;
    const sections = ["identity", "performance", "risk", "research", "news", "compare"];
    const observers = sections.map((sec) => {
      const el = document.getElementById(`sec-${sec}`);
      if (!el) return null;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setActiveSection(sec);
          }
        },
        { threshold: 0.2, rootMargin: "-10% 0px -60% 0px" }
      );
      obs.observe(el);
      return { obs, el };
    });
    return () => {
      observers.forEach((o) => o?.obs.unobserve(o.el));
    };
  }, [viewMode]);

  // First-run onboarding check
  useEffect(() => {
    const hasSeen = localStorage.getItem("mfp_onboarded_v2");
    if (!hasSeen) {
      setOnboardStep(1);
    }
  }, []);

  const completeOnboarding = () => {
    localStorage.setItem("mfp_onboarded_v2", "true");
    setOnboardStep(null);
    track("onboarding_completed", { scheme_code: fund.code });
  };

  const skipOnboarding = () => {
    localStorage.setItem("mfp_onboarded_v2", "true");
    setOnboardStep(null);
    track("onboarding_skipped", { scheme_code: fund.code });
  };

  // Page visits are recorded once, by <Tracker view={...} /> in fund/[scheme_code]/page.js —
  // this used to duplicate that into a separate mfp_recent_visits key with no cloud sync of its
  // own; removed rather than migrated, since it's now a straight duplicate of Tracker's own call.

  // Table Copy Value helper
  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    alert(`Copied ${label}: ${text}`);
    track("value_copied", { label, text });
  };

  const copyResearchLink = async () => {
    const researchLink = window.location.href;
    try {
      await navigator.clipboard.writeText(researchLink);
      alert("Copied research link.");
      track("value_copied", { label: "Research link" });
    } catch {
      window.prompt("Copy this research link:", researchLink);
      track("value_copy_fallback", { label: "Research link" });
    }
  };

  // Premium Health Score Ring details
  const healthRingDashoffset = useMemo(() => {
    if (!health) return 0;
    const radius = 34;
    const circumference = 2 * Math.PI * radius;
    return circumference - (health.overall / 100) * circumference;
  }, [health]);

  // Professional Benchmarks Table Sort
  const sortedBench = useMemo(() => {
    if (!bench) return [];
    const copy = [...bench];
    if (tableSortKey === "window") return copy; // original window ordering
    copy.sort((a, b) => {
      let valA = a[tableSortKey] ?? 0;
      let valB = b[tableSortKey] ?? 0;
      return tableSortDesc ? valB - valA : valA - valB;
    });
    return copy;
  }, [bench, tableSortKey, tableSortDesc]);

  const toggleSort = (key) => {
    if (tableSortKey === key) {
      setTableSortDesc(!tableSortDesc);
    } else {
      setTableSortKey(key);
      setTableSortDesc(true);
    }
  };

  // Next.js static / dynamic actions list
  const nextActionsItems = [
    { label: `Similar funds in ${fund.category}`, href: `/categories/${encodeURIComponent(fund.category)}` },
    { label: `View AMC: ${fund.amc}`, href: `/amc/${encodeURIComponent(fund.amc + " Mutual Fund")}` },
    fund.benchmark && { label: `View benchmark: ${fund.benchmark}`, href: `/benchmark/${fund.benchmark}` },
    { label: "See latest market news", href: "/news" },
    { label: "Today's market brief", href: "/brief" }
  ].filter(Boolean);

  return (
    <div className="container-px relative py-8 sm:py-10">
      <ProductBreadcrumbs items={[["Mutual Funds", "/funds"], [fund.category || "Fund", fund.category ? `/categories/${encodeURIComponent(fund.category)}` : "/funds"], [fund.name.replace(/ - (Direct|Regular).*/i, ""), null]]} />
      
      {/* Onboarding Walkthrough Overlay */}
      {onboardStep !== null && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-bg/85 p-4 animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="fund-tour-title">
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl transition-spring">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <span className="text-[10px] uppercase font-bold tracking-widest text-accent-soft">
                Workspace Tour · Step {onboardStep} of 4
              </span>
              <button onClick={skipOnboarding} className="text-[11px] text-ink-faint hover:text-ink">
                Skip
              </button>
            </div>
            
            <div className="mt-4">
              {onboardStep === 1 && (
                <div>
                  <h4 id="fund-tour-title" className="text-[16px] font-semibold text-ink">Choose your research format</h4>
                  <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
                    Use <strong>Focused sections</strong> to investigate one question at a time, or open the <strong>Full report</strong> for continuous reading.
                  </p>
                </div>
              )}
              {onboardStep === 2 && (
                <div>
                  <h4 className="text-[16px] font-bold text-ink">Dynamic Health Score</h4>
                  <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
                    Blend of performance, risk, consistency, AMC standing, and factsheet data. The confidence score dynamically measures how much real verified data backed this analysis.
                  </p>
                </div>
              )}
              {onboardStep === 3 && (
                <div>
                  <h4 className="text-[16px] font-bold text-ink">Synchronized Charts</h4>
                  <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
                    Hovering or sliding across any chart automatically aligns the cursor and dates on the other chart. You see risk and price at the exact same point in time.
                  </p>
                </div>
              )}
              {onboardStep === 4 && (
                <div>
                  <h4 className="text-[16px] font-bold text-ink">Private Research Notes</h4>
                  <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
                    Your observations are saved locally to this specific browser. Write notes, pin pages, or check data quality scores as you navigate the platform.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-between pt-4 border-t border-line">
              {onboardStep > 1 ? (
                <button
                  onClick={() => setOnboardStep(onboardStep - 1)}
                  className="rounded-lg bg-surface-strong px-3.5 py-1.5 text-[12.5px] font-semibold text-ink-muted hover:bg-surface-strong"
                >
                  Back
                </button>
              ) : (
                <div />
              )}
              {onboardStep < 4 ? (
                <button
                  onClick={() => setOnboardStep(onboardStep + 1)}
                  className="rounded-lg bg-accent px-4 py-1.5 text-[12.5px] font-semibold text-ink hover:bg-accent/80 transition-colors"
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={completeOnboarding}
                  className="rounded-lg bg-pos px-4 py-1.5 text-[12.5px] font-semibold text-[#090b11] hover:opacity-90 transition-opacity"
                >
                  Let’s Go!
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header Breadcrumbs */}
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint flex flex-wrap items-center gap-1.5 mb-2.5">
        <span>Research</span>
        <span>/</span>
        <span>Funds</span>
        <span>/</span>
        <a href={`/amc/${encodeURIComponent(fund.amc + " Mutual Fund")}`} className="hover:text-ink">{fund.amc.replace(" Mutual Fund", "")}</a>
        <span>/</span>
        <span className="text-ink-muted truncate">{fund.name.replace(/ - (Direct|Regular).*/i, "")}</span>
      </div>

      {/* Pinned Metrics Floating Sub-header */}
      <div className="sticky top-16 z-30 -mx-4 mb-7 flex items-center justify-between gap-4 border-y border-line bg-bg px-4 py-3 shadow-sm transition-all">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[15px] font-semibold text-ink">{fund.name.replace(/ - (Direct|Regular).*/i, "")}</h1>
            <Badge>{fund.plan}</Badge>
          </div>
          <p className="text-[11px] text-ink-faint truncate hidden sm:block">{fund.amc} · {fund.category}</p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <span className="text-[10px] text-ink-faint uppercase font-bold block">NAV</span>
            <span className="text-[14.5px] font-bold font-mono text-ink">₹{fund.nav != null ? fund.nav.toFixed(2) : "—"}</span>
          </div>
          {health && (
            <div className="text-right hidden sm:block">
              <span className="text-[10px] text-ink-faint uppercase font-bold block">Health</span>
              <span className={`text-[14.5px] font-bold ${
                gradeTone(health.grade) === "pos" ? "text-pos" : gradeTone(health.grade) === "warn" ? "text-warn" : "text-neg"
              }`}>{health.overall} · {health.grade}</span>
            </div>
          )}
          <WatchButton code={fund.code} name={fund.name.replace(/ - (Direct|Regular).*/i, "")} amc={fund.amc} />
        </div>
      </div>

      {/* Main Grid: Left Side Workspace Sidebar / Right Side Workspace Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN: Research Sidebar */}
        <aside className="order-2 space-y-5 lg:order-none lg:col-span-3 lg:sticky lg:top-20">
          
          {/* Workspace / Scroll Navigation Selector */}
          <div className="rounded-xl border border-line bg-surface p-3 space-y-2">
            <div className="text-[9.5px] uppercase font-bold tracking-widest text-ink-faint px-2">
              Research format
            </div>
            <div className="grid grid-cols-2 gap-1">
              <button
                onClick={() => setViewMode("workspace")}
                className={`py-1.5 rounded-lg text-[12.5px] font-semibold transition-all ${
                  viewMode === "workspace" ? "bg-surface-strong text-ink" : "text-ink-faint hover:text-ink-muted"
                }`}
              >
                Focused sections
              </button>
              <button
                onClick={() => setViewMode("report")}
                className={`py-1.5 rounded-lg text-[12.5px] font-semibold transition-all ${
                  viewMode === "report" ? "bg-surface-strong text-ink" : "text-ink-faint hover:text-ink-muted"
                }`}
              >
                Full report
              </button>
            </div>
          </div>

          {/* Table of Contents / Jump Navigation */}
          <div className="rounded-xl border border-line bg-surface p-3">
            <div className="text-[9.5px] uppercase font-bold tracking-widest text-ink-faint px-2 mb-2">
              Research sections
            </div>
            <nav className="space-y-0.5">
              {[
                { key: "identity", label: "Identity & Rationale" },
                { key: "performance", label: "Performance & NAV" },
                { key: "risk", label: "Risk & Portfolio" },
                { key: "research", label: "Research readiness" },
                { key: "news", label: "News & Documents" },
                { key: "compare", label: "Compare & Actions" }
              ].map((s) => {
                const isActive = viewMode === "workspace" ? activeTab === s.key : activeSection === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => {
                      if (viewMode === "workspace") {
                        setActiveTab(s.key);
                        track("workspace_tab_changed", { tab: s.key, code: fund.code });
                      } else {
                        const target = document.getElementById(`sec-${s.key}`);
                        target?.scrollIntoView({ behavior: "smooth" });
                      }
                    }}
                    className={`w-full text-left rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold transition-all flex items-center justify-between ${
                      isActive ? "bg-accent/10 text-accent-soft border-l-2 border-accent" : "text-ink-faint hover:bg-surface-2 hover:text-ink-muted"
                    }`}
                  >
                    <span>{s.label}</span>
                    {viewMode === "workspace" && activeTab === s.key && (
                      <span className="h-1.5 w-1.5 rounded-full bg-accent-soft" />
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Collapsible Action Widgets */}
          <div className="rounded-xl border border-line bg-surface p-3 text-[12px] space-y-2">
            <div className="text-[9.5px] uppercase font-bold tracking-widest text-ink-faint px-2">
              Workspace Actions
            </div>
            <button
              onClick={copyResearchLink}
              className="w-full text-left rounded-lg px-2.5 py-1.5 text-ink-muted hover:bg-surface-2 transition-colors flex items-center justify-between"
            >
              <span>Copy research link</span>
              <span className="text-[10.5px] text-ink-faint">Share</span>
            </button>
            <button
              onClick={() => {
                // "Print Research PDF" only means what it says if every section is actually on
                // the page when the browser's print dialog opens — Focused sections mode shows
                // just one tab at a time, which would silently print an incomplete report.
                if (viewMode !== "report") {
                  setViewMode("report");
                  setTimeout(() => window.print(), 150);
                } else {
                  window.print();
                }
                track("research_report_printed", { scheme_code: fund.code });
              }}
              className="w-full text-left rounded-lg px-2.5 py-1.5 text-ink-muted hover:bg-surface-2 transition-colors"
            >
              Print Research PDF
            </button>
            {report && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(report, null, 2));
                  alert("Structured research report copied as JSON — every section from this page in one object, ready to paste into an advisor tool or export pipeline.");
                  track("research_report_json_copied", { scheme_code: fund.code });
                }}
                className="w-full text-left rounded-lg px-2.5 py-1.5 text-ink-muted hover:bg-surface-2 transition-colors"
              >
                Copy Research Report (JSON)
              </button>
            )}
            <button
              onClick={() => setOnboardStep(1)}
              className="w-full text-left rounded-lg px-2.5 py-1.5 text-accent-soft hover:bg-accent/5 transition-colors"
            >
              Re-run Onboarding Tour
            </button>
          </div>

        </aside>

        {/* RIGHT COLUMN: Main Research Contents */}
        <main className="order-1 space-y-6 lg:order-none lg:col-span-9">
          
          {/* NOTICE WARNING BOARD */}
          {notice && (
            <div className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-[12.5px] text-ink-muted animate-fade-in">
              <span className="font-semibold text-ink">{notice[0]}.</span> {notice[1]}
            </div>
          )}

          {fund.isIdcw && (
            <div className="rounded-xl border border-warn/30 bg-warn/[0.04] px-4 py-3 text-[12.5px] text-warn">
              <strong>IDCW (Dividend) Plan</strong> — NAV returns shown are distorted by cash pay-outs. Compare using Growth option.
            </div>
          )}

          {/* TAB CONTENT: IDENTITY */}
          {(viewMode === "workspace" ? activeTab === "identity" : true) && (
            <section id="sec-identity" className="scroll-mt-24 space-y-6 animate-fade-in">
              
              {/* Executive Summary */}
              <WorkspaceCard title="Executive Summary" subtitle="Plain text analysis computed directly from NAV trends">
                <p className="text-[13.5px] leading-relaxed text-ink-muted">
                  {fund.name.replace(/ - (Direct|Regular).*/i, "")} is a <strong>{fund.category}</strong> plan managed by <strong>{fund.amc}</strong>. {benchmarkSummarySentence(fund, cohort, meta)}
                </p>
                <div className="mt-4 p-4 rounded-xl border border-line bg-surface text-[13px] leading-relaxed text-ink-muted">
                  {researchSummary(fund, cohort)}
                </div>
              </WorkspaceCard>

              {/* Verified Fund Profile — Research Intelligence Upgrade, Mission 1. Every value
                  here comes from a real AMC factsheet (meta = getMetadata(f.code)), distinct
                  from AMFI-sourced fields (NAV, returns, category) shown elsewhere. Coverage %
                  is this fund's own metadata-completeness dimension (completeness.js), already
                  computed for the readiness checklist below — not duplicated logic. */}
              <WorkspaceCard
                title="Verified Fund Profile"
                subtitle={meta ? `Factsheet-sourced data · ${completeness.dims.metadata}% of tracked fields present for this scheme` : "No AMC factsheet acquired for this scheme yet"}
              >
                {meta ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <ProfileField label="Benchmark" value={meta.benchmark} regId="benchmark" covKey={["Identity", "Benchmark"]} />
                      <ProfileField label="Launch Date" value={meta.launch_date} regId="launch_date" covKey={["Metadata", "Launch Date"]}
                        format={(v) => { const age = fundAgeLabel(v); return age ? `${v} (${age})` : v; }} />
                      <ProfileField label="AUM" value={meta.aum_crores} regId="aum" covKey={["Metadata", "AUM"]}
                        format={(v) => `₹${Number(v).toLocaleString("en-IN")} Cr`} />
                      <ProfileField label="Expense Ratio" value={expenseRatioDisplay(meta)} regId="expense_ratio" covKey={["Metadata", "Expense Ratio"]} />
                      <ProfileField label="Riskometer" value={meta.riskometer} regId="riskometer" covKey={["Metadata", "Riskometer"]} />
                      <ProfileField label="Fund Manager(s)" value={meta.fund_manager} regId="fund_manager" covKey={["Metadata", "Manager"]} />
                      <ProfileField label="Minimum SIP" value={meta.minimum_sip} regId="minimum_sip" covKey={["Metadata", "SIP Minimum"]}
                        format={(v) => `₹${Number(v).toLocaleString("en-IN")}`} />
                      <ProfileField label="Minimum Investment" value={meta.minimum_lumpsum} regId="minimum_investment" covKey={["Metadata", "Lumpsum Minimum"]}
                        format={(v) => `₹${Number(v).toLocaleString("en-IN")}`} />
                      <ProfileField label="Exit Load" value={meta.exit_load} regId="exit_load" covKey={["Metadata", "Exit Load"]} />
                    </div>
                    <div className="mt-4 pt-4 border-t border-line flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] text-ink-faint">
                      <span>Factsheet (portfolio) date: <strong className="text-ink-muted">{meta.source_date || "unknown"}</strong></span>
                      <span>Source: <strong className="text-ink-muted">{meta.source || "AMC factsheet PDF"}</strong></span>
                      <span>Validation: <strong className="text-pos">Passed</strong> <span className="text-ink-faint">(range/sanity checks at parse time)</span></span>
                      {meta.source_url && (
                        <a href={meta.source_url} target="_blank" rel="noopener noreferrer" className="text-accent-soft hover:underline font-semibold">
                          View original filing ↗
                        </a>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-[12.5px] text-ink-faint leading-relaxed">
                    MF Pulse has verified factsheet coverage for {metadataStatus.populated.toLocaleString("en-IN")} schemes across three AMC pipelines
                    (SBI, HDFC, ICICI Prudential) as of {fieldCoverage?.factsheetLastUpdated || "date unavailable"}. <strong className="text-ink-muted">{fund.amc}</strong> isn’t
                    in that set yet, so benchmark, AUM, expense ratio, exit load, and the other fields normally shown here aren’t fabricated or estimated —
                    they simply aren’t acquired for this fund. Everything above the fold (NAV, returns, category) still comes from AMFI’s official daily feed
                    and is unaffected by this.
                  </p>
                )}
              </WorkspaceCard>

              {/* Investment Thesis — every sentence traceable to a real metric, no LLM. */}
              {thesis && (
                <WorkspaceCard title="Investment Thesis" subtitle="Generated from deterministic rules over real returns, risk, and rank data">
                  <p className="text-[13.5px] leading-relaxed text-ink-muted">{thesis}</p>
                </WorkspaceCard>
              )}

              {/* Strengths & Weaknesses */}
              {strengthsWeak && (
                <WorkspaceCard title="Strengths & Weaknesses" subtitle="Every point backed by a real, computed number">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    <div>
                      <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-pos mb-2">Top Strengths</div>
                      {strengthsWeak.strengths.length ? (
                        <ul className="space-y-2">
                          {strengthsWeak.strengths.map((s, i) => (
                            <li key={i} className="text-[12.5px] leading-relaxed text-ink-muted pl-3 border-l-2 border-pos/40">{s}</li>
                          ))}
                        </ul>
                      ) : <p className="text-[12px] text-ink-faint">None flagged from current data.</p>}
                    </div>
                    <div>
                      <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-neg mb-2">Top Risks</div>
                      {strengthsWeak.risks.length ? (
                        <ul className="space-y-2">
                          {strengthsWeak.risks.map((s, i) => (
                            <li key={i} className="text-[12.5px] leading-relaxed text-ink-muted pl-3 border-l-2 border-neg/40">{s}</li>
                          ))}
                        </ul>
                      ) : <p className="text-[12px] text-ink-faint">None flagged from current data.</p>}
                    </div>
                    <div>
                      <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-warn mb-2">Watch Carefully</div>
                      {strengthsWeak.watch.length ? (
                        <ul className="space-y-2">
                          {strengthsWeak.watch.map((s, i) => (
                            <li key={i} className="text-[12.5px] leading-relaxed text-ink-muted pl-3 border-l-2 border-warn/40">{s}</li>
                          ))}
                        </ul>
                      ) : <p className="text-[12px] text-ink-faint">No data-quality warnings.</p>}
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-line pt-4">
                    <div className="rounded-xl border border-line bg-surface p-3">
                      <div className="text-[9.5px] uppercase font-bold tracking-wider text-ink-faint">Recent Improvement</div>
                      <p className="text-[12px] text-ink-muted mt-1 leading-relaxed">{strengthsWeak.recentImprovement || "None detected in category rank movement."}</p>
                    </div>
                    <div className="rounded-xl border border-line bg-surface p-3">
                      <div className="text-[9.5px] uppercase font-bold tracking-wider text-ink-faint">Recent Deterioration</div>
                      <p className="text-[12px] text-ink-muted mt-1 leading-relaxed">{strengthsWeak.recentDeterioration || "None detected in category rank movement."}</p>
                    </div>
                    <div className="rounded-xl border border-line bg-surface p-3">
                      <div className="text-[9.5px] uppercase font-bold tracking-wider text-ink-faint">Why Rank Changed</div>
                      <p className="text-[12px] text-ink-muted mt-1 leading-relaxed">{strengthsWeak.whyRankChanged}</p>
                    </div>
                  </div>
                </WorkspaceCard>
              )}

              {/* Investor Fit — suitability, never a recommendation. */}
              {fit && fit.length > 0 && (
                <WorkspaceCard title="Investor Fit" subtitle="Structural suitability by investor profile — not a recommendation">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {fit.map((p) => (
                      <div key={p.profile} className={`rounded-xl border p-3 ${p.suitable ? "border-pos/25 bg-pos/[0.03]" : "border-line bg-surface"}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-[12.5px] font-bold text-ink">{p.profile}</span>
                          <Badge tone={p.suitable ? "pos" : null}>{p.suitable ? "Suitable" : "Not typical"}</Badge>
                        </div>
                        <p className="text-[11.5px] text-ink-faint leading-relaxed mt-1.5">{p.why}</p>
                      </div>
                    ))}
                  </div>
                </WorkspaceCard>
              )}

              {/* Recent Price Context (Final Productization sprint, Phase 2) — describes the
                  fund's own recent price behaviour only. Never a buy/wait signal: this app does
                  not give market-timing advice, and the disclaimer here is load-bearing, not
                  decorative. */}
              {priceContext?.available && (
                <WorkspaceCard title="Recent Price Context" subtitle="What changed recently — not a signal to act on">
                  <ul className="space-y-1.5">
                    {priceContext.notes.map((note) => (
                      <li key={note} className="text-[12.5px] text-ink-muted leading-relaxed">— {note}</li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-ink-faint mt-3 leading-relaxed">{priceContext.disclaimer}</p>
                </WorkspaceCard>
              )}

              {/* Fund DNA — 10 dimensions, each a real score + plain-language explanation. */}
              {dna && (
                <WorkspaceCard title="Fund DNA" subtitle={`${dna.availableCount} of ${dna.totalCount} dimensions available for this fund`}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                    {dna.dimensions.map((d) => (
                      <div key={d.key}>
                        <div className="flex items-center justify-between text-[12px]">
                          <span className="font-semibold text-ink-muted">{d.label}</span>
                          {d.available ? (
                            <span className="font-mono text-ink-faint">{d.score}/100</span>
                          ) : (
                            <span className="text-[10.5px] text-ink-faint">n/a</span>
                          )}
                        </div>
                        {d.available && (
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-strong">
                            <div className="h-full rounded-full bg-accent-soft" style={{ width: `${d.score}%` }} />
                          </div>
                        )}
                        <p className="text-[11px] text-ink-faint leading-relaxed mt-1">{d.explanation}</p>
                      </div>
                    ))}
                  </div>
                </WorkspaceCard>
              )}

              {/* Dynamic Health Score Ring & Ratios */}
              {health && (
                <WorkspaceCard
                  title="Dynamic Health Diagnostics"
                  subtitle="Dynamically updated using recent AMFI daily NAV history"
                  action={
                    <Badge tone={gradeTone(health.grade) === "pos" ? "pos" : gradeTone(health.grade) === "warn" ? "warn" : "neg"}>
                      Grade {health.grade}
                    </Badge>
                  }
                >
                  <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
                    
                    {/* Ring gauge */}
                    <div className="flex items-center gap-5">
                      <div className="relative h-20 w-20 shrink-0">
                        <svg className="h-full w-full -rotate-90" viewBox="0 0 80 80">
                          <circle cx="40" cy="40" r="34" className="stroke-line" strokeWidth="6" fill="none" />
                          <circle
                            cx="40"
                            cy="40"
                            r="34"
                            className={`transition-all duration-1000 ${
                              gradeTone(health.grade) === "pos" ? "stroke-pos" : gradeTone(health.grade) === "warn" ? "stroke-warn" : "stroke-neg"
                            }`}
                            strokeWidth="6"
                            fill="none"
                            strokeDasharray={`${2 * Math.PI * 34}`}
                            strokeDashoffset={healthRingDashoffset}
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="absolute inset-0 grid place-items-center text-[18px] font-bold text-ink font-mono">
                          {health.overall}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-wider text-ink-faint">Overall Diagnostics</div>
                        <div className="text-[20px] font-bold text-ink leading-tight font-mono">{health.overall}<span className="text-[12px] text-ink-faint">/100</span></div>
                        <div className="mt-1">
                          <Badge tone={health.confidence === "high" ? "pos" : health.confidence === "medium" ? "warn" : "neg"}>
                            {health.confidence === "high" ? "High Confidence" : health.confidence === "medium" ? "Medium Confidence" : "Limited Data"}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    {/* Breakdown bars — Quality Engine's 9-dimension recomposition of this same
                        score (see lib/qualityEngine.js), each with its own real explanation.
                        Falls back to the original 7-part breakdown if quality wasn't computed. */}
                    <details className="group flex-1 border-t border-line pt-4 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
                      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-xl border border-line px-4 text-xs font-semibold text-ink-muted outline-none hover:border-line-strong hover:text-ink focus-visible:ring-2 focus-visible:ring-accent">
                        Explain this score
                        <span aria-hidden="true" className="transition-transform group-open:rotate-180">⌄</span>
                      </summary>
                      <div className="mt-4 grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
                        {(quality?.breakdown || health.breakdown).map((b) => (
                          <div key={b.key}>
                            <div className="flex items-center justify-between gap-3 text-[11px]">
                              <span className="flex min-w-0 items-center gap-1 text-ink-faint">
                                <span className="truncate">{QUALITY_LABELS[b.key] || (b.key === "categoryRank" ? "Category Rank" : b.key === "dataQuality" ? "Data Quality" : b.key.charAt(0).toUpperCase() + b.key.slice(1))}</span>
                                {b.key === "momentum" && <TrendArrow value={b.score - 50} />}
                                {b.weight != null && <span className="shrink-0 text-[9.5px] text-ink-faint/70">({b.weight}% weight)</span>}
                              </span>
                              <span className="shrink-0 font-mono text-ink-muted">{b.score}/100</span>
                            </div>
                            <div className="mt-1"><PercentileBar value={b.score} tone={b.score >= 65 ? "pos" : b.score <= 35 ? "neg" : "accent"} /></div>
                            {b.explanation && <p className="mt-1 text-[10.5px] leading-relaxed text-ink-faint">{b.explanation}</p>}
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 grid gap-3 rounded-xl bg-surface-2 p-4 text-[11px] leading-5 text-ink-muted sm:grid-cols-2">
                        <p><span className="font-semibold text-ink">Evidence:</span> AMFI NAV history supplies performance, risk, consistency and momentum. Acquired AMC factsheets supply diversification and transparency only when available.</p>
                        <p><span className="font-semibold text-ink">Missing data:</span> {quality ? `${quality.totalPossible - quality.coverage} of ${quality.totalPossible} quality dimensions are unavailable and excluded through drop-and-renormalise.` : "The fallback health model discloses unavailable components rather than assigning them a neutral value."}</p>
                      </div>
                    </details>

                  </div>

                  {quality?.confidence && (
                    <div className="mt-4 flex items-center gap-2">
                      <span className="text-[10.5px] uppercase tracking-wider text-ink-faint">Research Confidence</span>
                      <Badge tone={CONFIDENCE_TONE[quality.confidence]}>{CONFIDENCE_LABEL[quality.confidence]}</Badge>
                      <span className="text-[10.5px] text-ink-faint">— {quality.coverage} of {quality.totalPossible} dimensions available</span>
                    </div>
                  )}

                  <p className="mt-4 border-t border-line pt-3.5 text-[12.5px] leading-relaxed text-ink-muted">
                    {health.explanation}
                  </p>

                  {/* Decision Support (Phase 7) — what's driving this score, what's holding it
                      back, what to watch. Composition, not a fabricated before/after delta — see
                      qualityEngine.js's explainQuality() for why. */}
                  {decisionSupport && (decisionSupport.drivers.length > 0 || decisionSupport.detractors.length > 0 || decisionSupport.monitor || decisionSupport.rankMovement) && (
                    <div className="mt-3.5 border-t border-line pt-3.5 space-y-2.5">
                      {decisionSupport.drivers.length > 0 && (
                        <p className="text-[12px] leading-relaxed">
                          <span className="font-bold text-pos">Driving this score: </span>
                          <span className="text-ink-muted">{decisionSupport.drivers.map((d) => `${QUALITY_LABELS[d.key] || d.key} (${d.score}/100)`).join(", ")}.</span>
                        </p>
                      )}
                      {decisionSupport.detractors.length > 0 && (
                        <p className="text-[12px] leading-relaxed">
                          <span className="font-bold text-neg">Holding it back: </span>
                          <span className="text-ink-muted">{decisionSupport.detractors.map((d) => `${QUALITY_LABELS[d.key] || d.key} (${d.score}/100)`).join(", ")}.</span>
                        </p>
                      )}
                      {decisionSupport.monitor && (
                        <p className="text-[12px] leading-relaxed">
                          <span className="font-bold text-warn">Monitor: </span>
                          <span className="text-ink-muted">{decisionSupport.monitor}</span>
                        </p>
                      )}
                      {decisionSupport.rankMovement && (
                        <p className="text-[12px] leading-relaxed">
                          <span className="font-bold text-accent-soft">Recent rank movement: </span>
                          <span className="text-ink-muted">{decisionSupport.rankMovement}</span>
                        </p>
                      )}
                    </div>
                  )}
                </WorkspaceCard>
              )}

              {/* Research Priority Score & Suggested Action */}
              {(priority || attentionReasons.length > 0) && (
                <WorkspaceCard
                  title="Why This Fund Deserves Attention"
                  subtitle="Flags recent rank-movements, news impact, and standing"
                  action={priority ? <Badge tone={TIER_TONE[priority.tier]}>{priority.tier} Priority</Badge> : null}
                >
                  {priority && (
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
                      <div className="flex items-center gap-4">
                        <div className="text-[32px] font-black tnum text-ink leading-none font-mono">
                          {priority.score}
                          <span className="text-[13px] text-ink-faint font-normal font-sans">/100</span>
                        </div>
                        <div>
                          <div className="text-[11px] uppercase tracking-wider text-ink-faint">Research Priority Score</div>
                          <div className="text-[11px] text-ink-muted">
                            Confidence Index: <span className="font-semibold text-accent-soft">{priority.coverage}/4 parameters</span>
                          </div>
                        </div>
                      </div>

                      {/* Suggested actions block */}
                      <div className="rounded-xl border border-line bg-surface-2 px-3.5 py-2">
                        <span className="text-[9.5px] uppercase font-bold tracking-wider text-ink-faint block">Suggested Action</span>
                        <span className="text-[12.5px] font-bold text-accent-soft mt-0.5 block">
                          {priority.score >= 70 ? "Investigate AMC Overlaps" : priority.score >= 40 ? "Monitor Return Spreads" : "Maintain Watchlist Monitor"}
                        </span>
                      </div>
                    </div>
                  )}

                  {attentionReasons.length > 0 ? (
                    <div className="space-y-3">
                      {attentionReasons.map((r, i) => (
                        <div key={i} className="border-b border-line pb-3 last:border-0 last:pb-0">
                          <div className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-accent-soft">{r.metric}</div>
                          <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{r.detail}</p>
                          <p className="mt-1 text-[10.5px] text-ink-faint font-semibold">Source: {r.source} · as of {r.timestamp || "—"}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[12.5px] text-ink-faint">No qualifying research-worthy signals flagged.</p>
                  )}

                  {priority && <p className="mt-3.5 border-t border-line pt-3 text-[11px] leading-relaxed text-ink-faint">{priority.explanation}</p>}
                </WorkspaceCard>
              )}

            </section>
          )}

          {/* TAB CONTENT: PERFORMANCE */}
          {(viewMode === "workspace" ? activeTab === "performance" : true) && (
            <section id="sec-performance" className="scroll-mt-24 space-y-6 animate-fade-in">
              
              {/* Return Metrics Cards */}
              <WorkspaceCard title="Point-to-Point Returns" subtitle="Annualised for periods exceeding 1 year">
                {rets.length ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {rets.map(([l, v, s]) => (
                      <div key={l} className="rounded-xl border border-line bg-surface px-3.5 py-3 hover:bg-surface-2 transition-all">
                        <div className="text-[10.5px] uppercase tracking-wider text-ink-faint flex items-center gap-1.5">
                          <span>{l}</span>
                          {s && <span className="text-[9.5px] lowercase text-ink-faint">({s})</span>}
                        </div>
                        <div className={`mt-1.5 text-[20px] font-bold tnum font-mono ${v >= 0 ? "text-pos" : "text-neg"}`}>
                          {v >= 0 ? "+" : ""}{v.toFixed(2)}%
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-line bg-surface px-4 py-3 text-[12.5px] text-ink-faint">
                    Insufficient historical data to compute returns.
                  </div>
                )}

                {fund.catRank && (
                  <div className="mt-4 border-t border-line pt-3 space-y-2.5">
                    <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-[12.5px] text-ink-muted">
                      <span>Category Rank: <strong className="text-ink font-mono">#{fund.catRank}</strong> of {fund.catSize}</span>
                      <span className="text-ink/20">·</span>
                      <span>Category Percentile: <strong className="text-ink font-mono">{fund.catPct}%</strong></span>
                      <span className="text-ink/20">·</span>
                      {fund.trend != null && (
                        <span className="inline-flex items-center gap-1">
                          Trend Index: <strong className="text-ink font-mono">{fund.trend}/100</strong> ({fund.trend >= 60 ? "Improving" : fund.trend <= 40 ? "Weakening" : "Steady"})
                          <TrendArrow value={fund.trend - 50} />
                        </span>
                      )}
                    </div>
                    <div className="max-w-xs">
                      <PercentileBar value={fund.catPct} markerValue={50} markerLabel="Category median" tone={fund.catPct >= 65 ? "pos" : fund.catPct <= 35 ? "neg" : "accent"} />
                    </div>
                  </div>
                )}
              </WorkspaceCard>

              {/* Synced NAV Trend and Volatility Charts */}
              <WorkspaceCard
                title="Synchronized Market Analytics"
                subtitle="Crosshairs and metrics update simultaneously across price and risk"
                action={
                  <div className="text-[11px] text-accent-soft font-bold flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent-soft animate-pulse" />
                    TradingView Synced Mode
                  </div>
                }
              >
                <div className="space-y-6">
                  <div>
                    <h4 className="text-[12px] font-bold uppercase tracking-wider text-ink-faint mb-2">Net Asset Value (NAV) Trend</h4>
                    <NavChart
                      points={history?.points}
                      code={fund.code}
                      hoveredDate={hoveredDate}
                      setHoveredDate={setHoveredDate}
                      days={days}
                      setDays={setDays}
                    />
                  </div>

                  <div className="border-t border-line pt-5">
                    <VolatilityChart
                      points={history?.points}
                      hoveredDate={hoveredDate}
                      setHoveredDate={setHoveredDate}
                      days={days}
                    />
                  </div>
                </div>
              </WorkspaceCard>

              {/* Calendar & Rolling Returns */}
              {(calReturns.length > 0 || rollReturns.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {calReturns.length > 0 && (
                    <WorkspaceCard title="Calendar Returns" subtitle="NAV returns calculated for each calendar year">
                      <div className="space-y-2 mt-1">
                        {calReturns.map((c) => (
                          <div key={c.year} className="flex items-center justify-between text-[12.5px] border-b border-line pb-1.5 last:border-0 last:pb-0">
                            <span className="text-ink-muted">
                              {c.year}
                              {c.from.slice(5) !== "01-01" || c.to.slice(5, 7) !== "12" ? (
                                <span className="text-ink-faint text-[11px]"> ({c.from} to {c.to})</span>
                              ) : null}
                            </span>
                            <span className={`tnum font-bold font-mono ${c.return >= 0 ? "text-pos" : "text-neg"}`}>
                              {c.return >= 0 ? "+" : ""}{c.return}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </WorkspaceCard>
                  )}

                  {rollReturns.length > 0 && (
                    <WorkspaceCard title="Rolling 12M Return" subtitle="Computed dynamically over periods">
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2 text-center">
                          <div className="p-2.5 rounded-lg border border-line bg-surface">
                            <span className="text-[10px] text-ink-faint block">Minimum 12M</span>
                            <span className="text-[15px] font-bold text-neg font-mono mt-1 block">
                              {Math.min(...rollReturns.map((r) => r.return)).toFixed(1)}%
                            </span>
                          </div>
                          <div className="p-2.5 rounded-lg border border-line bg-surface">
                            <span className="text-[10px] text-ink-faint block">Maximum 12M</span>
                            <span className="text-[15px] font-bold text-pos font-mono mt-1 block">
                              {Math.max(...rollReturns.map((r) => r.return)).toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        <div className="flex justify-center py-1">
                          <Sparkline values={rollReturns.map((r) => r.return)} width={220} height={40} />
                        </div>
                        <p className="text-[11px] text-ink-faint leading-relaxed text-center">
                          Based on {rollReturns.length} rolling 12-month periods calculated dynamically.
                        </p>
                      </div>
                    </WorkspaceCard>
                  )}
                </div>
              )}

            </section>
          )}

          {/* TAB CONTENT: RISK */}
          {(viewMode === "workspace" ? activeTab === "risk" : true) && (
            <section id="sec-risk" className="scroll-mt-24 space-y-6 animate-fade-in">
              
              {/* Volatility, Sharpe, Alpha, Beta */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                
                <WorkspaceCard title="Risk & Drawdown Ratios" subtitle="Standard daily NAV ratios calculated over 90 days">
                  {fund.vol90 != null ? (
                    <div className="space-y-3">
                      <div className="flex justify-between text-[12.5px] border-b border-line pb-1.5">
                        <span className="text-ink-faint">Annualised Volatility (90d)</span>
                        <span className="text-ink font-semibold font-mono">
                          {fund.vol90}% {categoryAvgVol != null && <span className="text-[11.5px] text-ink-faint font-normal"> (Category Avg: {categoryAvgVol}%)</span>}
                        </span>
                      </div>
                      <div className="flex justify-between text-[12.5px] border-b border-line pb-1.5">
                        <span className="text-ink-faint">Volatility (30d)</span>
                        <span className="text-ink font-semibold font-mono">{fund.vol30}%</span>
                      </div>
                      <div className="flex justify-between text-[12.5px] border-b border-line pb-1.5">
                        <span className="text-ink-faint">Downside Volatility</span>
                        <span className="text-ink font-semibold font-mono">
                          {fund.dvol90}% {categoryAvgDvol != null && <span className="text-[11.5px] text-ink-faint font-normal"> (Category Avg: {categoryAvgDvol}%)</span>}
                        </span>
                      </div>
                      <div className="flex justify-between text-[12.5px] border-b border-line pb-1.5">
                        <span className="text-ink-faint">Peak Drawdown (90d)</span>
                        <span className="text-neg font-bold font-mono">
                          {fund.maxdd90}% {categoryAvgMaxdd != null && <span className="text-[11.5px] text-ink-faint font-normal"> (Category Avg: {categoryAvgMaxdd}%)</span>}
                        </span>
                      </div>
                      <div className="flex justify-between text-[12.5px] border-b border-line pb-1.5">
                        <span className="text-ink-faint">Current Drawdown from High</span>
                        <span className={`font-mono font-semibold ${fund.ddFromHigh < 0 ? "text-neg" : "text-pos"}`}>
                          {fund.ddFromHigh >= 0 ? "+" : ""}{fund.ddFromHigh.toFixed(2)}%
                        </span>
                      </div>
                      <div className="flex justify-between text-[12.5px]">
                        <span className="text-ink-faint flex items-center gap-1.5">
                          Consistency Rating
                          <MetricTooltip>Share of trading days in the observed window where the NAV didn’t fall. Higher means fewer down-days, not necessarily higher returns — a fund can be highly consistent (few down-days) while still returning less than a more volatile fund. Best read alongside returns, not instead of them.</MetricTooltip>
                        </span>
                        <span className="text-ink font-semibold font-mono">
                          {fund.consistency}% {categoryAvgConsistency != null && <span className="text-[11.5px] text-ink-faint font-normal"> (Category Avg: {categoryAvgConsistency}%)</span>}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[12.5px] text-ink-faint">Insufficient data to calculate risk ratios.</p>
                  )}
                </WorkspaceCard>

                <WorkspaceCard title="Volatility Efficiency" subtitle="Sharpe, Sortino, Alpha, Beta vs Index Proxy">
                  {fund.vol90 != null ? (
                    <div className="space-y-3">
                      {sharpe != null && (
                        <div className="flex justify-between text-[12.5px] border-b border-line pb-1.5">
                          <span className="text-ink-faint flex items-center gap-1.5">
                            Sharpe Ratio (1Y, rf 6.5%)
                            <MetricTooltip>Return earned per unit of total risk taken, above the risk-free rate. Above 1 is generally considered good, above 2 very good, below 0 means the fund underperformed a risk-free investment. Example: a Sharpe of 1.2 means the fund earned 1.2 units of return for every unit of volatility.</MetricTooltip>
                          </span>
                          <span className={`font-bold font-mono ${sharpe >= 1 ? "text-pos" : "text-ink"}`}>{sharpe}</span>
                        </div>
                      )}
                      {sortino != null && (
                        <div className="flex justify-between text-[12.5px] border-b border-line pb-1.5">
                          <span className="text-ink-faint flex items-center gap-1.5">
                            Sortino Ratio (1Y, rf 6.5%)
                            <MetricTooltip>Like Sharpe, but only penalises downside volatility — a fund that swings up sharply isn’t treated as “risky” here. Above 1.5 is generally considered good. Useful alongside Sharpe: a much higher Sortino than Sharpe suggests the fund’s volatility skews more upside than downside.</MetricTooltip>
                          </span>
                          <span className={`font-bold font-mono ${sortino >= 1.5 ? "text-pos" : "text-ink"}`}>{sortino}</span>
                        </div>
                      )}
                      {riskStats && (
                        <>
                          <div className="border-b border-line pb-2.5">
                            <div className="flex justify-between text-[12.5px]">
                              <span className="text-ink-faint flex items-center gap-1.5">
                                Beta vs Benchmark Proxy
                                <MetricTooltip>How much the fund tends to move for every 1% move in its benchmark index. Beta of 1.0 means it moves in step with the index; above 1.0 means it amplifies moves (both up and down); below 1.0 means it’s more muted. Neither direction is inherently “better” — it depends on whether you want amplified or dampened market exposure.</MetricTooltip>
                              </span>
                              <span className="text-ink font-semibold font-mono">{riskStats.beta}</span>
                            </div>
                            <div className="mt-1.5">
                              <Gauge value={riskStats.beta} min={0} max={2} refValue={1} label="1.0 = matches benchmark" />
                            </div>
                          </div>
                          <div className="flex justify-between text-[12.5px] border-b border-line pb-1.5">
                            <span className="text-ink-faint flex items-center gap-1.5">
                              Alpha (Annualised)
                              <MetricTooltip>Return the fund generated beyond what its Beta alone would predict, given the benchmark’s actual performance — the part of the return not explained by simply tracking the market. Positive alpha suggests genuine outperformance after adjusting for risk; negative means it underperformed even accounting for its market exposure.</MetricTooltip>
                            </span>
                            <span className={`font-bold font-mono ${riskStats.alpha >= 0 ? "text-pos" : "text-neg"}`}>
                              {riskStats.alpha >= 0 ? "+" : ""}{riskStats.alpha}%
                            </span>
                          </div>
                          {riskStats.informationRatio != null && (
                            <div className="flex justify-between text-[12.5px] border-b border-line pb-1.5">
                              <span className="text-ink-faint flex items-center gap-1.5">
                                Information Ratio
                                <MetricTooltip>How consistently the fund beats its benchmark, relative to how much its outperformance varies. A high, stable information ratio suggests skill rather than a few lucky bets; a fund that occasionally spikes ahead then lags will score lower here even with the same average outperformance.</MetricTooltip>
                              </span>
                              <span className="text-ink font-semibold font-mono">{riskStats.informationRatio}</span>
                            </div>
                          )}
                        </>
                      )}
                      <p className="text-[10px] text-ink-faint leading-relaxed mt-1">
                        Beta & Alpha calculated against {riskStats?.indexUsed || "Standard Large Cap Index Proxy"} over {riskStats?.overlapDays || 90} trading days.
                      </p>
                    </div>
                  ) : (
                    <p className="text-[12.5px] text-ink-faint">Insufficient data to calculate efficiency ratios.</p>
                  )}
                </WorkspaceCard>

              </div>

              {/* Portfolio Risk allocations (from real holding factsheets) */}
              {port && (
                <WorkspaceCard title="Factsheet Portfolio Risks" subtitle="Calculated from monthly AMC filing updates">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-3.5 rounded-xl border border-line bg-surface">
                      <span className="text-[10.5px] text-ink-faint block uppercase tracking-wider">Holding Risk Level</span>
                      <span className="text-[16px] font-bold text-accent-soft block mt-1">{port.level}</span>
                      <span className="text-[11.5px] text-ink font-mono mt-0.5 block">{port.score}/100 Score</span>
                    </div>
                    <div className="p-3.5 rounded-xl border border-line bg-surface">
                      <span className="text-[10.5px] text-ink-faint block uppercase tracking-wider">Top 3 Sectors</span>
                      <span className="text-[20px] font-bold text-ink font-mono block mt-1">{port.sectorTop3}%</span>
                      <span className="text-[10.5px] text-ink-faint block mt-0.5">Aggregated Allocation</span>
                    </div>
                    <div className="p-3.5 rounded-xl border border-line bg-surface">
                      <span className="text-[10.5px] text-ink-faint block uppercase tracking-wider">Top 10 Holdings</span>
                      <span className="text-[20px] font-bold text-ink font-mono block mt-1">{port.top10}%</span>
                      <span className="text-[10.5px] text-ink-faint block mt-0.5">Concentration Weight</span>
                    </div>
                  </div>
                  <p className="mt-3.5 text-[12px] text-ink-muted border-t border-line pt-2.5">
                    <strong>Portfolio Insight:</strong> {port.insights.join(" ")}
                  </p>
                </WorkspaceCard>
              )}

            </section>
          )}

          {/* TAB CONTENT: RESEARCH */}
          {(viewMode === "workspace" ? activeTab === "research" : true) && (
            <section id="sec-research" className="scroll-mt-24 space-y-6 animate-fade-in">
              
              {/* Research readiness checklist */}
              <WorkspaceCard title="Research Readiness & Completeness Check" subtitle="Checklist tracking available sourced factual parameters">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4 mb-4">
                  <div>
                    <span className="text-[10.5px] uppercase font-bold tracking-wider text-ink-faint">Data Readiness Rating</span>
                    <h4 className="text-[22px] font-bold text-ink font-mono mt-1">
                      {readiness.answered} <span className="text-[13px] text-ink-faint font-normal font-sans">of {readiness.total} questions answered</span>
                    </h4>
                  </div>
                  <div>
                    <span className="text-[10.5px] uppercase font-bold tracking-wider text-ink-faint">Completeness Index</span>
                    <h4 className={`text-[22px] font-bold font-mono mt-1 ${
                      completenessTone(completeness.score) === "pos" ? "text-pos" : completenessTone(completeness.score) === "warn" ? "text-warn" : "text-neg"
                    }`}>
                      {completeness.score}%
                    </h4>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {readiness.questions.map((q) => (
                    <div key={q.question} className="rounded-xl border border-line bg-surface p-3 text-[12.5px] flex items-start gap-2.5">
                      <span className={`text-[14px] ${q.answered ? "text-pos font-bold" : "text-ink-faint"}`}>
                        {q.answered ? "✓" : "○"}
                      </span>
                      <div className="min-w-0">
                        <span className={`font-semibold truncate block ${q.answered ? "text-ink-muted" : "text-ink-faint"}`}>
                          {q.question}
                        </span>
                        <span className="text-[10px] text-ink-faint block mt-0.5">
                          {q.answered ? `Source: ${q.source}` : "Not yet acquired"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </WorkspaceCard>

              {/* Private browser notes */}
              <WorkspaceCard title="Your Workspace Notes" subtitle="Saved locally to your browser, never transmitted to external APIs">
                <ResearchNotes code={fund.code} name={fund.name.replace(/ - (Direct|Regular).*/i, "")} />
              </WorkspaceCard>

            </section>
          )}

          {/* TAB CONTENT: NEWS */}
          {(viewMode === "workspace" ? activeTab === "news" : true) && (
            <section id="sec-news" className="scroll-mt-24 space-y-6 animate-fade-in">
              
              {/* Documents & PDF Factsheets */}
              <WorkspaceCard title="Verified Factsheet Documents" subtitle="Official filings stored and managed locally">
                {meta?.source_url ? (
                  <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-line bg-surface text-[13px]">
                    <div>
                      <span className="text-ink font-bold block">AMC Factsheet Filing</span>
                      <span className="text-[11px] text-ink-faint mt-0.5 block">As of {meta.source_date || "Unknown Date"}</span>
                    </div>
                    <a
                      className="rounded-lg bg-accent px-4 py-2 text-[12.5px] font-bold text-ink hover:bg-accent/80 transition-colors"
                      href={meta.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open PDF Factsheet ↗
                    </a>
                  </div>
                ) : (
                  <p className="text-[12.5px] text-ink-faint">
                    No verified PDF factsheet filing acquired for this scheme. Sourced files appear once parsed from AMC filings.
                  </p>
                )}
              </WorkspaceCard>

              {/* Linked news articles — News Intelligence 4.0 (Phase 9): why it matters, affected
                  sectors/categories/AMCs, expected impact, confidence, rule used, related funds. */}
              {relatedNews.length > 0 ? (
                <WorkspaceCard title="Linked Market News" subtitle="Why each article matters to this fund, not just that it exists">
                  <div className="space-y-4">
                    {relatedNews.map((n, i) => {
                      const ins = newsInsights?.[n.id];
                      return (
                        <div key={n.id} className="rounded-xl border border-line bg-surface p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-[11px] text-ink-faint font-semibold">
                                {n.source?.name || "Market Feed"} · {relativeTime ? relativeTime(n.publishedAt) : "recent"}
                              </div>
                              <a href={n.url} target="_blank" rel="noopener noreferrer" className="mt-1 font-bold text-ink hover:text-accent-soft block">{n.title}</a>
                            </div>
                            {ins?.expectedImpact && (
                              <Badge tone={ins.expectedImpact === "Critical" || ins.expectedImpact === "High" ? "neg" : ins.expectedImpact === "Medium" ? "warn" : "neutral"}>
                                {ins.expectedImpact} Impact
                              </Badge>
                            )}
                          </div>

                          {ins && (
                            <div className="mt-3 space-y-2 border-t border-line pt-3">
                              {ins.whyItMatters && (
                                <p className="text-[11.5px] leading-relaxed text-ink-muted"><span className="font-semibold text-ink">Why it matters: </span>{ins.whyItMatters}</p>
                              )}
                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-ink-faint">
                                {ins.affectedSectors.length > 0 && <span>Sectors: <strong className="text-ink-muted">{ins.affectedSectors.join(", ")}</strong></span>}
                                {ins.affectedCategories.length > 0 && <span>Categories: <strong className="text-ink-muted">{ins.affectedCategories.join(", ")}</strong></span>}
                                {ins.affectedAmcs.length > 0 && <span>AMCs: <strong className="text-ink-muted">{ins.affectedAmcs.join(", ")}</strong></span>}
                                {ins.ruleUsed && <span>Rule: <strong className="text-ink-muted font-mono">{ins.ruleUsed}</strong></span>}
                                <span>Confidence: <strong className="text-ink-muted">{ins.confidence}</strong> (source: {n.source?.credibility || "unverified"})</span>
                              </div>
                              {ins.relatedFunds.length > 0 && (
                                <div className="flex flex-wrap gap-2 pt-1">
                                  {ins.relatedFunds.map((rf) => (
                                    <a key={rf.code} href={`/fund/${rf.code}`} className="text-[10.5px] rounded-full border border-line px-2 py-0.5 text-ink-muted hover:text-accent-soft hover:border-accent-soft/40 transition-colors">
                                      {rf.name.replace(/ - (Direct|Regular).*/i, "")} {rf.health != null ? `· ${rf.health}/100` : ""}
                                    </a>
                                  ))}
                                </div>
                              )}
                              {i === 0 && similarPastEvents?.length > 0 && (
                                <div className="pt-1.5">
                                  <span className="text-[10.5px] text-ink-faint">Historical similar events ({similarPastEvents.length}): </span>
                                  {similarPastEvents.map((p, j) => (
                                    <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" className="text-[10.5px] text-accent-soft hover:underline">
                                      {j > 0 && ", "}{p.title.slice(0, 50)}{p.title.length > 50 ? "…" : ""}
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </WorkspaceCard>
              ) : (
                <div className="rounded-xl border border-line bg-surface p-5 text-center text-ink-faint text-[12.5px]">
                  No linked market articles for {fund.amc} or {fund.category} in the last 24 hours.
                </div>
              )}

            </section>
          )}

          {/* TAB CONTENT: COMPARE */}
          {(viewMode === "workspace" ? activeTab === "compare" : true) && (
            <section id="sec-compare" className="scroll-mt-24 space-y-6 animate-fade-in">
              
              {/* Category Peer comparisons */}
              {cohort && (
                <WorkspaceCard title="Category Benchmark & Peer Comparison" subtitle="Comparing relative point-to-point NAV returns">
                  
                  {/* Performance Comparison Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12.5px] text-left border-collapse">
                      <thead>
                        <tr className="border-b border-line text-[10px] uppercase font-bold tracking-wider text-ink-faint">
                          <th className="py-2.5 pr-4">
                            <button onClick={() => toggleSort("window")} className="flex items-center gap-1 hover:text-ink">
                              Window {tableSortKey === "window" && (tableSortDesc ? "▼" : "▲")}
                            </button>
                          </th>
                          <th className="py-2.5 text-right">
                            <button onClick={() => toggleSort("fund")} className="flex items-center gap-1 justify-end ml-auto hover:text-ink">
                              Fund {tableSortKey === "fund" && (tableSortDesc ? "▼" : "▲")}
                            </button>
                          </th>
                          <th className="py-2.5 text-right">
                            <button onClick={() => toggleSort("peer")} className="flex items-center gap-1 justify-end ml-auto hover:text-ink">
                              Peer Avg {tableSortKey === "peer" && (tableSortDesc ? "▼" : "▲")}
                            </button>
                          </th>
                          <th className="py-2.5 text-right">
                            <button onClick={() => toggleSort("delta")} className="flex items-center gap-1 justify-end ml-auto hover:text-ink">
                              Outperformance {tableSortKey === "delta" && (tableSortDesc ? "▼" : "▲")}
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedBench.map((b) => (
                          <tr
                            key={b.label}
                            className="border-b border-line hover:bg-surface-2 transition-colors group"
                          >
                            <td className="py-3 font-semibold text-ink-muted">
                              {b.label} {b.pa ? <span className="text-[9.5px] text-ink-faint font-normal">(p.a.)</span> : null}
                            </td>
                            <td
                              onClick={() => copyToClipboard(b.fund.toFixed(2) + "%", `${b.label} Fund return`)}
                              className={`py-3 text-right font-mono font-bold cursor-copy hover:underline ${
                                b.fund >= 0 ? "text-pos" : "text-neg"
                              }`}
                            >
                              {b.fund >= 0 ? "+" : ""}{b.fund.toFixed(2)}%
                            </td>
                            <td className="py-3 text-right font-mono text-ink-faint">
                              {b.peer >= 0 ? "+" : ""}{b.peer.toFixed(2)}%
                            </td>
                            <td
                              className={`py-3 text-right font-mono font-bold ${
                                b.delta >= 0 ? "text-pos" : "text-neg"
                              }`}
                            >
                              {b.delta >= 0 ? "+" : ""}{b.delta.toFixed(2)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <p className="mt-4 text-[10.5px] text-ink-faint leading-relaxed">
                    Comparison based on category cohort <strong>{fund.category}</strong>. Click any return percentage to copy it.
                  </p>
                </WorkspaceCard>
              )}

              {/* Suggested comparison funds */}
              {comparisons.length > 0 && (
                <WorkspaceCard title="Suggested Comparison peer funds" subtitle="Same plan and category, sorted by diagnostics">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {comparisons.map((c) => (
                      <a
                        key={c.code}
                        href={`/fund/${c.code}`}
                        className="glass block p-4 text-[12.5px] hover:bg-surface-strong transition-colors rounded-xl border border-line"
                      >
                        <div className="font-bold text-ink truncate">{c.name}</div>
                        <div className="text-[11px] text-ink-faint mt-0.5 truncate">{c.amc}</div>
                        <div className="mt-3 flex items-center justify-between">
                          <span className={`font-bold ${c.health >= 70 ? "text-pos" : c.health >= 55 ? "text-warn" : "text-neg"}`}>
                            {c.health}/100 Score
                          </span>
                          {c.r1m != null && (
                            <span className={`font-mono ${c.r1m >= 0 ? "text-pos" : "text-neg"}`}>
                              {c.r1m >= 0 ? "+" : ""}{c.r1m.toFixed(1)}% (1M)
                            </span>
                          )}
                        </div>
                      </a>
                    ))}
                  </div>
                </WorkspaceCard>
              )}

              {/* Suggested Next actions checklist */}
              <WorkspaceCard title="Next Research Actions" subtitle="Logical paths to proceed with comparison or AMC audits">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {nextActionsItems.map((item, idx) => (
                    <a
                      key={idx}
                      href={item.href}
                      className="flex items-center justify-between p-3.5 rounded-xl border border-line bg-surface hover:bg-surface-2 transition-colors group"
                    >
                      <span className="text-[12.5px] text-ink-muted group-hover:text-ink font-semibold">
                        {item.label}
                      </span>
                      <span className="text-ink-faint group-hover:text-accent-soft transition-colors font-bold text-[14px]">
                        →
                      </span>
                    </a>
                  ))}
                </div>
              </WorkspaceCard>

            </section>
          )}

        </main>
        
      </div>
    </div>
  );
}
