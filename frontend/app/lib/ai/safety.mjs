export const DISCLAIMER =
  "For research/education only — not investment advice.";
export const LIMITS = Object.freeze({
  message: 1800,
  history: 6,
  body: 16000,
  evidence: 18,
  context: 16000,
  answer: 6000,
});
export class AIError extends Error {
  constructor(code, status = 503) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const string = (v, max) =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;
export function validateRequest(raw) {
  if (!object(raw) || !string(raw.message, LIMITS.message))
    throw new AIError("invalid_request", 400);
  const history = raw.history ?? [];
  if (
    !Array.isArray(history) ||
    history.length > LIMITS.history ||
    history.some(
      (h) =>
        !object(h) ||
        !["user", "assistant"].includes(h.role) ||
        !string(h.content, LIMITS.message),
    )
  )
    throw new AIError("invalid_request", 400);
  const c = raw.pageContext ?? { type: "market" };
  if (
    !object(c) ||
    !["market", "fund", "comparison", "amc", "signal"].includes(c.type)
  )
    throw new AIError("invalid_request", 400);
  const codes = c.codes ?? [],
    amcs = c.amcs ?? [];
  if (
    !Array.isArray(codes) ||
    codes.length > 2 ||
    codes.some((x) => typeof x !== "string" || !/^\d{6}$/.test(x))
  )
    throw new AIError("invalid_request", 400);
  if (
    !Array.isArray(amcs) ||
    amcs.length > 4 ||
    amcs.some((x) => !string(x, 120))
  )
    throw new AIError("invalid_request", 400);
  if (
    (c.type === "fund" && codes.length !== 1) ||
    (c.type === "amc" && amcs.length !== 1) ||
    (c.type === "comparison" && !codes.length && !amcs.length) ||
    (codes.length && amcs.length)
  )
    throw new AIError("invalid_request", 400);
  // Pick fields explicitly: client evidence, system prompts, model overrides and arbitrary URLs are discarded.
  return {
    message: raw.message.trim(),
    history: history.map((h) => ({ role: h.role, content: h.content.trim() })),
    pageContext: {
      type: c.type,
      codes: [...new Set(codes)],
      amcs: [...new Set(amcs)],
    },
  };
}
export async function readRequest(request) {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new AIError("invalid_request", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new AIError("invalid_request", 400);
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > LIMITS.body) {
        await reader.cancel();
        throw new AIError("request_too_large", 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.byteLength;
    }
    return validateRequest(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    );
  } catch (e) {
    if (e instanceof AIError) throw e;
    throw new AIError("invalid_request", 400);
  } finally {
    reader.releaseLock();
  }
}
export function freshness(asOf, now = Date.now()) {
  const days = Math.floor((now - Date.parse(`${asOf}T00:00:00Z`)) / 86400000);
  return !Number.isFinite(days) || days < 0
    ? "unknown"
    : days > 7
      ? "stale"
      : days > 2
        ? "delayed"
        : "recent";
}
export function boundEvidence(items) {
  const result = [];
  let size = 2;
  for (const item of items) {
    if (!item.text || item.text.length > 3500) continue;
    const e = {
      ...item,
      id: `MF-${String(result.length + 1).padStart(3, "0")}`,
    };
    const n = JSON.stringify(e).length + 1;
    if (result.length === LIMITS.evidence || size + n > LIMITS.context) break;
    result.push(e);
    size += n;
  }
  return result;
}
export function safetyReply(message) {
  if (
    /\b(api.?key|system prompt|environment variables|ignore (all|previous)|bypass|fabricate|make up (numbers|returns))\b/i.test(
      message,
    )
  )
    return "Pulse AI cannot reveal private configuration or override its evidence rules. Ask about MF Pulse data or methodology.";
  if (
    /\b(buy|sell|invest|allocate)\b.*\b(for me|my money|my savings|my portfolio)\b|guarantee.*return|execute.*trade/i.test(
      message,
    )
  )
    return "Pulse AI cannot decide what you should buy, guarantee returns, or execute trades. I can explain the available fund comparisons, historical performance and risk measures for research.";
  return null;
}
// IDs are request-local. Reject the whole answer instead of laundering unknown citations.
export function validateAnswer(answer, evidence) {
  if (
    typeof answer !== "string" ||
    !answer.trim() ||
    answer.length > LIMITS.answer
  )
    throw new AIError("invalid_answer", 502);
  if (
    /https?:\/\/|<[^>]+>|\bsk-[a-z0-9_-]{8,}|\bguaranteed?\s+(returns?|profit|to (rise|fall))|\byou should (buy|sell|invest)/i.test(
      answer,
    )
  )
    throw new AIError("invalid_answer", 502);
  const citations = [...answer.matchAll(/\[(MF-[^\]]+)\]/g)].map((m) => m[1]);
  const supplied = new Map(evidence.map((e) => [e.id, e]));
  if (!citations.length || citations.some((id) => !supplied.has(id)))
    throw new AIError("invalid_answer", 502);
  // Each paragraph needs support; numerical tokens must occur in that paragraph's cited evidence.
  // This is a conservative consistency check, not semantic proof that a claim follows from a source.
  const numbers = (s) =>
    (s.replace(/\[MF-[^\]]+\]/g, "").match(/-?\d+(?:\.\d+)?/g) || []).map((n) =>
      String(Number(n)),
    );
  for (const paragraph of answer.trim().split(/\n\s*\n/)) {
    const ids = [...paragraph.matchAll(/\[(MF-[^\]]+)\]/g)].map((m) => m[1]);
    if (!ids.length) throw new AIError("invalid_answer", 502);
    const support = ids.map((id) => supplied.get(id));
    const known = new Set(
      numbers(support.map((e) => `${e.asOf || ""} ${e.text}`).join(" ")),
    );
    if (numbers(paragraph).some((n) => !known.has(n)))
      throw new AIError("invalid_answer", 502);
  }
  return [...new Set(citations)].map((id) => supplied.get(id));
}
export function safeError(error) {
  const code = error instanceof AIError ? error.code : "unavailable";
  const messages = {
    invalid_request:
      "Please send a valid question and select supported fund or AMC context.",
    request_too_large:
      "This conversation is too long. Start a new conversation.",
    rate_limit:
      "Pulse AI has reached its request limit. Please try again in a minute.",
    invalid_answer:
      "Pulse AI could not verify this explanation. Please retry or inspect the underlying evidence.",
  };
  return {
    code,
    error:
      messages[code] ||
      "Pulse AI is temporarily unavailable. MF Pulse’s underlying market data is still available.",
    status: error instanceof AIError ? error.status : 503,
  };
}
