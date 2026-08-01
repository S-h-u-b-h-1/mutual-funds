import Nav from "../components/Nav";
import Footer from "../components/Footer";
import Tracker from "../components/Tracker";
import ProductBreadcrumbs from "../components/ProductBreadcrumbs";
import ScreenerPresets from "../components/ScreenerPresets";
import ScreenerTableClient from "../components/ScreenerTableClient";
import FreshnessBadge from "../components/ui/FreshnessBadge";
import ProvenanceDisclosure from "../components/ui/ProvenanceDisclosure";
import { allFunds, coverage, asOf } from "../lib/funds";
import { fundHealth } from "../lib/fundHealth";
import { freshnessTone } from "../lib/marketStatus";
import { getMetadata, allMetadata, metadataStatus } from "../lib/metadata";

export const metadata = { title: "Fund Research Screener" };

const AUM_BANDS = [500, 1000, 5000];
const EXPENSE_BANDS = [1, 0.75, 0.5];
function schemeExpenseRatio(meta) {
  return meta ? meta.expense_ratio ?? meta.direct_expense_ratio ?? meta.regular_expense_ratio ?? null : null;
}

const SORTS = {
  health: { label: "Health score", get: (fund) => fund._h, direction: -1 },
  r1m: { label: "1-month return", get: (fund) => fund.r1m, direction: -1 },
  r3m: { label: "3-month return", get: (fund) => fund.r3m, direction: -1 },
  r1y: { label: "1-year return", get: (fund) => fund.r1y, direction: -1 },
  vol90: { label: "Lowest volatility", get: (fund) => fund.vol90, direction: 1 },
  maxdd90: { label: "Lowest drawdown", get: (fund) => fund.maxdd90, direction: -1 },
  consistency: { label: "Consistency", get: (fund) => fund.consistency, direction: -1 },
};

