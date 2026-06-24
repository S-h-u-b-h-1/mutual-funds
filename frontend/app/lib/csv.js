// Server-side CSV builder. Runs in Server Components so column accessor functions
// never cross the client boundary — only the resulting string is sent to the client.
export function toCsv(rows, columns) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => c.label).join(",");
  const lines = rows.map((r) => columns.map((c) => esc(c.get ? c.get(r) : r[c.key])).join(","));
  return [header, ...lines].join("\n");
}
