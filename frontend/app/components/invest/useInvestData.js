"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { investApi } from "../../lib/invest/api";

// H3 (docs/LAUNCH_BLOCKER_REPORT.md): a session that expires mid-visit previously left the
// customer stuck on a "This view did not load" card with only a "Try again" button that re-hit
// the same 401'ing endpoint -- no path back to /login anywhere in the invest tree. A 401 here
// means the session itself is gone, not a transient failure, so it's handled as a redirect
// rather than a retryable error, mirroring the callbackUrl pattern AuthGate.jsx already uses for
// a signed-out visitor's first load.
export function useInvestData() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [profile, compliance] = await Promise.all([investApi.getProfile(), investApi.getCompliance()]);
      setData({ ...profile, compliance });
    } catch (e) {
      if (e?.status === 401) {
        const target = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        router.replace(`/login?callbackUrl=${encodeURIComponent(target)}`);
        return;
      }
      setError(e.message);
    }
    finally { setLoading(false); }
  }, [router]);
  useEffect(() => { refresh(); }, [refresh]);
  return { data, loading, error, refresh, api: investApi };
}

export function LoadingCards() { return <div className="grid gap-4 sm:grid-cols-2" role="status" aria-label="Loading investment workspace" aria-busy="true"><div className="skeleton h-44 rounded-[1.65rem]" /><div className="skeleton h-44 rounded-[1.65rem]" /></div>; }
export function ErrorCard({ message, retry }) { return <div role="alert" className="rounded-[1.65rem] border border-neg/25 bg-neg/5 p-6"><h2 className="font-semibold text-ink">This view did not load</h2><p className="mt-2 text-sm text-ink-muted">{message}</p><button type="button" onClick={retry} className="mt-4 min-h-11 rounded-full bg-ink px-5 text-sm font-semibold text-bg">Try again</button></div>; }
