import Link from "next/link";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import DataCompletenessMatrix from "../components/DataCompletenessMatrix";
import StatStrip from "../components/ui/StatStrip";
import fieldCoverage from "../data/fieldCoverage.json";
import { FIELD_REGISTRY, computeConfidence } from "../lib/fieldRegistry";

export const metadata = { title: "Data Quality & Coverage" };

function fieldCoverageEntry(entry) {
  if (!entry.key) return null;
  const [group, name] = entry.key.split(".");
  return fieldCoverage.fields?.[group]?.[name] || null;
}

function domainFor(entry) {
  if (entry.id === "nav") return "NAV";
  if (entry.id === "fund_house") return "AMC";
  if (["fund_manager", "manager_history"].includes(entry.id)) return "Manager";
  if (["holdings", "sector_allocation"].includes(entry.id)) return "Holdings";
  if (["asset_allocation", "portfolio_turnover"].includes(entry.id)) return "Portfolio";
  if (["riskometer", "duration", "yield", "average_maturity", "modified_duration", "credit_quality"].includes(entry.id)) return "Risk";
  if (entry.key?.startsWith("Performance.")) return "Performance";
  return "Metadata";
}

function validationFor(entry) {
  if (entry.status === "blocked_by_license") return "Blocked";
  if (entry.status === "not_applicable") return "Not applicable";
  if (entry.status === "not_yet_assessed") return "Not assessed";
  if (entry.status === "no_schema") return "Not measurable";
  if (entry.id === "sector_allocation") return "Known limitation";
  return "Validated";
}

function freshnessFor(entry, lastUpdated) {
  if (!lastUpdated) return "Unavailable";
  if (entry.refreshFrequency === "n/a") return "Not applicable";
  if (entry.refreshFrequency.startsWith("static")) return "Reference field";
  return lastUpdated === fieldCoverage.asOf ? "Current audit" : "Dated evidence";
}

function buildRows() {
  const registered = FIELD_REGISTRY.map((entry) => {
    const measured = fieldCoverageEntry(entry);
    const coveragePct = measured?.universe_pct ?? null;
    const measuredCount = measured?.universe_n ?? null;
    const lastUpdated = entry.key?.startsWith("Identity.") || entry.key?.startsWith("Performance.")
      ? fieldCoverage.amfiLastUpdated
      : entry.key
        ? fieldCoverage.factsheetLastUpdated
        : null;
    return {
      id: entry.id,
      field: entry.label,
      domain: domainFor(entry),
      coveragePct,
      missingPct: coveragePct == null ? null : Math.max(0, 100 - coveragePct),
      measuredCount,
      denominator: fieldCoverage.denominators.universe,
      officialSource: entry.officialSource || "Official source not yet registered",
      secondarySource: entry.secondarySource,
      backupSource: entry.backupSource,
      confidence: computeConfidence(entry, coveragePct),
      lastUpdated: lastUpdated || "No measured update",
      freshness: freshnessFor(entry, lastUpdated),
      validationStatus: validationFor(entry),
      refreshFrequency: entry.refreshFrequency,
      notes: entry.notes,
    };
  });
  const registeredKeys = new Set(FIELD_REGISTRY.map((entry) => entry.key).filter(Boolean));
  const measuredWithoutRegistry = Object.entries(fieldCoverage.fields).flatMap(([group, fields]) =>
    Object.entries(fields).filter(([name]) => !registeredKeys.has(`${group}.${name}`)).map(([name, measured]) => {
      const coveragePct = measured.universe_pct;
      const lastUpdated = group === "Performance" || group === "Identity" ? fieldCoverage.amfiLastUpdated : fieldCoverage.factsheetLastUpdated;
      return {
        id: `unregistered_${group}_${name}`.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        field: name,
        domain: group === "Performance" ? "Performance" : "Metadata",
        coveragePct,
        missingPct: Math.max(0, 100 - coveragePct),
        measuredCount: measured.universe_n,
        denominator: fieldCoverage.denominators.universe,
        officialSource: "Source registry entry not yet connected",
        secondarySource: null,
        backupSource: null,
        confidence: "N/A",
        lastUpdated,
        freshness: lastUpdated === fieldCoverage.asOf ? "Current audit" : "Dated evidence",
        validationStatus: "Not assessed",
        refreshFrequency: "Source registry pending",
        notes: "The warehouse audit measures this field, but the frontend source registry does not yet expose an authoritative source, validation policy and refresh contract. Coverage is shown; provenance confidence remains unavailable.",
      };
    })
  );
  return [...registered, ...measuredWithoutRegistry];
}

