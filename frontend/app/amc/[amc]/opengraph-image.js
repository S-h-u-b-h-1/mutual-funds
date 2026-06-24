import { ImageResponse } from "next/og";
import trendData from "../../data/amc_trend.json";

export const runtime = "edge";
export const alt = "MF Pulse — AMC fund-flow card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG({ params }) {
  const amc = decodeURIComponent(params.amc);
  const name = amc.replace(" Mutual Fund", "");
  const pts = trendData.amcs[amc];
  const change = pts ? pts[pts.length - 1][1] - pts[0][1] : null;
  const up = change == null ? true : change >= 0;
  const color = change == null ? "#818cf8" : up ? "#34d399" : "#f87171";
  const metric = change == null ? "Fund-flow intelligence" : `${up ? "+" : ""}${change.toFixed(2)} · 30-day equity index`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "linear-gradient(135deg, #06080f 0%, #0c1322 62%, #10231d 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ width: "20px", height: "20px", borderRadius: "50%", background: "#34d399" }} />
          <div style={{ fontSize: "32px", color: "#97a1b8", fontWeight: 600 }}>MF Pulse · Flow Intelligence</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: "30px", color: "#5b6577", fontWeight: 600, marginBottom: "12px" }}>Asset Management Company</div>
          <div style={{ fontSize: name.length > 22 ? "64px" : "78px", color: "#e9edf6", fontWeight: 800, lineHeight: 1.04, letterSpacing: "-2px" }}>{name}</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", fontSize: "40px", fontWeight: 700, color }}>
            <span>{change == null ? "" : up ? "▲" : "▼"}</span>
            <span>{metric}</span>
          </div>
          <div style={{ fontSize: "24px", color: "#5b6577" }}>data © AMFI</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
