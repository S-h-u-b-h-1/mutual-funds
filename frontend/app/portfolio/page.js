import Nav from "../components/Nav";
import Footer from "../components/Footer";
import PortfolioWorkspace from "../components/PortfolioWorkspace";

export const metadata = { title: "Portfolio Intelligence" };

export default function PortfolioPage() {
  return (
    <>
      <Nav active="/portfolio" />
      <main className="container-px py-10 sm:py-14">
        <div className="eyebrow text-accent">Portfolio intelligence</div>
        <h1 className="page-title mt-3">Import, validate, and monitor your mutual fund portfolio.</h1>
        <p className="measure mt-4 text-sm leading-6 text-ink-muted">Upload a portfolio statement, preview the PDF, process holdings, and review an institutional dashboard powered by the existing deterministic intelligence engine.</p>
        <div className="mt-8"><PortfolioWorkspace /></div>
      </main>
      <Footer note={<span>Portfolio research is not a suitability assessment. Values use available NAV and metadata; missing evidence remains disclosed.</span>} />
    </>
  );
}
