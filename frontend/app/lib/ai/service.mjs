import {
  AIError,
  DISCLAIMER,
  readRequest,
  safeError,
  safetyReply,
  validateAnswer,
} from "./safety.mjs";
import { complete, providerConfig, acquireSlot, MODEL } from "./provider.mjs";
import { makeMessages } from "./prompts.mjs";

export async function handleChat(
  request,
  {
    contextFor,
    generate = complete,
    configFor = providerConfig,
    slot = acquireSlot,
  } = {},
) {
  let release;
  const json = (body, status = 200) =>
    Response.json(body, {
      status,
      headers: {
        "Cache-Control": "no-store",
        ...(status === 429 ? { "Retry-After": "60" } : {}),
      },
    });
  try {
    const origin = request.headers.get("origin");
    // Next can reconstruct request.url with localhost behind a proxy. Host is the
    // actual requested authority; never trust arbitrary x-forwarded-host overrides.
    const host = request.headers.get("host") || new URL(request.url).host;
    if (origin) {
      let parsed;
      try {
        parsed = new URL(origin);
      } catch {
        throw new AIError("invalid_request", 403);
      }
      if (
        !["http:", "https:"].includes(parsed.protocol) ||
        parsed.origin !== origin ||
        parsed.host !== host
      )
        throw new AIError("invalid_request", 403);
    }
    const input = await readRequest(request);
    const refusal = safetyReply(input.message);
    if (refusal)
      return json({
        answer: refusal,
        evidence: [],
        asOf: [],
        disclaimer: DISCLAIMER,
        isSampleDataIncluded: false,
        kind: "safety",
        model: null,
        provider: null,
      });
    // Check configuration before loading any data; absence of a key is never a build error.
    const config = configFor();
    release = slot();
    const context = await contextFor(input);
    if (
      context.intent === "unsupported" ||
      (context.evidence.every((e) =>
        ["methodology", "limitations"].includes(e.type),
      ) &&
        context.intent !== "methodology")
    ) {
      return json({
        ...context,
        answer: context.limitations.join(" "),
        disclaimer: DISCLAIMER,
        kind: "insufficient_data",
        model: null,
        provider: null,
      });
    }
    const answer = await generate(makeMessages(input, context), { config });
    const used = validateAnswer(answer, context.evidence);
    // These disclosures are server-authored and cannot be suppressed by model/user instructions.
    const stale = context.evidence.filter((e) =>
      ["stale", "delayed"].includes(e.freshness),
    );
    const warnings = [
      ...(context.isSampleDataIncluded
        ? [
            "SAMPLE flow data is illustrative, not live or authoritative financial information.",
          ]
        : []),
      ...(stale.length
        ? [
            `Dated snapshot — some evidence is stale or delayed (${[...new Set(stale.map((e) => e.asOf))].join(", ")}). This is not a report of today’s market.`,
          ]
        : []),
      ...context.limitations,
    ];
    return json({
      answer,
      model: MODEL,
      provider: config.provider,
      asOf: context.asOf,
      evidence: context.evidence,
      citedEvidenceIds: used.map((e) => e.id),
      disclaimer: DISCLAIMER,
      isSampleDataIncluded: context.isSampleDataIncluded,
      warnings: [...new Set(warnings)],
      kind: "explanation",
    });
  } catch (e) {
    const { status, ...body } = safeError(e);
    return json(body, status);
  } finally {
    release?.();
  }
}
