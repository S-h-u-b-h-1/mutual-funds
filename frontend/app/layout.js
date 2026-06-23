import { Inter } from "next/font/google";
import "./globals.css";
import SentryInit from "./components/SentryInit";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

const SITE = "https://frontend-six-beta-20.vercel.app";
const DESC =
  "Daily Indian mutual-fund flows, NAVs and AMC analytics from free public AMFI data — track equity & debt flows, drill into any AMC, and build a watchlist.";

export const metadata = {
  metadataBase: new URL(SITE),
  title: { default: "MF Pulse — India mutual fund flows & NAVs", template: "%s · MF Pulse" },
  description: DESC,
  keywords: ["mutual funds", "India", "AMFI", "NAV", "fund flows", "SIP", "AMC", "equity flows"],
  openGraph: { title: "MF Pulse — India mutual fund flows & NAVs", description: DESC, url: SITE, siteName: "MF Pulse", type: "website", locale: "en_IN" },
  twitter: { card: "summary_large_image", title: "MF Pulse", description: DESC },
  robots: { index: true, follow: true },
};

export const viewport = { themeColor: "#080b14" };

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <body><SentryInit />{children}</body>
    </html>
  );
}