export default function FundsPage({ searchParams }) {
  const universe = allFunds();
  const q = (searchParams?.q || "").toLowerCase().trim();
  const plan = searchParams?.plan || "all";
  const option = searchParams?.opt || "growth";
  const category = searchParams?.category || "all";
  const amc = searchParams?.amc || "all";
  const sort = SORTS[searchParams?.sort] ? searchParams.sort : "health";
  const fresh = searchParams?.fresh === "1";
  const needYear = searchParams?.hist === "1y";
  const aum = AUM_BANDS.includes(Number(searchParams?.aum)) ? Number(searchParams.aum) : null;
  const expense = EXPENSE_BANDS.includes(Number(searchParams?.expense)) ? Number(searchParams.expense) : null;
  const verified = searchParams?.verified === "1";
  const sortConfig = SORTS[sort];
  const categories = [...new Set(universe.map((fund) => fund.category).filter(Boolean))].sort();
  const amcs = [...new Set(universe.map((fund) => fund.amc).filter(Boolean))].sort();
  // Real coverage counts for the two factsheet-sourced filters below — shown next to each control
  // so a near-empty result set (only 973 of 14,224 schemes have any factsheet data at all) reads
  // as "this filter only applies to acquired schemes," not as a bug.
  const aumCoverageN = allMetadata().filter((m) => m.aum_crores != null).length;
  const expenseCoverageN = allMetadata().filter((m) => schemeExpenseRatio(m) != null).length;
  // Real staleness, not a hardcoded "current" — found via a data-integrity audit that this badge
  // never actually checked the date at all. Reuses freshnessTone()'s GREEN_MAX/AMBER_MAX
  // thresholds (the ones that match ingestion/freshness.py) rather than adding yet another
  // independent freshness-threshold implementation to the several already in this codebase.
  const asOfStaleDays = Math.floor((Date.now() - new Date(`${asOf}T00:00:00Z`).getTime()) / 86400000);
  const asOfTone = freshnessTone(asOfStaleDays);
  const asOfStatus = asOfTone === "pos" ? "current" : asOfTone === "warn" ? "delayed" : "stale";

  let rows = universe.map((fund) => ({ fund, meta: (aum != null || expense != null || verified) ? getMetadata(fund.code) : null }))
    .filter(({ fund, meta }) => {
    if (option === "growth" && !fund.isGrowth) return false;
    if (option === "idcw" && !fund.isIdcw) return false;
    if (plan === "direct" && !fund.isDirect) return false;
    if (plan === "regular" && fund.isDirect) return false;
    if (category !== "all" && fund.category !== category) return false;
    if (amc !== "all" && fund.amc !== amc) return false;
    if (fresh && fund.staleDays !== 0) return false;
    if (needYear && fund.r1y == null) return false;
    if (verified && !meta) return false;
    if (aum != null && !(meta?.aum_crores >= aum)) return false;
    if (expense != null) {
      const er = schemeExpenseRatio(meta);
      if (er == null || er > expense) return false;
    }
    if (q && !(fund.name.toLowerCase().includes(q) || fund.amc.toLowerCase().includes(q) || fund.category.toLowerCase().includes(q) || fund.code === q)) return false;
    return true;
  }).map(({ fund, meta }) => {
    const health = fundHealth(fund);
    return { ...fund, _h: health?.overall ?? null, _g: health?.grade ?? null, _aum: meta?.aum_crores ?? null, _expense: schemeExpenseRatio(meta) };
  }).filter((fund) => sortConfig.get(fund) != null);

  rows.sort((a, b) => (sortConfig.get(b) - sortConfig.get(a)) * (sortConfig.direction === 1 ? -1 : 1));
  const total = rows.length;
  rows = rows.slice(0, 80).map((fund) => ({ ...fund, _key: fund.code }));

  function quickFilter(label, params) {
    const query = new URLSearchParams({ q: searchParams?.q || "", plan, opt: option, category, amc, sort, ...(fresh ? { fresh: "1" } : {}), ...(needYear ? { hist: "1y" } : {}), ...(aum != null ? { aum: String(aum) } : {}), ...(expense != null ? { expense: String(expense) } : {}), ...(verified ? { verified: "1" } : {}), ...params });
    return <a href={`/funds?${query}`} className="inline-flex min-h-9 items-center rounded-full border border-line bg-surface px-3 text-xs font-medium text-ink-muted hover:border-line-strong hover:text-ink">{label}</a>;
  }

  return (
    <>
      <Nav active="/funds" />
      <Tracker event="fund_filter_used" payload={{ q, plan, option, category, amc, sort, fresh, needYear, aum, expense, verified, results: total }} />
      <main className="container-px py-10 sm:py-14">
        <ProductBreadcrumbs items={[["Mutual Funds", null]]} />
        <header className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div><div className="eyebrow text-accent">Fund research</div><h1 className="page-title mt-3">Find evidence, not a leaderboard winner.</h1><p className="measure mt-4 text-sm leading-6 text-ink-muted">Screen direct and regular plans separately, keep missing measures visible, and move selected funds into comparison or strategy research.</p></div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-faint"><FreshnessBadge status={asOfStatus}>NAV {asOf}</FreshnessBadge><a href="/data-quality" className="font-medium text-accent">Review coverage →</a></div>
        </header>
        <ProvenanceDisclosure className="mt-5" source="AMFI NAVAll and NAV history" sourceUrl="https://www.amfiindia.com" updatedAt={asOf} confidence="High" coverage={`${coverage.priced.toLocaleString("en-IN")} of ${coverage.total.toLocaleString("en-IN")} schemes priced`} freshness="Daily on trading days" methodology="Fund identity and NAV come from AMFI. Returns and risk measures are deterministic calculations over observed NAV history." limitations="Factsheet fields such as AUM and expense ratio cover only acquired AMC documents and remain visibly unavailable elsewhere." />

        <section className="mt-8 rounded-2xl border border-line bg-surface p-4 sm:p-5" aria-label="Fund filters">
          <form action="/funds" method="get" className="grid gap-3 md:grid-cols-2 lg:grid-cols-6">
            <label className="md:col-span-2 lg:col-span-2"><span className="eyebrow">Search</span><input name="q" defaultValue={searchParams?.q || ""} placeholder="Fund, AMC, category, or code" className="mt-2 min-h-11 w-full rounded-xl border border-line bg-bg px-3.5 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent" /></label>
            <label><span className="eyebrow">Plan</span><select name="plan" defaultValue={plan} className="mt-2 min-h-11 w-full rounded-xl border border-line bg-bg px-3 text-sm text-ink"><option value="all">All plans</option><option value="direct">Direct</option><option value="regular">Regular</option></select></label>
            <label><span className="eyebrow">Option</span><select name="opt" defaultValue={option} className="mt-2 min-h-11 w-full rounded-xl border border-line bg-bg px-3 text-sm text-ink"><option value="growth">Growth</option><option value="idcw">IDCW</option><option value="all">All options</option></select></label>
            <label><span className="eyebrow">Category</span><select name="category" defaultValue={category} className="mt-2 min-h-11 w-full rounded-xl border border-line bg-bg px-3 text-sm text-ink"><option value="all">All categories</option>{categories.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label><span className="eyebrow">AMC</span><select name="amc" defaultValue={amc} className="mt-2 min-h-11 w-full rounded-xl border border-line bg-bg px-3 text-sm text-ink"><option value="all">All AMCs</option>{amcs.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label><span className="eyebrow">Fund size (AUM)</span><select name="aum" defaultValue={aum ?? "all"} className="mt-2 min-h-11 w-full rounded-xl border border-line bg-bg px-3 text-sm text-ink"><option value="all">Any AUM</option>{AUM_BANDS.map((value) => <option key={value} value={value}>{`≥ ₹${value.toLocaleString("en-IN")} Cr`}</option>)}</select></label>
            <label><span className="eyebrow">Expense ratio</span><select name="expense" defaultValue={expense ?? "all"} className="mt-2 min-h-11 w-full rounded-xl border border-line bg-bg px-3 text-sm text-ink"><option value="all">Any expense ratio</option>{EXPENSE_BANDS.map((value) => <option key={value} value={value}>{`≤ ${value}%`}</option>)}</select></label>
            <label className="md:col-span-2"><span className="eyebrow">Sort evidence</span><select name="sort" defaultValue={sort} className="mt-2 min-h-11 w-full rounded-xl border border-line bg-bg px-3 text-sm text-ink">{Object.entries(SORTS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
            <div className="flex items-end"><button className="min-h-11 w-full rounded-xl bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-soft">Apply filters</button></div>
          </form>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">{quickFilter("Top health", { sort: "health" })}{quickFilter("Direct Growth", { plan: "direct", opt: "growth" })}{quickFilter("1Y history", { hist: "1y" })}{quickFilter("Lowest drawdown", { sort: "maxdd90" })}{quickFilter("Consistency", { sort: "consistency" })}{quickFilter("Fresh NAV only", { fresh: "1" })}{quickFilter("Verified factsheet data", { verified: verified ? "" : "1" })}<ScreenerPresets /></div>
          <p className="mt-3 text-[10.5px] text-ink-faint">Fund size and expense ratio come from acquired AMC factsheets ({metadataStatus.populated.toLocaleString("en-IN")} of {universe.length.toLocaleString("en-IN")} schemes so far: {aumCoverageN.toLocaleString("en-IN")} have AUM, {expenseCoverageN.toLocaleString("en-IN")} have an expense ratio) — these filters narrow to that subset, not the full universe.</p>
        </section>

        <section className="mt-8" aria-labelledby="results-title">
          <div className="flex flex-wrap items-end justify-between gap-4"><div><div className="eyebrow">{total.toLocaleString("en-IN")} matches · showing 80</div><h2 id="results-title" className="section-title mt-2">Research results</h2></div><div className="text-xs leading-5 text-ink-faint">{coverage.priced.toLocaleString("en-IN")} priced · {coverage.withRisk.toLocaleString("en-IN")} with risk · {coverage.with1y.toLocaleString("en-IN")} with 1Y history</div></div>
          <div className="mt-5"><ScreenerTableClient rows={rows} total={total} asOf={asOf} confLabel={sortConfig.label} /></div>
        </section>
      </main>
      <Footer note={<span>Daily NAV research, not real-time. Missing values remain visible. Direct and regular plans are evaluated as separate records.</span>} />
    </>
  );
}