export default function DataQuality() {
  const rows = buildRows();
  const measured = rows.filter((row) => row.coveragePct != null);
  const highConfidence = rows.filter((row) => row.confidence === "High").length;
  const knownGaps = rows.filter((row) => row.coveragePct === 0 || row.coveragePct == null).length;

  return (
    <>
      <Nav active="/research" />
      <main id="main-content" className="container-px py-10 sm:py-14">
        <header className="max-w-4xl">
          <div className="eyebrow text-accent">Trust center · verified coverage</div>
          <h1 className="page-title mt-3">Know exactly which data you can trust.</h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-ink-muted">MF Pulse publishes its missing data alongside its available data. Each field below shows measured coverage, registered official sources, validation state, refresh expectation and confidence—without filling gaps with estimates.</p>
          <div className="mt-5 flex flex-wrap gap-3 text-xs text-ink-muted"><span>Warehouse audit: <strong className="text-ink">{fieldCoverage.asOf}</strong></span><span>·</span><span>Universe: <strong className="text-ink">{fieldCoverage.denominators.universe.toLocaleString("en-IN")} schemes</strong></span><span>·</span><Link href="/methodology" className="font-semibold text-accent hover:text-accent-soft">Read methodology →</Link></div>
        </header>

        <section className="mt-8" aria-label="Coverage summary">
          <StatStrip items={[
            { label: "Registered fields", value: rows.length },
            { label: "Measured fields", value: measured.length },
            { label: "High confidence", value: highConfidence, tone: "pos" },
            { label: "Unmeasured or zero", value: knownGaps, tone: "warn" },
          ]} />
        </section>

        <div className="mt-10"><DataCompletenessMatrix rows={rows} asOf={fieldCoverage.asOf} denominator={fieldCoverage.denominators.universe} /></div>

        <section className="mt-10 grid gap-4 md:grid-cols-3" aria-labelledby="interpret-title">
          <div className="md:col-span-3"><div className="eyebrow text-ink-faint">How to read this</div><h2 id="interpret-title" className="section-title mt-2">Coverage and confidence answer different questions.</h2></div>
          <article className="rounded-2xl border border-line bg-surface p-5"><h3 className="font-semibold text-ink">Coverage</h3><p className="mt-2 text-sm leading-6 text-ink-muted">The share of the full AMFI universe with a populated field in the generated warehouse audit.</p></article>
          <article className="rounded-2xl border border-line bg-surface p-5"><h3 className="font-semibold text-ink">Confidence</h3><p className="mt-2 text-sm leading-6 text-ink-muted">Combines measured coverage, validation and whether the registered source is primary and official.</p></article>
          <article className="rounded-2xl border border-line bg-surface p-5"><h3 className="font-semibold text-ink">Freshness</h3><p className="mt-2 text-sm leading-6 text-ink-muted">Compares the evidence date with its expected daily, monthly, static or event-driven refresh policy.</p></article>
        </section>
      </main>
      <Footer note={<span>Coverage generated from the warehouse audit · sources registered from official AMFI, AMC, SID and regulatory records · <Link href="/data-status" className="text-accent">Pipeline status →</Link></span>} />
    </>
  );
}
