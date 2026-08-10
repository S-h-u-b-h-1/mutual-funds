// One shared classification for portfolio diversification, risk assumptions and projections.
// Unknown categories remain Unknown instead of being silently treated as equity.
export const CANONICAL_CATEGORIES = {
  "Large Cap": ["large cap", "large & mid", "large and mid"],
  "Mid Cap": ["mid cap"],
  "Small Cap": ["small cap"],
  Debt: ["debt", "gilt", "liquid", "corporate bond", "money market", "banking and psu", "credit risk", "overnight", "duration", "income"],
  Gold: ["gold"],
  International: ["international", "overseas", "global", "fund of funds"],
  Hybrid: ["hybrid", "balanced advantage", "multi asset", "aggressive hybrid", "conservative hybrid", "equity savings"],
  Index: ["index", "etf"],
};

export function categoryToCanonicalBucket(category, assetClass = "") {
  const cat = String(category || "").toLowerCase();
  for (const [bucket, keywords] of Object.entries(CANONICAL_CATEGORIES)) {
    if (keywords.some((keyword) => cat.includes(keyword))) return bucket;
  }
  const asset = String(assetClass || "").toLowerCase();
  if (asset.includes("debt")) return "Debt";
  if (asset.includes("hybrid")) return "Hybrid";
  if (asset.includes("equity")) return "Equity — Other";
  return "Unknown";
}

export function isEquityBucket(bucket) {
  return ["Large Cap", "Mid Cap", "Small Cap", "Index", "International", "Equity — Other"].includes(bucket);
}
