import "./globals.css";

export const metadata = {
  title: "MF Pulse — Indian mutual fund tracker",
  description: "Daily NAV & scheme analytics across all AMCs, from free public AMFI data.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
