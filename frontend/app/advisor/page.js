import Nav from "../components/Nav";
import Footer from "../components/Footer";
import Tracker from "../components/Tracker";
import AdvisorContactForm from "../components/AdvisorContactForm";

export const metadata = { title: "Talk to an advisor — MF Pulse" };

export default function AdvisorPage() {
  return (
    <>
      <Nav active="/advisor" />
      <Tracker event="page_view" payload={{ page: "advisor" }} />
      <main className="container-px py-10 sm:py-14">
        <div className="mx-auto max-w-xl">
          <div className="eyebrow text-accent">Human guidance</div>
          <h1 className="page-title mt-3">Turn research into a considered next step.</h1>
          <p className="mt-2.5 text-[14px] leading-relaxed text-ink-muted">
            MF Pulse gives you the research — health scores, risk, benchmark comparisons, AMC
            intelligence. If you&rsquo;d like help turning that into a decision, or a full
            portfolio review, share a few details below and{" "}
            <span className="text-ink">Suasion Securities</span> will reach out.
          </p>
          <div className="mt-6">
            <AdvisorContactForm sourcePage="advisor_page" />
          </div>
        </div>
      </main>
      <Footer note={<span>Powered by Suasion Securities · MF Pulse does not itself provide investment advice · not investment advice.</span>} />
    </>
  );
}
