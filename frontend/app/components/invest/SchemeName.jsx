"use client";

import { useEffect, useState } from "react";
import { fundsApi } from "../../lib/invest/api";

export default function SchemeName({ code, fallback = "Scheme name unavailable" }) {
  const [name, setName] = useState("");
  useEffect(() => { if (!code) return undefined; let active = true; fundsApi.search(String(code)).then((value) => { if (active) setName(value.results?.[0]?.name || ""); }).catch(() => {}); return () => { active = false; }; }, [code]);
  return <>{name || fallback}</>;
}
