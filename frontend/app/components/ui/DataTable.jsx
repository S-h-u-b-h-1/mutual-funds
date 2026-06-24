// Investor-grade table: dense, aligned numerals, hairline rows, hover.
// columns: [{ key, label, align:'right'|'left', mono, muted, render(row), width }]
export default function DataTable({ columns, rows, dense = true, footnote }) {
  const pad = dense ? "py-2.5" : "py-3.5";
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-white/[0.015]">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line">
            {columns.map((c) => (
              <th
                key={c.key}
                style={c.width ? { width: c.width } : undefined}
                className={`px-3.5 ${pad} text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-faint ${
                  c.align === "right" ? "text-right" : "text-left"
                }`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r._key ?? i} className="border-b border-line/60 transition-colors last:border-0 hover:bg-white/[0.025]">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`px-3.5 ${pad} align-middle ${c.align === "right" ? "text-right tnum" : "text-left"} ${
                    c.mono ? "tnum" : ""
                  } ${c.muted ? "text-ink-muted" : "text-ink"}`}
                >
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {footnote && <div className="border-t border-line px-3.5 py-2 text-[11px] text-ink-faint">{footnote}</div>}
    </div>
  );
}
