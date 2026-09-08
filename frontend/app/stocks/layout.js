export default function StocksLayout({ children }) {
  return <>
    <aside className="border-b border-line bg-surface px-4 py-3 text-center text-xs text-ink-muted">
      Stocks research beta: universe and identity coverage are available. Prices, financials, ownership, management and valuation coverage vary by company; missing data is not a zero value. No trading is executed.
    </aside>
    {children}
  </>;
}
