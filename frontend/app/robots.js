import { siteUrl } from "./lib/siteUrl";
const SITE = siteUrl();

export default function robots() {
  return {
    rules: process.env.VERCEL_ENV === "preview" ? { userAgent: "*", disallow: "/" } : { userAgent: "*", allow: "/", disallow: ["/invest", "/portfolio", "/profile", "/internal", "/management", "/operations"] },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
