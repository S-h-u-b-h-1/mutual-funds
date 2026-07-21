// Reconciliation Engine tests (Phase 4 M3) — real Neon. Core-engine mechanics (ladder,
// auto-resolve, run failure) use a throwaway test comparator; each production comparator gets
// its own real-data test. Disposable-rows discipline throughout.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { query } from "../../db.js";
import { registerComparator } from "./registry.js";
import {
  ladderStatus,
  runReconciliation,
  resolveReconciliationItem,
  getReconciliationMetrics,
} from "./core.js";
import { portfolioProvider } from "../../invest/providers/index.js";
// production comparators, registered as a side effect
import "./comparators/index.js";
import { LAG_THRESHOLD_MINUTES } from "./comparators/webhookProcessingLag.js";

const RUN = crypto.randomBytes(3).toString("hex");
const T = (name) => `test-${RUN}-${name}`;
const testUserIds = [];

async function makeTestUser(label) {
  const email = `invest-test-recon-${RUN}-${label}@mfpulse.test`;
  const r = await query(`insert into users (name, email) values ($1, $2) returning id`, [`Recon Test ${label}`, email]);
  testUserIds.push(r.rows[0].id);
  return r.rows[0].id;
}

afterAll(async () => {
  await query(`delete from reconciliation_items where recon_type like $1`, [`test-${RUN}-%`]);
  await query(`delete from reconciliation_runs where recon_type like $1`, [`test-${RUN}-%`]);
  // production-comparator runs/items created against disposable test users during this suite
  await query(
    `delete from reconciliation_items where recon_type in ('documents-vault-integrity','orders-provider-linkage','holdings-vs-provider','webhook-processing-lag')
       and entity_key like any(array(select id::text || '%' from unnest($1::uuid[]) as id))`,
    [testUserIds]
  ).catch(() => {}); // best-effort; the user cascade below is the real cleanup guarantee
  for (const id of testUserIds) await query(`delete from users where id = $1`, [id]);
});

describe("ladderStatus", () => {
  it("1st sighting retry, 2nd mismatch, 3rd+ escalated", () => {
    expect(ladderStatus(1)).toBe("retry");
    expect(ladderStatus(2)).toBe("mismatch");
    expect(ladderStatus(3)).toBe("escalated");
    expect(ladderStatus(9)).toBe("escalated");
  });
});

