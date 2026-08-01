import { Manrope, IBM_Plex_Mono } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import "./globals.css";
import SentryInit from "./components/SentryInit";
import PageView from "./components/PageView";
import SyncPrompt from "./components/SyncPrompt";
import AuthGate from "./components/AuthGate";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-research-sans", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-research-mono", display: "swap" });

const SITE = "https://frontend-six-beta-20.vercel.app";
const DESC =
  "Mutual fund performance intelligence for India — real 1-week to 1-year NAV returns, AMC quality rankings, and category leadership across 1,200+ equity funds, from daily AMFI data.";

export const metadata = {
  metadataBase: new URL(SITE),
  title: { default: "MF Pulse — India mutual fund performance intelligence", template: "%s · MF Pulse" },
  description: DESC,
  keywords: ["mutual funds", "India", "AMFI", "NAV", "fund performance", "fund returns", "best mutual funds", "AMC rankings"],
  openGraph: { title: "MF Pulse — Mutual fund performance intelligence", description: DESC, url: SITE, siteName: "MF Pulse", type: "website", locale: "en_IN" },
  twitter: { card: "summary_large_image", title: "MF Pulse", description: DESC },
  robots: { index: true, follow: true },
};

export const viewport = { themeColor: [
  { media: "(prefers-color-scheme: light)", color: "#f6f4ee" },
  { media: "(prefers-color-scheme: dark)", color: "#10191a" },
] };

const themeScript = `(() => { try { const saved = localStorage.getItem('mfp-theme'); const system = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; document.documentElement.dataset.theme = saved || system; } catch (_) { document.documentElement.dataset.theme = 'light'; } })()`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${manrope.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        <a href="#app-content" className="skip-link">Skip to main content</a>
        <SessionProvider>
          <SentryInit />
          <PageView />
          <div id="app-content" tabIndex={-1}>
            <AuthGate>{children}</AuthGate>
          </div>
          <SyncPrompt />
        </SessionProvider>
      </body>
    </html>
  );
}
