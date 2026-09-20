import Nav from "../components/Nav";
import Footer from "../components/Footer";
import Tracker from "../components/Tracker";
import WealthAdvisorWorkspace from "../components/WealthAdvisorWorkspace";
import { advisoryCandidateSet } from "../lib/advisoryCandidates";
import { asOf } from "../lib/funds";

export const metadata = { title: "Wealth Advisory Agent — MFPulse" };

export default function AdvisorPage() {
  return (
    <>
      <Nav active="/advisor" />
      <Tracker event="page_view" payload={{ page: "wealth_advisor" }} />
      <main className="container-px py-8 sm:py-11">
        <div className="mb-7">
          <div className="eyebrow text-accent">MFPulse advisory workspace</div>
          <h1 className="page-title mt-3">Profile. Compare. Question every trade-off.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-muted">A guided, evidence-led conversation that connects your risk capacity to real mutual-fund comparisons.</p>
        </div>
        <WealthAdvisorWorkspace candidates={advisoryCandidateSet()} asOf={asOf} resumeDraft />
      </main>
      <Footer note={<span>Educational research only—not a regulated suitability assessment or investment instruction.</span>} />
    </>
  );
}
