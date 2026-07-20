"use client";

import { useCallback, useEffect, useState } from "react";

async function request(path, options) {
  const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", ...(options?.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "We could not complete that request.");
  return body;
}

export function useInvestData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [profile, compliance] = await Promise.all([request("/api/v1/invest/profile"), request("/api/v1/invest/compliance")]);
      setData({ ...profile, compliance });
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return { data, loading, error, refresh, request };
}

export function LoadingCards() { return <div className="grid gap-4 sm:grid-cols-2" aria-label="Loading investment workspace"><div className="h-44 animate-pulse rounded-[1.65rem] bg-surface-2" /><div className="h-44 animate-pulse rounded-[1.65rem] bg-surface-2" /></div>; }
export function ErrorCard({ message, retry }) { return <div role="alert" className="rounded-[1.65rem] border border-neg/25 bg-neg/5 p-6"><h2 className="font-semibold text-ink">This view did not load</h2><p className="mt-2 text-sm text-ink-muted">{message}</p><button type="button" onClick={retry} className="mt-4 min-h-11 rounded-full bg-ink px-5 text-sm font-semibold text-bg">Try again</button></div>; }
