import { Manrope, IBM_Plex_Mono } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import "./globals.css";
import SentryInit from "./components/SentryInit";
import PageView from "./components/PageView";
import SyncPrompt from "./components/SyncPrompt";
import AuthGate from "./components/AuthGate";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-research-sans", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-research-mono", display: "swap" });

const SITE = "https://mf-pulse.vercel.app";
const DESC =
  "Compare Indian mutual funds with AMFI-backed returns, rolling performance, volatility, drawdown, Sharpe and Sortino ratios, expense ratios, AMC research and explainable portfolio health.";

export const metadata = {
  metadataBase: new URL(SITE),
  title: { default: "MF Pulse — India mutual fund performance intelligence", template: "%s · MF Pulse" },
  description: DESC,
  keywords: ["compare mutual funds India", "best mutual funds research", "mutual fund rolling returns", "XIRR", "CAGR", "Sharpe ratio", "Sortino ratio", "expense ratio", "portfolio overlap", "portfolio health", "NFO analysis", "AMC rankings", "AMFI NAV"],
  openGraph: { title: "MF Pulse — Evidence-led mutual fund research", description: DESC, url: SITE, siteName: "MF Pulse", type: "website", locale: "en_IN", images: [{ url: "/mf-pulse-research-preview.png", width: 1732, height: 909, alt: "MF Pulse fund comparison, risk and return, and portfolio allocation research visuals" }] },
  twitter: { card: "summary_large_image", title: "MF Pulse", description: DESC, images: ["/mf-pulse-research-preview.png"] },
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
