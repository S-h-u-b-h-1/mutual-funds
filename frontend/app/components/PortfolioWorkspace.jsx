"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";

const STAGES = ["Uploading", "Reading PDF", "Extracting Holdings", "Matching Funds", "Validating", "Building Portfolio", "AI Analysis"];
const STATEMENT_TYPES = [
  { key: "cams_cas_pdf", label: "CAMS CAS PDF", detail: "Consolidated Account Statement issued by CAMS" },
  { key: "kfin_cas_pdf", label: "KFIN CAS PDF", detail: "Consolidated Account Statement issued by KFintech" },
  { key: "mfcentral_summary", label: "MF Central Portfolio Summary", detail: "MF Central consolidated portfolio statement" },
];
const HISTORY_KEY = "mfp-portfolio-upload-history-v1";

const money = (value) => value == null || Number.isNaN(Number(value))
  ? "Not available"
  : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value));
const number = (value, suffix = "") => value == null || Number.isNaN(Number(value)) ? "Not available" : `${Number(value).toFixed(Number(value) % 1 === 0 ? 0 : 1)}${suffix}`;

function storageKey(user) {
  return `${HISTORY_KEY}:${String(user?.id || user?.email || "anonymous").toLowerCase()}`;
}

function readHistory(user) {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(window.localStorage.getItem(storageKey(user)) || "[]"); } catch { return []; }
}

function writeHistory(user, rows) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(user), JSON.stringify(rows.slice(0, 8)));
}

function snapshotHoldings(holdings) {
  return (holdings || []).map((h) => ({
    schemeCode: h.schemeCode,
    name: h.name || h.schemeName,
    weight: Number(h.weight || 0),
    value: Number(h.currentValue || 0),
  }));
}

