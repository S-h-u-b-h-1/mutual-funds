import dynamic from "next/dynamic";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import Tracker from "../components/Tracker";
import SectionHeader from "../components/ui/SectionHeader";
import GlassPanel from "../components/ui/GlassPanel";
import Badge from "../components/ui/Badge";
import { allFunds, asOf } from "../lib/funds";
import { fundHealth } from "../lib/fundHealth";

const MarketMapChart = dynamic(() => import("../components/MarketMapChart"), { ssr: false });

export const metadata = { title: "Market Map" };
export const revalidate = 3600;

// Category → AMC → Fund treemap dataset. Value = real scheme count (an honest sizing metric
// always available, unlike AUM which only exists for a 152-fund factsheet subset). Color = real
// 1-month NAV return (the "which parts of the market are green/red" signal this page exists to
// answer). Scoped to active equity Growth non-IDCW funds — the same investable universe every
// other ranked page on this site already uses, not an arbitrary new cut.
function buildTreemap(funds) {
  const eq = funds.filter((f) => f.assetClass === "Equity" && f.isGrowth && !f.isIdcw && f.active !== false && f.r1m != null);
  const byCategory = new Map();
  for (const f of eq) {
    if (!byCategory.has(f.category)) byCategory.set(f.category, new Map());
    const byAmc = byCategory.get(f.category);
    if (!byAmc.has(f.amc)) byAmc.set(f.amc, []);
    byAmc.get(f.amc).push(f);
  }
  const children = [];
  for (const [category, byAmc] of byCategory) {
    const amcChildren = [];
    let catCount = 0, catSum = 0;
    for (const [amc, fs] of byAmc) {
      const sum = fs.reduce((s, f) => s + f.r1m, 0);
      amcChildren.push({
        name: amc,
        value: fs.length,
        avg1m: +(sum / fs.length).toFixed(2),
        children: fs.map((f) => {
          const h = fundHealth(f);
          return { name: f.name.replace(/ - (Direct|Regular).*/i, ""), value: 1, r1m: f.r1m, code: f.code, health: h?.overall ?? null };
        }),
      });
      catCount += fs.length;
      catSum += sum;
    }
    children.push({ name: category, value: catCount, avg1m: +(catSum / catCount).toFixed(2), children: amcChildren });
  }
  return { name: "Market", children };
}

export default function MarketMap() {
  const funds = allFunds();
  const tree = buildTreemap(funds);
  const totalFunds = tree.children.reduce((s, c) => s + c.value, 0);

  return (
    <>
      <Nav active="/market-map" />
      <Tracker event="page_view" payload={{ page: "market_map" }} />
      <main className="container-px py-10 sm:py-14">
        <div className="eyebrow text-accent">Market Map</div>
        <h1 className="page-title mt-3">
          The Indian equity mutual fund industry, at a glance
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-muted">
          {totalFunds.toLocaleString("en-IN")} active equity Growth funds, grouped by category then AMC. Box
          size = real scheme count; color = real 1-month NAV return. Click into a box to zoom, click a fund
          to open its page.
        </p>

        <section className="mt-7">
          <SectionHeader
            eyebrow="real AMFI NAV · 1-month return"
            title="Category → AMC → Fund"
            action={<Badge tone="pos" dot>real NAV, as of {asOf}</Badge>}
          />
          <GlassPanel className="p-3 sm:p-4">
            <MarketMapChart data={tree} />
          </GlassPanel>
          <p className="mt-2 text-[11px] text-ink-faint">
            Green = positive 1-month NAV return, red = negative. Depth is Category → AMC → individual fund.
            Not investment advice — a size/return map of the real universe, nothing more.
          </p>
        </section>
      </main>
      <Footer note={<span>Every box is a real scheme from AMFI NAV data, as of {asOf} · sized by count, colored by real 1-month return.</span>} />
    </>
  );
}
