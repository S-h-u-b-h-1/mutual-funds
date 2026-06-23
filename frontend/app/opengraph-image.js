import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "MF Pulse — India mutual fund flows & NAVs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #080b14 0%, #0f1524 60%, #11261f 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "18px", marginBottom: "28px" }}>
          <div style={{ width: "22px", height: "22px", borderRadius: "50%", background: "#34d399" }} />
          <div style={{ fontSize: "38px", color: "#97a1b8", fontWeight: 600 }}>MF Pulse · Live</div>
        </div>
        <div style={{ fontSize: "76px", color: "#eef1f8", fontWeight: 800, lineHeight: 1.05, letterSpacing: "-2px" }}>
          Where India's mutual-fund
        </div>
        <div style={{ fontSize: "76px", color: "#34d399", fontWeight: 800, lineHeight: 1.05, letterSpacing: "-2px" }}>
          money moved today
        </div>
        <div style={{ display: "flex", gap: "16px", marginTop: "44px" }}>
          {["14,219 schemes", "51 AMCs", "Daily NAV + flows"].map((t) => (
            <div
              key={t}
              style={{
                display: "flex",
                fontSize: "26px",
                color: "#c7cedd",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "999px",
                padding: "12px 26px",
              }}
            >
              {t}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
