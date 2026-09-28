export const metadata = { robots: { index: false, follow: false } };

export default function InvestmentSandboxLayout({ children }) {
  return <>
    <div role="note" className="sticky top-0 z-50 border-b border-amber-500 bg-amber-100 px-4 py-3 text-center text-sm font-semibold text-amber-950">
      Demo / Sandbox — No real investment is executed. KYC, payments, orders, SIPs, redemptions, switches, connected holdings and documents are simulated. Do not enter real identity or banking details here.
    </div>
    {children}
  </>;
}
