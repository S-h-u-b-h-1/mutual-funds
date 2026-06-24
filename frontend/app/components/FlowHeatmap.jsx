// Fund-flow heatmap: AMC rows × month columns, cell colour = net flow direction/size.
export default function FlowHeatmap({ rows, assetClass = "Equity" }) {
  const data = (rows || []).filter((r) => r.asset_class === assetClass);
  if (!data.length) return null;
  const months = [...new Set(data.map((r) => r.month))].sort();
  const amcs = [...new Set(data.map((r) => r.amc_name))];
  const map = {};
  data.forEach((r) => { (map[r.amc_name] ||= {})[r.month] = Number(r.net_flow_cr); });
  const max = Math.max(...data.map((r) => Math.abs(Number(r.net_flow_cr))), 1);

  const style = (v) => {
    if (v == null) return { background: "rgba(255,255,255,0.02)" };
    const t = Math.min(Math.abs(v) / max, 1);
    const rgb = v >= 0 ? "52,211,153" : "248,113,113";
    return { background: `rgba(${rgb},${(0.12 + 0.62 * t).toFixed(3)})` };
  };
  const fmtK = (v) => `${v >= 0 ? "+" : "−"}${(Math.abs(v) / 1000).toFixed(1)}k`;
  const mlabel = (m) => { const d = new Date(m + "T00:00:00Z"); return d.toLocaleString("en", { month: "short" }); };

  return (
    <div className="overflow-x-auto">
      <table className="border-separate" style={{ borderSpacing: "4px" }}>
        <thead>
          <tr>
            <th className="pr-3" />
            {months.map((m) => (
              <th key={m} className="pb-1 text-center text-[10.5px] font-medium uppercase tracking-wider text-ink-faint">{mlabel(m)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {amcs.map((a) => (
            <tr key={a}>
              <td className="whitespace-nowrap pr-3 text-right text-[12px] text-ink-muted">{a.replace(" Mutual Fund", "")}</td>
              {months.map((m) => {
                const v = map[a]?.[m];
                return (
                  <td
                    key={m}
                    title={v != null ? `${a} · ${m}: ₹${Math.round(v)} Cr` : ""}
                    className="h-9 w-14 rounded-md text-center text-[10.5px] font-medium tnum"
                    style={{ ...style(v), color: "rgba(233,237,246,0.9)" }}
                  >
                    {v != null ? fmtK(v) : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-center gap-3 text-[11px] text-ink-faint">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-3 rounded-sm" style={{ background: "rgba(52,211,153,0.6)" }} /> net inflow</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-3 rounded-sm" style={{ background: "rgba(248,113,113,0.6)" }} /> net outflow</span>
        <span>· ₹ in thousands of crore · {assetClass}</span>
      </div>
    </div>
  );
}
