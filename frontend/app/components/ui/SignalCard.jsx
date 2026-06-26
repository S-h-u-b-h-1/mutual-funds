import { signalPath } from "../../lib/signalSlug";

export default function SignalCard({ amc, assetClass, signal, z, value }) {
  const up = signal === "inflow_surge";
  return (
    <a
      href={`/signals/${signalPath(amc, assetClass)}`}
      className="group glass p-4 flex items-center gap-3.5 transition-all duration-200 hover:border-line-strong hover:-translate-y-0.5"
    >
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-extrabold ${
          up ? "bg-pos/10 text-pos" : "bg-neg/10 text-neg"
        }`}
      >
        {up ? "↑" : "↓"}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-ink truncate">
          {amc} · {assetClass}
        </div>
        <div className="text-[11px] text-ink-muted">
          {up ? "Inflow surge" : "Outflow surge"} · {value}
        </div>
      </div>
      <div className="text-xs font-bold text-ink-faint tnum shrink-0">z {z}</div>
    </a>
  );
}
