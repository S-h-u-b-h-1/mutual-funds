// Mock portfolio-sync provider (Journey 3). Simulates what a real BSE Star MF/CAMS/KFintech
// account-sync would report back for a newly-connected account — never fabricates a REAL user's
// financial position; only used behind an explicit, user-initiated "connect" action (never
// auto-populated silently), and every holding it returns is tagged with a distinct source
// ('mock-connected') so it's never confused with a real CAS import or a real completed order.
//
// The FUND identity in every returned holding is real (a real, currently-active AMFI scheme
// code — portfolioService.js resolves it through the same buildHolding() enrichment the CAS-
// import path uses, so real current NAV/category/AMC apply). Only the "you hold N units,
// purchased on date D" fact is synthetic, deliberately deterministic per user (same user sees a
// stable demo portfolio across visits — not fresh random numbers on every call) rather than
// invented anew each time, and clearly documented as such everywhere it surfaces.
import { PortfolioProvider } from "../types.js";

// Real, verified scheme codes as of this build (frontend/app/data/funds.json) — one real,
// currently-active, direct-growth fund per category/AMC pair, deliberately spread across asset
// classes so a connected demo portfolio isn't just "eight equity funds that move together".
const DEMO_POOL = [
  { schemeCode: "120465", category: "Large Cap" },
  { schemeCode: "150404", category: "Mid Cap" },
  { schemeCode: "153612", category: "Small Cap" },
  { schemeCode: "151165", category: "ELSS" },
  { schemeCode: "154043", category: "Flexi Cap" },
  { schemeCode: "139527", category: "Aggressive Hybrid" },
  { schemeCode: "119605", category: "Gilt" },
  { schemeCode: "145396", category: "Dynamic Asset Allocation or Balanced Advantage" },
];

// Deterministic string hash (not crypto — doesn't need to be, just needs to be stable and
// reasonably spread) so the same userId always maps to the same synthetic portfolio.
function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// A small linear-congruential generator seeded from the hash — deterministic per user, but each
// successive call within one generation produces a different-looking value (unlike reusing the
// same hash for every field, which would make units/purchaseDaysAgo/costFactor all correlate).
function makeRng(seed) {
  let state = seed || 1;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

export class MockPortfolioProvider extends PortfolioProvider {
  async syncHoldings(userId) {
    const rng = makeRng(hashSeed(userId));
    const holdingCount = 3 + Math.floor(rng() * 4); // 3-6 holdings
    const pool = [...DEMO_POOL].sort(() => rng() - 0.5).slice(0, holdingCount);

    const holdings = pool.map(({ schemeCode }) => {
      const units = +(50 + rng() * 450).toFixed(3); // 50-500 units
      const purchaseDaysAgo = 30 + Math.floor(rng() * 700); // ~1 month to ~2 years ago
      // Synthetic cost factor relative to CURRENT nav (never a real historical price lookup) —
      // 0.75-1.25x spreads holdings across genuine gains and genuine losses, not an always-up
      // demo portfolio.
      const costFactor = 0.75 + rng() * 0.5;
      return {
        schemeCode,
        units,
        costFactor,
        purchaseDaysAgo,
        folioNumber: `MOCK${hashSeed(userId + schemeCode).toString().slice(0, 8)}`,
      };
    });

    return { provider: "mock-portfolio", holdings };
  }
}
