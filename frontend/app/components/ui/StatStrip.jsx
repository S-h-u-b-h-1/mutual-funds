// Dense market-summary strip with hairline separators (Bloomberg-style).
export default function StatStrip({ items }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
      {items.map((it, i) => (
        <div key={i} className="bg-bg px-4 py-3.5">
          <div className="text-[10px] font-medium uppercase tracking-[0.09em] text-ink-faint">{it.label}</div>
          <div
            className={`mt-1.5 text-[18px] font-semibold tracking-tight tnum ${
              it.tone === "pos" ? "text-pos" : it.tone === "neg" ? "text-neg" : "text-ink"
            }`}
          >
            {it.value}
          </div>
          {it.sub && <div className="mt-0.5 text-[10.5px] text-ink-faint">{it.sub}</div>}
        </div>
      ))}
    </div>
  );
}
