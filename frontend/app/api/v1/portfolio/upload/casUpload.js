// CAS PDF upload handler — extract, identify provider, parse, normalize, resolve, verify,
// persist. Separate from the CSV/manual path in route.js because every step differs: binary
// input, async extraction, canonical (not exact-match) scheme resolution, and two additional
// writes (portfolio_transactions, portfolio_snapshots) neither of which any prior import path used.
import { extractCasText } from "../../../../lib/portfolioImport/casPdf";
import { parseCasText } from "../../../../lib/portfolioImport/casParser";
import { normalizeCasImport, computePortfolioXirr } from "../../../../lib/portfolioImport/casNormalizer";

// Maps the UI's selected tab (components/PortfolioWorkspace.jsx's STATEMENT_TYPES) to the
// provider casParser.js's detectProvider() would independently find in the PDF text — a
// cross-check, not a gate: a mismatch is surfaced as a warning (the user may have simply picked
// the wrong tab, or a registrar's signature text may vary), never a rejection of an otherwise
// valid statement.
const EXPECTED_PROVIDER = { cams_cas_pdf: "cams", kfin_cas_pdf: "kfin", mfcentral_summary: "mfcentral" };

function buildIdentityCheckNote(investorEmail, accountEmail) {
  if (!investorEmail) return "No email address found on the statement.";
  const normalize = (e) => String(e || "").trim().toLowerCase();
  return normalize(investorEmail) === normalize(accountEmail)
    ? "Email on statement matches your account."
    : "Email on statement does not match your account email — this may be a family member's or joint-holder's statement.";
}

// Unresolved/ambiguous holdings are persisted as their own standing record, not just reported in
// one upload's own response — "persist it as unresolved... never map to a random 'closest' fund
// merely to obtain NAV" (see casNormalizer.js's normalizeCasImport() for exactly which
// resolution_status values exist and why). A row stays 'open' until a LATER upload actually
// resolves the same folio+ISIN (resolveStaleUnresolvedHoldings, below) or an operator dismisses
// it — it is not re-derived from scratch on every upload, so it survives even if the investor
// never re-uploads. Exported (not just called inline) so it's directly testable without needing
// to construct a full PDF buffer through the whole route.
export async function persistUnresolvedHoldings(query, userId, uploadId, errors) {
  for (const e of errors) {
    await query(
      `insert into portfolio_unresolved_holdings
         (user_id, upload_id, raw_scheme_name, isin, folio_number, units, purchase_value, market_value_reported, resolution_status, resolution_reason, ambiguity_candidates, source)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'cas')`,
      [userId, uploadId, e.schemeName ?? null, e.isin ?? null, e.folioNumber ?? null, e.units ?? null, e.purchaseValue ?? null, e.marketValueReported ?? null, e.status ?? "unresolved", e.reason ?? null, e.ambiguityCandidates ? JSON.stringify(e.ambiguityCandidates) : null]
    );
  }
}

// Matched on (user_id, folio_number, isin) only — the strongest identifier available, and the one
// virtually every real CAS row carries. A prior unresolved row with no ISIN on record (rare —
// casParser.js only omits it when the source text itself had none) isn't auto-resolved this way;
// it stays open until an operator or a future name-based pass closes it.
export async function resolveStaleUnresolvedHoldings(query, userId, holdings) {
  for (const h of holdings) {
    if (!h.isin || !h.folioNumber) continue;
    await query(
      `update portfolio_unresolved_holdings set status = 'resolved', resolved_at = now()
       where user_id = $1 and folio_number = $2 and isin = $3 and status = 'open'`,
      [userId, h.folioNumber, h.isin]
    );
  }
}

// First-ever writer to portfolio_transactions (schema existed since 002_auth_and_user_data.sql but
// no code had ever populated it) — this is what makes real XIRR possible, not just a point-in-time
// cost/value comparison. ON CONFLICT DO NOTHING against the fingerprint unique constraint
// (031_transaction_idempotency.sql) is a DB-level idempotency backstop beyond the app-level
// checksum gate in handleCasUpload — the checksum gate is what actually stops a normal duplicate
// re-upload; this is what stops a duplicate ROW surviving any path that reaches this insert
// without going through that gate (a retry, a race, a future import source).
export async function persistTransactions(query, userId, transactions) {
  for (const t of transactions) {
    await query(
      `insert into portfolio_transactions (user_id, scheme_code, transaction_type, description, units, nav_value, unit_balance, amount, transaction_date, source, folio_number)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'cas', $10)
       on conflict (user_id, scheme_code, folio_number, transaction_date, transaction_type, amount, units, nav_value) do nothing`,
      [userId, t.schemeCode, t.transactionType, t.description ?? null, t.units, t.navValue, t.unitBalance ?? null, t.amount, t.transactionDate, t.folioNumber ?? ""]
    );
  }
}

