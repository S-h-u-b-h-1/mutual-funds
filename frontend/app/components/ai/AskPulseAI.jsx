// Only entity identifiers and fixed prompt names travel in the URL; questions stay out of logs/referrers.
export default function AskPulseAI({
  codes = [],
  amcs = [],
  type = "market",
  children = "Ask Pulse AI",
}) {
  const params = new URLSearchParams({ type });
  codes.forEach((code) => params.append("code", String(code)));
  amcs.forEach((amc) => params.append("amc", amc));
  return (
    <a
      href={`/ai?${params}`}
      className="inline-flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3.5 py-2 text-[12px] font-medium text-accent-soft transition-colors hover:bg-accent/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      ✦ {children}
    </a>
  );
}
