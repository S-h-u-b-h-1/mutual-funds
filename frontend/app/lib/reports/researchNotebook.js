// Research Notebook (Investment Operating System mission, Phase 10) — a structured report object
// for the future PDF/export engine. Composes a user's already-saved research (watchlist, notes,
// saved comparisons — Mission A's cloud sync tables) into one object grouped by fund, so "what
// have I actually looked into" is answerable without opening three separate pages. No new data:
// every field is a direct read from user_watchlist / user_research_notes /
// user_saved_comparisons, exactly as the sync APIs already return them.
export function buildResearchNotebook({ watchlist = [], notes = [], comparisons = [] }) {
  const byFund = {};
  const entry = (schemeCode, fundName) => (byFund[schemeCode] ||= { schemeCode, fundName: fundName || null, watchlisted: false, watchlistedAt: null, notes: [] });

  for (const w of watchlist) {
    const e = entry(w.scheme_code, w.fund_name);
    e.watchlisted = true;
    e.watchlistedAt = w.added_at;
    e.fundName = e.fundName || w.fund_name;
  }
  for (const n of notes) {
    const e = entry(n.scheme_code, n.fund_name);
    e.notes.push({ id: n.id, text: n.text, createdAt: n.created_at, updatedAt: n.updated_at });
  }

  const funds = Object.values(byFund).sort((a, b) => (b.watchlistedAt || "").localeCompare(a.watchlistedAt || ""));

  return {
    fundCount: funds.length,
    funds,
    savedComparisons: comparisons.map((c) => ({ id: c.id, name: c.name, amcs: c.amcs, createdAt: c.created_at })),
    summary: {
      watchlistedCount: watchlist.length,
      notesCount: notes.length,
      fundsWithNotes: funds.filter((f) => f.notes.length > 0).length,
      fundsWatchlistedWithoutNotes: funds.filter((f) => f.watchlisted && f.notes.length === 0).length,
      savedComparisonsCount: comparisons.length,
    },
    methodology: "Direct read from your saved watchlist, research notes, and saved AMC comparisons (user_watchlist / user_research_notes / user_saved_comparisons) — no new data, no inference about funds you haven't actually saved or noted.",
  };
}
