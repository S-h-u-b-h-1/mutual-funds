// Shared PostgREST fetch helper for server components.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function sb(path, { revalidate = 3600 } = {}) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    next: { revalidate },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${path}`);
  return res.json();
}

export const SUPA = { URL, KEY };

// Exact row count via PostgREST's Content-Range header — select=* (not a named column) since
// not every table has an `id` column (e.g. dim_scheme/fact_nav_daily use natural-key PKs).
export async function sbCount(table, { revalidate = 60 } = {}) {
  const res = await fetch(`${URL}/rest/v1/${table}?select=*&limit=1`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: "count=exact" },
    next: { revalidate },
  });
  if (!res.ok) return null;
  const range = res.headers.get("content-range") || "*/0";
  return parseInt(range.split("/")[1] || "0", 10);
}
