"use client";
import { useEffect, useState } from "react";
import { track } from "../lib/track";

const KEY = "mfp_watchlist";
const read = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
};

export default function WatchButton({ code, name, amc }) {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(read().some((x) => x.code === code)), [code]);

  function toggle() {
    const list = read();
    const exists = list.some((x) => x.code === code);
    const next = exists ? list.filter((x) => x.code !== code) : [...list, { code, name, amc }];
    localStorage.setItem(KEY, JSON.stringify(next));
    setOn(!exists);
    track(exists ? "watchlist_remove" : "watchlist_add", { scheme_code: code, amc });
    window.dispatchEvent(new Event("mfp-watchlist"));
  }

  return (
    <button className={`watch ${on ? "on" : ""}`} onClick={toggle}
      title={on ? "Remove from watchlist" : "Add to watchlist"} aria-label="Toggle watchlist">
      {on ? "★" : "☆"}
    </button>
  );
}
