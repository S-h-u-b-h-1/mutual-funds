import Link from "next/link";

const confidenceTone = {
  High: "text-pos",
  Medium: "text-warn",
  Low: "text-neg",
  Unavailable: "text-ink-faint",
};

export default function ProvenanceDisclosure({
  source,
  sourceUrl,
  updatedAt,
  confidence = "Unavailable",
  coverage,
  freshness,
  methodology,
  limitations,
  className = "",
}) {
  const sourceValue = sourceUrl ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink hover:text-accent">{source} ↗</a> : <span className="font-semibold text-ink">{source}</span>;
  return (
    <aside className={`rounded-2xl border border-line bg-surface px-4 py-3 sm:px-5 ${className}`} aria-label="Data source and confidence">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-xs">
        <div><span className="text-ink-faint">Official source</span><span className="ml-2">{sourceValue}</span></div>
        <div><span className="text-ink-faint">Updated</span><span className="financial-number ml-2 font-medium text-ink-muted">{updatedAt || "Not available"}</span></div>
        <div><span className="text-ink-faint">Confidence</span><span className={`ml-2 font-semibold ${confidenceTone[confidence] || "text-ink-muted"}`}>{confidence}</span></div>
        {coverage && <div><span className="text-ink-faint">Coverage</span><span className="ml-2 font-medium text-ink-muted">{coverage}</span></div>}
        {freshness && <div><span className="text-ink-faint">Freshness</span><span className="ml-2 font-medium text-ink-muted">{freshness}</span></div>}
        <details className="group ml-auto">
          <summary className="inline-flex min-h-10 cursor-pointer list-none items-center rounded-full px-3 font-semibold text-accent outline-none hover:bg-accent/10 focus-visible:ring-2 focus-visible:ring-accent">How this is verified <span aria-hidden="true" className="ml-1 transition-transform group-open:rotate-180">⌄</span></summary>
          <div className="mt-3 border-t border-line pt-3 text-xs leading-5 text-ink-muted sm:min-w-[28rem]">
            <p><span className="font-semibold text-ink">Method:</span> {methodology || "Methodology is documented at the platform level."}</p>
            {limitations && <p className="mt-2"><span className="font-semibold text-ink">Limitations:</span> {limitations}</p>}
            <div className="mt-3 flex flex-wrap gap-4"><Link href="/methodology" className="font-semibold text-accent hover:text-accent-soft">Methodology →</Link><Link href="/data-quality" className="font-semibold text-accent hover:text-accent-soft">Coverage matrix →</Link><Link href="/data-status" className="font-semibold text-accent hover:text-accent-soft">Pipeline status →</Link></div>
          </div>
        </details>
      </div>
    </aside>
  );
}
