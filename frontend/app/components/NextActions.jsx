// Contextual "what should I do next?" strip (Phase 2) — every link here must resolve to a real,
// already-shipped page. Never link to something that doesn't exist yet (no dead ends).
export default function NextActions({ items }) {
  const valid = (items || []).filter((i) => i && i.href && i.label);
  if (!valid.length) return null;
  return (
    <section className="mt-7">
      <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">What&rsquo;s next</div>
      <div className="flex flex-wrap gap-2">
        {valid.map((i) => (
          <a key={i.href} href={i.href} className="glass flex items-center gap-1.5 px-3.5 py-2 text-[12.5px] text-ink-muted transition-colors hover:bg-white/[0.045] hover:text-ink">
            {i.label} <span className="text-ink-faint">→</span>
          </a>
        ))}
      </div>
    </section>
  );
}
