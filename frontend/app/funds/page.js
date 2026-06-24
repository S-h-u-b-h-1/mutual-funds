import Nav from "../components/Nav";
import Footer from "../components/Footer";
import Tracker from "../components/Tracker";
import SectionHeader from "../components/ui/SectionHeader";
import DataTable from "../components/ui/DataTable";
import Badge from "../components/ui/Badge";
import { allFunds, coverage, asOf } from "../lib/funds";

export const metadata = { title: "Fund Screener" };

const pct = (v) => (v == null ? <span className="text-ink-faint">—</span> : <span className={v >= 0 ? "text-pos tnum" : "text-neg tnum"}>{v >= 0 ? "+" : ""}{v.toFixed(1)}%</span>);
const short = (n) => n.replace(/ - (Direct|Regular).*/i, "");

const SORTS = { r1m: "1M return", r1y: "1Y return", trend: "Trend", r3m: "3M return" };

const cols = [
  { key: "name", label: "Fund", render: (r) => <a className="text-ink hover:text-accent-soft" href={`/fund/${r.code}`}>{short(r.name)}<span className="block text-[11px] text-ink-faint">{r.amc} · {r.category} · {r.plan}</span></a> },
  { key: "r1m", label: "1M", align: "right", render: (r) => pct(r.r1m) },
  { key: "r3m", label: "3M", align: "right", render: (r) => pct(r.r3m) },
  { key: "r1y", label: "1Y", align: "right", render: (r) => pct(r.r1y) },
  { key: "trend", label: "Trend", align: "right", render: (r) => (r.trend == null ? <span className="text-ink-faint">—</span> : <span className="tnum text-ink-muted">{r.trend}</span>) },
];

export default function Funds({ searchParams }) {
  const q = (searchParams?.q || "").toLowerCase().trim();
  const plan = searchParams?.plan || "all";
  const opt = searchParams?.opt || "growth";
  const sort = SORTS[searchParams?.sort] ? searchParams.sort : "r1m";
  const fresh = searchParams?.fresh === "1";

  let rows = allFunds().filter((f) => {
    if (opt === "growth" && !f.isGrowth) return false;
    if (opt === "idcw" && !f.isIdcw) return false;
    if (plan === "direct" && !f.isDirect) return false;
    if (plan === "regular" && f.isDirect) return false;
    if (fresh && f.staleDays !== 0) return false;
    if (q && !(f.name.toLowerCase().includes(q) || f.amc.toLowerCase().includes(q) || f.category.toLowerCase().includes(q) || f.code === q)) return false;
    return f[sort] != null;
  });
  rows.sort((a, b) => (b[sort] ?? -1e9) - (a[sort] ?? -1e9));
  const total = rows.length;
  rows = rows.slice(0, 80).map((f) => ({ ...f, _key: f.code }));

  const chip = (label, params) => {
    const sp = new URLSearchParams({ q: searchParams?.q || "", plan, opt, sort, ...(fresh ? { fresh: "1" } : {}), ...params });
    return <a href={`/funds?${sp}`} className="rounded-full border border-line px-3 py-1 text-[12px] text-ink-muted hover:text-ink">{label}</a>;
  };

  return (
    <>
      <Nav active="/funds" />
      <Tracker event="fund_search" payload={{ q, plan, opt, sort, results: total }} />
      <main className="container-px py-9">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Screener</div>
        <h1 className="mt-2 text-[28px] sm:text-[32px] font-bold tracking-tightest text-ink">Fund screener</h1>
        <p className="mt-2 max-w-2xl text-[14px] text-ink-muted">
          {coverage.priced.toLocaleString("en-IN")} priced schemes · {coverage.with90d.toLocaleString("en-IN")} with ≥90-day history.
          Daily NAV intelligence, not real-time. <a className="text-ink-muted underline-offset-2 hover:text-ink hover:underline" href="/data-quality">Coverage →</a>
        </p>

        <form className="mt-5 flex flex-wrap items-center gap-2" action="/funds" method="get">
          <input name="q" defaultValue={searchParams?.q || ""} placeholder="Search fund, AMC, category, or code…" className="min-w-[220px] flex-1 rounded-lg border border-line bg-white/[0.02] px-3.5 py-2 text-[13px] text-ink outline-none placeholder:text-ink-faint focus:border-line-strong" />
          <select name="plan" defaultValue={plan} className="rounded-lg border border-line bg-bg px-3 py-2 text-[13px] text-ink-muted">
            <option value="all">All plans</option><option value="direct">Direct</option><option value="regular">Regular</option>
          </select>
          <select name="opt" defaultValue={opt} className="rounded-lg border border-line bg-bg px-3 py-2 text-[13px] text-ink-muted">
            <option value="growth">Growth</option><option value="idcw">IDCW</option><option value="all">All options</option>
          </select>
          <select name="sort" defaultValue={sort} className="rounded-lg border border-line bg-bg px-3 py-2 text-[13px] text-ink-muted">
            {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white">Apply</button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {chip("Direct Growth", { plan: "direct", opt: "growth" })}
          {chip("Fresh NAV only", { fresh: "1" })}
          {chip("Top 1Y", { sort: "r1y" })}
          {chip("Improving trend", { sort: "trend" })}
        </div>

        <section className="mt-6">
          <SectionHeader eyebrow={`${total.toLocaleString("en-IN")} matches · showing top 80`} title="Results" action={<Badge tone="pos" dot>real NAV</Badge>} />
          <DataTable columns={cols} rows={rows} footnote={`Sorted by ${SORTS[sort]}. Direct & Regular ranked separately on fund pages. Source: AMFI. As of ${asOf}.`} />
        </section>
      </main>
      <Footer />
    </>
  );
}
