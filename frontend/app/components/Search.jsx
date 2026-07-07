"use client";
import { useEffect, useRef, useState } from "react";
import { track } from "../lib/track";
import { recordSearch, getRecentSearches } from "../lib/sessionMemory";
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

export default function Search() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState([]);
  const [popular, setPopular] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const timer = useRef(null);
  const reqId = useRef(0);
  const inputRef = useRef(null);
  const dialogRef = useRef(null);
  const listRef = useRef(null);

  // Sync recent and popular searches once on mount
  useEffect(() => {
    setRecent(getRecentSearches(6));
    fetch(`${SUPA.URL}/rest/v1/v_top_searches?select=query,searches&limit=5`, {
      headers: { apikey: SUPA.KEY, Authorization: `Bearer ${SUPA.KEY}` }
    })
      .then((r) => r.json())
      .then((d) => setPopular(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [open]);

  // Open and close dialog helpers
  const openPalette = () => {
    setOpen(true);
    dialogRef.current?.showModal();
    // Wait for animation frame to focus input
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
      
      // Toggle dialog with Cmd+K or Ctrl+K
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (open) closePalette();
        else openPalette();
      }
      
      // Focus/open search with "/" (if not currently focused inside an input)
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
          recordSearch(clean);
          setRecent(getRecentSearches(6));
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
  
  // Build flattened list of selectable targets
  const registerItem = (type, value, payload) => {
    selectableItems.push({ type, value, payload });
  };

  const showSuggestions = q.trim().length < 2;

  // Populate suggestion items
  if (showSuggestions) {
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
      window.location.href = `/fund/${item.payload}`;
      closePalette();
    }
  };

  return (
    <div className="w-full">
      {/* Visual search trigger button */}
      <button
        onClick={openPalette}
        className="flex w-full items-center justify-between rounded-2xl border border-line-strong bg-white/[0.02] py-3.5 pl-4 pr-5 text-left text-[14px] text-ink-muted placeholder:text-ink-faint hover:bg-white/[0.04] hover:border-white/20 transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
      >
        <div className="flex items-center gap-3">
          <svg className="h-4.5 w-4.5 text-ink-faint" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <span>Search by fund, AMC, category, ISIN or code…</span>
        </div>
        <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-0.5 rounded border border-line bg-white/[0.08] px-1.5 font-mono text-[10px] font-semibold text-ink-faint">
          <span className="text-[11px]">⌘</span>K
        </kbd>
      </button>

      {/* Global Command Palette dialog overlay */}
      <dialog
        ref={dialogRef}
        closedby="any"
        onClose={closePalette}
        className="cmd-dialog fixed inset-0 z-50 m-0 h-full w-full max-h-none max-w-none overflow-hidden bg-transparent p-0 outline-none flex items-start justify-center pt-[10vh]"
      >
        <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0b0e17]/95 shadow-2xl backdrop-blur-2xl transition-spring flex flex-col max-h-[80vh] mx-4">
          
          {/* Header search bar */}
          <div className="flex items-center gap-3 border-b border-white/[0.06] px-4.5 py-4">
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
              placeholder="Search anything, or select suggested categories below..."
              className="w-full bg-transparent text-[15px] text-ink placeholder:text-ink-faint outline-none"
            />
            {loading && (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            )}
            <button
              onClick={closePalette}
              className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wide text-ink-faint hover:text-ink transition-colors"
            >
              esc
            </button>
          </div>

          {/* Results/Suggestions list container */}
          <div
            ref={listRef}
            className="flex-1 overflow-y-auto p-2 space-y-4 max-h-[50vh] scrollbar-thin"
          >
            {/* SUGGESTIONS MODE */}
            {showSuggestions && (
              <div className="space-y-4">
                
                {/* Recent Searches */}
                {recent.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">
                      Recent Searches
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-1">
                      {recent.map((s) => {
                        const globalIndex = selectableItems.findIndex((x) => x.type === "recent" && x.value === s);
                        return (
                          <button
                            key={`r-${s}`}
                            data-selectable
                            onMouseMove={() => setActiveIndex(globalIndex)}
                            onClick={() => triggerItem({ type: "recent", value: s })}
                            className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] transition-colors ${
                              activeIndex === globalIndex ? "bg-white/[0.06] text-ink" : "text-ink-muted hover:bg-white/[0.02]"
                            }`}
                          >
                            <span className="text-ink-faint">↺</span>
                            <span className="truncate">{s}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Popular Queries */}
                {popular.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">
                      Popular Right Now
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-1">
                      {popular.map((p) => {
                        const globalIndex = selectableItems.findIndex((x) => x.type === "popular" && x.value === p.query);
                        return (
                          <button
                            key={`p-${p.query}`}
                            data-selectable
                            onMouseMove={() => setActiveIndex(globalIndex)}
                            onClick={() => triggerItem({ type: "popular", value: p.query })}
                            className={`flex items-center justify-between gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] transition-colors ${
                              activeIndex === globalIndex ? "bg-white/[0.06] text-ink" : "text-ink-muted hover:bg-white/[0.02]"
                            }`}
                          >
                            <span className="truncate flex items-center gap-2.5">
                              <span className="text-accent-soft">↗</span> {p.query}
                            </span>
                            <span className="text-[10px] text-ink-faint font-semibold">{p.searches}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Trending & Quick Links */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  
                  {/* Trending Funds */}
                  <div>
                    <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">
                      Trending Funds
                    </div>
                    <div className="space-y-0.5 mt-1.5">
                      {TRENDING_FUNDS.map((f) => {
                        const globalIndex = selectableItems.findIndex((x) => x.type === "fund" && x.payload === f.code);
                        return (
                          <button
                            key={f.code}
                            data-selectable
                            onMouseMove={() => setActiveIndex(globalIndex)}
                            onClick={() => triggerItem({ type: "fund", value: f.name, payload: f.code })}
                            className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] transition-colors ${
                              activeIndex === globalIndex ? "bg-white/[0.06] text-ink" : "text-ink-muted hover:bg-white/[0.02]"
                            }`}
                          >
                            <span className="text-pos font-semibold text-[14px]">★</span>
                            <span className="truncate">{f.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Suggested AMCs */}
                  <div>
                    <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">
                      Suggested AMCs
                    </div>
                    <div className="space-y-0.5 mt-1.5">
                      {SUGGESTED_AMCS.map((amc) => {
                        const globalIndex = selectableItems.findIndex((x) => x.type === "amc" && x.value === amc);
                        return (
                          <button
                            key={amc}
                            data-selectable
                            onMouseMove={() => setActiveIndex(globalIndex)}
                            onClick={() => triggerItem({ type: "amc", value: amc })}
                            className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] transition-colors ${
                              activeIndex === globalIndex ? "bg-white/[0.06] text-ink" : "text-ink-muted hover:bg-white/[0.02]"
                            }`}
                          >
                            <span className="text-accent-soft font-semibold text-[14px]">⬢</span>
                            <span className="truncate">{amc.replace(" Mutual Fund", "")}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                </div>

                {/* Categories & Benchmarks */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  
                  {/* Suggested Categories */}
                  <div>
                    <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">
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
                    <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">
                      Suggested Benchmarks
                    </div>
                    <div className="space-y-0.5 mt-1.5">
                      {SUGGESTED_BENCHMARKS.map((b) => {
                        const globalIndex = selectableItems.findIndex((x) => x.type === "benchmark" && x.value === b);
                        return (
                          <button
                            key={b}
                            data-selectable
                            onMouseMove={() => setActiveIndex(globalIndex)}
                            onClick={() => triggerItem({ type: "benchmark", value: b })}
                            className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] transition-colors ${
                              activeIndex === globalIndex ? "bg-white/[0.06] text-ink" : "text-ink-muted hover:bg-white/[0.02]"
                            }`}
                          >
                            <span className="text-ink-faint font-semibold text-[14px]">⚡</span>
                            <span className="truncate">{b}</span>
                          </button>
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
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">
                  Search Results ({results.length})
                </div>
                <div className="space-y-1 mt-1">
                  {results.map((r, idx) => {
                    const globalIndex = idx;
                    return (
                      <button
                        key={r.code}
                        data-selectable
                        onMouseMove={() => setActiveIndex(globalIndex)}
                        onClick={() => triggerItem({ type: "result", value: r.name, payload: r.code })}
                        className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                          activeIndex === globalIndex ? "bg-white/[0.06]" : "hover:bg-white/[0.02]"
                        }`}
                      >
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className={`text-[13.5px] truncate font-medium ${
                            activeIndex === globalIndex ? "text-accent-soft" : "text-ink"
                          }`}>
                            {r.name}
                          </span>
                          <span className="text-[11px] text-ink-muted truncate">
                            {r.amc} · {r.category}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {r.matchType && r.matchType !== "Fund name" && (
                            <span className="rounded-full border border-line px-2 py-0.5 text-[10px] text-ink-faint">
                              {r.matchType}
                            </span>
                          )}
                          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-mono text-ink-faint font-semibold">
                            {r.code}
                          </span>
                        </div>
                      </button>
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

          {/* Dialog Footer shortcuts guide */}
          <div className="flex items-center justify-between border-t border-white/[0.06] bg-white/[0.015] px-4.5 py-3 text-[11px] text-ink-faint">
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1"><kbd className="rounded bg-white/[0.08] px-1 py-0.5 text-[9px] font-semibold text-ink-muted">↑↓</kbd> Navigate</span>
              <span className="inline-flex items-center gap-1"><kbd className="rounded bg-white/[0.08] px-1 py-0.5 text-[9px] font-semibold text-ink-muted">Enter</kbd> Select</span>
              <span className="inline-flex items-center gap-1"><kbd className="rounded bg-white/[0.08] px-1 py-0.5 text-[9px] font-semibold text-ink-muted">Esc</kbd> Close</span>
            </div>
            <div className="text-[10px] uppercase font-bold tracking-wider text-accent-soft/80">
              MF Pulse Intelligence
            </div>
          </div>

        </div>
      </dialog>
    </div>
  );
}
