// MFAPI.in — free REST API of AMFI NAV history, keyed by AMFI scheme code.
// Used ONLY as a per-fund history source for the trend chart, fetched on demand and
// cached. Never the sole source; identity/returns come from our AMFI-built bundle.
export async function getNavHistory(code) {
  try {
    const r = await fetch(`https://api.mfapi.in/mf/${code}`, { next: { revalidate: 21600 } });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j?.data?.length) return null;
    const points = j.data
      .map((d) => {
        const [dd, mm, yy] = d.date.split("-");
        return { t: `${yy}-${mm}-${dd}`, v: Number(d.nav) };
      })
      .filter((p) => p.v > 0)
      .reverse(); // ascending by date
    return { points, meta: j.meta || null };
  } catch {
    return null;
  }
}
