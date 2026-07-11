"use client";
import { useEffect, useRef, useState } from "react";
import { track } from "../lib/track";
import { saveSearch, getSearchHistory, getHistory, saveHistory } from "../lib/cloudSync";
import { SUPA } from "../lib/supabase";

// Predefined suggestion data for a premium experience
const SUGGESTED_AMCS = ["SBI Mutual Fund", "HDFC Mutual Fund", "ICICI Prudential Mutual Fund", "Nippon India Mutual Fund", "Axis Mutual Fund", "Quant Mutual Fund"];
const SUGGESTED_CATEGORIES = ["Large Cap", "Mid Cap", "Small Cap", "Flexi Cap", "ELSS", "Liquid"];
const SUGGESTED_BENCHMARKS = ["NIFTY 50 TRI", "NIFTY Midcap 150 TRI", "NIFTY Smallcap 250 TRI"];
const TRENDING_FUNDS = [
  { name: "Quant Small Cap Fund", code: "120847" },
  { name: "HDFC Mid-Cap Opportunities Fund", code: "101997" },
  { name: "Parag Parikh Flexi Cap Fund", code: "122639" }
];

const WORKSPACE_SHORTCUTS = [
  { label: "Go to News & Regulatory Updates", path: "/news", key: "/news" },
  { label: "Go to Compare & Allocations", path: "/compare", key: "/compare" },
  { label: "Go to Ingestion & System Status", path: "/data-status", key: "/status" },
  { label: "Go to Performance Leaderboards", path: "/performance", key: "/performance" }
];

