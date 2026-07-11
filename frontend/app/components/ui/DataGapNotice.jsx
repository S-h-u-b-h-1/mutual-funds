export default function DataGapNotice({ title = "Data currently incomplete", children, className = "" }) {
  return (
    <aside className={`rounded-xl border border-missing/35 bg-missing/10 p-4 text-sm text-ink-muted ${className}`} aria-label="Data limitation">
      <div className="font-medium text-ink">{title}</div>
      {children && <div className="mt-1.5 max-w-prose text-[13px] leading-relaxed">{children}</div>}
    </aside>
  );
}
