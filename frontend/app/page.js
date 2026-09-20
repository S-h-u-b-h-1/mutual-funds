import Nav from "./components/Nav";
import Footer from "./components/Footer";
import Tracker from "./components/Tracker";
import WealthAdvisorWorkspace from "./components/WealthAdvisorWorkspace";
import { advisoryCandidateSet } from "./lib/advisoryCandidates";
import { asOf } from "./lib/funds";

export const metadata = {
  title: "MFPulse Wealth Advisory Agent",
  description: "Explainable mutual-fund product comparison, risk profiling, and advisory dialogue using observed AMFI data.",
};

export default function HomePage() {
  const candidates = advisoryCandidateSet();
  return (
    <>
      <Nav active="/" />
      <Tracker event="page_view" payload={{ page: "wealth_advisor_home" }} />
      <main className="container-px py-8 sm:py-11">
        <section className="mb-7 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-accent/25 bg-accent/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">Wealth Advisory Agent</span>
              <span className="rounded-full border border-line bg-surface px-3 py-1.5 text-[10px] font-semibold text-ink-muted">Explainable by design</span>
            </div>
            <h1 className="mt-5 max-w-4xl text-[2.35rem] font-semibold leading-[1.02] tracking-[-0.055em] text-ink sm:text-[3.4rem]">From “which fund?” to a decision you can understand.</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-ink-muted">Create a provisional risk profile, compare matched mutual funds, and question every trade-off. No opaque score and no sales handoff.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-2xl border border-line bg-surface p-3 shadow-glass">
            {[["01", "Profile"], ["02", "Compare"], ["03", "Discuss"]].map(([number, label]) => <div key={number} className="rounded-xl bg-surface-2 p-3"><div className="financial-number text-sm font-semibold text-accent">{number}</div><div className="mt-2 text-[11px] font-semibold text-ink">{label}</div></div>)}
          </div>
        </section>
        <WealthAdvisorWorkspace candidates={candidates} asOf={asOf} requireAccount />
      </main>
      <Footer note={<span>MFPulse is an educational research system. Shortlists are explainable and never investment instructions.</span>} />
    </>
  );
}
