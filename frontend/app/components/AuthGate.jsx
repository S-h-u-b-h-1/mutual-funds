"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { getStoredProfile, isProfileComplete } from "../lib/userProfile";

const AUTH_PAGES = new Set(["/login", "/register", "/forgot-password", "/reset-password"]);

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
  const isPublic = isLanding || isAuthPage;
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
    if (status === "authenticated" && profileReady && !profileComplete && !isPublic && !isSetupPage) {
      router.replace(`/profile/setup?callbackUrl=${encodeURIComponent(target)}`);
    }
  }, [isPublic, isSetupPage, profileComplete, profileReady, router, status, target]);

  if (isPublic) return children;

  if (status === "loading" || (status === "authenticated" && !profileReady)) {
    return <GateShell title="Checking access" detail="Verifying your secure MF Pulse workspace before loading this page." />;
  }

  if (status === "unauthenticated") {
    return (
      <GateShell
        title="Sign in required"
        detail="The research terminal, fund pages, portfolio tools, news impact views, and dashboards are available after sign in."
        action={<a href={`/login?callbackUrl=${encodeURIComponent(target)}`} className="mt-6 inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-white">Sign in to continue</a>}
      />
    );
  }

  if (!profileComplete && !isSetupPage) {
    return <GateShell title="Complete your profile" detail="MF Pulse uses your role, research goal, risk comfort, and horizon to personalize the frontend workspace." />;
  }

  return children;
}
