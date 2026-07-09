"use client";
import { useEffect, useState } from "react";
import { track } from "../lib/track";
import { getWatchlist, saveWatchlist, removeFromWatchlist } from "../lib/cloudSync";

export default function WatchButton({ code, name, amc }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    getWatchlist().then((list) => { if (live) setOn(list.some((x) => x.code === code)); });
    const refresh = () => getWatchlist().then((list) => { if (live) setOn(list.some((x) => x.code === code)); });
    window.addEventListener("mfp-sync", refresh);
    return () => { live = false; window.removeEventListener("mfp-sync", refresh); };
  }, [code]);

  async function toggle() {
    const exists = on;
    setOn(!exists); // optimistic — cloudSync's own local mirror + mfp-sync event reconcile the rest
    if (exists) await removeFromWatchlist(code);
    else await saveWatchlist({ code, name, amc });
    track(exists ? "watchlist_remove" : "watchlist_add", { scheme_code: code, amc });
  }

  return (
    <button
      onClick={toggle}
      title={on ? "Remove from watchlist" : "Add to watchlist"}
      aria-label="Toggle watchlist"
      className={`text-[17px] leading-none transition-transform hover:scale-110 ${on ? "text-warn" : "text-ink-faint hover:text-warn"}`}
    >
      {on ? "★" : "☆"}
    </button>
  );
}
