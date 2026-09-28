"use client";

import { useMemo, useState } from "react";
import EChart from "../ui/EChart";

const INK = "#dce8e6";
const MUTED = "#829396";
const GRID = "rgba(128, 155, 157, 0.14)";
const GREEN = "#70d6bd";
const BLUE = "#6aa8d8";
const AMBER = "#d6a542";

function formatCurrency(value, currency, compact = false) {
  if (!Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 2,
  }).format(Number(value));
}

export function GlobalPriceChart({ points = [], currency = "USD" }) {
  const [range, setRange] = useState("5Y");
  const clean = useMemo(() => points
    .filter((point) => point?.date && Number.isFinite(Number(point.close)))
    .map((point) => ({ ...point, close: Number(point.close) }))
    .sort((a, b) => pointTime(a) - pointTime(b)), [points]);

  const shown = useMemo(() => {
    if (!clean.length || range === "5Y") return clean;
    const months = range === "1Y" ? 12 : range === "3Y" ? 36 : 6;
    const cutoff = new Date(clean.at(-1).date);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
    return clean.filter((point) => pointTime(point) >= cutoff.getTime());
  }, [clean, range]);

  const option = useMemo(() => ({
    animationDuration: 550,
    grid: { left: 18, right: 20, top: 24, bottom: 36, containLabel: true },
    tooltip: {
      trigger: "axis",
      renderMode: "richText",
      backgroundColor: "#0d1b20",
      borderColor: "#2b464b",
      textStyle: { color: INK, fontSize: 12 },
      formatter: (rows) => `${rows[0].axisValue}\n${formatCurrency(rows[0].value, currency)}`,
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: shown.map((point) => point.date),
      axisLabel: { color: MUTED, fontSize: 10, hideOverlap: true },
      axisLine: { lineStyle: { color: "#52676b" } },
    },
    yAxis: {
      type: "value",
      scale: true,
      axisLabel: { color: MUTED, fontSize: 10, formatter: (value) => formatCurrency(value, currency, true) },
      splitLine: { lineStyle: { color: GRID, type: "dashed" } },
    },
    dataZoom: shown.length > 120 ? [{ type: "inside", filterMode: "none" }] : [],
    series: [{
      type: "line",
      data: shown.map((point) => point.close),
      showSymbol: shown.length < 35,
      symbolSize: 5,
      lineStyle: { color: GREEN, width: 2 },
      itemStyle: { color: GREEN },
      areaStyle: { color: "rgba(112,214,189,0.11)" },
    }],
  }), [currency, shown]);

  if (clean.length < 2) return <ChartEmpty>No price series is available for this company under the connected Fiscal.ai plan.</ChartEmpty>;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-full border border-line bg-surface-2 p-1" aria-label="Price chart range">
          {["6M", "1Y", "3Y", "5Y"].map((item) => (
            <button key={item} type="button" onClick={() => setRange(item)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${range === item ? "bg-ink text-bg" : "text-ink-muted hover:text-ink"}`}>{item}</button>
          ))}
        </div>
        <div className="text-[11px] text-ink-faint">{shown.length} split-adjusted daily closes · {currency}</div>
      </div>
      <div className="overflow-hidden rounded-2xl bg-[#0b171c]" role="img" aria-label={`${range} closing-price chart`}>
        <EChart option={option} height={340} />
      </div>
    </div>
  );
}

function pointTime(point) {
  return new Date(point.date).getTime();
}

export function GlobalFinancialChart({ rows = [], currency = "USD" }) {
  const clean = useMemo(() => rows.slice(-10).filter((row) => row.fiscalYear), [rows]);
  const option = useMemo(() => ({
    animationDuration: 550,
    color: [GREEN, BLUE, AMBER],
    legend: { top: 0, textStyle: { color: MUTED, fontSize: 11 } },
    grid: { left: 18, right: 18, top: 44, bottom: 30, containLabel: true },
    tooltip: {
      trigger: "axis",
      renderMode: "richText",
      backgroundColor: "#0d1b20",
      borderColor: "#2b464b",
      textStyle: { color: INK, fontSize: 12 },
      valueFormatter: (value) => formatCurrency(value, currency, true),
    },
    xAxis: { type: "category", data: clean.map((row) => `FY${row.fiscalYear}`), axisLabel: { color: MUTED, fontSize: 10 }, axisLine: { lineStyle: { color: "#52676b" } } },
    yAxis: { type: "value", axisLabel: { color: MUTED, fontSize: 10, formatter: (value) => formatCurrency(value, currency, true) }, splitLine: { lineStyle: { color: GRID, type: "dashed" } } },
    series: [
      ["Revenue", "revenue", GREEN],
      ["Operating profit", "operatingProfit", BLUE],
      ["Net income", "netIncome", AMBER],
    ].map(([name, key, color]) => ({
      name,
      type: name === "Revenue" ? "bar" : "line",
      data: clean.map((row) => row[key]),
      connectNulls: false,
      showSymbol: true,
      symbolSize: 6,
      itemStyle: { color },
      lineStyle: { color, width: 2 },
    })),
  }), [clean, currency]);

  if (clean.length < 2) return <ChartEmpty>At least two standardized annual statements are required before a financial trend is drawn.</ChartEmpty>;
  return <div className="overflow-hidden rounded-2xl bg-[#0b171c]" role="img" aria-label="Annual revenue, operating-profit and net-income chart"><EChart option={option} height={330} /></div>;
}

function ChartEmpty({ children }) {
  return <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-line bg-surface-2/60 p-6 text-center text-sm leading-6 text-ink-muted">{children}</div>;
}
