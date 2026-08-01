"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { getStoredProfile, isProfileComplete } from "../lib/userProfile";

const AUTH_PAGES = new Set(["/login", "/register", "/forgot-password", "/reset-password"]);

// Production Activation Phase 6: public mutual-fund RESEARCH must never require an account to
// read — that directly contradicted this platform's own trust/transparency mission (a retail
// investor, journalist, or advisor has to be able to verify a number without signing up first).
// Everything below is read-only research content with no personal state of its own. What stays
// gated is exactly the personal surfaces: dashboard, portfolio, profile, and any save/sync
// action within an otherwise-public page (those already degrade to a local-only save when
// signed out — see cloudSync.js — never a hard failure).
//
// /advisor is a judgment call: today it's a "talk to an advisor" contact/lead form, not an
// account-tied flow, so it's kept public rather than gated — revisit if it grows into something
// that reads or writes personal account data.
const PUBLIC_PATH_PREFIXES = [
  "/funds", "/fund", "/amc", "/categories", "/benchmark", "/manager",
  "/news", "/methodology", "/data-status", "/data-quality", "/status",
  "/performance", "/brief", "/market-map", "/signals", "/discover",
  "/research", "/compare", "/about", "/advisor",
  // Stock Intelligence (Section 37: public company/sector research must be as openly readable as
  // mutual-fund research is above — same reasoning, new domain). Only the research surface is
  // public; user-specific stock pages (watchlists, stock portfolio, research notes) are not in
  // this list and stay gated once their frontend pages exist, matching how /portfolio (MF) is
  // gated today despite /funds being public.
  "/stocks", "/sectors", "/markets", "/commodities",
];

function isPublicResearchPath(pathname) {
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function currentTarget(pathname) {
  if (typeof window === "undefined") return pathname || "/";
  return `${pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`;
}

function GateShell({ title, detail, action }) {
  return (
    <main className="container-px mx-auto grid min-h-[70dvh] place-items-center py-16">
      <section className="w-full max-w-lg rounded-[2rem] border border-line bg-surface p-7 text-center shadow-float">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent/12 text-accent" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-current shadow-glow" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-[-0.04em] text-ink">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-ink-muted">{detail}</p>
        {action}
      </section>
    </main>
  );
}

export default function AuthGate({ children }) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const { data: session, status } = useSession();
  const [profileReady, setProfileReady] = useState(false);
  const [profileComplete, setProfileComplete] = useState(false);

  const isLanding = pathname === "/";
  const isAuthPage = AUTH_PAGES.has(pathname);
  const isSetupPage = pathname === "/profile/setup";
  const isInvestPath = pathname === "/invest" || pathname.startsWith("/invest/");
  const isPublic = isLanding || isAuthPage || isPublicResearchPath(pathname);
  const target = useMemo(() => currentTarget(pathname), [pathname]);

  useEffect(() => {
    if (status !== "authenticated") {
      setProfileReady(status !== "loading");
      setProfileComplete(false);
      return;
    }

    function refreshProfile() {
      const profile = getStoredProfile(session.user);
      setProfileComplete(isProfileComplete(profile));
      setProfileReady(true);
    }

    refreshProfile();
    window.addEventListener("storage", refreshProfile);
    window.addEventListener("mfp-profile-updated", refreshProfile);
    return () => {
      window.removeEventListener("storage", refreshProfile);
      window.removeEventListener("mfp-profile-updated", refreshProfile);
    };
  }, [session, status]);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated" && !isPublic) {
      router.replace(`/login?callbackUrl=${encodeURIComponent(target)}`);
      return;
    }
    if (status === "authenticated" && profileReady && !profileComplete && !isPublic && !isSetupPage && !isInvestPath) {
      router.replace(`/profile/setup?callbackUrl=${encodeURIComponent(target)}`);
    }
  }, [isInvestPath, isPublic, isSetupPage, profileComplete, profileReady, router, status, target]);

  if (isPublic) return children;

  if (status === "loading" || (status === "authenticated" && !profileReady)) {
    return <GateShell title="Checking access" detail="Verifying your secure MF Pulse workspace before loading this page." />;
  }

  if (status === "unauthenticated") {
    return (
      <GateShell
        title="Sign in required"
        detail="Your personal dashboard, portfolio tools, and saved research need an account. Fund research, comparisons, and market news are open to everyone — no sign-in needed."
        action={<a href={`/login?callbackUrl=${encodeURIComponent(target)}`} className="mt-6 inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-white">Sign in to continue</a>}
      />
    );
  }

  if (!profileComplete && !isSetupPage && !isInvestPath) {
    return <GateShell title="Complete your profile" detail="MF Pulse uses your role, research goal, risk comfort, and horizon to personalize the frontend workspace." />;
  }

  return children;
}
