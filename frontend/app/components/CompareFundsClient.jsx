"use client";
import { useState, useEffect } from "react";
import { track } from "../lib/track";
import { saveWatchlist } from "../lib/cloudSync";

export default function CompareFundsClient({ initialFunds, allFundsList }) {
  const [selectedCodes, setSelectedCodes] = useState(initialFunds.map((f) => f.code));
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);

  // Compute active fund details based on selected codes
  const activeFunds = selectedCodes.map((code) => {
    return allFundsList.find((f) => f.code === code);
  }).filter(Boolean);

  // Update URL to match selection
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (selectedCodes.length > 0) {
      sp.set("funds", selectedCodes.join(","));
    } else {
      sp.delete("funds");
    }
    const newUrl = `${window.location.pathname}?${sp.toString()}`;
    window.history.replaceState({}, "", newUrl);
  }, [selectedCodes]);

  // Handle client-side search autocomplete
  useEffect(() => {
    const clean = searchQuery.trim().toLowerCase();
    if (clean.length < 2) {
      setSearchResults([]);
      return;
    }
    const matches = allFundsList
      .filter((f) => {
        return (
          f.name.toLowerCase().includes(clean) ||
          f.amc.toLowerCase().includes(clean) ||
          f.code.includes(clean)
        );
      })
      .slice(0, 5);
    setSearchResults(matches);
  }, [searchQuery, allFundsList]);

  const addFund = (code) => {
    if (selectedCodes.includes(code)) return;
    if (selectedCodes.length >= 4) {
      alert("You can compare up to 4 funds side-by-side.");
      return;
    }
    setSelectedCodes([...selectedCodes, code]);
    setSearchQuery("");
    setSearchResults([]);
    track("fund_comparison_added", { code });
  };

  const removeFund = (code) => {
    setSelectedCodes(selectedCodes.filter((c) => c !== code));
    track("fund_comparison_removed", { code });
  };

  // Was writing a second, bare "watchlist" key (plain scheme-code strings) disconnected from
  // the real mfp_watchlist WatchButton/Watchlist/WatchlistIntelligence all use — funds added
  // here never actually showed up as watchlisted anywhere else in the app. Fixed to go through
  // the same adapter (and therefore the same key/shape, cloud-synced when signed in) everything
  // else does.
  const addBatchToWatchlist = () => {
    activeFunds.forEach((f) => saveWatchlist({ code: f.code, name: f.name, amc: f.amc }));
    alert("Added selected funds to Watchlist successfully!");
    track("comparison_batch_watchlisted", { count: selectedCodes.length });
  };

  const rows = [
    {
      label: "Pulse Health Score",
      render: (f) => (
        <div className="flex flex-col items-center">
          <span className={`text-[16px] font-bold ${
            f._h >= 70 ? "text-pos" : f._h >= 55 ? "text-warn" : "text-neg"
          }`}>
            {f._h}/100
          </span>
          <span className="text-[10px] text-ink-faint uppercase font-bold">Grade {f._g}</span>
        </div>
      )
    },
    {
      label: "1-Month Return",
      render: (f) => {
        const v = f.r1m;
        return v == null ? <span className="text-ink-faint">—</span> : <span className={`font-mono font-bold ${v >= 0 ? "text-pos" : "text-neg"}`}>{v >= 0 ? "+" : ""}{v.toFixed(2)}%</span>;
      }
    },
    {
      label: "3-Month Return",
      render: (f) => {
        const v = f.r3m;
        return v == null ? <span className="text-ink-faint">—</span> : <span className={`font-mono font-bold ${v >= 0 ? "text-pos" : "text-neg"}`}>{v >= 0 ? "+" : ""}{v.toFixed(2)}%</span>;
      }
    },
    {
      label: "1-Year Return",
      render: (f) => {
        const v = f.r1y;
        return v == null ? <span className="text-ink-faint">—</span> : <span className={`font-mono font-bold ${v >= 0 ? "text-pos" : "text-neg"}`}>{v >= 0 ? "+" : ""}{v.toFixed(2)}%</span>;
      }
    },
    {
      label: "90d Volatility",
      render: (f) => f.vol90 == null ? <span className="text-ink-faint">—</span> : <span className="font-mono text-ink-muted">{f.vol90}</span>
    },
    {
      label: "90d Max Drawdown",
      render: (f) => f.maxdd90 == null ? <span className="text-ink-faint">—</span> : <span className="font-mono text-neg">{f.maxdd90}</span>
    },
    {
      label: "Consistency Score",
      render: (f) => f.consistency == null ? <span className="text-ink-faint">—</span> : <span className="font-mono text-white font-bold">{f.consistency}%</span>
    },
    {
      label: "SEBI Category",
      render: (f) => <span className="text-ink-muted">{f.category}</span>
    },
    {
      label: "Fund House",
      render: (f) => <span className="text-ink-muted">{f.amc}</span>
    },
    {
      label: "Plan Option",
      render: (f) => <span className="text-[11.5px] text-ink-faint font-semibold uppercase">{f.plan} · {f.isDirect ? "Direct" : "Regular"}</span>
    }
  ];

  return (
    <div className="space-y-6">
      
      {/* Top action row */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-4.5">
        <div className="relative w-full max-w-sm">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Type fund name to add to comparison…"
            className="w-full rounded-xl border border-line bg-white/[0.03] px-3.5 py-2 text-[13px] text-white outline-none focus:border-accent"
          />
          {searchResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl border border-line bg-[#090b11] p-1.5 shadow-2xl space-y-0.5">
              {searchResults.map((r) => (
                <button
                  key={r.code}
                  onClick={() => addFund(r.code)}
                  className="w-full text-left rounded-lg px-3 py-2 text-[12.5px] text-ink-muted hover:bg-white/[0.06] hover:text-white transition-all block truncate"
                >
                  {r.name.replace(/ - (Direct|Regular).*/i, "")} <span className="text-ink-faint">({r.plan})</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {activeFunds.length > 0 && (
          <div className="flex gap-2">
            <a
              href={`/research?import_funds=${selectedCodes.join(",")}`}
              className="rounded-xl border border-accent/40 bg-accent/10 hover:bg-accent/20 px-4 py-2 text-[12.5px] font-bold text-white transition-all flex items-center"
            >
              Model as Portfolio Strategy →
            </a>
            <button
              onClick={addBatchToWatchlist}
              className="rounded-xl border border-line bg-white/[0.015] hover:bg-white/[0.04] px-4 py-2 text-[12.5px] font-bold text-ink-muted hover:text-white transition-all"
            >
              Add all to Watchlist
            </button>
            <button
              onClick={() => setSelectedCodes([])}
              className="rounded-xl border border-line bg-white/[0.015] hover:bg-white/[0.04] px-4 py-2 text-[12.5px] font-bold text-ink-faint hover:text-neg transition-all"
            >
              Clear Selection
            </button>
          </div>
        )}
      </div>

      {activeFunds.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/[0.08] p-12 text-center max-w-md mx-auto">
          <div className="text-[28px]">⇄</div>
          <h3 className="text-[14px] font-bold text-white mt-2">No funds selected</h3>
          <p className="text-[12px] text-ink-faint mt-1 leading-relaxed">
            Use the search box above to add up to 4 mutual funds for side-by-side analytical comparison.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white/[0.01]">
          <table className="w-full border-collapse text-[12.5px] text-left">
            <thead>
              <tr className="border-b border-line bg-white/[0.01]">
                <th className="px-4 py-3.5 font-bold uppercase tracking-wider text-[10px] text-ink-faint w-[20%]">
                  Comparison Metric
                </th>
                {activeFunds.map((f) => (
                  <th key={f.code} className="px-4 py-3.5 w-[20%] text-center border-l border-white/[0.04]">
                    <div className="flex flex-col items-center">
                      <a
                        href={`/fund/${f.code}`}
                        className="font-bold text-white hover:text-accent-soft text-[13px] leading-tight block text-center max-w-[150px] truncate"
                        title={f.name}
                      >
                        {f.name.replace(/ - (Direct|Regular).*/i, "")}
                      </a>
                      <span className="text-[10px] text-ink-faint mt-1 font-mono">{f.code}</span>
                      <button
                        onClick={() => removeFund(f.code)}
                        className="text-[11px] text-ink-faint hover:text-neg mt-2 block transition-all"
                      >
                        [ Remove ]
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.005]">
                  <td className="px-4 py-3 font-semibold text-ink-muted">{row.label}</td>
                  {activeFunds.map((f) => (
                    <td key={f.code} className="px-4 py-3 text-center border-l border-white/[0.04] align-middle">
                      {row.render(f)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}
