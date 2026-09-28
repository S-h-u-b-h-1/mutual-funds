import { AIError } from "./safety.mjs";
export const MODEL = "inclusionai/ling-3.0-flash-fin";
export const BASE_URL = "https://openrouter.ai/api/v1";
export const PROVIDER = "OpenRouter";
export function providerConfig(env = process.env) {
  if (env.AI_FEATURE_ENABLED !== "true") throw new AIError("disabled");
  if (!env.OPENROUTER_API_KEY?.trim()) throw new AIError("missing_key");
  if (
    (env.OPENROUTER_MODEL || MODEL) !== MODEL ||
    (env.OPENROUTER_BASE_URL || BASE_URL).replace(/\/$/, "") !== BASE_URL
  )
    throw new AIError("unapproved_provider");
  return {
    model: MODEL,
    baseURL: BASE_URL,
    key: env.OPENROUTER_API_KEY.trim(),
    provider: PROVIDER,
  };
}
export async function complete(
  messages,
  { config = providerConfig(), fetcher = fetch } = {},
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 24000);
  try {
    const response = await fetcher(`${config.baseURL}/chat/completions`, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.key}`,
        "HTTP-Referer": "https://mf-pulse.vercel.app",
        "X-Title": "MF Pulse",
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: false,
        reasoning: { enabled: false },
        max_tokens: 600,
        temperature: 0.1,
      }),
    });
    if (!response.ok)
      throw new AIError(
        response.status === 429
          ? "rate_limit"
          : response.status === 401 || response.status === 403
            ? "provider_access"
            : "provider_error",
        response.status === 429 ? 429 : 503,
      );
    // Bound provider response bytes too, including any accidental reasoning payload.
    const reader = response.body.getReader();
    const parts = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 64000) {
          await reader.cancel();
          throw new AIError("invalid_answer", 502);
        }
        parts.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const p of parts) {
      bytes.set(p, offset);
      offset += p.byteLength;
    }
    const data = JSON.parse(new TextDecoder().decode(bytes));
    const choice = data?.choices?.[0];
    if (
      choice?.finish_reason !== "stop" ||
      typeof choice.message?.content !== "string" ||
      !choice.message.content.trim() ||
      choice.message.tool_calls
    )
      throw new AIError("invalid_answer", 502);
    return choice.message.content.trim();
  } catch (e) {
    if (e instanceof AIError) throw e;
    throw new AIError(controller.signal.aborted ? "timeout" : "provider_error");
  } finally {
    clearTimeout(timer);
  }
}
// Process-local load guard: bounded, no IP/question storage. Not a distributed abuse barrier.
let windowStart = 0,
  count = 0,
  active = 0;
export function acquireSlot(now = Date.now()) {
  if (now - windowStart >= 60000) {
    count = 0;
    windowStart = now;
  }
  if (count >= 12 || active >= 2) throw new AIError("rate_limit", 429);
  count++;
  active++;
  let released = false;
  return () => {
    if (!released) {
      active--;
      released = true;
    }
  };
}
