"use client";
import { useState } from "react";

const fmt = (n) => new Intl.NumberFormat("en-IN").format(n);
const inr = (n) => `${n >= 0 ? "+" : "−"}₹${fmt(Math.abs(Math.round(n)))} Cr`;

const COLS = [
  { key: "name", label: "AMC", align: "left" },
  { key: "equity", label: "Eq schemes", align: "right" },
  { key: "idx", label: "30d Idx", align: "right" },
  { key: "equityFlow", label: "Eq flow", align: "right" },
  { key: "debtFlow", label: "Debt flow", align: "right" },
  { key: "totalFlow", label: "Net flow", align: "right" },
  { key: "signals", label: "Signals", align: "right" },
];

export default function Leaderboard({ rows }) {
  const [sortKey, setSortKey] = useState("totalFlow");
  const [dir, setDir] = useState("desc");

  function sortBy(k) {
    if (k === sortKey) setDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(k); setDir("desc"); }
  }

  const sorted = [...rows].sort((a, b) => {
    const va = a[sortKey], vb = b[sortKey];
    const an = va == null, bn = vb == null;
    if (an && bn) return 0;
    if (an) return 1; // nulls always last
    if (bn) return -1;
    const cmp = typeof va === "string" ? va.localeCompare(vb) : va - vb;
    return dir === "desc" ? -cmp : cmp;
  });

  const arrow = (k) => (sortKey === k ? (dir === "desc" ? " ↓" : " ↑") : "");
  const flowCell = (v) => (v == null ? <span className="text-ink-faint">—</span> : <span className={v >= 0 ? "text-pos" : "text-neg"}>{inr(v)}</span>);

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-white/[0.015]">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line">
            {COLS.map((c) => (
              <th
                key={c.key}
                onClick={() => sortBy(c.key)}
                aria-sort={sortKey === c.key ? (dir === "desc" ? "descending" : "ascending") : "none"}
                className={`cursor-pointer select-none whitespace-nowrap px-3.5 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] hover:text-ink ${
                  c.align === "right" ? "text-right" : "text-left"
                } ${sortKey === c.key ? "text-ink" : "text-ink-faint"}`}
              >
                {c.label}{arrow(c.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.amc} className="border-b border-line/60 transition-colors last:border-0 hover:bg-white/[0.025]">
              <td className="px-3.5 py-2.5"><a className="font-medium text-ink hover:text-accent-soft" href={`/amc/${encodeURIComponent(r.amc)}`}>{r.name}</a></td>
              <td className="px-3.5 py-2.5 text-right tnum">{fmt(r.equity)}</td>
              <td className="px-3.5 py-2.5 text-right tnum">{r.idx == null ? <span className="text-ink-faint">—</span> : <span className={r.idx >= 0 ? "text-pos" : "text-neg"}>{r.idx >= 0 ? "+" : ""}{r.idx.toFixed(2)}</span>}</td>
              <td className="px-3.5 py-2.5 text-right tnum">{flowCell(r.equityFlow)}</td>
              <td className="px-3.5 py-2.5 text-right tnum">{flowCell(r.debtFlow)}</td>
              <td className="px-3.5 py-2.5 text-right tnum">{flowCell(r.totalFlow)}</td>
              <td className="px-3.5 py-2.5 text-right tnum">{r.signals > 0 ? <span className="text-ink">{r.signals}</span> : <span className="text-ink-faint">0</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-line px-3.5 py-2 text-[11px] text-ink-faint">
        Click any header to sort. Flows = latest reporting month (sample). “—” = no monthly flow data.
      </div>
    </div>
  );
}
