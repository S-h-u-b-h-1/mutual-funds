"use client";
import EChart from "./ui/EChart";
import { track } from "../lib/track";

// Diverging red→green on real 1-month return, same visual language as the rest of the app
// (text-pos/text-neg convention) — not a decorative palette.
function colorFor(v) {
  if (v == null) return "#5b6577";
  const clamped = Math.max(-8, Math.min(8, v));
  const t = (clamped + 8) / 16; // 0 (red) .. 1 (green)
  const r = Math.round(248 - t * (248 - 52));
  const g = Math.round(113 + t * (211 - 113));
  const b = Math.round(113 + t * (153 - 113));
  return `rgb(${r},${g},${b})`;
}

function colorLevel(node) {
  return { itemStyle: { color: colorFor(node.avg1m ?? node.r1m) } };
}

function paint(node) {
  const out = { ...node, ...colorLevel(node) };
  if (node.children) out.children = node.children.map(paint);
  return out;
}

export default function MarketMapChart({ data }) {
  const painted = paint(data);

  const option = {
    tooltip: {
      formatter: (info) => {
        const d = info.data;
        const ret = d.avg1m ?? d.r1m;
        const retStr = ret != null ? `${ret >= 0 ? "+" : ""}${ret.toFixed(2)}%` : "—";
        return `<b>${info.name}</b><br/>${d.code ? "Fund" : d.value + " schemes"} · 1M return: ${retStr}`;
      },
    },
    series: [
      {
        type: "treemap",
        roam: false,
        nodeClick: "zoomToNode",
        breadcrumb: { show: true },
        label: { show: true, formatter: "{b}", color: "#0b0f19", fontSize: 11 },
        upperLabel: { show: true, height: 24, color: "#fff" },
        itemStyle: { borderColor: "#080b14", borderWidth: 1, gapWidth: 1 },
        levels: [
          { itemStyle: { borderWidth: 0, gapWidth: 2 } },
          { itemStyle: { borderWidth: 2, gapWidth: 1 } },
          { itemStyle: { borderWidth: 1, gapWidth: 0.5 } },
        ],
        data: painted.children,
      },
    ],
  };

  function onClick(params) {
    if (params.data?.code) {
      track("market_map_fund_click", { code: params.data.code });
      window.location.href = `/fund/${params.data.code}`;
    }
  }

  return <EChart option={option} height={560} onEvents={{ click: onClick }} />;
}