describe("engine core (integration, real Neon, throwaway comparator)", () => {
  it("matched pairs count as matched and create no exception", async () => {
    const type = T("matched");
    registerComparator({
      type, entityType: "widget",
      async loadPairs() {
        return [{ key: "w1", internal: { v: 1 }, external: { v: 1 } }];
      },
      compare: (i, e) => ({ matched: i.v === e.v }),
    });
    const { totals } = await runReconciliation(type);
    expect(totals).toMatchObject({ checked: 1, matched: 1, exceptions: 0 });
    const items = await query(`select count(*)::int as c from reconciliation_items where recon_type = $1`, [type]);
    expect(items.rows[0].c).toBe(0);
  });

  it("missing_external and missing_internal are classified distinctly", async () => {
    const type = T("missing-sides");
    registerComparator({
      type, entityType: "widget",
      async loadPairs() {
        return [
          { key: "a", internal: { v: 1 }, external: null },
          { key: "b", internal: null, external: { v: 1 } },
        ];
      },
      compare: () => ({ matched: true }),
    });
    await runReconciliation(type);
    const rows = await query(`select entity_key, mismatch_kind from reconciliation_items where recon_type = $1 order by entity_key`, [type]);
    expect(rows.rows).toEqual([
      { entity_key: "a", mismatch_kind: "missing_external" },
      { entity_key: "b", mismatch_kind: "missing_internal" },
    ]);
  });

  it("both sides null is skipped entirely (not checked, not an exception)", async () => {
    const type = T("both-null");
    registerComparator({
      type, entityType: "widget",
      async loadPairs() {
        return [{ key: "x", internal: null, external: null }];
      },
      compare: () => ({ matched: true }),
    });
    const { totals } = await runReconciliation(type);
    expect(totals.checked).toBe(0);
  });

  it("value_mismatch carries field-level diffs from compare()", async () => {
    const type = T("value-diff");
    registerComparator({
      type, entityType: "widget",
      async loadPairs() {
        return [{ key: "w1", internal: { units: 10 }, external: { units: 12 } }];
      },
      compare: (i, e) => ({ matched: i.units === e.units, diffs: [{ field: "units", internal: i.units, external: e.units }] }),
    });
    await runReconciliation(type);
    const row = await query(`select mismatch_kind, details from reconciliation_items where recon_type = $1`, [type]);
    expect(row.rows[0].mismatch_kind).toBe("value_mismatch");
    expect(row.rows[0].details.diffs).toEqual([{ field: "units", internal: 10, external: 12 }]);
  });

  it("the ladder progresses across runs: retry -> mismatch -> escalated, occurrences increment, one row throughout", async () => {
    const type = T("ladder");
    let stillMismatched = true;
    registerComparator({
      type, entityType: "widget",
      async loadPairs() {
        return [{ key: "w1", internal: { v: 1 }, external: { v: stillMismatched ? 2 : 1 } }];
      },
      compare: (i, e) => ({ matched: i.v === e.v }),
    });
    await runReconciliation(type);
    let row = await query(`select status, occurrences from reconciliation_items where recon_type = $1`, [type]);
    expect(row.rows[0]).toMatchObject({ status: "retry", occurrences: 1 });

    await runReconciliation(type);
    row = await query(`select status, occurrences from reconciliation_items where recon_type = $1`, [type]);
    expect(row.rows[0]).toMatchObject({ status: "mismatch", occurrences: 2 });

    await runReconciliation(type);
    row = await query(`select status, occurrences from reconciliation_items where recon_type = $1`, [type]);
    expect(row.rows[0]).toMatchObject({ status: "escalated", occurrences: 3 });

    const countRows = await query(`select count(*)::int as c from reconciliation_items where recon_type = $1`, [type]);
    expect(countRows.rows[0].c).toBe(1); // one escalating row, never duplicated

    // now it matches again -> auto-resolved
    stillMismatched = false;
    const { totals } = await runReconciliation(type);
    expect(totals.autoResolved).toBe(1);
    row = await query(`select status, resolved_by, resolution_note from reconciliation_items where recon_type = $1`, [type]);
    expect(row.rows[0].status).toBe("resolved");
    expect(row.rows[0].resolved_by).toBe("auto");
    expect(row.rows[0].resolution_note).toMatch(/Auto-resolved/);
  });

  it("re-mismatching after an auto-resolve opens a FRESH item (occurrences reset to 1), not a reopened old one", async () => {
    const type = T("reopen");
    let mismatched = true;
    registerComparator({
      type, entityType: "widget",
      async loadPairs() {
        return [{ key: "w1", internal: { v: 1 }, external: { v: mismatched ? 2 : 1 } }];
      },
      compare: (i, e) => ({ matched: i.v === e.v }),
    });
    await runReconciliation(type); // retry, occurrences 1
    mismatched = false;
    await runReconciliation(type); // auto-resolved
    mismatched = true;
    await runReconciliation(type); // mismatched again
    const rows = await query(`select status, occurrences from reconciliation_items where recon_type = $1 order by created_at`, [type]);
    expect(rows.rows.length).toBe(2); // the resolved one, plus a new open one
    const open = rows.rows.find((r) => r.status !== "resolved");
    expect(open).toMatchObject({ status: "retry", occurrences: 1 });
  });

  it("the { matched: true } explicit-verdict form also auto-resolves (webhook-lag-style comparators)", async () => {
    const type = T("explicit-matched");
    registerComparator({
      type, entityType: "widget",
      async loadPairs() {
        return [{ key: "w1", exception: { kind: "stale_processing", diffs: [] } }];
      },
      compare: () => ({ matched: true }),
    });
    await runReconciliation(type);
    let row = await query(`select status from reconciliation_items where recon_type = $1`, [type]);
    expect(row.rows[0].status).toBe("retry");

    registerComparator({
      type, entityType: "widget",
      async loadPairs() {
        return [{ key: "w1", matched: true }];
      },
      compare: () => ({ matched: true }),
    });
    const { totals } = await runReconciliation(type);
    expect(totals.autoResolved).toBe(1);
    row = await query(`select status from reconciliation_items where recon_type = $1`, [type]);
    expect(row.rows[0].status).toBe("resolved");
  });

  it("an unregistered comparator type throws without creating a run row", async () => {
    const before = await query(`select count(*)::int as c from reconciliation_runs where recon_type = $1`, [T("no-such-type")]);
    await expect(runReconciliation(T("no-such-type"))).rejects.toThrow(/No comparator registered/);
    const after = await query(`select count(*)::int as c from reconciliation_runs where recon_type = $1`, [T("no-such-type")]);
    expect(after.rows[0].c).toBe(before.rows[0].c);
  });

  it("a comparator that throws mid-run marks the run 'failed' with the error, not silently lost", async () => {
    const type = T("throws");
    registerComparator({
      type, entityType: "widget",
      async loadPairs() {
        throw new Error("upstream provider unavailable");
      },
      compare: () => ({ matched: true }),
    });
    await expect(runReconciliation(type)).rejects.toThrow(/upstream provider unavailable/);
    const run = await query(`select status, error from reconciliation_runs where recon_type = $1`, [type]);
    expect(run.rows[0].status).toBe("failed");
    expect(run.rows[0].error).toMatch(/upstream provider unavailable/);
  });

  it("scope is recorded on the run row for audit", async () => {
    const type = T("scoped");
    registerComparator({
      type, entityType: "widget",
      async loadPairs(scope) {
        return [{ key: "w1", internal: { v: scope.target }, external: { v: scope.target } }];
      },
      compare: (i, e) => ({ matched: i.v === e.v }),
    });
    const { runId } = await runReconciliation(type, { target: 42 });
    const run = await query(`select scope from reconciliation_runs where id = $1`, [runId]);
    expect(run.rows[0].scope).toEqual({ target: 42 });
  });
});