async function insertUploadRow(query, { userId, filename, status, rowsParsed, rowsImported, rowsSkipped, errors, warnings, checksum, fileSize, provider, identityNote }) {
  const r = await query(
    `insert into portfolio_uploads (user_id, source, filename, status, rows_parsed, rows_imported, rows_skipped, errors, content_sha256, file_size_bytes, provider, identity_check_note)
     values ($1, 'cas', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     returning id, status, rows_imported, rows_skipped, uploaded_at`,
    [userId, filename, status, rowsParsed, rowsImported, rowsSkipped, JSON.stringify({ errors, warnings }), checksum, fileSize, provider, identityNote]
  );
  return r.rows[0];
}

export async function handleCasUpload({ user, filename, buffer, selectedStatementType, query }) {
  const extraction = await extractCasText(buffer);
  if (extraction.rejected) {
    // Recorded even on rejection — "even a failed attempt is recorded" is this route's own
    // standing guarantee (see route.js's header comment), now true for CAS too.
    await insertUploadRow(query, {
      userId: user.id, filename, status: "failed", rowsParsed: 0, rowsImported: 0, rowsSkipped: 0,
      errors: [{ reason: extraction.reason, code: extraction.rejected }], warnings: [],
      checksum: null, fileSize: buffer.length, provider: null, identityNote: null,
    });
    return Response.json(
      { error: extraction.reason, code: extraction.rejected, imported: 0, holdings: [], errors: [{ reason: extraction.reason }], warnings: [] },
      { status: 400 }
    );
  }

  const { text, checksum } = extraction;

  const parsed = parseCasText(text);
  const { holdings, errors, transactions, warnings } = normalizeCasImport(parsed);
  const status = holdings.length === 0 ? "failed" : errors.length > 0 ? "partial" : "success";
  const identityNote = buildIdentityCheckNote(parsed.investor.email, user.email);

  // Duplicate-upload detection: has this exact file content already been successfully imported
  // by this user? Checked by checksum, not filename (a re-downloaded copy of the same statement
  // may have a different filename but identical content). This deliberately runs AFTER parsing:
  // summary PDFs have no transaction ledger, so reprocessing the same statement is safe and useful
  // when parser mapping improves (holdings are upserted). Ledger PDFs are still blocked because
  // blindly replaying the same transaction rows would duplicate portfolio_transactions.
  const priorMatch = await query(
    `select id, uploaded_at, status from portfolio_uploads where user_id = $1 and content_sha256 = $2 and status in ('success', 'partial') order by uploaded_at desc limit 1`,
    [user.id, checksum]
  );
  if (priorMatch.rows[0]) {
    const prior = priorMatch.rows[0];
    if (transactions.length > 0) {
      return Response.json(
        {
          error: `This exact statement was already imported on ${new Date(prior.uploaded_at).toISOString().slice(0, 10)}. Upload a newer statement, or re-download a fresh copy if you believe your holdings have changed.`,
          code: "duplicate_upload",
          priorUploadId: prior.id,
          imported: 0, holdings: [], errors: [], warnings: [],
        },
        { status: 409 }
      );
    }
    warnings.push(`This exact portfolio summary was already imported on ${new Date(prior.uploaded_at).toISOString().slice(0, 10)}. It was reprocessed to refresh statement-derived values; existing holdings were updated, not duplicated.`);
  }

  const expectedProvider = EXPECTED_PROVIDER[selectedStatementType];
  if (parsed.provider && expectedProvider && parsed.provider !== expectedProvider) {
    warnings.push(`You selected "${selectedStatementType}" but this statement looks like it was issued by ${parsed.provider.toUpperCase()} — the statement was still processed using the shared CAS parser, but double-check you picked the right tab.`);
  } else if (!parsed.provider) {
    warnings.push("Could not automatically confirm which registrar (CAMS/KFin/MF Central) issued this statement from its text — processed using your selected tab.");
  }

  try {
    const uploadRow = await insertUploadRow(query, {
      userId: user.id, filename, status,
      rowsParsed: holdings.length + errors.length, rowsImported: holdings.length, rowsSkipped: errors.length,
      errors, warnings, checksum, fileSize: buffer.length, provider: parsed.provider, identityNote,
    });

    for (const h of holdings) {
      await query(
        `insert into portfolio_holdings (user_id, scheme_code, units, avg_cost, source, folio_number, imported_at)
         values ($1, $2, $3, $4, 'cas', $5, now())
         on conflict (user_id, scheme_code, source, folio_number)
         do update set units = excluded.units, avg_cost = excluded.avg_cost, imported_at = excluded.imported_at`,
        [user.id, h.schemeCode, h.units, h.avgCost, h.folioNumber ?? ""]
      );
    }

    await persistTransactions(query, user.id, transactions);
    await persistUnresolvedHoldings(query, user.id, uploadRow.id, errors);
    await resolveStaleUnresolvedHoldings(query, user.id, holdings);

    const xirr = computePortfolioXirr(transactions, holdings);

    const totals = await query(`select count(*)::int as holdings_count from portfolio_holdings where user_id = $1`, [user.id]);
    await query(
      `insert into portfolio (user_id, holdings_count, last_upload_at, updated_at)
       values ($1, $2, now(), now())
       on conflict (user_id) do update set holdings_count = excluded.holdings_count, last_upload_at = excluded.last_upload_at, updated_at = now()`,
      [user.id, totals.rows[0].holdings_count]
    );

    // A minimal, self-contained allocation snapshot (by AMC and category, computed from this
    // batch's own holdings) for the diff/history the mission asks for. Deliberately does not call
    // into the full Portfolio Intelligence analytics engine (which consolidates ALL of a user's
    // holdings across every source, sector-level allocation, etc.) — that engine's output is the
    // richer, authoritative one shown on the Portfolio Review page; this snapshot exists so a
    // day-over-day diff is possible even before that engine's own history-writing is built out
    // (Mission B Phase 8, still pending). Upserts on (user_id, snapshot_date) — a second CAS
    // upload on the same day updates today's snapshot rather than erroring.
    const byAmc = {}, byCategory = {};
    let totalCostValue = 0;
    for (const h of holdings) {
      const value = h.purchaseValue ?? 0;
      totalCostValue += value;
      if (h.amc) byAmc[h.amc] = (byAmc[h.amc] || 0) + value;
      if (h.category) byCategory[h.category] = (byCategory[h.category] || 0) + value;
    }
    if (holdings.length > 0) {
      await query(
        `insert into portfolio_snapshots (user_id, snapshot_date, total_value, allocation, holdings_count)
         values ($1, current_date, $2, $3, $4)
         on conflict (user_id, snapshot_date) do update set total_value = excluded.total_value, allocation = excluded.allocation, holdings_count = excluded.holdings_count`,
        [user.id, totalCostValue, JSON.stringify({ byAmc, byCategory, source: "cas", note: "Cost-basis allocation from this CAS batch only; see Portfolio Review for the full current-value allocation across all sources." }), holdings.length]
      );
    }

    return Response.json(
      {
        upload: uploadRow,
        provider: parsed.provider,
        identityCheck: identityNote,
        imported: holdings.length,
        holdings,
        errors,
        warnings,
        transactionsImported: transactions.length,
        xirr,
      },
      { status: 201 }
    );
  } catch (error) {
    try {
      await insertUploadRow(query, {
        userId: user.id, filename, status: "failed", rowsParsed: 0, rowsImported: 0, rowsSkipped: 0,
        errors: [{ reason: "Unexpected error while processing this statement." }], warnings: [],
        checksum, fileSize: buffer.length, provider: parsed.provider, identityNote: null,
      });
    } catch {
      // Best-effort audit row, same as the CSV path's failure handler.
    }
    return Response.json(
      { error: "This statement could not be fully processed. Please try again or contact support if the problem persists.", imported: 0, holdings: [], errors: [{ reason: String(error?.message || error) }], warnings: [] },
      { status: 400 }
    );
  }
}
