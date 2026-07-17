"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getWatchlist } from "../lib/cloudSync";
import WatchlistIntelligence from "./WatchlistIntelligence";

// WatchlistIntelligence itself renders null when the watchlist is empty (by design, for its
// other call sites where an empty section should just disappear). This homepage slot has its
// own section header above it regardless, so an empty WatchlistIntelligence would leave a
// header with nothing underneath — this wrapper checks first and shows an honest CTA instead.
export default function HomeWatchlistSection() {
  const [hasItems, setHasItems] = useState(null); // null = still checking

  useEffect(() => {
    let cancelled = false;
    getWatchlist().then((list) => {
      if (!cancelled) setHasItems(list.length > 0);
    }).catch(() => { if (!cancelled) setHasItems(false); });
    return () => { cancelled = true; };
  }, []);

  if (hasItems === null) return null; // avoid a flash of the CTA before the real check resolves
  if (!hasItems) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
        <p className="text-[13px] text-ink-muted">Nothing on your watchlist yet.</p>
        <Link href="/funds" className="premium-link">Browse funds to start tracking <span aria-hidden="true">→</span></Link>
      </div>
    );
  }
  return <WatchlistIntelligence />;
}