describe("resolveReconciliationItem", () => {
  it("resolves an open item with actor + note; rejects a second resolution and requires both fields", async () => {
    const type = T("resolve");
    registerComparator({
      type, entityType: "widget",
      async loadPairs() {
        return [{ key: "w1", internal: { v: 1 }, external: { v: 2 } }];
      },
      compare: (i, e) => ({ matched: i.v === e.v }),
    });
    await runReconciliation(type);
    const row = await query(`select id from reconciliation_items where recon_type = $1`, [type]);
    const resolved = await resolveReconciliationItem(row.rows[0].id, { resolvedBy: "user-1", note: "Known timing lag, confirmed fine." });
    expect(resolved.status).toBe("resolved");
    expect(resolved.resolved_by).toBe("user-1");
    await expect(resolveReconciliationItem(row.rows[0].id, { resolvedBy: "user-1", note: "again" })).rejects.toThrow(/not an open exception/);
    await expect(resolveReconciliationItem(row.rows[0].id, { resolvedBy: "user-1" })).rejects.toThrow(/required/);
  });
});

describe("getReconciliationMetrics", () => {
  it("aggregates open-exception counts and each type's latest run, without leaking record contents", async () => {
    const type = T("metrics");
    registerComparator({
      type, entityType: "widget",
      async loadPairs() {
        return [{ key: "secret-key-1", internal: { v: 1 }, external: { v: 2 } }];
      },
      compare: (i, e) => ({ matched: i.v === e.v }),
    });
    await runReconciliation(type);
    const metrics = await getReconciliationMetrics();
    expect(metrics.openExceptions.some((r) => r.recon_type === type && r.status === "retry")).toBe(true);
    expect(metrics.lastRuns.some((r) => r.recon_type === type)).toBe(true);
    // aggregate shape only — no entity_key/details leak into the metrics payload
    expect(JSON.stringify(metrics)).not.toMatch(/secret-key-1/);
  });
});

