"use client";

import { useMemo, useState } from "react";
import EChart from "../ui/EChart";

const INK = "#dce8e6";
const MUTED = "#829396";
const GRID = "rgba(128, 155, 157, 0.14)";
const GREEN = "#70d6bd";
const AMBER = "#d6a542";
const BLUE = "#6aa8d8";

const asDate = (value) => new Date(value).getTime();
const money = (value) => `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function EmptyChart({ children }) {
  return <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-line bg-surface-2/60 p-6 text-center text-sm leading-6 text-ink-muted">{children}</div>;
}

export function StockHistoryChart({ points = [], sourceLabel = "Source unavailable" }) {
  const [range, setRange] = useState("MAX");
  const clean = useMemo(() => points
    .filter((point) => point?.asOfDate && Number.isFinite(Number(point.price)))
    .map((point) => ({ ...point, price: Number(point.price) }))
    .sort((a, b) => asDate(a.asOfDate) - asDate(b.asOfDate)), [points]);

  const shown = useMemo(() => {
    if (range === "MAX" || !clean.length) return clean;
    const years = Number(range.replace("Y", ""));
    const cutoff = new Date(clean.at(-1).asOfDate);
    cutoff.setFullYear(cutoff.getFullYear() - years);
    return clean.filter((point) => asDate(point.asOfDate) >= cutoff.getTime());
  }, [clean, range]);

  const stats = useMemo(() => {
    if (shown.length < 2) return null;
    const first = shown[0];
    const last = shown.at(-1);
    const totalReturn = ((last.price / first.price) - 1) * 100;
    const years = Math.max((asDate(last.asOfDate) - asDate(first.asOfDate)) / 31_557_600_000, 0);
    const cagr = years >= 1 ? (Math.pow(last.price / first.price, 1 / years) - 1) * 100 : null;
    const peak = Math.max(...shown.map((point) => point.price));
    const drawdown = ((last.price / peak) - 1) * 100;
    return { totalReturn, cagr, peak, drawdown };
  }, [shown]);

  const option = useMemo(() => ({
    animationDuration: 650,
    grid: { left: 18, right: 18, top: 26, bottom: 38, containLabel: true },
    tooltip: {
      trigger: "axis", renderMode: "richText", backgroundColor: "#0d1b20", borderColor: "#2b464b",
      textStyle: { color: INK, fontSize: 12 },
      formatter: (rows) => `${rows[0].axisValue}\n${money(rows[0].value)}`,
    },
    xAxis: { type: "category", boundaryGap: false, data: shown.map((point) => String(point.asOfDate).slice(0, 10)), axisLabel: { color: MUTED, fontSize: 10, hideOverlap: true }, axisLine: { lineStyle: { color: "#52676b" } } },
    yAxis: { type: "value", scale: true, axisLabel: { color: MUTED, fontSize: 10, formatter: (value) => `₹${value}` }, splitLine: { lineStyle: { color: GRID, type: "dashed" } } },
    dataZoom: shown.length > 90 ? [{ type: "inside", filterMode: "none" }] : [],
    series: [{ type: "line", data: shown.map((point) => point.price), showSymbol: shown.length < 30, symbolSize: 5, smooth: shown.length < 80 ? 0.18 : false, lineStyle: { color: GREEN, width: 2 }, itemStyle: { color: GREEN }, areaStyle: { color: "rgba(112,214,189,0.11)" }, emphasis: { focus: "series" } }],
  }), [shown]);

  if (clean.length < 2) return <EmptyChart>A contracted historical-price feed has not supplied enough observations yet. MF Pulse will not fabricate a “lifetime” chart from a current quote or silently redistribute exchange data.</EmptyChart>;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-full border border-line bg-surface-2 p-1" aria-label="Price-history range">
          {["1Y", "3Y", "5Y", "10Y", "MAX"].map((item) => <button type="button" key={item} onClick={() => setRange(item)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${range === item ? "bg-ink text-bg" : "text-ink-muted hover:text-ink"}`}>{item}</button>)}
        </div>
        <div className="text-[11px] text-ink-faint">{shown.length} observations · {sourceLabel}</div>
      </div>
      <div className="overflow-hidden rounded-2xl bg-[#0b171c]" role="img" aria-label={`${range} available price history`}><EChart option={option} height={330} /></div>
      {stats && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[["Period return", stats.totalReturn, "%"], ["CAGR", stats.cagr, "%"], ["Observed high", stats.peak, "₹"], ["From observed high", stats.drawdown, "%"]].map(([label, value, unit]) => <div key={label} className="rounded-xl bg-surface-2 px-3 py-2"><div className="text-[10px] uppercase tracking-wider text-ink-faint">{label}</div><div className="mt-1 text-sm font-semibold text-ink financial-number">{value == null ? "—" : unit === "₹" ? money(value) : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`}</div></div>)}
      </div>}
      <p className="mt-3 text-[11px] leading-5 text-ink-faint">Returns are price returns from the observations on file, not total returns, unless the source explicitly marks the series as corporate-action adjusted. A shorter observed range is never labelled as the company&apos;s lifetime.</p>
    </div>
  );
}

export function FinancialTrendChart({ statements = [] }) {
  const rows = useMemo(() => statements
    .filter((statement) => statement?.fiscalYear && statement?.fields)
    .map((statement) => ({ year: `FY${statement.fiscalYear}`, revenue: Number(statement.fields.revenue), ebitda: Number(statement.fields.ebitda), profit: Number(statement.fields.net_profit) }))
    .filter((row) => [row.revenue, row.ebitda, row.profit].some(Number.isFinite))
    .sort((a, b) => Number(a.year.slice(2)) - Number(b.year.slice(2))), [statements]);
  const series = useMemo(() => [["Revenue", "revenue", GREEN], ["EBITDA", "ebitda", BLUE], ["Net profit", "profit", AMBER]].map(([name, key, color]) => ({ name, type: "line", data: rows.map((row) => Number.isFinite(row[key]) ? row[key] : null), connectNulls: false, showSymbol: true, symbolSize: 6, lineStyle: { width: 2, color }, itemStyle: { color } })), [rows]);
  const option = useMemo(() => ({
    animationDuration: 650,
    color: [GREEN, BLUE, AMBER],
    legend: { top: 0, textStyle: { color: MUTED, fontSize: 11 } },
    grid: { left: 18, right: 18, top: 42, bottom: 28, containLabel: true },
    tooltip: { trigger: "axis", renderMode: "richText", backgroundColor: "#0d1b20", borderColor: "#2b464b", textStyle: { color: INK, fontSize: 12 }, valueFormatter: (value) => value == null ? "—" : `₹${Number(value).toLocaleString("en-IN")} Cr` },
    xAxis: { type: "category", data: rows.map((row) => row.year), axisLabel: { color: MUTED, fontSize: 10 }, axisLine: { lineStyle: { color: "#52676b" } } },
    yAxis: { type: "value", axisLabel: { color: MUTED, fontSize: 10, formatter: (value) => `₹${value}` }, splitLine: { lineStyle: { color: GRID, type: "dashed" } } },
    series,
  }), [rows, series]);
  if (rows.length < 2) return <EmptyChart>At least two sourced annual statements are needed before a financial trend is drawn.</EmptyChart>;
  return <div className="overflow-hidden rounded-2xl bg-[#0b171c]" role="img" aria-label={`Financial history from ${rows[0].year} to ${rows.at(-1).year}`}><EChart option={option} height={320} /></div>;
}
