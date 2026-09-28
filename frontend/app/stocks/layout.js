export default function StocksLayout({ children }) {
  return <>
    <aside className="border-b border-line bg-surface px-4 py-3 text-center text-xs text-ink-muted">
      Stocks research beta: Indian coverage and Fiscal.ai-powered global equity reports are available. Prices, financials, news and valuation coverage vary by company; missing data is not a zero value. No trading is executed.
    </aside>
    {children}
  </>;
}
