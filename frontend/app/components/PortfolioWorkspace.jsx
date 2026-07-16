"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const STATEMENT_TYPES = [
  { key: "cams_cas_pdf", label: "CAMS CAS PDF", detail: "Consolidated Account Statement issued by CAMS" },
  { key: "kfin_cas_pdf", label: "KFIN CAS PDF", detail: "Consolidated Account Statement issued by KFintech" },
  { key: "mfcentral_summary", label: "MF Central Portfolio Summary", detail: "MF Central consolidated portfolio statement" },
];

const money = (value) => value == null || Number.isNaN(Number(value))
  ? "Not available"
  : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value));
const number = (value, suffix = "") => value == null || Number.isNaN(Number(value)) ? "Not available" : `${Number(value).toFixed(Number(value) % 1 === 0 ? 0 : 1)}${suffix}`;

function uploadErrorMessage(data, status) {
  if (status === 401) return "Your session expired. Sign in again, then retry this upload.";
  if (data?.code === "encrypted_pdf" || /password|encrypted/i.test(data?.error || "")) {
    return "This PDF is password-protected. Export an unlocked copy from the statement provider, then retry.";
  }
  if (data?.code === "duplicate_upload") return data.error || "This exact statement has already been imported. Choose a newer statement.";
  if (data?.code === "file_too_large" || status === 413) return data.error || "This PDF is larger than the 15 MB limit.";
  if (data?.code === "unsupported_provider") return "This statement provider is not supported. Use a CAMS, KFintech, or verified MF Central statement.";
  if (data?.code || /could not be read|xref|invalid pdf/i.test(data?.error || "")) {
    return "This PDF could not be read as a supported statement. Check that it opens normally, is unlocked, and came from CAMS, KFintech, or MF Central.";
  }
  return data?.error || "Statement processing failed. Check the file and try again.";
}

