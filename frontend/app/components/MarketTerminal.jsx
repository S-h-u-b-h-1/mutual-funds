// Server component — data is already resolved by the caller (ISR-cached), no client JS needed
// just to display it. Every group/instrument is exactly what was actually fetched; a symbol
// Yahoo didn't return is silently absent, never backfilled with a placeholder.
const GROUP_ORDER = ["India", "Global", "Commodities", "Currency"];

function relativeAge(iso) {
  if (!iso) return "unknown";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function Quote({ q }) {
  const up = (q.changePct ?? 0) >= 0;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line/60 px-3 py-2 text-[12.5px] last:border-0">
      <span className="text-ink-muted">{q.name}</span>
      <span className="flex items-center gap-2 tnum">
        <span className="text-ink">{q.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
        <span className={up ? "text-pos" : "text-neg"}>
          {q.changePct != null ? `${up ? "+" : ""}${q.changePct.toFixed(2)}%` : "—"}
        </span>
      </span>
    </div>
  );
}

export default function MarketTerminal({ data }) {
  if (!data?.quotes?.length) return null;
  return (
    <section className="mt-6 rounded-2xl border border-line bg-white/[0.015] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Market Terminal</div>
        <div className="text-[10.5px] text-ink-faint">
          {data.received}/{data.requested} instruments · unlicensed quote data, not a real-time feed · source: Yahoo Finance
        </div>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-4">
        {GROUP_ORDER.filter((g) => data.byGroup[g]?.length).map((g) => (
          <div key={g}>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.09em] text-ink-faint">{g}</div>
            {data.byGroup[g].map((q) => (
              <Quote key={q.symbol} q={q} />
            ))}
            <div className="pt-1.5 text-[10px] text-ink-faint">
              as of {relativeAge(data.byGroup[g][0]?.lastUpdated)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
