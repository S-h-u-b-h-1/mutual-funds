import Nav from "../components/Nav";
import Footer from "../components/Footer";
import PulseAIChat from "../components/ai/PulseAIChat";
import { providerConfig } from "../lib/ai/provider.mjs";
import { validateRequest } from "../lib/ai/safety.mjs";
import daily from "../data/daily.json";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Pulse AI Advisor — Personalised fund research",
  robots: { index: false, follow: true },
};
export default function PulseAIPage({ searchParams = {} }) {
  const arr = (value) =>
    value == null ? [] : Array.isArray(value) ? value : [value];
  let initialContext = { type: "market", codes: [], amcs: [] };
  try {
    initialContext = validateRequest({
      message: "research",
      pageContext: {
        type: searchParams.type || "market",
        codes: arr(searchParams.code),
        amcs: arr(searchParams.amc),
      },
    }).pageContext;
  } catch {}
  let availability = true;
  try {
    providerConfig();
  } catch {
    availability = false;
  }
  const prompts = {
    fund: "Explain this fund’s recent performance.",
    comparison: "Explain this comparison.",
    signal: "Explain the strongest flow signal.",
    amc: "Explain this AMC’s recent performance.",
    profile: "What fund research fits my saved profile?",
    portfolio: "What deserves attention in my portfolio?",
  };
  return (
    <>
      <Nav active="/ai" />
      <main className="container-px py-8 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-soft">
              MF Pulse · Advisor agent
            </div>
            <h1 className="mt-2 text-[32px] font-bold tracking-tightest text-ink sm:text-[40px]">
              Pulse AI
            </h1>
            <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-muted">
              Profile-aware fund insights, portfolio reviews and updates grounded in MF Pulse data.
            </p>
          </div>
          <span className="rounded-full border border-line px-3 py-1.5 text-xs text-ink-muted">
            {initialContext.type === "market"
              ? "Market research"
              : `${initialContext.type} context`}
          </span>
        </div>
        <PulseAIChat
          initialContext={initialContext}
          initialPrompt={prompts[initialContext.type]}
          availability={availability}
          snapshotDate={daily.asOf}
        />
      </main>
      <Footer note="For research/education only — not investment advice. MF Pulse calculations remain the source of truth." />
    </>
  );
}
