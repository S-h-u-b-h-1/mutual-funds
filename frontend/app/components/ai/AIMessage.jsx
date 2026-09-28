export default function AIMessage({ message, index }) {
  const { role, content, result } = message;
  if (role === "user")
    return (
      <div className="ml-4 rounded-xl border border-line bg-white/[0.04] p-4 sm:ml-12">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
          Your question
        </div>
        <p className="whitespace-pre-wrap break-words text-sm text-ink">
          {content}
        </p>
      </div>
    );
  const evidence = result.evidence || [];
  const parts = (result.answer || "").split(/(\[MF-\d{3}\])/g);
  return (
    <article className="glass p-4 sm:p-6">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wider">
        <span className="font-semibold text-accent-soft">✦ Pulse AI</span>
        <span className="text-ink-muted">
          {result.kind === "explanation"
            ? "AI explanation"
            : "Research guidance"}
        </span>
      </div>
      {result.warnings?.length > 0 && (
        <div className="mb-4 rounded-lg border border-warn/25 bg-warn/[0.05] p-3 text-xs leading-relaxed text-warn">
          {result.warnings.map((w, i) => (
            <p key={i} className={i ? "mt-2" : ""}>
              {w}
            </p>
          ))}
        </div>
      )}
      <p className="whitespace-pre-wrap break-words text-[14px] leading-7 text-ink">
        {parts.map((part, i) => {
          const id = part.match(/^\[(MF-\d{3})\]$/)?.[1];
          return id && evidence.some((e) => e.id === id) ? (
            <a
              key={i}
              href={`#answer-${index}-${id}`}
              className="rounded bg-accent/10 px-1 text-xs text-accent-soft underline underline-offset-2"
            >
              {part}
            </a>
          ) : (
            part
          );
        })}
      </p>
      {evidence.length > 0 && (
        <details className="mt-5 border-t border-line pt-4" open>
          <summary className="cursor-pointer text-xs font-semibold text-ink-muted">
            Grounded in · {evidence.length} evidence records
          </summary>
          <ul className="mt-3 space-y-2">
            {evidence.map((e) => (
              <li
                key={e.id}
                id={`answer-${index}-${e.id}`}
                className="scroll-mt-20 rounded-lg border border-line p-3 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <a href={e.href} className="text-accent-soft hover:underline">
                    {e.id} · {e.source}
                  </a>
                  <span
                    className={
                      e.isSample || e.freshness === "stale"
                        ? "text-warn"
                        : "text-ink-muted"
                    }
                  >
                    {e.isSample ? "SAMPLE · " : ""}
                    {e.asOf || "Methodology / availability"}
                    {e.asOf ? ` · ${e.freshness}` : ""}
                  </span>
                </div>
                <details className="mt-2 text-ink-muted">
                  <summary className="cursor-pointer">
                    Inspect evidence
                    {result.citedEvidenceIds?.includes(e.id) ? " · cited" : ""}
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed">
                    {e.text}
                  </p>
                </details>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="mt-4 text-[11px] text-ink-muted">{result.disclaimer}</p>
    </article>
  );
}
