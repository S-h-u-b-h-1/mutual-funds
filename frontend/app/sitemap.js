import trendData from "./data/amc_trend.json";

const SITE = "https://frontend-six-beta-20.vercel.app";

export default function sitemap() {
  const amcs = Object.keys(trendData.amcs).map((a) => ({
    url: `${SITE}/amc/${encodeURIComponent(a)}`,
    changeFrequency: "daily",
    priority: 0.7,
  }));
  const pages = ["/performance", "/categories", "/research", "/compare", "/data-quality"].map((p) => ({
    url: `${SITE}${p}`,
    changeFrequency: "daily",
    priority: 0.8,
  }));
  return [{ url: SITE, changeFrequency: "daily", priority: 1 }, ...pages, ...amcs];
}
