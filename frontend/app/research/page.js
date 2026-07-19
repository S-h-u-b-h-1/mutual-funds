import Nav from "../components/Nav";
import Footer from "../components/Footer";
import ResearchWorkspaceClient from "../components/ResearchWorkspaceClient";
import { getFund } from "../lib/funds";
import { fundHealth } from "../lib/fundHealth";

export const metadata = { title: "Strategy Workspace" };

export default function Research({ searchParams }) {
  const requestedCodes = String(searchParams?.import_funds || "").split(",").map((code) => code.trim()).filter(Boolean).slice(0, 20);
  const initialFunds = requestedCodes
    .map((code) => getFund(code))
    .filter((f) => f?.active !== false && f?.nav != null)
    .map((f) => {
      const h = fundHealth(f);
      return {
        code: f.code,
        name: f.name,
        amc: f.amc,
        category: f.category,
        plan: f.plan,
        r1m: f.r1m ?? null,
        r1y: f.r1y ?? null,
        vol90: f.vol90 ?? null,
        maxdd90: f.maxdd90 ?? null,
        consistency: f.consistency ?? null,
        _h: h?.overall ?? null,
        _g: h?.grade ?? null
      };
    });

  return (
    <>
      <Nav active="/research" />
      <main className="container-px space-y-8 py-10 sm:py-14">
        <div>
          <div className="eyebrow text-accent">Strategy workspace</div>
          <h1 className="page-title mt-3">Turn a fund list into a documented research thesis.</h1>
          <p className="measure mt-4 text-sm leading-6 text-ink-muted">Model multi-fund allocations with custom weights and preserve the reasoning behind them. Calculations remain deterministic and use existing fund measures.</p>
        </div>

        <ResearchWorkspaceClient initialFunds={initialFunds} />
      </main>
      <Footer note={<span>Research allocation tool · local browser persistence · past performance ≠ future returns.</span>} />
    </>
  );
}
