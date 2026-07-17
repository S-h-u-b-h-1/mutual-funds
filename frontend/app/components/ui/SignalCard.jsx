// Flow signals are industry-wide per fund category (AMFI Monthly Report), not per AMC — no
// AMC-specific drill-down page exists for this data, so this renders as a static card, not a link.
export default function SignalCard({ assetClass, signal, z, value }) {
  const up = signal === "inflow_surge";
  return (
    <div className="glass p-4 flex items-center gap-3.5">
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-extrabold ${
          up ? "bg-pos/10 text-pos" : "bg-neg/10 text-neg"
        }`}
      >
        {up ? "↑" : "↓"}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-ink truncate">
          {assetClass}
        </div>
        <div className="text-[11px] text-ink-muted">
          {up ? "Inflow surge" : "Outflow surge"} · {value}
        </div>
      </div>
      <div className="text-xs font-bold text-ink-faint tnum shrink-0">z {z}</div>
    </div>
  );
}
