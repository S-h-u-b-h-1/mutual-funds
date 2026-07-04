"use client";
import EChart from "./ui/EChart";

// Rolling 12-month return line chart — answers "has this fund's trailing-year return been
// consistent or volatile over time", a real institutional question a single point-in-time 1Y
// return figure can't answer on its own.
export default function RollingReturnChart({ points }) {
  if (!points?.length) return null;
  const option = {
    grid: { left: 48, right: 16, top: 16, bottom: 28 },
    xAxis: { type: "category", data: points.map((p) => p.t), axisLabel: { color: "#5b6577", fontSize: 10 } },
    yAxis: { type: "value", axisLabel: { formatter: "{value}%", color: "#5b6577", fontSize: 10 }, splitLine: { lineStyle: { color: "#1a2030" } } },
    tooltip: { trigger: "axis", valueFormatter: (v) => `${v >= 0 ? "+" : ""}${v}%` },
    series: [
      {
        type: "line",
        data: points.map((p) => p.return),
        showSymbol: false,
        lineStyle: { color: "#7dd3a8", width: 1.5 },
        areaStyle: { color: "rgba(125,211,168,0.08)" },
        markLine: { silent: true, symbol: "none", lineStyle: { color: "#5b6577", type: "dashed" }, data: [{ yAxis: 0 }] },
      },
    ],
  };
  return <EChart option={option} height={220} />;
}
