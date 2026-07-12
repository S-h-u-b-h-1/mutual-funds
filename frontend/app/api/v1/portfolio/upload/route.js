import { requireUser, unauthorized } from "../../../../lib/apiAuth";
import { query } from "../../../../lib/db";
import { parsePortfolio, PORTFOLIO_SOURCES } from "../../../../lib/portfolioImport";

// Accepts either a CSV file upload (multipart/form-data: fields "source", "file") or manual
// entry (application/json: { source: "manual", entries: [...] }). Always records a
// portfolio_uploads row — even a failed/empty attempt — so imports are auditable, then upserts
// every successfully resolved holding into portfolio_holdings and refreshes the portfolio
// header cache row.
export async function POST(request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  let source, input, filename = null;
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    source = formData.get("source");
    const file = formData.get("file");
    if (!file || typeof file.text !== "function") {
      return Response.json({ error: "file is required for CSV sources" }, { status: 400 });
    }
    filename = file.name || null;
    input = await file.text();
  } else {
    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }
    source = body.source;
    input = body.entries;
  }

  if (!source || !PORTFOLIO_SOURCES[source]) {
    return Response.json({ error: `source is required and must be one of: ${Object.keys(PORTFOLIO_SOURCES).join(", ")}` }, { status: 400 });
  }
  if (source === "manual" && !Array.isArray(input)) {
    return Response.json({ error: "entries (array) is required for manual source" }, { status: 400 });
  }
  if (source !== "manual" && typeof input !== "string") {
    return Response.json({ error: "file is required for CSV sources" }, { status: 400 });
  }

  // Everything from here on can throw on a genuinely malformed file (a PapaParse edge case, a
  // parser hitting an input shape it didn't expect, a DB constraint on an out-of-range value) —
  // previously unguarded, so an unexpected exception fell through to Next.js's generic 500 with
  // no useful message, and skipped the portfolio_uploads audit row entirely (the exact
  // "even a failed attempt is recorded" guarantee this route's own header comment promises).
  // "Never crash" is an explicit requirement for this import surface — found and fixed as part of
  // a portfolio-upload robustness pass, not from a live failure.
  try {
    const { holdings, errors, warnings } = parsePortfolio(source, input);
    const status = holdings.length === 0 ? "failed" : errors.length > 0 ? "partial" : "success";

    const uploadRow = await query(
      `insert into portfolio_uploads (user_id, source, filename, status, rows_parsed, rows_imported, rows_skipped, errors)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id, status, rows_imported, rows_skipped, uploaded_at`,
      [user.id, source, filename, status, holdings.length + errors.length, holdings.length, errors.length, JSON.stringify({ errors, warnings })]
    );

    for (const h of holdings) {
      await query(
        `insert into portfolio_holdings (user_id, scheme_code, units, avg_cost, source, folio_number, imported_at)
         values ($1, $2, $3, $4, $5, $6, now())
         on conflict (user_id, scheme_code, source, folio_number)
         do update set units = excluded.units, avg_cost = excluded.avg_cost, imported_at = excluded.imported_at`,
        [user.id, h.schemeCode, h.units, h.avgCost, source, h.folioNumber ?? ""]
      );
    }

    // total_value/last_computed_at are owned by the Portfolio Intelligence Engine (Phase 3), which
    // joins every holding against live NAV — not computed here from just this batch's rows.
    const totals = await query(`select count(*)::int as holdings_count from portfolio_holdings where user_id = $1`, [user.id]);
    await query(
      `insert into portfolio (user_id, holdings_count, last_upload_at, updated_at)
       values ($1, $2, now(), now())
       on conflict (user_id) do update set holdings_count = excluded.holdings_count, last_upload_at = excluded.last_upload_at, updated_at = now()`,
      [user.id, totals.rows[0].holdings_count]
    );

    return Response.json(
      { upload: uploadRow.rows[0], imported: holdings.length, holdings, errors, warnings },
      { status: 201 }
    );
  } catch (error) {
    try {
      await query(
        `insert into portfolio_uploads (user_id, source, filename, status, rows_parsed, rows_imported, rows_skipped, errors)
         values ($1, $2, $3, 'failed', 0, 0, 0, $4)`,
        [user.id, source, filename, JSON.stringify({ errors: [{ reason: "Unexpected error while processing this file." }], warnings: [] })]
      );
    } catch {
      // Best-effort audit row — if even this insert fails, still return a clean error below
      // rather than let a secondary exception mask the original one.
    }
    return Response.json(
      { error: "This file could not be processed. Check that it's a valid export from the selected source and try again.", imported: 0, holdings: [], errors: [{ reason: String(error?.message || error) }], warnings: [] },
      { status: 400 }
    );
  }
}