function scoreTone(value) {
  if (value == null) return "text-ink-faint";
  if (value >= 70) return "text-pos";
  if (value >= 45) return "text-warn";
  return "text-neg";
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

function UploadStatus({ phase, error, onCancel }) {
  const isActive = phase === "uploading" || phase === "processing";
  const title = error
    ? "Portfolio not yet saved to your account."
    : phase === "complete"
      ? "Portfolio saved and synced to your account."
      : phase === "processing"
        ? "The server is reading and saving your statement"
        : phase === "uploading"
          ? "Uploading securely"
          : "Ready when you are";
  return (
    <div className="rounded-[1.5rem] border border-line bg-surface p-4" aria-live="polite" aria-atomic="true">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Processing pipeline</div>
          <div className="mt-1 text-sm font-semibold text-ink">{title}</div>
        </div>
        {phase === "complete" && <div className="grid h-10 w-10 place-items-center rounded-full bg-pos/15 text-pos" aria-hidden="true">✓</div>}
      </div>
      <div className="rounded-2xl border border-line bg-surface-2 p-3 text-sm text-ink-muted">
        {isActive ? (
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 shrink-0 animate-pulse rounded-full bg-accent" aria-hidden="true" />
            <span>The current API reports completion only after parsing and persistence finish.</span>
          </div>
        ) : (
          <p>No estimated stages are shown because the server does not expose live parsing status yet.</p>
        )}
      </div>
      {isActive && <button type="button" onClick={onCancel} className="mt-3 inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm font-semibold text-ink-muted hover:text-ink">Cancel upload</button>}
    </div>
  );
}

export default function PortfolioWorkspace() {
  const { data: session, status: authStatus } = useSession();
  const sessionKey = session?.user?.id || session?.user?.email || null;
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
  const [uploadPhase, setUploadPhase] = useState("idle");
  const [view, setView] = useState("dashboard");
  const uploadInputRef = useRef(null);
  const dashboardRef = useRef(null);
  const requestRef = useRef(null);
  const noticeRef = useRef(null);

  useEffect(() => {
    if (!file) { setFileUrl(""); return undefined; }
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

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

  useEffect(() => {
    if (!sessionKey) return;
    loadHoldings()
      .then((items) => {
        if (items.length) {
          setView("dashboard");
          return computeReport().catch((err) => {
            setError(err.message || "Portfolio analysis is temporarily unavailable. Your saved holdings are unchanged.");
          });
        }
        setView("import");
        return null;
      })
      .catch((err) => setError(`${err.message || "Portfolio could not be loaded."} Retry after checking your connection or signing in again.`));
  }, [sessionKey]);

  function selectFile(nextFile) {
    setError("");
    setMessage("");
    setUploadPhase("idle");
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
    if (nextFile.size > MAX_FILE_BYTES) {
      setError(`This PDF is ${(nextFile.size / 1024 / 1024).toFixed(1)} MB. The maximum supported size is 15 MB.`);
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

  function cancelUpload() {
    requestRef.current?.abort();
  }

  async function processStatement() {
    setError("");
    setMessage("");
    setUploadPhase("idle");
    if (!file) { setError("Upload a CAMS, KFIN, or MF Central PDF statement first."); return; }

    setBusy(true);
    setUploadPhase("uploading");
    const controller = new AbortController();
    requestRef.current = controller;

    try {
      const form = new FormData();
      form.append("source", statementType);
      form.append("file", file);
      setUploadPhase("processing");
      const response = await fetch("/api/v1/portfolio/upload", { method: "POST", body: form, signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(uploadErrorMessage(data, response.status));

      await loadHoldings();
      await computeReport();
      setUploadPhase("complete");
      setMessage(`Portfolio saved and synced to your account. ${data.imported} holding${data.imported === 1 ? "" : "s"} imported.`);
      setView("dashboard");
      window.requestAnimationFrame(() => {
        noticeRef.current?.focus();
        dashboardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (err) {
      const text = err.name === "AbortError"
        ? "Upload cancelled. Portfolio not yet saved to your account."
        : `${err.message || "Statement processing failed."} Portfolio not yet saved to your account.`;
      setUploadPhase("error");
      setError(text);
      window.requestAnimationFrame(() => noticeRef.current?.focus());
    } finally {
      requestRef.current = null;
      setBusy(false);
    }
  }

  const dashboard = useMemo(() => {
    const totalValue = report?.portfolioSummary?.totalValue ?? null;
    const sortedByReturn = holdings.map((h) => ({ ...h, _return: returnValue(h) })).filter((h) => h._return != null).sort((a, b) => Number(b._return) - Number(a._return));
    return {
      totalValue,
      invested: report?.portfolioSummary?.investedValue ?? null,
      gain: report?.portfolioSummary?.gainLoss ?? null,
      diversification: report?.diversification?.score ?? null,
      riskScore: report?.concentration?.score ?? null,
      amc: report?.allocations?.amc || [],
      sector: report?.allocations?.sector?.breakdown || [],
      category: report?.allocations?.category || [],
      topHoldings: report?.topHoldings || holdings.slice().sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0)).slice(0, 10),
      best: sortedByReturn[0] || null,
      worst: sortedByReturn.at(-1) || null,
    };
  }, [holdings, report]);

  const latestImportedAt = holdings
    .map((holding) => holding.importedAt)
    .filter(Boolean)
    .sort()
    .at(-1) || null;

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
            <p className="mt-4 max-w-2xl text-sm leading-6 text-bg/70">Import a supported consolidated statement and return to holdings stored in your account. Dates and historical views appear only when supplied by the portfolio service.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {STATEMENT_TYPES.map((type) => <span key={type.key} className="rounded-full border border-white/12 bg-white/[0.06] px-3 py-1 text-xs text-bg/80">{type.label}</span>)}
            </div>
          </div>
          <div className="grid content-end gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {[["Storage", holdings.length ? "Synced to account" : "No saved portfolio"], ["Last imported", latestImportedAt ? new Date(latestImportedAt).toLocaleString("en-IN") : "Not available"], ["Holdings", `${holdings.length} resolved`]].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-bg/45">{label}</div>
                <div className="mt-2 break-words text-sm font-semibold text-bg">{value}</div>
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
        <section className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 rounded-[2rem] border border-line bg-surface p-5 shadow-float sm:p-6">
            <div className="rounded-2xl border border-accent/20 bg-accent/10 p-4">
              <div className="eyebrow text-accent">Secure processing notice</div>
              <p className="mt-2 text-sm leading-6 text-ink-muted">
                Use an unlocked PDF up to 15 MB. CSV and manual entry are not required. The file is processed in memory and is not retained by default; extracted holdings are saved to your private account only after the server confirms the request.
              </p>
              <p className="mt-2 text-xs leading-5 text-ink-faint">The current server saves in the same request and does not yet provide a review-before-save draft. Password-protected PDFs cannot be read; export an unlocked copy and retry.</p>
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
              <input ref={uploadInputRef} type="file" accept="application/pdf,.pdf" aria-label="Choose a CAMS, KFintech, or MF Central PDF statement" aria-describedby="portfolio-file-help" onChange={(event) => selectFile(event.target.files?.[0] || null)} className="sr-only" />
              <div className="mx-auto max-w-md">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-accent/12 text-accent"><FileIcon /></div>
                <h3 className="mt-5 text-xl font-semibold tracking-[-0.04em] text-ink">Drop your statement PDF here</h3>
                <p id="portfolio-file-help" className="mt-2 text-sm leading-6 text-ink-muted">Unlocked PDF only, maximum 15 MB. Use a CAMS CAS, KFintech statement, or verified MF Central Portfolio Summary.</p>
                <button type="button" onClick={() => uploadInputRef.current?.click()} className="mt-5 inline-flex min-h-11 items-center rounded-full bg-ink px-5 text-sm font-semibold text-bg">Choose PDF</button>
              </div>
            </div>

            {file && (
              <div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
                <div className="min-w-0 overflow-hidden rounded-[1.5rem] border border-line bg-surface-2 p-4">
                  <div className="eyebrow">Selected file</div>
                  <div className="mt-2 break-all text-sm font-semibold leading-5 text-ink" title={file.name}>{file.name}</div>
                  <div className="mt-1 text-xs text-ink-faint">{(file.size / 1024 / 1024).toFixed(2)} MB · PDF preview ready</div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" onClick={processStatement} disabled={busy} className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-white shadow-glow disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Uploading and saving…" : uploadPhase === "error" ? "Retry upload" : "Upload and save"}</button>
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
            {message && <p ref={noticeRef} tabIndex={-1} className="mt-4 rounded-2xl border border-pos/25 bg-pos/10 p-3 text-sm text-pos outline-none focus-visible:ring-2 focus-visible:ring-accent" role="status">{message}</p>}
            {error && <p ref={noticeRef} tabIndex={-1} className="mt-4 rounded-2xl border border-neg/25 bg-neg/10 p-3 text-sm text-neg outline-none focus-visible:ring-2 focus-visible:ring-accent" role="alert">{error}</p>}
          </div>
          <aside className="space-y-5">
            <UploadStatus phase={uploadPhase} error={error} onCancel={cancelUpload} />
            <section className="rounded-[1.5rem] border border-line bg-surface p-4">
              <div className="eyebrow">Privacy and persistence</div>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-ink-muted">
                <li>• Original PDF is not retained by default.</li>
                <li>• Holdings are loaded from your account, not this browser.</li>
                <li>• A cancelled or failed request is never shown as saved.</li>
              </ul>
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
          {holdings.length > 0 && <div className="rounded-full border border-pos/20 bg-pos/10 px-4 py-2 text-xs font-semibold text-pos">Saved to your account</div>}
        </div>

        {!holdings.length ? (
          <div className="rounded-[2rem] border border-dashed border-line bg-surface p-8 text-center shadow-sm">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent/12 text-accent"><FileIcon /></div>
            <h3 className="mt-5 text-2xl font-semibold tracking-[-0.05em] text-ink">No portfolio imported yet.</h3>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-ink-muted">Upload a supported PDF statement to create server-held holdings and the currently available portfolio analysis.</p>
            <button type="button" onClick={() => setView("import")} className="mt-6 inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-white">Upload Portfolio Statement</button>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Portfolio Value" value={money(dashboard.totalValue)} detail={`${holdings.length} resolved holdings`} />
              <MetricCard label="Invested Value" value={money(dashboard.invested)} detail={dashboard.invested == null ? "Not supplied by the portfolio API" : "Supplied by the portfolio API"} />
              <MetricCard label="Current Gain" value={money(dashboard.gain)} tone={dashboard.gain > 0 ? "text-pos" : dashboard.gain < 0 ? "text-neg" : "text-ink"} detail={dashboard.gain == null ? "Not supplied by the portfolio API" : "Supplied by the portfolio API"} />
              <MetricCard label="Today's Gain" value="Pending NAV delta" detail="Daily P&L needs historical unit-level NAV snapshots." />
              <MetricCard label="Portfolio Research Score" value={report?.portfolioSummary?.healthScore == null ? "Not available" : `${report.portfolioSummary.healthScore}/100`} tone={scoreTone(report?.portfolioSummary?.healthScore)} detail="Supplied by the portfolio intelligence API" />
              <MetricCard label="Diversification Score" value={dashboard.diversification == null ? "Not available" : `${dashboard.diversification}/100`} tone={scoreTone(dashboard.diversification)} detail={report?.diversification ? `${number(report.diversification.effectiveHoldings)} effective holdings` : "Pending analysis"} />
              <MetricCard label="Risk Score" value={dashboard.riskScore == null ? "Not available" : `${dashboard.riskScore}/100`} tone={dashboard.riskScore >= 40 ? "text-neg" : dashboard.riskScore >= 20 ? "text-warn" : "text-pos"} detail="Existing concentration-risk score" />
              <MetricCard label="Last Imported" value={latestImportedAt ? new Date(latestImportedAt).toLocaleDateString("en-IN") : "Not recorded"} detail="Latest server holding import timestamp" />
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
              <AllocationCard title="Category Allocation" items={dashboard.category} />
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
                <MetricCard label="Valuation Date" value="Not available" detail="The current portfolio API does not return the official NAV valuation date." />
              </section>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-[1.5rem] border border-line bg-surface p-5 shadow-sm">
                <div className="eyebrow">Updated statement comparison</div>
                <p className="mt-4 rounded-2xl border border-dashed border-line p-4 text-sm leading-6 text-ink-muted">No server-backed import diff is available yet. Previous holdings are not compared in the browser because that could misrepresent what is persisted.</p>
              </section>

              <section className="rounded-[1.5rem] border border-line bg-surface p-5 shadow-sm">
                <div className="eyebrow">Portfolio history</div>
                <p className="mt-4 rounded-2xl border border-dashed border-line p-4 text-sm leading-6 text-ink-muted">Historical tracking began when this portfolio was first imported. The current API does not yet expose stored valuation points, so no periods are fabricated here.</p>
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
