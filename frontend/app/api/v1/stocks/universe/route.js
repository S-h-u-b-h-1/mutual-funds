import { NextResponse } from "next/server";
import { getIndexUniverse, getStockUniverseSnapshot, STOCK_INDEX_KEYS } from "../../../../lib/stocks/universe";

// Query-string filtering (`?index=BSE100`) must remain request-aware. Marking this force-static
// caused Next.js to build one unfiltered response and reuse it for every query variant.
export const dynamic = "force-dynamic";

export function GET(request) {
  const indexKey = new URL(request.url).searchParams.get("index")?.toUpperCase();
  const payload = indexKey && STOCK_INDEX_KEYS.includes(indexKey)
    ? { schemaVersion: 1, retrievedAt: getStockUniverseSnapshot().retrievedAt, index: getIndexUniverse(indexKey) }
    : getStockUniverseSnapshot();
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      "X-Data-Source": "NSE Indices; BSE Indices",
    },
  });
}
