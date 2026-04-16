export default function BookLoading() {
  return (
    <section className="mx-auto max-w-6xl space-y-10 px-5 py-14 md:py-20">
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="h-6 w-28 animate-pulse rounded bg-white/10" />
          <div className="h-10 w-72 animate-pulse rounded bg-white/10" />
          <div className="h-4 w-96 animate-pulse rounded bg-white/10" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card h-32 animate-pulse p-5" />
          <div className="card h-32 animate-pulse p-5" />
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card h-20 animate-pulse p-4" />
        ))}
      </div>
    </section>
  );
}
