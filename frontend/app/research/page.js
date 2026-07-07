import Nav from "../components/Nav";
import Footer from "../components/Footer";
import ResearchWorkspaceClient from "../components/ResearchWorkspaceClient";
import { allFunds } from "../lib/funds";
import { fundHealth } from "../lib/fundHealth";

export const metadata = { title: "Strategy Workspace" };

export default function Research() {
  const allFundsList = allFunds()
    .filter((f) => f.active !== false && f.nav != null)
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
      <main className="container-px py-10 space-y-8">
        <div>
          <h1 className="text-[26px] sm:text-[32px] font-black tracking-tightest text-white">
            Strategy & Research Notebook
          </h1>
          <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-muted">
            Model multi-fund portfolios with custom weightings. We calculate weighted overall health scores, return profiles, volatility, and drawdowns.
          </p>
        </div>

        <ResearchWorkspaceClient allFundsList={allFundsList} />
      </main>
      <Footer note={<span>Research allocation tool · local browser persistence · past performance ≠ future returns.</span>} />
    </>
  );
}
