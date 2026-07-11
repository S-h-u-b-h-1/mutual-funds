"use client";
import { useState, useEffect, useMemo } from "react";
import { track } from "../lib/track";
import { getAllNotes } from "../lib/cloudSync";

export default function ResearchWorkspaceClient({ allFundsList }) {
  const [strategies, setStrategies] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);

  const [fundNotes, setFundNotes] = useState({});

  // Load strategies from localStorage, handle URL imports, and load fund notes
  useEffect(() => {
    let list = [];
    try {
      const stored = localStorage.getItem("mfp_strategies");
      if (stored) {
        list = JSON.parse(stored);
      }
    } catch {}

    // Check query params for import_funds
    const urlParams = new URLSearchParams(window.location.search);
    const importFundsStr = urlParams.get("import_funds");
    let activeId = list.length > 0 ? list[0].id : null;

    if (importFundsStr) {
      const codes = importFundsStr.split(",").filter((code) => {
        return allFundsList.some((f) => f.code === code);
      });

      if (codes.length > 0) {
        const defaultPct = Math.floor(100 / codes.length);
        const allocations = codes.map((code, idx) => {
          const pct = idx === codes.length - 1 ? 100 - defaultPct * (codes.length - 1) : defaultPct;
          return { code, pct };
        });

        const importedStrat = {
          id: "strat_" + Date.now(),
          name: `Imported Strategy (${new Date().toLocaleDateString("en-IN")})`,
          thesis: "Automatically compiled from active fund selection.",
          allocations,
          updatedAt: new Date().toISOString()
        };

        list = [importedStrat, ...list];
        activeId = importedStrat.id;
        try {
          localStorage.setItem("mfp_strategies", JSON.stringify(list));
        } catch {}

        // Remove query parameters from address bar to avoid duplicate imports on reload
        const newUrl = window.location.pathname;
        window.history.replaceState({}, "", newUrl);
        track("strategy_imported", { id: importedStrat.id, count: codes.length });
      }
    }

    setStrategies(list);
    if (activeId) {
      setSelectedId(activeId);
    }
  }, [allFundsList]);

  // Separate effect (was a synchronous localStorage read inline above) — cloudSync's getAllNotes()
  // is async whether it resolves from the cloud or from the same mfp_research_notes fallback, so
  // it can't stay inline in the sync effect above without making the whole thing async too.
  useEffect(() => {
    let live = true;
    function loadNotes() {
      getAllNotes(500).then((notes) => {
        if (!live) return;
        const latestNotes = {};
        for (const n of notes) {
          if (!latestNotes[n.code] || new Date(n.at) > new Date(latestNotes[n.code].at)) {
            latestNotes[n.code] = { text: n.text, at: n.at };
          }
        }
        const flat = {};
        for (const [code, v] of Object.entries(latestNotes)) flat[code] = v.text;
        setFundNotes(flat);
      });
    }
    loadNotes();
    window.addEventListener("mfp-sync", loadNotes);
    return () => { live = false; window.removeEventListener("mfp-sync", loadNotes); };
  }, []);

  const persistStrategies = (list) => {
    setStrategies(list);
    try {
      localStorage.setItem("mfp_strategies", JSON.stringify(list));
    } catch {}
  };

  const createNewStrategy = () => {
    const newStrat = {
      id: "strat_" + Date.now(),
      name: `New Portfolio Strategy ${strategies.length + 1}`,
      thesis: "",
      allocations: [], // Array of { code: string, pct: number }
      updatedAt: new Date().toISOString()
    };
    const list = [newStrat, ...strategies];
    persistStrategies(list);
    setSelectedId(newStrat.id);
    track("strategy_created", { id: newStrat.id });
  };

  const deleteStrategy = (e, id) => {
    e.stopPropagation();
    const list = strategies.filter((s) => s.id !== id);
    persistStrategies(list);
    if (selectedId === id) {
      setSelectedId(list.length > 0 ? list[0].id : null);
    }
    track("strategy_deleted", { id });
  };

  const activeStrategy = useMemo(() => {
    return strategies.find((s) => s.id === selectedId) || null;
  }, [strategies, selectedId]);

  const updateActiveStrategyField = (field, value) => {
    if (!activeStrategy) return;
    const list = strategies.map((s) => {
      if (s.id === selectedId) {
        return {
          ...s,
          [field]: value,
          updatedAt: new Date().toISOString()
        };
      }
      return s;
    });
    persistStrategies(list);
  };

  // Autocomplete search
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

  const addFundToStrategy = (code) => {
    if (!activeStrategy) return;
    const alreadyExists = activeStrategy.allocations.some((a) => a.code === code);
    if (alreadyExists) return;

    // Default allocation splits remaining space
    const count = activeStrategy.allocations.length;
    const defaultPct = count === 0 ? 100 : 0;

    const nextAllocations = [...activeStrategy.allocations, { code, pct: defaultPct }];
    updateActiveStrategyField("allocations", nextAllocations);
    setSearchQuery("");
    setSearchResults([]);
    track("strategy_fund_added", { strategyId: selectedId, code });
  };

  const removeFundFromStrategy = (code) => {
    if (!activeStrategy) return;
    const nextAllocations = activeStrategy.allocations.filter((a) => a.code !== code);
    updateActiveStrategyField("allocations", nextAllocations);
    track("strategy_fund_removed", { strategyId: selectedId, code });
  };

  const updateAllocationPct = (code, pctValue) => {
    if (!activeStrategy) return;
    const nextAllocations = activeStrategy.allocations.map((a) => {
      if (a.code === code) {
        return { ...a, pct: Number(pctValue) };
      }
      return a;
    });
    updateActiveStrategyField("allocations", nextAllocations);
  };

  // Compile detailed fund objects for the active strategy
  const compiledFunds = useMemo(() => {
    if (!activeStrategy) return [];
    return activeStrategy.allocations.map((alloc) => {
      const fund = allFundsList.find((f) => f.code === alloc.code);
      if (!fund) return null;
      return {
        ...fund,
        pct: alloc.pct
      };
    }).filter(Boolean);
  }, [activeStrategy, allFundsList]);

  const totalAllocationPct = useMemo(() => {
    return compiledFunds.reduce((sum, f) => sum + f.pct, 0);
  }, [compiledFunds]);

  // Aggregate weighted calculations
  const aggregates = useMemo(() => {
    if (compiledFunds.length === 0 || totalAllocationPct === 0) return null;
    let weightedHealth = 0;
    let weightedR1m = 0;
    let weightedR1y = 0;
    let weightedVol = 0;
    let weightedMaxdd = 0;

    compiledFunds.forEach((f) => {
      const weightMultiplier = f.pct / totalAllocationPct;
      weightedHealth += (f._h || 0) * weightMultiplier;
      weightedR1m += (f.r1m || 0) * weightMultiplier;
      weightedR1y += (f.r1y || 0) * weightMultiplier;
      weightedVol += (f.vol90 || 0) * weightMultiplier;
      weightedMaxdd += (f.maxdd90 || 0) * weightMultiplier;
    });

    return {
      health: Math.round(weightedHealth),
      r1m: weightedR1m,
      r1y: weightedR1y,
      vol: weightedVol,
      maxdd: weightedMaxdd
    };
  }, [compiledFunds, totalAllocationPct]);

  const copyStrategyMarkdown = () => {
    if (!activeStrategy || compiledFunds.length === 0) return;
    const textLines = [
      `# Strategy Brief: ${activeStrategy.name}`,
      `*Updated at: ${new Date(activeStrategy.updatedAt).toLocaleDateString("en-IN")}*`,
      "",
      `## Rationale / Thesis`,
      activeStrategy.thesis || "No thesis written yet.",
      "",
      `## Allocated Holdings (Total: ${totalAllocationPct}%)`,
      "| Fund Code | Fund Name | Allocation | Health Score | 1Y Return | Volatility | Max Drawdown |",
      "| :--- | :--- | :---: | :---: | :---: | :---: | :---: |"
    ];

    compiledFunds.forEach((f) => {
      textLines.push(
        `| ${f.code} | ${f.name.replace(/ - (Direct|Regular).*/i, "")} | ${f.pct}% | ${f._h}/100 | ${f.r1y?.toFixed(2)}% | ${f.vol90 || "—"} | ${f.maxdd90 || "—"} |`
      );
    });

    if (aggregates) {
      textLines.push("");
      textLines.push("## Combined Weighted Analytics");
      textLines.push(`- **Weighted Health Score**: ${aggregates.health}/100`);
      textLines.push(`- **Weighted 1-Month Return**: ${aggregates.r1m.toFixed(2)}%`);
      textLines.push(`- **Weighted 1-Year Return**: ${aggregates.r1y.toFixed(2)}%`);
      textLines.push(`- **Weighted 90d Volatility**: ${aggregates.vol.toFixed(2)}%`);
      textLines.push(`- **Weighted Peak Drawdown**: ${aggregates.maxdd.toFixed(2)}%`);
    }

    navigator.clipboard.writeText(textLines.join("\n"));
    alert("Strategy markdown brief copied to clipboard!");
    track("strategy_copied", { id: selectedId });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      
      {/* LEFT COLUMN: Strategies list */}
      <div className="lg:col-span-3 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase font-bold tracking-widest text-ink-faint">
            My Strategies ({strategies.length})
          </span>
          <button
            onClick={createNewStrategy}
            className="rounded-lg bg-accent px-3 py-1.5 text-[11.5px] font-bold text-white hover:bg-accent-soft transition-colors"
          >
            New Strategy
          </button>
        </div>

        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {strategies.map((s) => (
            <div
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              className={`w-full text-left rounded-xl border p-4 transition-all cursor-pointer flex justify-between items-start group ${
                selectedId === s.id ? "border-accent bg-accent/5" : "border-line bg-surface hover:bg-surface-2"
              }`}
            >
              <div className="min-w-0 flex-1 pr-2">
                <h4 className="text-[13px] font-bold text-ink truncate leading-snug">
                  {s.name}
                </h4>
                <div className="text-[11px] text-ink-faint mt-1">
                  {s.allocations.length} funds · {new Date(s.updatedAt).toLocaleDateString("en-IN")}
                </div>
              </div>
              <button
                onClick={(e) => deleteStrategy(e, s.id)}
                className="text-[12px] text-ink-faint hover:text-neg transition-colors p-1"
                title="Delete Strategy"
              >
                ✕
              </button>
            </div>
          ))}
          {strategies.length === 0 && (
            <p className="text-[12.5px] text-ink-faint py-6 text-center">
              No saved strategies yet. Click 'New Strategy' to get started.
            </p>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: Active Workspace */}
      <div className="lg:col-span-9">
        {activeStrategy ? (
          <div className="rounded-2xl border border-line bg-surface p-6 space-y-6">
            
            {/* Strategy Name & Thesis */}
            <div className="space-y-3">
              <input
                type="text"
                value={activeStrategy.name}
                onChange={(e) => updateActiveStrategyField("name", e.target.value)}
                placeholder="Title your strategy..."
                className="w-full bg-transparent text-[22px] font-black text-ink outline-none border-b border-dashed border-line pb-1 focus:border-accent"
              />
              
              <div>
                <label className="text-[10px] uppercase font-bold tracking-widest text-ink-faint block mb-1">
                  Investment Thesis / Rationale
                </label>
                <textarea
                  value={activeStrategy.thesis}
                  onChange={(e) => updateActiveStrategyField("thesis", e.target.value)}
                  placeholder="Document your strategy objectives, asset allocations rule, and target horizon..."
                  rows={3}
                  className="w-full rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-[12.5px] text-ink outline-none placeholder:text-ink-faint focus:border-line-strong leading-relaxed"
                />
              </div>
            </div>

            {/* Fund Selector Autocomplete */}
            <div className="space-y-2.5">
              <label className="text-[10px] uppercase font-bold tracking-widest text-ink-faint block">
                Add holdings to strategy
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Type fund name or code to add..."
                  className="w-full rounded-xl border border-line bg-surface-2 px-3.5 py-2 text-[12.5px] text-ink outline-none focus:border-accent"
                />
                {searchResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl border border-line bg-surface p-1.5 shadow-2xl space-y-0.5">
                    {searchResults.map((r) => (
                      <button
                        key={r.code}
                        onClick={() => addFundToStrategy(r.code)}
                        className="w-full text-left rounded-lg px-3 py-2 text-[12.5px] text-ink-muted hover:bg-surface-strong hover:text-ink transition-all block truncate"
                      >
                        {r.name.replace(/ - (Direct|Regular).*/i, "")} <span className="text-ink-faint">({r.plan})</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Fund Allocations Table */}
            {compiledFunds.length > 0 ? (
              <div className="space-y-5">
                <div className="overflow-x-auto rounded-xl border border-line bg-surface">
                  <table className="w-full border-collapse text-[12.5px] text-left">
                    <thead>
                      <tr className="border-b border-line bg-surface text-[10px] uppercase font-bold tracking-wider text-ink-faint">
                        <th className="px-4 py-3 w-[40%]">Holdings Name</th>
                        <th className="px-4 py-3 text-center w-[15%]">Allocation</th>
                        <th className="px-4 py-3 text-right">Pulse Health</th>
                        <th className="px-4 py-3 text-right">1Y Return</th>
                        <th className="px-4 py-3 text-right">Volatility</th>
                        <th className="px-4 py-3 text-right">Max Drawdown</th>
                        <th className="px-4 py-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compiledFunds.map((f) => (
                        <tr key={f.code} className="border-b border-line last:border-0 hover:bg-surface">
                          <td className="px-4 py-3">
                            <a href={`/fund/${f.code}`} className="font-bold text-ink hover:text-accent-soft block truncate max-w-[240px]">
                              {f.name.replace(/ - (Direct|Regular).*/i, "")}
                            </a>
                            <span className="text-[10px] text-ink-faint mt-0.5 block">{f.category} · {f.plan}</span>
                            {fundNotes[f.code] && (
                              <p className="text-[11px] italic text-ink-muted mt-1.5 leading-relaxed border-l-2 border-accent/30 pl-2 max-w-[240px] whitespace-normal break-words" title={fundNotes[f.code]}>
                                Note: "{fundNotes[f.code]}"
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 align-middle text-center">
                            <div className="flex items-center justify-center gap-1">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={f.pct}
                                onChange={(e) => updateAllocationPct(f.code, e.target.value)}
                                className="w-14 rounded border border-line bg-surface-2 text-center py-1 text-[12.5px] font-mono text-ink outline-none focus:border-accent"
                              />
                              <span className="text-ink font-mono">%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right align-middle font-mono font-bold">
                            <span className={f._h >= 70 ? "text-pos" : f._h >= 55 ? "text-warn" : "text-neg"}>
                              {f._h}/100
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right align-middle font-mono">
                            {f.r1y == null ? "—" : `${f.r1y >= 0 ? "+" : ""}${f.r1y.toFixed(1)}%`}
                          </td>
                          <td className="px-4 py-3 text-right align-middle font-mono text-ink-muted">
                            {f.vol90 || "—"}
                          </td>
                          <td className="px-4 py-3 text-right align-middle font-mono text-neg">
                            {f.maxdd90 || "—"}
                          </td>
                          <td className="px-4 py-3 text-center align-middle">
                            <button
                              onClick={() => removeFundFromStrategy(f.code)}
                              className="text-[11px] text-ink-faint hover:text-neg transition-all"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Allocation validation & summary block */}
                <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-4">
                  <div className="text-[12.5px]">
                    <span className="text-ink-faint">Allocation Total: </span>
                    <strong className={`font-mono ${totalAllocationPct === 100 ? "text-pos" : "text-warn"}`}>
                      {totalAllocationPct}%
                    </strong>
                    {totalAllocationPct !== 100 && (
                      <span className="text-[11px] text-warn block mt-0.5">
                        ⚠️ Must equal exactly 100% to reflect balanced weighting.
                      </span>
                    )}
                  </div>

                  <button
                    onClick={copyStrategyMarkdown}
                    className="rounded-xl border border-accent/40 bg-accent/15 hover:bg-accent/25 px-4 py-2 text-[12.5px] font-bold text-ink transition-all"
                  >
                    Copy Strategy Brief 📄
                  </button>
                </div>

                {/* Live Weighted Analytics block */}
                {aggregates && (
                  <div className="rounded-xl border border-line bg-surface-2 p-5 space-y-4">
                    <span className="text-[9.5px] uppercase font-bold tracking-wider text-ink-faint block">
                      Combined Weighted Analytics
                    </span>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-ink-faint block uppercase">Health Score</span>
                        <strong className={`text-[16px] font-mono block ${
                          aggregates.health >= 70 ? "text-pos" : aggregates.health >= 55 ? "text-warn" : "text-neg"
                        }`}>
                          {aggregates.health}/100
                        </strong>
                      </div>

                      <div className="space-y-0.5">
                        <span className="text-[10px] text-ink-faint block uppercase">1M Return</span>
                        <strong className={`text-[16px] font-mono block ${aggregates.r1m >= 0 ? "text-pos" : "text-neg"}`}>
                          {aggregates.r1m >= 0 ? "+" : ""}{aggregates.r1m.toFixed(2)}%
                        </strong>
                      </div>

                      <div className="space-y-0.5">
                        <span className="text-[10px] text-ink-faint block uppercase">1Y Return</span>
                        <strong className={`text-[16px] font-mono block ${aggregates.r1y >= 0 ? "text-pos" : "text-neg"}`}>
                          {aggregates.r1y >= 0 ? "+" : ""}{aggregates.r1y.toFixed(2)}%
                        </strong>
                      </div>

                      <div className="space-y-0.5">
                        <span className="text-[10px] text-ink-faint block uppercase">Volatility</span>
                        <strong className="text-[16px] text-ink font-mono block">
                          {aggregates.vol.toFixed(2)}%
                        </strong>
                      </div>

                      <div className="space-y-0.5">
                        <span className="text-[10px] text-ink-faint block uppercase">Drawdown</span>
                        <strong className="text-[16px] text-neg font-mono block">
                          {aggregates.maxdd.toFixed(2)}%
                        </strong>
                      </div>

                    </div>
                  </div>
                )}

              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-line p-8 text-center bg-surface">
                <div className="text-[24px]">📂</div>
                <h4 className="text-[13px] font-bold text-ink mt-1.5">This strategy is empty</h4>
                <p className="text-[11.5px] text-ink-faint mt-0.5 leading-relaxed max-w-xs mx-auto">
                  Type a fund name in the search box above to add holdings and start allocation modeling.
                </p>
              </div>
            )}

          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-line p-16 text-center max-w-md mx-auto">
            <div className="text-[32px] select-none">📈</div>
            <h3 className="text-[14px] font-bold text-ink mt-3">Portfolio Strategy Workspace</h3>
            <p className="text-[12px] text-ink-faint mt-1.5 leading-relaxed">
              Create named strategies, model custom allocation spreads, auto-calculate weighted risk/return averages, and copy strategies.
            </p>
            <button
              onClick={createNewStrategy}
              className="mt-5 rounded-lg bg-accent px-4 py-2 text-[12.5px] font-bold text-white hover:bg-accent-soft transition-all"
            >
              Create First Strategy
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
