// Unambiguous health-score cell for dense tables. Never renders a bare "82 B" — always
// "82/100 · B" so the score can't be misread as a magnitude (e.g. "82 billion"). Single
// source of truth for the render logic that was previously hand-duplicated across 4 pages.
export default function HealthCell({ score, grade, tone }) {
  if (score == null) return <span className="text-ink-faint">—</span>;
  const cls = tone === "pos" ? "text-pos" : tone === "warn" ? "text-warn" : "text-neg";
  return (
    <span className={`tnum font-semibold ${cls}`}>
      {score}<span className="font-normal text-ink-faint">/100</span> · {grade}
    </span>
  );
}
