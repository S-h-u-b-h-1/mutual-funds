// Runs alert evaluation across every enabled rule. Not user-facing — meant to be called by a
// scheduled job (this repo's existing GitHub Actions pipeline already runs on a schedule; wiring
// a workflow step to call this is a scheduling decision, deliberately left out of this pass per
// "no delivery infra"). Gated on a shared secret rather than requireUser() since there is no
// per-request user — this evaluates every user's rules in one pass.
import { query } from "../../../../../lib/db";
import { evaluateRule } from "../../../../../lib/alertEngine";

const hasSecret = Boolean(process.env.ALERTS_INTERNAL_SECRET);

export async function POST(request) {
  if (!hasSecret) {
    return Response.json({ error: "Alert evaluation is not configured" }, { status: 503 });
  }
  if (request.headers.get("x-internal-secret") !== process.env.ALERTS_INTERNAL_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rules = await query(
    `select id, user_id, alert_type, target_type, target_id, target_name, condition from alert_rules where enabled = true`
  );

  let triggered = 0;
  let skipped = 0;
  const errors = [];

  for (const rule of rules.rows) {
    let result;
    try {
      result = await evaluateRule(rule);
    } catch (err) {
      errors.push({ ruleId: rule.id, error: String(err?.message || err) });
      continue;
    }

    if (result.skipped) {
      skipped++;
      continue;
    }

    // Threshold-crossing / "new since last check" conditions carry their own tracking state
    // forward inside condition jsonb — this write happens every run regardless of whether this
    // particular pass triggered, or "crosses" would never have a real previous value to compare.
    if (result.newLastValue !== undefined || result.newLastSeenArticleId !== undefined) {
      const nextCondition = { ...rule.condition };
      if (result.newLastValue !== undefined) nextCondition.lastValue = result.newLastValue;
      if (result.newLastSeenArticleId !== undefined) nextCondition.lastSeenArticleId = result.newLastSeenArticleId;
      await query(`update alert_rules set condition = $2, updated_at = now() where id = $1`, [rule.id, JSON.stringify(nextCondition)]);
    }

    if (!result.triggered) continue;
    triggered++;

    const channels = await query(
      `select channel from user_notification_settings where user_id = $1 and alert_type = $2 and enabled = true`,
      [rule.user_id, rule.alert_type]
    );
    const targetChannels = channels.rows.length ? channels.rows.map((r) => r.channel) : ["in_app"];

    for (const channel of targetChannels) {
      await query(
        `insert into alert_deliveries (rule_id, channel, status, payload) values ($1, $2, 'pending', $3)`,
        [rule.id, channel, JSON.stringify(result.payload ?? {})]
      );
    }
  }

  return Response.json({ evaluated: rules.rows.length, triggered, skipped, errors });
}
