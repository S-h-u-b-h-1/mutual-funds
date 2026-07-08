// Alert evaluation logic (Phase 6 — backend only, no delivery infra: evaluateRule() decides
// whether a rule fires; nothing in this file sends anything anywhere. alert_deliveries rows stay
// status='pending' until a real delivery worker exists later — see 002_auth_and_user_data.sql.
//
// Only wired to REAL, already-computed signals — no invented data. That currently means:
//   health_score      -> fundHealth(getFund(target_id)).overall        (fund-level only)
//   attention_score    -> researchPriority(getFund(target_id), {}).score (fund-level only)
//   news               -> getArticlesForEntity(...) + impactScoreFor(...)
// factsheet/benchmark/category/amc/research_queue alert_types are valid to CREATE (the schema
// and CRUD API don't restrict alert_type) but have no real data source wired up yet — see this
// codebase's own "architecture, not analytics" pattern from the portfolio schema. evaluateRule()
// returns skipped:true with an honest reason for these rather than faking a result.
import { getFund } from "./funds";
import { fundHealth } from "./fundHealth";
import { researchPriority } from "./decisionEngine";
import { impactScoreFor } from "./marketImpact";
import { getArticlesForEntity } from "./news";

const SCORED_TYPES = new Set(["health_score", "attention_score"]);

function evaluateThreshold(condition, currentValue) {
  const { op, value } = condition || {};
  if (typeof value !== "number") return { triggered: false, skipped: true, reason: "condition.value must be a number" };

  switch (op) {
    case "below":
      return { triggered: currentValue < value, payload: { currentValue, threshold: value } };
    case "above":
      return { triggered: currentValue > value, payload: { currentValue, threshold: value } };
    case "crosses_below": {
      const last = condition.lastValue;
      const triggered = last != null && last >= value && currentValue < value;
      return { triggered, payload: { currentValue, threshold: value, previousValue: last ?? null }, newLastValue: currentValue };
    }
    case "crosses_above": {
      const last = condition.lastValue;
      const triggered = last != null && last <= value && currentValue > value;
      return { triggered, payload: { currentValue, threshold: value, previousValue: last ?? null }, newLastValue: currentValue };
    }
    default:
      return { triggered: false, skipped: true, reason: `unknown condition.op: "${op}"` };
  }
}

async function evaluateNewsRule(rule) {
  const entityType = rule.target_type;
  const entityName = rule.target_name || rule.target_id;
  const minScore = typeof rule.condition?.minScore === "number" ? rule.condition.minScore : 55; // default: "High" tier per marketImpact.js
  const articles = await getArticlesForEntity({ entityType, entityName, limit: 5 });
  if (!articles.length) return { triggered: false, payload: { checked: 0 } };

  const lastSeenId = rule.condition?.lastSeenArticleId ?? null;
  const fresh = lastSeenId ? articles.filter((a) => a.id !== lastSeenId) : articles;
  // Stop at the first previously-seen article — articles arrive newest-first, so anything after
  // that point was already evaluated on a prior run.
  const newOnes = [];
  for (const a of fresh) {
    if (a.id === lastSeenId) break;
    newOnes.push(a);
  }
  const scored = newOnes
    .map((a) => ({ article: a, ...impactScoreFor({ links: [{ entityType, entityName }] }) }))
    .filter((a) => a.score >= minScore);

  return {
    triggered: scored.length > 0,
    payload: { checked: articles.length, newArticles: newOnes.length, matched: scored.map((s) => ({ id: s.article.id, title: s.article.title, url: s.article.url, score: s.score, tier: s.tier })) },
    newLastSeenArticleId: articles[0]?.id ?? lastSeenId,
  };
}

export async function evaluateRule(rule) {
  if (SCORED_TYPES.has(rule.alert_type)) {
    const fund = rule.target_type === "fund" ? getFund(rule.target_id) : null;
    if (!fund) return { triggered: false, skipped: true, reason: "fund not found for target_id" };

    const currentValue = rule.alert_type === "health_score" ? fundHealth(fund)?.overall : researchPriority(fund, {})?.score;
    if (currentValue == null) return { triggered: false, skipped: true, reason: "score unavailable for this fund (insufficient data)" };

    return evaluateThreshold(rule.condition, currentValue);
  }

  if (rule.alert_type === "news") {
    return evaluateNewsRule(rule);
  }

  return { triggered: false, skipped: true, reason: `"${rule.alert_type}" evaluation is not yet implemented — architecture only` };
}
