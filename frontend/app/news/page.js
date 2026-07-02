import { getRecentArticles, getIngestionRuns } from "../lib/news";
import { newsStatus } from "../lib/newsStatus";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import GlassPanel from "../components/ui/GlassPanel";
import NewsClient from "../components/NewsClient";

export const metadata = { title: "Market News Intelligence" };
export const revalidate = 300;

export default async function News() {
  let articles = [];
  let runs = [];
  try {
    [articles, runs] = await Promise.all([
      getRecentArticles({ limit: 120 }),
      getIngestionRuns({ limit: 20 }),
    ]);
  } catch {
    articles = [];
    runs = [];
  }

  const status = newsStatus(runs);

  // "Sources active" = distinct sources with at least one successful ingestion run in the
  // fetched run history — a real, traceable count from news_ingestion_runs, not a guess.
  const activeSources = new Set(
    runs.filter((r) => r.status === "success" && r.news_sources?.name).map((r) => r.news_sources.name)
  ).size;

  const lastFetchedLabel = status.lastSuccessAt
    ? new Date(status.lastSuccessAt).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }) + " IST"
    : "never";

  return (
    <>
      <Nav active="/news" />
      <main className="container-px py-10">
        <h1 className="text-[28px] sm:text-[34px] font-bold tracking-tightest text-ink">
          Indian Market News Intelligence
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-muted">
          Verified financial news, regulatory updates, and market-moving events mapped to mutual fund
          relevance.
        </p>

        <GlassPanel className="mt-6 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.09em] text-ink-faint">
                Last fetched
              </div>
              <div className="mt-1 text-[14px] font-semibold tnum text-ink">{lastFetchedLabel}</div>
            </div>
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.09em] text-ink-faint">
                Sources active
              </div>
              <div className="mt-1 text-[14px] font-semibold tnum text-ink">{activeSources}</div>
            </div>
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.09em] text-ink-faint">
                Ingestion status
              </div>
              <div
                className={`mt-1 text-[14px] font-semibold ${
                  status.tone === "pos" ? "text-pos" : status.tone === "warn" ? "text-warn" : "text-neg"
                }`}
              >
                {status.isLive ? "Live" : status.tone === "warn" ? "Delayed" : "Not running"}
              </div>
            </div>
          </div>
          {status.tone !== "pos" && (
            <p
              className={`mt-3 text-[12px] leading-relaxed ${
                status.tone === "warn" ? "text-warn" : "text-neg"
              }`}
            >
              {status.label}
            </p>
          )}
        </GlassPanel>

        <div className="mt-8">
          <NewsClient articles={articles} runs={runs} />
        </div>
      </main>
      <Footer
        note={
          <span>
            News from RBI, SEBI, Economic Times, Mint, CNBC-TV18 · classification is rule-based, not
            AI-generated · see /methodology
          </span>
        }
      />
    </>
  );
}
