"use client";
// Thin ECharts wrapper (Phase 8 — terminal sprint's own explicit instruction: use a dedicated
// charting library for analytical charts, reserve Three.js for immersive/structural visuals).
// Client-only by construction (ECharts needs a real DOM) — import this component with
// next/dynamic({ssr:false}) at the call site so it never ships in the initial server bundle.
import { useEffect, useRef } from "react";

export default function EChart({ option, height = 360, onEvents }) {
  const ref = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    let disposed = false;
    import("echarts").then((echarts) => {
      if (disposed || !ref.current) return;
      const chart = echarts.init(ref.current, null, { renderer: "canvas" });
      chartRef.current = chart;
      chart.setOption(option);
      if (onEvents) {
        for (const [name, handler] of Object.entries(onEvents)) chart.on(name, handler);
      }
      const resize = () => chart.resize();
      window.addEventListener("resize", resize);
      chart.__resize = resize;
    });
    return () => {
      disposed = true;
      if (chartRef.current) {
        window.removeEventListener("resize", chartRef.current.__resize);
        chartRef.current.dispose();
        chartRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (chartRef.current) chartRef.current.setOption(option, true);
  }, [option]);

  return <div ref={ref} style={{ width: "100%", height }} />;
}
