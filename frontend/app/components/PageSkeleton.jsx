import Nav from "./Nav";

// Professional skeleton shown while a route streams in.
export default function PageSkeleton({ rows = 4, strip = true }) {
  return (
    <>
      <Nav />
      <main className="container-px py-8 sm:py-10">
        <div className="skeleton h-8 w-72" />
        <div className="skeleton mt-3 h-4 w-96 max-w-full" />

        {strip && (
          <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-bg px-4 py-3.5">
                <div className="skeleton h-2.5 w-12" />
                <div className="skeleton mt-2 h-5 w-16" />
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="glass p-6 lg:col-span-2"><div className="skeleton h-56 w-full" /></div>
          <div className="glass p-6">
            <div className="skeleton h-4 w-32" />
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton mt-3 h-3.5 w-full" />)}
          </div>
        </div>

        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="mt-4 glass p-4"><div className="skeleton h-4 w-full" /></div>
        ))}
      </main>
    </>
  );
}
