import Nav from "../components/Nav";
import Footer from "../components/Footer";
import ProfileForm from "../components/ProfileForm";

export const metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <>
      <Nav active="/profile" />
      <main className="container-px mx-auto max-w-5xl py-10">
        <section className="mb-7 grid gap-4 rounded-[2rem] border border-line bg-ink p-7 text-bg shadow-float lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="eyebrow text-accent-soft">Profile</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">Account and research preferences</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-bg/70">Manage the investor context used by the frontend experience. Long names and email addresses stay here, not in the navbar.</p>
          </div>
          <a href="/dashboard" className="inline-flex min-h-11 items-center justify-center rounded-full bg-white px-5 text-sm font-semibold text-ink">Open dashboard</a>
        </section>
        <ProfileForm mode="edit" />
      </main>
      <Footer />
    </>
  );
}
