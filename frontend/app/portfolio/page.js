import Nav from "../components/Nav";
import Footer from "../components/Footer";
import ProductBreadcrumbs from "../components/ProductBreadcrumbs";
import PortfolioWorkspace from "../components/PortfolioWorkspace";

export const metadata = { title: "Portfolio Intelligence" };

export default function PortfolioPage() {
  return (
    <>
      <Nav active="/portfolio" />
      <main id="main-content" className="container-px py-8 sm:py-10 lg:py-12">
        <ProductBreadcrumbs items={[["Portfolio", null]]} />
        <PortfolioWorkspace />
      </main>
      <Footer note={<span>Portfolio research is not a suitability assessment. Values use available NAV and metadata; missing evidence remains disclosed.</span>} />
    </>
  );
}
