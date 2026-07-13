import { Suspense } from "react";
import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import ProfileForm from "../../components/ProfileForm";

export const metadata = { title: "Complete Profile" };

function SetupContent({ searchParams }) {
  const callbackUrl = searchParams?.callbackUrl || "/dashboard";
  return <ProfileForm mode="setup" callbackUrl={callbackUrl} />;
}

export default function ProfileSetupPage({ searchParams }) {
  return (
    <>
      <Nav active="/profile" />
      <main className="container-px mx-auto max-w-5xl py-10">
        <section className="mb-7 rounded-[2rem] border border-line bg-ink p-7 text-bg shadow-float">
          <div className="eyebrow text-accent-soft">One-time setup</div>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">Complete your profile to unlock MF Pulse.</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-bg/70">The landing page remains public. The research terminal, fund pages, portfolio tools, compare, news, and status pages require sign in plus profile completion.</p>
        </section>
        <Suspense fallback={null}>
          <SetupContent searchParams={searchParams} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