export default function Search() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState([]);
  const [popular, setPopular] = useState([]);
  const [pinned, setPinned] = useState([]);
  const [visits, setVisits] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const timer = useRef(null);
  const reqId = useRef(0);
  const inputRef = useRef(null);
  const dialogRef = useRef(null);
  const listRef = useRef(null);

  // Sync recent, popular, pinned and recent visits from storage
  const syncStorage = () => {
    getSearchHistory(6).then(setRecent);

    // Load pinned pages (local-only — no backend concept for this yet)
    try {
      const p = localStorage.getItem("mfp_pinned_pages");
      setPinned(p ? JSON.parse(p) : []);
    } catch {
      setPinned([]);
    }

    // Recent visits — same underlying history as RecentActivity.jsx/mfp_recent_views, not a
    // separate tracking system (it used to be: a parallel mfp_recent_visits key with no cloud
    // sync of its own, unified here so this list and "Continue where you left off" always agree).
    getHistory({ type: "fund", limit: 5 }).then((views) => setVisits(views.map((v) => ({ code: v.id, name: v.name }))));
  };

  useEffect(() => {
    syncStorage();
    fetch(`${SUPA.URL}/rest/v1/v_top_searches?select=query,searches&limit=5`, {
      headers: { apikey: SUPA.KEY, Authorization: `Bearer ${SUPA.KEY}` }
    })
      .then((r) => r.json())
      .then((d) => setPopular(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [open]);

  // Toggle pinning an item
  const togglePin = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const p = localStorage.getItem("mfp_pinned_pages");
      let list = p ? JSON.parse(p) : [];
      const match = list.findIndex((x) => x.path === item.path);
      if (match >= 0) {
        list.splice(match, 1);
      } else {
        list.unshift(item);
      }
      localStorage.setItem("mfp_pinned_pages", JSON.stringify(list));
      setPinned(list);
      track("pin_page", { label: item.label, path: item.path });
    } catch {}
  };

  // Open and close dialog helpers
  const openPalette = () => {
    setOpen(true);
    syncStorage();
    dialogRef.current?.showModal();
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  const closePalette = () => {
    dialogRef.current?.close();
    setOpen(false);
    setQ("");
    setResults([]);
    setActiveIndex(0);
  };

  // Keyboard shortcut listener (Cmd+K, Ctrl+K, and /)
  useEffect(() => {
    function onKeyDown(e) {
      const isInput = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
      
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (open) closePalette();
        else openPalette();
      }
      
      if (e.key === "/" && !isInput) {
        e.preventDefault();
        openPalette();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Safari/Fallback click-outside light dismiss handler
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleOutsideClick = (e) => {
      if (e.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const isInside = (
        rect.top <= e.clientY &&
        e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX &&
        e.clientX <= rect.left + rect.width
      );
      if (!isInside) {
        closePalette();
      }
    };

    dialog.addEventListener("click", handleOutsideClick);
    return () => dialog.removeEventListener("click", handleOutsideClick);
  }, []);

  function runSearch(term) {
    setQ(term);
    fetchResults(term);
  }

  function fetchResults(term) {
    clearTimeout(timer.current);
    const clean = term.trim();
    if (clean.length < 2) {
      setResults([]);
      setActiveIndex(0);
      return;
    }
    setLoading(true);
    const myReq = ++reqId.current;
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(clean)}`);
        const { results: hits } = await res.json();
        if (myReq !== reqId.current) return;
        setResults(hits || []);
        setActiveIndex(0);
        track("search", { q: clean, results: hits?.length || 0 });
        if (hits?.length > 0) {
          saveSearch(clean);
          getSearchHistory(6).then(setRecent);
        }
      } catch {
        if (myReq === reqId.current) setResults([]);
      } finally {
        if (myReq === reqId.current) setLoading(false);
      }
    }, 250);
  }

  // Keyboard navigation within the palette
  const selectableItems = [];
  const registerItem = (type, value, payload) => {
    selectableItems.push({ type, value, payload });
  };

  const showSuggestions = q.trim().length < 2;

  // Build selectable items list
  if (showSuggestions) {
    pinned.forEach((p) => registerItem("pinned", p.label, p.path));
    WORKSPACE_SHORTCUTS.forEach((s) => registerItem("shortcut", s.label, s.path));
    visits.forEach((v) => registerItem("visit", v.name, `/fund/${v.code}`));
    recent.forEach((s) => registerItem("recent", s));
    popular.forEach((p) => registerItem("popular", p.query));
    TRENDING_FUNDS.forEach((f) => registerItem("fund", f.name, f.code));
    SUGGESTED_AMCS.forEach((a) => registerItem("amc", a));
    SUGGESTED_CATEGORIES.forEach((c) => registerItem("category", c));
    SUGGESTED_BENCHMARKS.forEach((b) => registerItem("benchmark", b));
  } else {
    results.forEach((r) => registerItem("result", r.name, r.code));
  }

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % Math.max(selectableItems.length, 1));
      scrollIntoView(activeIndex + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + selectableItems.length) % Math.max(selectableItems.length, 1));
      scrollIntoView(activeIndex - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const activeItem = selectableItems[activeIndex];
      if (activeItem) {
        triggerItem(activeItem);
      }
    }
  };

  const scrollIntoView = (index) => {
    const list = listRef.current;
    if (!list) return;
    const elements = list.querySelectorAll("[data-selectable]");
    const target = elements[index % Math.max(elements.length, 1)];
    if (target) {
      target.scrollIntoView({ block: "nearest" });
    }
  };

  const triggerItem = (item) => {
    if (item.type === "recent" || item.type === "popular" || item.type === "amc" || item.type === "category" || item.type === "benchmark") {
      runSearch(item.value);
    } else if (item.type === "fund" || item.type === "result") {
      track("search_click", { scheme_code: item.payload, name: item.value });
      saveHistory({ type: "fund", id: item.payload, name: item.value });
      window.location.href = `/fund/${item.payload}`;
      closePalette();
    } else if (item.type === "pinned" || item.type === "visit" || item.type === "shortcut") {
      window.location.href = item.payload;
      closePalette();
    }
  };

  return (
    <div className="w-full">
      {/* Trigger Button */}
      <button
        onClick={openPalette}
        className="flex w-full items-center justify-between rounded-2xl border border-line-strong bg-white/[0.02] py-3.5 pl-4 pr-5 text-left text-[14px] text-ink-muted hover:bg-white/[0.04] hover:border-white/20 transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
      >
        <div className="flex items-center gap-3">
          <svg className="h-5 w-5 shrink-0 text-ink-faint" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <span>Search workspaces or launch commands…</span>
        </div>
        <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-0.5 rounded border border-line bg-white/[0.08] px-1.5 font-mono text-[10px] font-semibold text-ink-faint">
          <span className="text-[11px]">⌘</span>K
        </kbd>
      </button>

      {/* dialog command palette */}
      <dialog
        ref={dialogRef}
        closedby="any"
        onClose={closePalette}
        className="cmd-dialog fixed inset-0 z-50 m-0 h-full w-full max-h-none max-w-none overflow-hidden bg-transparent p-0 outline-none flex items-start justify-center pt-[8vh]"
      >
        <div className="w-full max-w-2.5xl overflow-hidden rounded-2xl border border-white/[0.08] bg-[#090b11]/97 shadow-2xl backdrop-blur-3xl transition-spring flex flex-col max-h-[82vh] mx-4" style={{ maxWidth: "720px" }}>
          
          {/* Header Search Field */}
          <div className="flex items-center gap-3.5 border-b border-white/[0.06] px-5 py-4">
            <svg className="h-5 w-5 text-accent-soft shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                fetchResults(e.target.value);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search funds, shortcuts (/news), categories or pin pages..."
              className="w-full bg-transparent text-[15px] text-ink placeholder:text-ink-faint outline-none"
            />
            {loading && (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            )}
            <span className="text-[10px] uppercase font-bold text-ink-faint tracking-wider hidden sm:inline">
              Workspace Launcher
            </span>
            <button
              onClick={closePalette}
              className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wide text-ink-faint hover:text-ink transition-colors"
            >
              esc
            </button>
          </div>

          {/* Body items scroll container */}
          <div
            ref={listRef}
            className="flex-1 overflow-y-auto p-2 space-y-4 max-h-[52vh] scrollbar-thin"
          >
            {/* SUGGESTIONS MODE */}
            {showSuggestions && (
              <div className="space-y-4">
                
                {/* 1. Pinned Pages */}
                {pinned.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 text-[9.5px] font-bold uppercase tracking-[0.14em] text-accent-soft">
                      📌 Pinned Workspace Pages
                    </div>
                    <div className="grid grid-cols-1 gap-0.5 mt-1">
                      {pinned.map((p) => {
                        const globalIndex = selectableItems.findIndex((x) => x.type === "pinned" && x.payload === p.path);
                        return (
                          <div
                            key={`pin-${p.path}`}
                            data-selectable
                            onMouseMove={() => setActiveIndex(globalIndex)}
                            className={`flex items-center justify-between rounded-xl px-3 py-2 text-left text-[13px] transition-colors ${
                              activeIndex === globalIndex ? "bg-white/[0.06] text-ink" : "text-ink-muted"
                            }`}
                          >
                            <button
                              onClick={() => triggerItem({ type: "pinned", payload: p.path })}
                              className="flex items-center gap-2.5 truncate w-full text-left"
                            >
                              <span className="text-accent-soft font-bold">✦</span>
                              <span className="truncate">{p.label}</span>
                            </button>
                            <button
                              onClick={(e) => togglePin(e, p)}
                              className="text-[11px] text-ink-faint hover:text-neg px-2"
                              title="Unpin"
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. Workspace Shortcuts */}
                <div>
                  <div className="px-3 py-1.5 text-[9.5px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                    ⚡ Workspace Commands
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-1">
                    {WORKSPACE_SHORTCUTS.map((s) => {
                      const globalIndex = selectableItems.findIndex((x) => x.type === "shortcut" && x.payload === s.path);
                      const isPinned = pinned.some((x) => x.path === s.path);
                      return (
                        <div
                          key={s.key}
                          data-selectable
                          onMouseMove={() => setActiveIndex(globalIndex)}
                          className={`flex items-center justify-between rounded-xl px-3 py-1.5 text-[13px] transition-colors ${
                            activeIndex === globalIndex ? "bg-white/[0.06] text-ink" : "text-ink-muted"
                          }`}
                        >
                          <button
                            onClick={() => triggerItem({ type: "shortcut", payload: s.path })}
                            className="flex items-center gap-2.5 truncate text-left w-full"
                          >
                            <span className="text-ink-faint font-semibold">{s.key}</span>
                            <span className="truncate">{s.label}</span>
                          </button>
                          <button
                            onClick={(e) => togglePin(e, { label: s.label, path: s.path })}
                            className={`text-[12px] px-2 ${isPinned ? "text-accent-soft" : "text-ink-faint hover:text-ink"}`}
                            title={isPinned ? "Unpin Page" : "Pin Page"}
                          >
                            pin
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Recent Visits */}
                {visits.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 text-[9.5px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                      🕒 Recent Research Visits
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-1">
                      {visits.map((v) => {
                        const targetPath = `/fund/${v.code}`;
                        const globalIndex = selectableItems.findIndex((x) => x.type === "visit" && x.payload === targetPath);
                        const isPinned = pinned.some((x) => x.path === targetPath);
                        return (
                          <div
                            key={`visit-${v.code}`}
                            data-selectable
                            onMouseMove={() => setActiveIndex(globalIndex)}
                            className={`flex items-center justify-between rounded-xl px-3 py-1.5 text-[13px] transition-colors ${
                              activeIndex === globalIndex ? "bg-white/[0.06] text-ink" : "text-ink-muted"
                            }`}
                          >
                            <button
                              onClick={() => triggerItem({ type: "visit", payload: targetPath })}
                              className="flex items-center gap-2.5 truncate text-left w-full"
                            >
                              <span className="text-ink-faint">▸</span>
                              <span className="truncate">{v.name.replace(/ - (Direct|Regular).*/i, "")}</span>
                            </button>
                            <button
                              onClick={(e) => togglePin(e, { label: v.name.replace(/ - (Direct|Regular).*/i, ""), path: targetPath })}
                              className={`text-[12px] px-2 ${isPinned ? "text-accent-soft" : "text-ink-faint hover:text-ink"}`}
                            >
                              pin
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 4. Trending & Sugggestions */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  
                  {/* Trending Funds */}
                  <div>
                    <div className="px-3 py-1 text-[9.5px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                      Trending Funds
                    </div>
                    <div className="space-y-0.5 mt-1.5">
                      {TRENDING_FUNDS.map((f) => {
                        const globalIndex = selectableItems.findIndex((x) => x.type === "fund" && x.payload === f.code);
                        const targetPath = `/fund/${f.code}`;
                        const isPinned = pinned.some((x) => x.path === targetPath);
                        return (
                          <div
                            key={f.code}
                            data-selectable
                            onMouseMove={() => setActiveIndex(globalIndex)}
                            className={`flex items-center justify-between rounded-xl px-3 py-1.5 text-[13px] transition-colors ${
                              activeIndex === globalIndex ? "bg-white/[0.06] text-ink" : "text-ink-muted"
                            }`}
                          >
                            <button
                              onClick={() => triggerItem({ type: "fund", value: f.name, payload: f.code })}
                              className="flex items-center gap-2.5 truncate text-left w-full"
                            >
                              <span className="text-pos font-semibold text-[13px]">★</span>
                              <span className="truncate">{f.name}</span>
                            </button>
                            <button
                              onClick={(e) => togglePin(e, { label: f.name, path: targetPath })}
                              className={`text-[12px] px-2 ${isPinned ? "text-accent-soft" : "text-ink-faint hover:text-ink"}`}
                            >
                              pin
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Suggested AMCs */}
                  <div>
                    <div className="px-3 py-1 text-[9.5px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                      Suggested AMCs
                    </div>
                    <div className="space-y-0.5 mt-1.5">
                      {SUGGESTED_AMCS.map((amc) => {
                        const globalIndex = selectableItems.findIndex((x) => x.type === "amc" && x.value === amc);
                        const targetPath = `/amc/${encodeURIComponent(amc)}`;
                        const isPinned = pinned.some((x) => x.path === targetPath);
                        return (
                          <div
                            key={amc}
                            data-selectable
                            onMouseMove={() => setActiveIndex(globalIndex)}
                            className={`flex items-center justify-between rounded-xl px-3 py-1.5 text-[13px] transition-colors ${
                              activeIndex === globalIndex ? "bg-white/[0.06] text-ink" : "text-ink-muted"
                            }`}
                          >
                            <button
                              onClick={() => triggerItem({ type: "amc", value: amc })}
                              className="flex items-center gap-2.5 truncate text-left w-full"
                            >
                              <span className="text-accent-soft font-semibold">⬢</span>
                              <span className="truncate">{amc.replace(" Mutual Fund", "")}</span>
                            </button>
                            <button
                              onClick={(e) => togglePin(e, { label: amc.replace(" Mutual Fund", ""), path: targetPath })}
                              className={`text-[12px] px-2 ${isPinned ? "text-accent-soft" : "text-ink-faint hover:text-ink"}`}
                            >
                              pin
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>

                {/* Categories & Benchmarks */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  
                  {/* Suggested Categories */}
                  <div>
                    <div className="px-3 py-1 text-[9.5px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                      Quick Categories
                    </div>
                    <div className="flex flex-wrap gap-1.5 px-3 mt-2">
                      {SUGGESTED_CATEGORIES.map((c) => {
                        const globalIndex = selectableItems.findIndex((x) => x.type === "category" && x.value === c);
                        return (
                          <button
                            key={c}
                            data-selectable
                            onMouseMove={() => setActiveIndex(globalIndex)}
                            onClick={() => triggerItem({ type: "category", value: c })}
                            className={`rounded-lg border px-2.5 py-1 text-[11.5px] transition-colors ${
                              activeIndex === globalIndex ? "bg-accent border-accent text-white" : "border-line bg-white/[0.02] text-ink-muted hover:border-line-strong hover:text-ink"
                            }`}
                          >
                            {c}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Suggested Benchmarks */}
                  <div>
                    <div className="px-3 py-1 text-[9.5px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                      Suggested Benchmarks
                    </div>
                    <div className="space-y-0.5 mt-1.5">
                      {SUGGESTED_BENCHMARKS.map((b) => {
                        const globalIndex = selectableItems.findIndex((x) => x.type === "benchmark" && x.value === b);
                        const targetPath = `/benchmark/${b}`;
                        const isPinned = pinned.some((x) => x.path === targetPath);
                        return (
                          <div
                            key={b}
                            data-selectable
                            onMouseMove={() => setActiveIndex(globalIndex)}
                            className={`flex items-center justify-between rounded-xl px-3 py-1.5 text-[13px] transition-colors ${
                              activeIndex === globalIndex ? "bg-white/[0.06] text-ink" : "text-ink-muted"
                            }`}
                          >
                            <button
                              onClick={() => triggerItem({ type: "benchmark", value: b })}
                              className="flex items-center gap-2.5 truncate text-left w-full"
                            >
                              <span className="text-ink-faint font-semibold">⚡</span>
                              <span className="truncate">{b}</span>
                            </button>
                            <button
                              onClick={(e) => togglePin(e, { label: b, path: targetPath })}
                              className={`text-[12px] px-2 ${isPinned ? "text-accent-soft" : "text-ink-faint hover:text-ink"}`}
                            >
                              pin
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>

              </div>
            )}

            {/* RESULTS MODE */}
            {q.trim().length >= 2 && results.length > 0 && (
              <div>
                <div className="px-3 py-1.5 text-[9.5px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                  Search Results ({results.length})
                </div>
                <div className="space-y-1 mt-1">
                  {results.map((r, idx) => {
                    const globalIndex = idx;
                    const targetPath = `/fund/${r.code}`;
                    const isPinned = pinned.some((x) => x.path === targetPath);
                    return (
                      <div
                        key={r.code}
                        data-selectable
                        onMouseMove={() => setActiveIndex(globalIndex)}
                        className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors ${
                          activeIndex === globalIndex ? "bg-white/[0.06]" : "hover:bg-white/[0.02]"
                        }`}
                      >
                        <button
                          onClick={() => triggerItem({ type: "result", value: r.name, payload: r.code })}
                          className="flex flex-col gap-0.5 min-w-0 text-left w-full"
                        >
                          <span className={`text-[13.5px] truncate font-medium ${
                            activeIndex === globalIndex ? "text-accent-soft" : "text-ink"
                          }`}>
                            {r.name}
                          </span>
                          <span className="text-[11px] text-ink-muted truncate">
                            {r.amc} · {r.category}
                          </span>
                        </button>
                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          {r.matchType && r.matchType !== "Fund name" && (
                            <span className="rounded-full border border-line px-2 py-0.5 text-[10px] text-ink-faint">
                              {r.matchType}
                            </span>
                          )}
                          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-mono text-ink-faint font-semibold">
                            {r.code}
                          </span>
                          <button
                            onClick={(e) => togglePin(e, { label: r.name.replace(/ - (Direct|Regular).*/i, ""), path: targetPath })}
                            className={`text-[12px] px-2 ${isPinned ? "text-accent-soft" : "text-ink-faint hover:text-ink"}`}
                          >
                            pin
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* EMPTY RESULT STATE */}
            {q.trim().length >= 2 && !loading && results.length === 0 && (
              <div className="py-12 text-center">
                <div className="text-ink-faint text-[24px]">🔍</div>
                <div className="mt-2 text-[14px] font-semibold text-ink-muted">No matches found</div>
                <div className="mt-1 text-[12px] text-ink-faint max-w-xs mx-auto">
                  No funds, AMCs, or benchmarks match the query &ldquo;{q.trim()}&rdquo;. Try another term.
                </div>
              </div>
            )}
          </div>

          {/* Footer Shortcuts Guide */}
          <div className="flex items-center justify-between border-t border-white/[0.06] bg-white/[0.015] px-4.5 py-3 text-[11px] text-ink-faint">
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1"><kbd className="rounded bg-white/[0.08] px-1 py-0.5 text-[9px] font-semibold text-ink-muted">↑↓</kbd> Navigate</span>
              <span className="inline-flex items-center gap-1"><kbd className="rounded bg-white/[0.08] px-1 py-0.5 text-[9px] font-semibold text-ink-muted">Enter</kbd> Select</span>
              <span className="inline-flex items-center gap-1"><kbd className="rounded bg-white/[0.08] px-1 py-0.5 text-[9px] font-semibold text-ink-muted">Esc</kbd> Close</span>
            </div>
            <div className="text-[10px] uppercase font-bold tracking-wider text-accent-soft/80">
              MF Pulse Workspace
            </div>
          </div>

        </div>
      </dialog>
    </div>
  );
}