describe("production comparator: documents-vault-integrity", () => {
  it("a completed order without its confirmation document is flagged missing_external; with the document, matched", async () => {
    const userId = await makeTestUser("docs");
    const order = await query(
      `insert into investment_orders (user_id, scheme_code, order_type, amount, status)
       values ($1, '120465', 'purchase', 5000, 'completed') returning id`,
      [userId]
    );
    const orderId = order.rows[0].id;
    await runReconciliation("documents-vault-integrity", { limit: 2000 });
    let item = await query(
      `select status, mismatch_kind from reconciliation_items where recon_type = 'documents-vault-integrity' and entity_key = $1`,
      [orderId]
    );
    expect(item.rows[0]).toMatchObject({ status: "retry", mismatch_kind: "missing_external" });

    await query(
      `insert into documents (user_id, category, doc_type, title, source, provider, storage_ref, mime_type, status, related_entity_type, related_entity_id)
       values ($1, 'transactions', 'investment_confirmation', 'Confirmation', 'mock-generated', 'test', $2, 'application/pdf', 'generated', 'order', $3)`,
      [userId, `doc_recon_test_${RUN}`, orderId]
    );
    await runReconciliation("documents-vault-integrity", { limit: 2000 });
    item = await query(
      `select status from reconciliation_items where recon_type = 'documents-vault-integrity' and entity_key = $1`,
      [orderId]
    );
    expect(item.rows[0].status).toBe("resolved");
  });
});

describe("production comparator: orders-provider-linkage", () => {
  it("a submitted order with no provider reference is flagged; once linked, matched", async () => {
    const userId = await makeTestUser("linkage");
    const order = await query(
      `insert into investment_orders (user_id, scheme_code, order_type, amount, status)
       values ($1, '150404', 'purchase', 3000, 'submitted') returning id`,
      [userId]
    );
    const orderId = order.rows[0].id;
    await runReconciliation("orders-provider-linkage", { limit: 2000 });
    let item = await query(
      `select status, mismatch_kind from reconciliation_items where recon_type = 'orders-provider-linkage' and entity_key = $1`,
      [orderId]
    );
    expect(item.rows[0]).toMatchObject({ status: "retry", mismatch_kind: "missing_external" });

    await query(`update investment_orders set provider = 'mock-investment', provider_order_id = $2 where id = $1`, [orderId, `ord_recon_${RUN}`]);
    await runReconciliation("orders-provider-linkage", { limit: 2000 });
    item = await query(
      `select status from reconciliation_items where recon_type = 'orders-provider-linkage' and entity_key = $1`,
      [orderId]
    );
    expect(item.rows[0].status).toBe("resolved");
  });

  it("draft and cancelled orders are excluded from the check entirely", async () => {
    const userId = await makeTestUser("linkage-excl");
    await query(`insert into investment_orders (user_id, scheme_code, order_type, amount, status) values ($1, '150404', 'purchase', 1000, 'draft')`, [userId]);
    await query(`insert into investment_orders (user_id, scheme_code, order_type, amount, status) values ($1, '150404', 'purchase', 1000, 'cancelled')`, [userId]);
    const { totals } = await runReconciliation("orders-provider-linkage", { limit: 2000 });
    const items = await query(
      `select ri.id from reconciliation_items ri
       join investment_orders o on o.id::text = ri.entity_key
       where ri.recon_type = 'orders-provider-linkage' and o.user_id = $1`,
      [userId]
    );
    expect(items.rows.length).toBe(0);
    expect(totals.checked).toBeGreaterThanOrEqual(0);
  });
});

