// Shared display-formatting helpers. `short` strips the "- Direct/Regular ..." plan suffix from
// a scheme name for compact display — was hand-duplicated across 5 files (categories, categories/
// [category], funds, manager/[slug], benchmark/[slug]); centralised here as a single source.
export const short = (n) => String(n || "").replace(/ - (Direct|Regular).*/i, "");