function compareSnapshots(previous = [], current = []) {
  const prev = new Map(previous.map((h) => [String(h.schemeCode), h]));
  const curr = new Map(current.map((h) => [String(h.schemeCode), h]));
  const added = current.filter((h) => !prev.has(String(h.schemeCode)));
  const removed = previous.filter((h) => !curr.has(String(h.schemeCode)));
  const changed = current
    .map((h) => {
      const old = prev.get(String(h.schemeCode));
      if (!old) return null;
      const delta = Number(h.weight || 0) - Number(old.weight || 0);
      return Math.abs(delta) >= 0.25 ? { ...h, previousWeight: old.weight, delta } : null;
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return { added, removed, changed };
}

function assetAllocation(categoryAllocation = []) {
  const buckets = { Equity: 0, Debt: 0, Hybrid: 0, Gold: 0, International: 0, Other: 0 };
  for (const item of categoryAllocation) {
    const name = String(item.name || "").toLowerCase();
    const weight = Number(item.weight || 0);
    if (/debt|gilt|liquid|bond|money market|overnight|duration|credit/.test(name)) buckets.Debt += weight;
    else if (/hybrid|balanced|multi asset/.test(name)) buckets.Hybrid += weight;
    else if (/gold/.test(name)) buckets.Gold += weight;
    else if (/international|global|overseas/.test(name)) buckets.International += weight;
    else if (/equity|cap|elss|value|contra|index|sector|thematic|dividend yield|focused|flexi/.test(name)) buckets.Equity += weight;
    else buckets.Other += weight;
  }
  return Object.entries(buckets)
    .filter(([, weight]) => weight > 0)
    .map(([name, weight]) => ({ name, weight: +weight.toFixed(1) }))
    .sort((a, b) => b.weight - a.weight);
}

function scoreTone(value) {
  if (value == null) return "text-ink-faint";
  if (value >= 70) return "text-pos";
  if (value >= 45) return "text-warn";
  return "text-neg";
}

function ratingFromScore(score) {
  if (score == null) return "Unrated";
  if (score >= 85) return "A+";
  if (score >= 75) return "A";
  if (score >= 65) return "B+";
  if (score >= 50) return "B";
  return "C";
}

function returnValue(holding) {
  const candidates = [holding?.return1y, holding?.ret1y, holding?.oneYearReturn, holding?.returns?.oneYear, holding?.returns?.y1, holding?.y1];
  return candidates.find((v) => v != null && !Number.isNaN(Number(v)));
}

function FileIcon() {
  return (
    <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 3.75h6.4L18 8.35v11.9H7z" stroke="currentColor" strokeWidth="1.7" />
      <path d="M13 4v5h5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9.5 13h5M9.5 16h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function MetricCard({ label, value, detail, tone = "text-ink" }) {
  return (
    <article className="rounded-[1.35rem] border border-line bg-surface p-4 shadow-sm">
      <div className="eyebrow">{label}</div>
      <div className={`financial-number mt-2 text-xl font-semibold tracking-[-0.04em] ${tone}`}>{value}</div>
      {detail && <p className="mt-2 text-[11px] leading-4 text-ink-faint">{detail}</p>}
    </article>
  );
}

function AllocationCard({ title, items = [], note }) {
  return (
    <section className="rounded-[1.5rem] border border-line bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="eyebrow">{title}</div>
          {note && <p className="mt-1 text-[11px] text-ink-faint">{note}</p>}
        </div>
      </div>
      {items.length ? (
        <div className="mt-5 space-y-3">
          {items.slice(0, 8).map((item, index) => (
            <div key={`${title}-${item.name}`}>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="flex min-w-0 items-center gap-2 text-ink-muted">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-accent" style={{ opacity: Math.max(0.35, 1 - index * 0.08) }} aria-hidden="true" />
                  <span className="truncate">{item.name}</span>
                </span>
                <span className="financial-number text-ink">{number(item.weight, "%")}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-strong">
                <div className="h-full rounded-full bg-accent transition-all duration-700" style={{ width: `${Math.min(100, item.weight || 0)}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-5 rounded-2xl border border-dashed border-line p-4 text-sm text-ink-muted">Allocation data will appear after a successful portfolio analysis.</p>
      )}
    </section>
  );
}

function UploadStages({ activeIndex, complete, error }) {
  return (
    <div className="rounded-[1.5rem] border border-line bg-surface p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Processing pipeline</div>
          <div className="mt-1 text-sm font-semibold text-ink">{error ? "Stopped with an error" : complete ? "Portfolio built" : "Secure statement processing"}</div>
        </div>
        {complete && <div className="grid h-10 w-10 animate-pulse place-items-center rounded-full bg-pos/15 text-pos">✓</div>}
      </div>
      <div className="grid gap-2">
        {STAGES.map((stage, index) => {
          const done = complete || index < activeIndex;
          const active = index === activeIndex && !complete && !error;
          return (
            <div key={stage} className={`flex items-center gap-3 rounded-2xl border px-3 py-2 text-sm transition ${done ? "border-pos/20 bg-pos/10 text-pos" : active ? "border-accent/30 bg-accent/10 text-accent" : "border-line bg-surface-2 text-ink-faint"}`}>
              <span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] ${done ? "bg-pos text-white" : active ? "animate-pulse bg-accent text-white" : "bg-line text-ink-faint"}`}>{done ? "✓" : index + 1}</span>
              <span className="font-medium">{stage}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PortfolioWorkspace() {
  const { data: session, status: authStatus } = useSession();
  const [consent, setConsent] = useState(false);
  const [statementType, setStatementType] = useState(STATEMENT_TYPES[0].key);
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState("");
  const [dragging, setDragging] = useState(false);
  const [holdings, setHoldings] = useState([]);
  const [unresolved, setUnresolved] = useState([]);
  const [report, setReport] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeStage, setActiveStage] = useState(0);
  const [complete, setComplete] = useState(false);
  const [view, setView] = useState("dashboard");
  const [history, setHistory] = useState([]);
  const uploadInputRef = useRef(null);
  const dashboardRef = useRef(null);

  useEffect(() => {
    if (!file) { setFileUrl(""); return undefined; }
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (session?.user) setHistory(readHistory(session.user));
  }, [session]);

  async function loadHoldings() {
    const response = await fetch("/api/v1/portfolio/holdings");
    if (response.status === 401) return [];
    const data = await response.json();
    if (response.ok) {
      setHoldings(data.items || []);
      setUnresolved(data.unresolved || []);
      return data.items || [];
    }
    throw new Error(data.error || "Holdings could not be loaded.");
  }

  async function computeReport() {
    const response = await fetch("/api/v1/portfolio/intelligence");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Portfolio intelligence could not be computed.");
    setReport(data.report);
    setUnresolved(data.unresolvedHoldings || []);
    return data.report;
  }

  async function refreshReport() {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      await computeReport();
      setMessage(`Portfolio analysis refreshed at ${new Date().toLocaleString("en-IN")}.`);
    } catch (err) {
      setError(err.message || "Portfolio intelligence could not be computed.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!session) return;
    loadHoldings()
      .then((items) => {
        if (items.length) return computeReport();
        setView("import");
        return null;
      })
      .catch(() => setMessage("Portfolio dashboard is ready. Upload a statement to start analysis."));
  }, [session]);

  function selectFile(nextFile) {
    setError("");
    setMessage("");
    setComplete(false);
    if (!nextFile) { setFile(null); return; }
    if (nextFile.type && nextFile.type !== "application/pdf") {
      setError("Upload a PDF statement only. CSV import has been removed from this experience.");
      setFile(null);
      return;
    }
    if (!/\.pdf$/i.test(nextFile.name)) {
      setError("Only PDF statements are supported in the new import workflow.");
      setFile(null);
      return;
    }
    setFile(nextFile);
  }

  function onDrop(event) {
    event.preventDefault();
    setDragging(false);
    selectFile(event.dataTransfer.files?.[0] || null);
  }

  function saveUploadHistory(status, details = {}) {
    const statement = STATEMENT_TYPES.find((item) => item.key === statementType);
    const row = {
      id: `${Date.now()}`,
      fileName: file?.name || "Portfolio statement",
      statementType: statement?.label || "Portfolio Statement",
      status,
      uploadedAt: new Date().toISOString(),
      snapshot: snapshotHoldings(details.holdings || holdings),
      imported: details.imported ?? null,
      message: details.message || "",
    };
    const next = [row, ...history].slice(0, 8);
    setHistory(next);
    writeHistory(session.user, next);
    return row;
  }

  async function processStatement() {
    setError("");
    setMessage("");
    setComplete(false);
    if (!consent) { setError("Confirm consent before processing a portfolio statement."); return; }
    if (!file) { setError("Upload a CAMS, KFIN, or MF Central PDF statement first."); return; }

    setBusy(true);
    setActiveStage(0);

    const stageTimer = window.setInterval(() => {
      setActiveStage((current) => Math.min(STAGES.length - 1, current + 1));
    }, 650);

    try {
      const form = new FormData();
      form.append("source", statementType);
      form.append("file", file);
      const response = await fetch("/api/v1/portfolio/upload", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Statement processing failed.");

      setActiveStage(STAGES.length - 1);
      const nextHoldings = await loadHoldings();
      await computeReport();
      saveUploadHistory("success", { holdings: nextHoldings, imported: data.imported, message: `${data.imported} holdings imported.` });
      setComplete(true);
      setMessage("Portfolio statement processed. Opening dashboard…");
      window.setTimeout(() => {
        setView("dashboard");
        dashboardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 900);
    } catch (err) {
      const text = err.message || "Statement processing failed.";
      setError(text);
      saveUploadHistory("failed", { message: text });
    } finally {
      window.clearInterval(stageTimer);
      setBusy(false);
    }
  }

  const dashboard = useMemo(() => {
    const totalValue = report?.portfolioSummary?.totalValue ?? holdings.reduce((sum, h) => sum + Number(h.currentValue || 0), 0);
    const invested = holdings.reduce((sum, h) => sum + (h.avgCost != null ? Number(h.avgCost || 0) * Number(h.units || 0) : 0), 0);
    const hasInvested = holdings.some((h) => h.avgCost != null);
    const gain = hasInvested ? totalValue - invested : null;
    const sortedByReturn = holdings.map((h) => ({ ...h, _return: returnValue(h) })).filter((h) => h._return != null).sort((a, b) => Number(b._return) - Number(a._return));
    return {
      totalValue,
      invested: hasInvested ? invested : null,
      gain,
      rating: ratingFromScore(report?.portfolioSummary?.healthScore),
      diversification: report?.diversification?.score ?? null,
      riskScore: report?.concentration?.score ?? null,
      amc: report?.allocations?.amc || [],
      sector: report?.allocations?.sector?.breakdown || [],
      asset: assetAllocation(report?.allocations?.category || []),
      topHoldings: report?.topHoldings || holdings.slice().sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0)).slice(0, 10),
      best: sortedByReturn[0] || null,
      worst: sortedByReturn.at(-1) || null,
    };
  }, [holdings, report]);

  const latestHistory = history[0] || null;
  const comparison = history.length >= 2 ? compareSnapshots(history[1].snapshot, history[0].snapshot) : compareSnapshots([], snapshotHoldings(holdings));

  if (authStatus === "loading") return <div className="skeleton h-72 rounded-[2rem]" aria-label="Loading portfolio workspace" />;
  if (!session) {
    return (
      <section className="rounded-[2rem] border border-line bg-surface p-6 shadow-float sm:p-8">
        <div className="eyebrow">Private workspace</div>
        <h2 className="section-title mt-3">Sign in to import and analyze holdings.</h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-ink-muted">Portfolio records are user-scoped. MF Pulse does not accept holdings into an anonymous session.</p>
        <a href="/login?callbackUrl=/portfolio" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-accent px-5 text-sm font-semibold text-white">Sign in securely</a>
      </section>
    );
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[2rem] border border-line bg-ink text-bg shadow-float">
        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <div className="eyebrow text-accent-soft">Institutional portfolio import</div>
            <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.06em] sm:text-4xl">Upload Portfolio Statement</h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-bg/70">A premium statement workflow for CAMS, KFIN, and MF Central PDFs with preview, processing states, history, and portfolio dashboard handoff.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {STATEMENT_TYPES.map((type) => <span key={type.key} className="rounded-full border border-white/12 bg-white/[0.06] px-3 py-1 text-xs text-bg/80">{type.label}</span>)}
            </div>
          </div>
          <div className="grid content-end gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {[["Recent Upload", latestHistory ? latestHistory.fileName : "None yet"], ["Last Updated", latestHistory ? new Date(latestHistory.uploadedAt).toLocaleString("en-IN") : "Waiting for import"], ["Holdings", `${holdings.length} resolved`]].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-bg/45">{label}</div>
                <div className="mt-2 truncate text-sm font-semibold text-bg">{value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-full border border-line bg-surface p-1 shadow-sm">
          <button type="button" onClick={() => setView("dashboard")} aria-pressed={view === "dashboard"} className={`min-h-10 rounded-full px-4 text-sm font-semibold transition ${view === "dashboard" ? "bg-ink text-bg" : "text-ink-muted hover:text-ink"}`}>Portfolio Dashboard</button>
          <button type="button" onClick={() => setView("import")} aria-pressed={view === "import"} className={`min-h-10 rounded-full px-4 text-sm font-semibold transition ${view === "import" ? "bg-ink text-bg" : "text-ink-muted hover:text-ink"}`}>Re-upload Statement</button>
        </div>
        <button type="button" onClick={() => { setView("import"); window.setTimeout(() => uploadInputRef.current?.click(), 100); }} className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-white shadow-glow">Upload Portfolio Statement</button>
      </div>

      {view === "import" && (
        <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="rounded-[2rem] border border-line bg-surface p-5 shadow-float sm:p-6">
            <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface-2 p-4">
              <input id="portfolio-consent" type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 h-5 w-5 rounded border-line text-accent" />
              <label htmlFor="portfolio-consent" className="text-sm leading-6 text-ink-muted"><b className="text-ink">I consent to processing this portfolio statement for research.</b><br />Imported values are used to calculate portfolio evidence. This is not a suitability assessment or guaranteed recommendation.</label>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {STATEMENT_TYPES.map((type) => (
                <button key={type.key} type="button" onClick={() => setStatementType(type.key)} aria-pressed={statementType === type.key} className={`rounded-2xl border p-4 text-left transition ${statementType === type.key ? "border-accent bg-accent/10 text-accent" : "border-line bg-surface-2 text-ink-muted hover:border-line-strong hover:text-ink"}`}>
                  <div className="text-sm font-semibold">{type.label}</div>
                  <p className="mt-1 text-xs leading-5 opacity-75">{type.detail}</p>
                </button>
              ))}
            </div>

            <div
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`mt-5 grid min-h-[260px] place-items-center rounded-[2rem] border-2 border-dashed p-6 text-center transition ${dragging ? "border-accent bg-accent/10" : "border-line bg-bg"}`}
            >
              <input ref={uploadInputRef} type="file" accept="application/pdf,.pdf" onChange={(event) => selectFile(event.target.files?.[0] || null)} className="sr-only" />
              <div className="mx-auto max-w-md">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-accent/12 text-accent"><FileIcon /></div>
                <h3 className="mt-5 text-xl font-semibold tracking-[-0.04em] text-ink">Drop your statement PDF here</h3>
                <p className="mt-2 text-sm leading-6 text-ink-muted">CSV import has been removed. Use a CAMS CAS, KFIN CAS, or MF Central Portfolio Summary PDF.</p>
                <button type="button" onClick={() => uploadInputRef.current?.click()} className="mt-5 inline-flex min-h-11 items-center rounded-full bg-ink px-5 text-sm font-semibold text-bg">Choose PDF</button>
              </div>
            </div>

            {file && (
              <div className="mt-5 grid gap-5 lg:grid-cols-[280px_1fr]">
                <div className="rounded-[1.5rem] border border-line bg-surface-2 p-4">
                  <div className="eyebrow">Selected file</div>
                  <div className="mt-2 truncate text-sm font-semibold text-ink">{file.name}</div>
                  <div className="mt-1 text-xs text-ink-faint">{(file.size / 1024 / 1024).toFixed(2)} MB · PDF preview ready</div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" onClick={processStatement} disabled={busy || !consent} className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Processing…" : "Process statement"}</button>
                    <button type="button" onClick={() => selectFile(null)} disabled={busy} className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm font-semibold text-ink-muted hover:text-ink disabled:opacity-50">Remove</button>
                  </div>
                </div>
                <div className="min-h-[320px] overflow-hidden rounded-[1.5rem] border border-line bg-surface-2">
                  <object data={fileUrl} type="application/pdf" className="h-[420px] w-full" aria-label="PDF preview">
                    <div className="p-5 text-sm text-ink-muted">PDF preview is not available in this browser. You can still process the statement.</div>
                  </object>
                </div>
              </div>
            )}
            {message && <p className="mt-4 rounded-2xl border border-line bg-surface-2 p-3 text-sm text-ink-muted" role="status">{message}</p>}
            {error && <p className="mt-4 rounded-2xl border border-neg/25 bg-neg/10 p-3 text-sm text-neg" role="alert">{error}</p>}
          </div>
          <aside className="space-y-5">
            <UploadStages activeIndex={activeStage} complete={complete} error={error} />
            <section className="rounded-[1.5rem] border border-line bg-surface p-4">
              <div className="eyebrow">Upload History</div>
              <div className="mt-4 space-y-3">
                {(history.length ? history : [{ id: "empty", status: "empty", fileName: "No uploads yet", uploadedAt: null, statementType: "Upload history will appear here" }]).map((item) => (
                  <div key={item.id} className="rounded-2xl border border-line bg-surface-2 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 truncate text-sm font-semibold text-ink">{item.fileName}</div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${item.status === "success" ? "bg-pos/10 text-pos" : item.status === "failed" ? "bg-neg/10 text-neg" : "bg-ink-faint/10 text-ink-faint"}`}>{item.status}</span>
                    </div>
                    <div className="mt-1 text-xs text-ink-faint">{item.statementType}{item.uploadedAt ? ` · ${new Date(item.uploadedAt).toLocaleString("en-IN")}` : ""}</div>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </section>
      )}

      <section ref={dashboardRef} id="portfolio-dashboard" className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="eyebrow text-accent">Portfolio Dashboard</div>
            <h2 className="section-title mt-2">Institutional portfolio command center</h2>
          </div>
          <button type="button" onClick={refreshReport} disabled={!holdings.length || busy} className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-5 text-sm font-semibold text-ink-muted shadow-sm hover:text-ink disabled:cursor-not-allowed disabled:opacity-45">{busy ? "Refreshing…" : "Refresh analysis"}</button>
        </div>

        {!holdings.length ? (
          <div className="rounded-[2rem] border border-dashed border-line bg-surface p-8 text-center shadow-sm">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent/12 text-accent"><FileIcon /></div>
            <h3 className="mt-5 text-2xl font-semibold tracking-[-0.05em] text-ink">No portfolio imported yet.</h3>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-ink-muted">Upload a supported PDF statement to build holdings, allocation, risk, history, and comparison views.</p>
            <button type="button" onClick={() => setView("import")} className="mt-6 inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-white">Upload Portfolio Statement</button>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Portfolio Value" value={money(dashboard.totalValue)} detail={`${holdings.length} resolved holdings`} />
              <MetricCard label="Invested Value" value={money(dashboard.invested)} detail={dashboard.invested == null ? "Average cost missing for some holdings" : "From imported average cost"} />
              <MetricCard label="Current Gain" value={money(dashboard.gain)} tone={dashboard.gain > 0 ? "text-pos" : dashboard.gain < 0 ? "text-neg" : "text-ink"} detail="Current value minus imported cost" />
              <MetricCard label="Today's Gain" value="Pending NAV delta" detail="Daily P&L needs historical unit-level NAV snapshots." />
              <MetricCard label="Portfolio Rating" value={dashboard.rating} tone={scoreTone(report?.portfolioSummary?.healthScore)} detail={report?.portfolioSummary?.healthScore == null ? "Run analysis to rate" : `Health score ${report.portfolioSummary.healthScore}/100`} />
              <MetricCard label="Diversification Score" value={dashboard.diversification == null ? "Not available" : `${dashboard.diversification}/100`} tone={scoreTone(dashboard.diversification)} detail={report?.diversification ? `${number(report.diversification.effectiveHoldings)} effective holdings` : "Pending analysis"} />
              <MetricCard label="Risk Score" value={dashboard.riskScore == null ? "Not available" : `${dashboard.riskScore}/100`} tone={dashboard.riskScore >= 40 ? "text-neg" : dashboard.riskScore >= 20 ? "text-warn" : "text-pos"} detail="Existing concentration-risk score" />
              <MetricCard label="Last Updated" value={latestHistory ? new Date(latestHistory.uploadedAt).toLocaleDateString("en-IN") : "Not recorded"} detail={latestHistory?.fileName || "No upload history yet"} />
            </div>

            {report?.bottomLine && (
              <section className="rounded-[1.5rem] border border-accent/25 bg-accent/10 p-5">
                <div className="eyebrow text-accent">AI Summary</div>
                <p className="mt-2 text-sm leading-6 text-ink">{report.bottomLine}</p>
              </section>
            )}

            <div className="grid gap-4 lg:grid-cols-3">
              <AllocationCard title="AMC Allocation" items={dashboard.amc} />
              <AllocationCard title="Sector Allocation" items={dashboard.sector} note={report?.allocations?.sector?.coveragePct != null ? `${report.allocations.sector.coveragePct}% portfolio coverage` : undefined} />
              <AllocationCard title="Asset Allocation" items={dashboard.asset} />
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
              <section className="rounded-[1.5rem] border border-line bg-surface p-5 shadow-sm">
                <div className="eyebrow">Top Holdings</div>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[680px] text-sm">
                    <thead className="text-left text-xs text-ink-faint"><tr><th className="py-2">Fund</th><th className="py-2 text-right">Value</th><th className="py-2 text-right">Weight</th><th className="py-2">AMC</th></tr></thead>
                    <tbody>
                      {dashboard.topHoldings.slice(0, 8).map((h) => (
                        <tr key={h.schemeCode} className="border-t border-line">
                          <td className="py-3 pr-4"><a href={`/fund/${h.schemeCode}`} className="font-semibold text-ink hover:text-accent">{h.schemeName || h.name}</a><div className="text-xs text-ink-faint">{h.category}</div></td>
                          <td className="financial-number py-3 text-right">{money(h.currentValue)}</td>
                          <td className="financial-number py-3 text-right">{number(h.weight, "%")}</td>
                          <td className="py-3 pl-4 text-ink-muted">{h.amc || "Unknown"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="grid gap-4">
                <MetricCard label="Best Performer" value={dashboard.best ? `${number(dashboard.best._return, "%")}` : "Not available"} detail={dashboard.best ? (dashboard.best.name || dashboard.best.schemeName) : "Return data unavailable in holdings payload"} tone="text-pos" />
                <MetricCard label="Worst Performer" value={dashboard.worst ? `${number(dashboard.worst._return, "%")}` : "Not available"} detail={dashboard.worst ? (dashboard.worst.name || dashboard.worst.schemeName) : "Return data unavailable in holdings payload"} tone="text-neg" />
                <MetricCard label="Recent Upload" value={latestHistory?.status ? latestHistory.status.toUpperCase() : "None"} detail={latestHistory ? `${latestHistory.statementType} · ${latestHistory.fileName}` : "Upload history starts after your first statement"} />
              </section>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-[1.5rem] border border-line bg-surface p-5 shadow-sm">
                <div className="eyebrow">Compare with previous upload</div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-surface-2 p-4"><div className="text-xs text-ink-faint">Added Funds</div><div className="financial-number mt-1 text-xl font-semibold text-pos">{comparison.added.length}</div></div>
                  <div className="rounded-2xl bg-surface-2 p-4"><div className="text-xs text-ink-faint">Removed Funds</div><div className="financial-number mt-1 text-xl font-semibold text-neg">{comparison.removed.length}</div></div>
                  <div className="rounded-2xl bg-surface-2 p-4"><div className="text-xs text-ink-faint">Changed Allocation</div><div className="financial-number mt-1 text-xl font-semibold text-warn">{comparison.changed.length}</div></div>
                </div>
                <div className="mt-4 space-y-2 text-sm">
                  {comparison.added.slice(0, 3).map((item) => <p key={`a-${item.schemeCode}`} className="text-ink-muted"><span className="text-pos">Added:</span> {item.name}</p>)}
                  {comparison.removed.slice(0, 3).map((item) => <p key={`r-${item.schemeCode}`} className="text-ink-muted"><span className="text-neg">Removed:</span> {item.name}</p>)}
                  {comparison.changed.slice(0, 3).map((item) => <p key={`c-${item.schemeCode}`} className="text-ink-muted"><span className="text-warn">Changed:</span> {item.name} {item.delta > 0 ? "+" : ""}{item.delta.toFixed(1)}pt</p>)}
                  {!comparison.added.length && !comparison.removed.length && !comparison.changed.length && <p className="text-ink-muted">No previous upload comparison available yet.</p>}
                </div>
              </section>

              <section className="rounded-[1.5rem] border border-line bg-surface p-5 shadow-sm">
                <div className="eyebrow">Portfolio Timeline</div>
                <div className="mt-4 space-y-3">
                  {(history.length ? history : [{ id: "empty", status: "empty", fileName: "No uploads yet", uploadedAt: null, statementType: "Upload a statement to begin" }]).map((item) => (
                    <div key={item.id} className="flex gap-3 rounded-2xl border border-line bg-surface-2 p-3">
                      <span className={`mt-1 h-2.5 w-2.5 rounded-full ${item.status === "success" ? "bg-pos" : item.status === "failed" ? "bg-neg" : "bg-ink-faint"}`} />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-ink">{item.fileName}</div>
                        <div className="mt-1 text-xs text-ink-faint">{item.statementType}{item.uploadedAt ? ` · ${new Date(item.uploadedAt).toLocaleString("en-IN")}` : ""}</div>
                        {item.message && <div className="mt-1 text-xs text-ink-muted">{item.message}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {unresolved.length > 0 && (
              <div className="rounded-2xl border border-warn/30 bg-warn/10 p-4">
                <div className="text-sm font-semibold text-warn">{unresolved.length} unresolved holding{unresolved.length === 1 ? "" : "s"}</div>
                <ul className="mt-2 space-y-1 text-xs text-ink-muted">{unresolved.map((item, index) => <li key={`${item.schemeCode}-${index}`}>{item.schemeCode}: {item.reason}</li>)}</ul>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
