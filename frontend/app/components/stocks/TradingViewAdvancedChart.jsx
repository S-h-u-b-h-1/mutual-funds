"use client";

import { useEffect, useRef } from "react";

export default function TradingViewAdvancedChart({ symbol, companyName }) {
  const container = useRef(null);

  useEffect(() => {
    const node = container.current;
    if (!node || !symbol) return undefined;
    node.innerHTML = '<div class="tradingview-widget-container__widget h-full w-full"></div>';
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.textContent = JSON.stringify({
      autosize: true,
      symbol,
      interval: "D",
      timezone: "Asia/Kolkata",
      theme: "dark",
      style: "1",
      locale: "en",
      backgroundColor: "rgba(8, 17, 22, 1)",
      gridColor: "rgba(60, 82, 88, 0.22)",
      allow_symbol_change: false,
      calendar: false,
      details: true,
      hide_side_toolbar: false,
      hotlist: false,
      save_image: false,
      studies: ["STD;Volume", "STD;EMA"],
      support_host: "https://www.tradingview.com",
      withdateranges: true,
    });
    node.appendChild(script);
    return () => { node.innerHTML = ""; };
  }, [symbol]);

  if (!symbol) {
    return <div className="grid min-h-[480px] place-items-center bg-[#081116] p-8 text-center text-sm leading-6 text-[#9aabad]">A verified exchange symbol is required before the market chart can be loaded.</div>;
  }

  return (
    <div>
      <div ref={container} className="h-[480px] w-full sm:h-[540px]" aria-label={`${companyName} TradingView market chart`} />
      <div className="flex flex-col gap-2 border-t border-white/10 bg-[#081116] px-4 py-3 text-[10px] leading-4 text-[#87999c] sm:flex-row sm:items-center sm:justify-between">
        <span>Interactive TradingView chart · indicators, drawing tools and lifetime-range controls</span>
        <a href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#70d6bd]">Open on TradingView ↗</a>
      </div>
    </div>
  );
}
