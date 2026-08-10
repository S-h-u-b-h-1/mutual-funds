"use client";

import { useEffect, useState } from "react";

export default function NavChrome({ children, className = "" }) {
  const [condensed, setCondensed] = useState(false);

  useEffect(() => {
    const update = () => setCondensed(window.scrollY > 16);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header
      data-condensed={condensed ? "true" : "false"}
      className={`nav-shell sticky top-0 z-50 pointer-events-none transition-all duration-300 ease-out ${className}`}
    >
      {children}
    </header>
  );
}
