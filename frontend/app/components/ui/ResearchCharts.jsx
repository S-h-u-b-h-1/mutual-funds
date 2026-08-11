"use client";

import { useMemo } from "react";
import EChart from "./EChart";

const COLORS = ["#70d6bd", "#4bb69f", "#2f8277", "#7fae9b", "#486b67", "#d6a542", "#8b9aa0"];
const GRID = "rgba(128, 155, 157, 0.16)";
const MUTED = "#829396";
const INK = "#dce8e6";

const n = (value) => Number(value);
const finite = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(n(value));
const pct = (value, digits = 1) => `${n(value).toFixed(digits)}%`;

function EmptyVisual({ children }) {
  return <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-line bg-surface-2/60 p-6 text-center text-sm leading-6 text-ink-muted">{children}</div>;
}

export function AllocationDonut({ items = [], centerLabel = "Allocation", centerValue, height = 250 }) {
  const rows = useMemo(() => items
    .map((item) => ({ name: item.name || item.label || "Unlabelled", value: n(item.weight ?? item.value) }))
    .filter((item) => Number.isFinite(item.value) && item.value > 0)
    .sort((a, b) => b.value - a.value), [items]);

  const total = rows.reduce((sum, item) => sum + item.value, 0);
  const displayValue = centerValue || (total > 0 ? `${Math.round(total)}%` : "—");
  const option = useMemo(() => ({
    animationDuration: 650,
    color: COLORS,
    tooltip: {
      trigger: "item",
      renderMode: "richText",
      backgroundColor: "#0d1b20",
      borderColor: "#2b464b",
      textStyle: { color: INK, fontSize: 12 },
      formatter: ({ name, value, percent }) => `${name}\n${pct(value)} · ${percent}% of shown mix`,
    },
    series: [{
      type: "pie",
      radius: ["57%", "80%"],
      center: ["50%", "50%"],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: "#0b171c", borderWidth: 3, borderRadius: 5 },
      label: { show: false },
      emphasis: { scale: true, scaleSize: 5 },
      data: rows,
    }],
    graphic: [{
      type: "group",
      left: "center",
      top: "middle",
      children: [
        { type: "text", style: { text: displayValue, fill: INK, font: "600 22px system-ui", textAlign: "center", x: 0, y: -8 } },
        { type: "text", style: { text: centerLabel, fill: MUTED, font: "11px system-ui", textAlign: "center", x: 0, y: 18 } },
      ],
    }],
  }), [centerLabel, displayValue, rows]);

  if (!rows.length) return <EmptyVisual>Allocation becomes available when the source supplies usable weights.</EmptyVisual>;

  return (
    <div className="grid items-center gap-4 sm:grid-cols-[minmax(180px,0.9fr)_minmax(190px,1.1fr)]">
      <div className="overflow-hidden rounded-2xl bg-[#0b171c]" role="img" aria-label={`${centerLabel}: ${rows.map((item) => `${item.name} ${pct(item.value)}`).join(", ")}`}>
        <EChart option={option} height={height} />
      </div>
      <div className="space-y-3">
        {rows.slice(0, 7).map((item, index) => {
          const share = total ? (item.value / total) * 100 : 0;
          return (
            <div key={item.name}>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="flex min-w-0 items-center gap-2 text-ink-muted"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLORS[index % COLORS.length] }} /><span className="truncate">{item.name}</span></span>
                <span className="financial-number shrink-0 font-semibold text-ink">{pct(item.value)}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-strong"><div className="h-full rounded-full" style={{ width: `${Math.max(3, share)}%`, background: COLORS[index % COLORS.length] }} /></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RiskReturnMap({ points = [], height = 300, returnLabel = "1-year return (%)", riskLabel = "90-day volatility (%)" }) {
  const clean = useMemo(() => points
    .filter((point) => finite(point.return) && finite(point.risk))
    .map((point) => ({ name: point.name, value: [n(point.return), n(point.risk), n(point.size) || 1], highlight: Boolean(point.highlight), detail: point.detail })), [points]);

  const option = useMemo(() => ({
    animationDuration: 700,
    grid: { left: 48, right: 18, top: 26, bottom: 46, containLabel: false },
    tooltip: {
      trigger: "item",
      renderMode: "richText",
      backgroundColor: "#0d1b20",
      borderColor: "#2b464b",
      textStyle: { color: INK, fontSize: 12 },
      formatter: ({ data }) => `${data.name}\nReturn: ${pct(data.value[0])}\nRisk: ${pct(data.value[1])}${data.detail ? `\n${data.detail}` : ""}`,
    },
    xAxis: {
      type: "value",
      name: returnLabel,
      nameLocation: "middle",
      nameGap: 30,
      nameTextStyle: { color: MUTED, fontSize: 11 },
      axisLabel: { color: MUTED, fontSize: 10, formatter: "{value}%" },
      axisLine: { lineStyle: { color: "#52676b" } },
      splitLine: { lineStyle: { color: GRID, type: "dashed" } },
    },
    yAxis: {
      type: "value",
      name: riskLabel,
      nameTextStyle: { color: MUTED, fontSize: 11, align: "left" },
      axisLabel: { color: MUTED, fontSize: 10, formatter: "{value}%" },
      axisLine: { show: true, lineStyle: { color: "#52676b" } },
      splitLine: { lineStyle: { color: GRID, type: "dashed" } },
    },
    series: [{
      type: "scatter",
      data: clean,
      symbolSize: (value) => Math.max(10, Math.min(24, 8 + Math.sqrt(value[2]) * 1.7)),
      itemStyle: {
        color: ({ data }) => data.highlight ? "#e3ad37" : "#63c7b2",
        borderColor: ({ data }) => data.highlight ? "#ffd166" : "#b7e7dc",
        borderWidth: 1,
        opacity: 0.88,
      },
      emphasis: { focus: "self", scale: 1.35 },
    }],
  }), [clean, returnLabel, riskLabel]);

  if (!clean.length) return <EmptyVisual>The risk/return map needs both return and volatility observations.</EmptyVisual>;
  return <div className="overflow-hidden rounded-2xl bg-[#0b171c]" role="img" aria-label={`Risk and return map with ${clean.length} observations`}><EChart option={option} height={height} /></div>;
}

export function ComparisonBars({ funds = [], metrics = [] }) {
  const usable = metrics.map((metric) => {
    const values = funds.map((fund) => fund[metric.key]).filter(finite).map(n);
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 0;
    return { ...metric, min, max, range: max - min || 1 };
  });

  if (!funds.length) return <EmptyVisual>Add funds to reveal a visual comparison.</EmptyVisual>;
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[680px]">
        <div className="grid grid-cols-[190px_repeat(var(--fund-count),minmax(110px,1fr))] border-b border-line pb-3" style={{ "--fund-count": funds.length }}>
          <div className="eyebrow">Research dimension</div>
          {funds.map((fund) => <div key={fund.code} className="truncate px-3 text-xs font-semibold text-ink" title={fund.name}>{fund.shortName || fund.name}</div>)}
        </div>
        {usable.map((metric) => (
          <div key={metric.key} className="grid grid-cols-[190px_repeat(var(--fund-count),minmax(110px,1fr))] items-center border-b border-line/70 py-3 last:border-0" style={{ "--fund-count": funds.length }}>
            <div className="pr-4"><div className="text-xs font-semibold text-ink">{metric.label}</div><div className="mt-1 text-[10px] leading-4 text-ink-faint">{metric.help}</div></div>
            {funds.map((fund, index) => {
              const value = n(fund[metric.key]);
              const observed = finite(fund[metric.key]);
              const normalized = observed ? (metric.lowerIsBetter ? (metric.max - value) / metric.range : (value - metric.min) / metric.range) : 0;
              return (
                <div key={fund.code} className="px-3">
                  <div className="financial-number text-xs font-semibold text-ink">{observed ? `${value.toFixed(metric.digits ?? 1)}${metric.suffix || ""}` : "—"}</div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-strong"><div className="h-full rounded-full" style={{ width: observed ? `${Math.max(12, 25 + normalized * 75)}%` : "0%", background: COLORS[index % COLORS.length] }} /></div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