describe("production comparator: holdings-vs-provider", () => {
  it("matching units reconcile clean; a unit mismatch is flagged and diffed; fixing it auto-resolves; an internal-only scheme is missing_external", async () => {
    const userId = await makeTestUser("holdings");
    const external = await portfolioProvider.syncHoldings(userId);
    const first = external.holdings[0];
    const key = `${userId}:${first.schemeCode}`;

    await query(
      `insert into portfolio_holdings (user_id, scheme_code, units, source, folio_number) values ($1, $2, $3, 'mock-connected', $4)`,
      [userId, first.schemeCode, first.units, first.folioNumber]
    );
    // a scheme the provider will never return for this user
    await query(
      `insert into portfolio_holdings (user_id, scheme_code, units, source, folio_number) values ($1, '999999', 5, 'mock-connected', 'FAKE1')`,
      [userId]
    );

    await runReconciliation("holdings-vs-provider", { userLimit: 200 });
    let matched = await query(`select status from reconciliation_items where recon_type = 'holdings-vs-provider' and entity_key = $1`, [key]);
    expect(matched.rows.length).toBe(0); // clean match creates no item

    const missing = await query(
      `select status, mismatch_kind from reconciliation_items where recon_type = 'holdings-vs-provider' and entity_key = $1`,
      [`${userId}:999999`]
    );
    expect(missing.rows[0]).toMatchObject({ status: "retry", mismatch_kind: "missing_external" });

    // introduce a real mismatch on the matching row
    await query(`update portfolio_holdings set units = units + 10 where user_id = $1 and scheme_code = $2`, [userId, first.schemeCode]);
    await runReconciliation("holdings-vs-provider", { userLimit: 200 });
    const mismatch = await query(
      `select status, mismatch_kind, details from reconciliation_items where recon_type = 'holdings-vs-provider' and entity_key = $1`,
      [key]
    );
    expect(mismatch.rows[0]).toMatchObject({ status: "retry", mismatch_kind: "value_mismatch" });
    expect(mismatch.rows[0].details.diffs.some((d) => d.field === "units")).toBe(true);

    // fix it back -> auto-resolve
    await query(`update portfolio_holdings set units = $3 where user_id = $1 and scheme_code = $2`, [userId, first.schemeCode, first.units]);
    await runReconciliation("holdings-vs-provider", { userLimit: 200 });
    const healed = await query(
      `select status from reconciliation_items where recon_type = 'holdings-vs-provider' and entity_key = $1`,
      [key]
    );
    expect(healed.rows[0].status).toBe("resolved");
  });
});

describe("production comparator: webhook-processing-lag", () => {
  it("a delivery stuck past the threshold is flagged; once it processes, the open item auto-heals", async () => {
    const delivery = await query(
      `insert into webhook_deliveries (provider, external_event_id, status, received_at)
       values ('mock-payments', $1, 'received', now() - make_interval(mins => $2))
       returning id`,
      [`evt-recon-${RUN}`, LAG_THRESHOLD_MINUTES + 5]
    );
    const deliveryId = delivery.rows[0].id;
    try {
      await runReconciliation("webhook-processing-lag");
      let item = await query(
        `select status, mismatch_kind from reconciliation_items where recon_type = 'webhook-processing-lag' and entity_key = $1`,
        [deliveryId]
      );
      expect(item.rows[0]).toMatchObject({ status: "retry", mismatch_kind: "stale_processing" });

      await query(`update webhook_deliveries set status = 'processed' where id = $1`, [deliveryId]);
      await runReconciliation("webhook-processing-lag");
      item = await query(
        `select status from reconciliation_items where recon_type = 'webhook-processing-lag' and entity_key = $1`,
        [deliveryId]
      );
      expect(item.rows[0].status).toBe("resolved");
    } finally {
      await query(`delete from webhook_deliveries where id = $1`, [deliveryId]);
    }
  });

  it("a delivery still within the threshold is not flagged", async () => {
    const delivery = await query(
      `insert into webhook_deliveries (provider, external_event_id, status, received_at)
       values ('mock-payments', $1, 'received', now() - make_interval(mins => 2)) returning id`,
      [`evt-recon-fresh-${RUN}`]
    );
    try {
      await runReconciliation("webhook-processing-lag");
      const item = await query(
        `select status from reconciliation_items where recon_type = 'webhook-processing-lag' and entity_key = $1`,
        [delivery.rows[0].id]
      );
      expect(item.rows.length).toBe(0);
    } finally {
      await query(`delete from webhook_deliveries where id = $1`, [delivery.rows[0].id]);
    }
  });
});
