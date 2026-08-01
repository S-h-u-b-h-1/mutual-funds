import Link from "next/link";
import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import GlassPanel from "../../components/ui/GlassPanel";
import Badge, { EmptyState } from "../../components/ui/Badge";
import SectionHeader from "../../components/ui/SectionHeader";
import { EXAMPLE_SCREENS } from "../../lib/stocks/screener";
import { query } from "../../lib/db";
import { runScreener } from "../../lib/stocks/screener";

export const dynamic = "force-dynamic";

const STARTER_SCREEN_KEYS = [
  "highRoce",
  "lowDebtToEquity",
  "strongSalesGrowth",
  "cashFlowGenerators",
  "qualityAndSafe",
  "dividendStocks",
];

async function loadScreenableCompanies() {
  const r = await query(
    `select distinct on (c.id)
        c.id as company_id, c.display_name, c.nse_symbol, c.bse_code, c.sector_id, c.industry_id,
        cvs.market_cap, cvs.pe, cvs.pb, cvs.ev_ebitda, cvs.dividend_yield
       from companies c
       left join company_valuation_snapshots cvs on cvs.company_id = c.id
      where c.listing_status = 'listed'
      order by c.id, cvs.as_of_date desc`
  );
  return r.rows.map((row) => ({
    companyId: row.company_id,
    displayName: row.display_name,
    nseSymbol: row.nse_symbol,
    bseCode: row.bse_code,
    sectorId: row.sector_id,
    industryId: row.industry_id,
    marketCap: row.market_cap === null ? null : Number(row.market_cap),
    pe: row.pe === null ? null : Number(row.pe),
    pb: row.pb === null ? null : Number(row.pb),
    evEbitda: row.ev_ebitda === null ? null : Number(row.ev_ebitda),
    dividendYield: row.dividend_yield === null ? null : Number(row.dividend_yield),
  }));
}

async function runSelectedScreen(screenKey) {
  const selected = EXAMPLE_SCREENS[screenKey] ? screenKey : "highRoce";
  try {
    const companies = await loadScreenableCompanies();
    return { selected, result: runScreener(companies, EXAMPLE_SCREENS[selected].filterGroup, { sortBy: "marketCap", limit: 25 }), error: null };
  } catch (error) {
    return { selected, result: { results: [], matchedCount: 0, totalCount: 0 }, error: error?.message || "Screener API unavailable." };
  }
}

function CriteriaList({ filterGroup }) {
  const filters = filterGroup.filters || [];
  return (
    <ul className="mt-3 grid gap-2 text-xs leading-5 text-ink-muted">
      {filters.map((filter, index) => (
        <li key={index} className="rounded-xl bg-surface-2 p-3">
          {"filters" in filter ? `${filter.combinator} group with ${filter.filters.length} checks` : `${filter.field} ${filter.operator} ${Array.isArray(filter.value) ? filter.value.join(" to ") : filter.value}`}
        </li>
      ))}
    </ul>
  );
}

export default async function StockScreenerPage({ searchParams }) {
  const params = await searchParams;
  const requested = params?.screen || "highRoce";
  const { selected, result, error } = await runSelectedScreen(requested);
  const screen = EXAMPLE_SCREENS[selected];

  return (
    <>
      <Nav active="/stocks/screener" />
      <main id="main-content" className="container-px py-10 sm:py-14">
        <div className="eyebrow text-accent">Stock screener</div>
        <h1 className="page-title mt-3 max-w-4xl">Powerful screens, with missing data treated honestly.</h1>
        <p className="measure mt-4 text-sm leading-6 text-ink-muted">
          These are backend filter definitions, not editorial lists. If ROCE, debt, growth, cash-flow or dividend fields are not populated for a company, that company does not pass the screen silently.
        </p>

        <section className="mt-8 grid gap-6 lg:grid-cols-[330px_minmax(0,1fr)]">
          <GlassPanel className="p-4">
            <SectionHeader eyebrow="Screens" title="Common starting points" />
            <div className="grid gap-2">
              {STARTER_SCREEN_KEYS.map((key) => {
                const item = EXAMPLE_SCREENS[key];
                return (
                <Link key={key} href={`/stocks/screener?screen=${key}`} aria-current={key === selected ? "page" : undefined} className={`rounded-2xl border p-3 text-left transition ${key === selected ? "border-accent bg-accent/10" : "border-line bg-surface-2 hover:border-accent/35"}`}>
                  <div className="text-sm font-semibold text-ink">{item.label}</div>
                  <div className="mt-1 text-xs leading-5 text-ink-muted">{item.description}</div>
                </Link>
                );
              })}
            </div>
          </GlassPanel>

          <div className="grid gap-6">
            <GlassPanel className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <SectionHeader eyebrow="Selected screen" title={screen.label} />
                  <p className="text-sm leading-6 text-ink-muted">{screen.description}</p>
                </div>
                <Badge tone={error ? "warn" : "accent"}>{result.matchedCount} of {result.totalCount} confirmed</Badge>
              </div>
              <CriteriaList filterGroup={screen.filterGroup} />
            </GlassPanel>

            <GlassPanel className="p-5">
              <SectionHeader eyebrow="Results" title="Companies that pass every required check" />
              {result.results.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-sm">
                    <caption className="sr-only">Stock screener results</caption>
                    <thead className="border-y border-line bg-surface-2 text-left text-xs text-ink-faint">
                      <tr><th className="px-3 py-3">Company</th><th className="px-3 py-3">Ticker</th><th className="px-3 py-3 text-right">Market cap</th><th className="px-3 py-3 text-right">P/E</th><th className="px-3 py-3 text-right">Dividend yield</th></tr>
                    </thead>
                    <tbody>
                      {result.results.map((company) => (
                        <tr key={company.companyId} className="border-b border-line">
                          <th className="px-3 py-3 text-left"><Link href={`/stocks/${company.companyId}`} className="font-semibold text-ink hover:text-accent">{company.displayName}</Link></th>
                          <td className="px-3 py-3 font-mono text-xs text-ink-muted">{company.nseSymbol || company.bseCode || "—"}</td>
                          <td className="px-3 py-3 text-right tnum text-ink-muted">{company.marketCap == null ? "—" : `₹${Math.round(company.marketCap).toLocaleString("en-IN")} Cr`}</td>
                          <td className="px-3 py-3 text-right tnum text-ink-muted">{company.pe == null ? "—" : `${company.pe.toFixed(1)}x`}</td>
                          <td className="px-3 py-3 text-right tnum text-ink-muted">{company.dividendYield == null ? "—" : `${company.dividendYield.toFixed(1)}%`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState icon="🔎" title="No confirmed matches for this screen yet" hint={error || "This usually means the backend has not populated the metrics required by this screen. MF Pulse will not show fake matches."} />
              )}
            </GlassPanel>
          </div>
        </section>
      </main>
      <Footer note={<span>Screening is discovery, not a recommendation. Criteria and data coverage must be reviewed before any thesis.</span>} />
    </>
  );
}
