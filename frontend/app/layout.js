import { Inter } from "next/font/google";
import "./globals.css";
import SentryInit from "./components/SentryInit";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

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

export const viewport = { themeColor: "#080b14" };

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <body><SentryInit />{children}</body>
    </html>
  );
}
