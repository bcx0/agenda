export default function LoginLoading() {
  return (
    <section className="mx-auto max-w-5xl px-5 py-10 md:py-24">
      <div className="flex flex-col gap-10 md:grid md:grid-cols-[1.1fr_0.9fr] md:items-center">
        <div className="space-y-6">
          <div className="h-6 w-32 animate-pulse rounded bg-white/10" />
          <div className="h-10 w-64 animate-pulse rounded bg-white/10" />
          <div className="hidden space-y-3 md:block">
            <div className="h-4 w-full animate-pulse rounded bg-white/10" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-white/10" />
          </div>
        </div>
        <div className="card space-y-6 p-8">
          <div className="space-y-2">
            <div className="h-3 w-12 animate-pulse rounded bg-white/10" />
            <div className="h-11 w-full animate-pulse rounded bg-white/10" />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-20 animate-pulse rounded bg-white/10" />
            <div className="h-11 w-full animate-pulse rounded bg-white/10" />
          </div>
          <div className="h-11 w-full animate-pulse rounded bg-white/10" />
        </div>
      </div>
    </section>
  );
}
