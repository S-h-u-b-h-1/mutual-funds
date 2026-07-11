const tones = {
  current: "border-pos/30 bg-pos/10 text-pos",
  delayed: "border-warn/30 bg-warn/10 text-warn",
  stale: "border-neg/30 bg-neg/10 text-neg",
  unknown: "border-line bg-surface-strong text-ink-muted",
};

export default function FreshnessBadge({ status = "unknown", children, timestamp }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${tones[status] || tones.unknown}`} title={timestamp || undefined}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  );
}
