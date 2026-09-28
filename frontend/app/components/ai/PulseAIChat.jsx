"use client";
import { useEffect, useRef, useState } from "react";
import { track } from "../../lib/track";
import AIMessage from "./AIMessage";

const MARKET_PROMPTS = [
  "What deserves attention today?",
  "Explain today’s risk regime.",
  "Which categories have the strongest 1-month momentum?",
  "Explain the market breadth.",
  "Explain the strongest flow signal.",
  "How should I compare two mutual funds?",
];
export default function PulseAIChat({
  initialContext,
  initialPrompt,
  availability,
  snapshotDate,
}) {
  const [draft, setDraft] = useState(initialPrompt || "");
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [lastRequest, setLastRequest] = useState(null);
  const lock = useRef(false),
    input = useRef(null),
    controller = useRef(null);
  const contextType = initialContext.type;
  const prompts =
    contextType === "profile"
      ? [
          "What fund research fits my saved profile?",
          "Explain my risk profile and its trade-offs.",
          "Show the evidence behind my fund shortlist.",
        ]
      : contextType === "portfolio"
        ? [
            "What deserves attention in my portfolio?",
            "Explain my portfolio strengths and weaknesses.",
            "How does my portfolio compare with my saved profile?",
          ]
        : contextType === "fund"
      ? [
          "Explain this fund’s recent performance.",
          "Compare recent vs longer-term momentum.",
          "What risk measures are available for this fund?",
        ]
      : contextType === "comparison"
        ? [
            "Explain this comparison.",
            "What are the limitations of this comparison?",
            "Which metrics should I look at?",
          ]
        : contextType === "signal"
          ? [
              "Explain the strongest flow signal.",
              "Why is this flow data labelled sample?",
            ]
          : MARKET_PROMPTS;
  useEffect(() => {
    track("ai_open", { page: "/ai", contextType });
    return () => controller.current?.abort();
  }, [contextType]);
  async function submit(question, retry = false) {
    const message = question.trim();
    if (!message || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    const history =
      retry && lastRequest
        ? lastRequest.history
        : messages
            .slice(-6)
            .map((m) => ({
              role: m.role,
              content: (m.content || m.result?.answer || "").slice(0, 1800),
            }));
    const payload = { message, history, pageContext: initialContext };
    setLastRequest(payload);
    if (!retry) {
      setMessages((prev) => [...prev, { role: "user", content: message }]);
      setDraft("");
    }
    track("ai_question", { page: "/ai", contextType });
    if (contextType === "fund")
      track("ai_context_fund", { page: "/ai", contextType });
    const abort = new AbortController();
    controller.current = abort;
    const timer = setTimeout(() => abort.abort(), 28000);
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: abort.signal,
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Pulse AI is temporarily unavailable.");
        track("ai_error", {
          page: "/ai",
          contextType,
          code: data.code || "unavailable",
        });
      } else
        setMessages((prev) => [...prev, { role: "assistant", result: data }]);
    } catch {
      setError(
        "Pulse AI could not complete this request. Please retry. The underlying market data is still available.",
      );
      track("ai_error", {
        page: "/ai",
        contextType,
        code: "network_or_timeout",
      });
    } finally {
      clearTimeout(timer);
      lock.current = false;
      setBusy(false);
      input.current?.focus();
    }
  }
  return (
    <div className="mt-7 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
      <section className="min-w-0" aria-label="Pulse AI conversation">
        {!availability && (
          <div
            role="status"
            className="mb-4 rounded-xl border border-warn/30 bg-warn/[0.05] p-4 text-sm text-warn"
          >
            Pulse AI is awaiting provider setup or a fresh free-pricing check.
            You can still explore{" "}
            <a className="underline" href="/performance">
              fund performance
            </a>{" "}
            and{" "}
            <a className="underline" href="/brief">
              the deterministic brief
            </a>
            .
          </div>
        )}
        <div
          role="log"
          aria-label="Research conversation"
          aria-live="polite"
          aria-relevant="additions"
          className="space-y-4"
        >
          {messages.length === 0 && (
            <div className="glass p-6 sm:p-8">
              <span className="text-2xl text-accent-soft" aria-hidden>
                ✦
              </span>
              <h2 className="mt-4 text-xl font-semibold tracking-tight text-ink">
                Your finance research advisor, grounded in evidence.
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-muted">
                Ask about your saved profile, portfolio, fund insights or market
                updates. Each explanation includes its evidence, source dates
                and limitations.
              </p>
              <div className="mt-5 flex flex-wrap gap-2 text-[11px] text-ink-muted">
                <span className="rounded-full border border-line px-3 py-1.5">
                  AMFI NAV observations
                </span>
                <span className="rounded-full border border-line px-3 py-1.5">
                  MF Pulse calculations
                </span>
                <span className="rounded-full border border-line px-3 py-1.5">
                  Cited AI explanations
                </span>
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <AIMessage key={i} message={m} index={i} />
          ))}
        </div>
        {busy && (
          <p
            role="status"
            className="mt-4 rounded-lg border border-accent/25 p-4 text-sm text-accent-soft"
          >
            Retrieving MF Pulse evidence and checking an explanation…
          </p>
        )}
        {error && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-warn/30 bg-warn/[0.05] p-4 text-sm"
          >
            <p className="text-warn">{error}</p>
            <div className="mt-3 flex gap-4">
              <button
                type="button"
                disabled={busy}
                onClick={() => submit(lastRequest.message, true)}
                className="text-accent-soft underline"
              >
                Retry question
              </button>
              <a href="/data-status" className="text-ink-muted underline">
                Check data status
              </a>
            </div>
          </div>
        )}
        <form
          className="mt-5 glass p-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit(draft);
          }}
        >
          <label
            htmlFor="pulse-question"
            className="text-xs font-semibold text-ink-muted"
          >
            Your research question
          </label>
          <textarea
            id="pulse-question"
            ref={input}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={1800}
            rows={3}
            placeholder="Ask about MF Pulse data…"
            aria-describedby="pulse-privacy"
            className="mt-2 block w-full resize-y rounded-lg border border-line bg-bg/60 p-3 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              disabled={busy || !messages.length}
              onClick={() => {
                setMessages([]);
                setError(null);
                setLastRequest(null);
                setDraft("");
                input.current?.focus();
              }}
              className="text-xs text-ink-muted underline disabled:opacity-40"
            >
              New conversation
            </button>
            <button
              type="submit"
              disabled={busy || !draft.trim() || !availability}
              className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-40"
            >
              {busy ? "Checking evidence…" : "Ask Pulse AI →"}
            </button>
          </div>
          <p
            id="pulse-privacy"
            className="mt-3 text-[11px] leading-relaxed text-ink-muted"
          >
            Your question, recent conversation and a de-identified summary of
            your saved profile or portfolio may be sent to SiliconFlow. Names,
            email, folios, balances and transaction amounts are excluded.
            Conversations are kept in this tab only.
          </p>
        </form>
      </section>
      <aside className="space-y-4 lg:sticky lg:top-20">
        <div className="glass p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Start with a question
          </h2>
          <div className="mt-3 space-y-2">
            {prompts.map((p, i) => (
              <button
                key={p}
                type="button"
                disabled={busy}
                onClick={() => {
                  setDraft(p);
                  input.current?.focus();
                  track("ai_suggested_prompt", {
                    page: "/ai",
                    contextType,
                    promptIndex: i,
                  });
                }}
                className="block w-full rounded-lg border border-line p-3 text-left text-[13px] leading-relaxed text-ink-muted transition-colors hover:border-accent/40 hover:text-ink disabled:opacity-40"
              >
                {p} <span className="text-accent-soft">↗</span>
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-line p-5 text-xs leading-relaxed text-ink-muted">
          <h2 className="font-semibold text-ink">Research, with boundaries</h2>
          <p className="mt-2">
            Analytics snapshot: <b className="tnum">{snapshotDate}</b>.
            Freshness is checked for every answer; older data is never presented
            as today’s market.
          </p>
          <p className="mt-3">
            Flow signals use <span className="text-warn">SAMPLE</span> data.
            Missing facts stay missing. AI explanations do not replace
            deterministic calculations.
          </p>
          <a href="/methodology" className="mt-3 inline-block text-accent-soft">
            Read the methodology →
          </a>
        </div>
      </aside>
    </div>
  );
}
