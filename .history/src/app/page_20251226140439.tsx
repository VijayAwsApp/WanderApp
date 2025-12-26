export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="text-lg font-semibold">Wander App</div>
          <div className="flex gap-2">
            <button className="rounded-md border bg-white px-3 py-1.5 text-sm">
              Log in
            </button>
            <button className="rounded-md bg-black px-3 py-1.5 text-sm text-white">
              Get started
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight">Plan your trip in minutes</h1>
        <p className="mt-2 max-w-2xl text-gray-600">
          Tell us where you’re going and we’ll build a day-by-day plan.
        </p>

        <div className="mt-8 rounded-xl border bg-white p-5">
          <div className="grid gap-4 md:grid-cols-3">
            <input
              className="rounded-md border px-3 py-2"
              placeholder="Destination (e.g., Vancouver)"
            />
            <input
              className="rounded-md border px-3 py-2"
              placeholder="Days (e.g., 3)"
            />
            <button className="rounded-md bg-black px-3 py-2 text-white">
              Generate
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border bg-white p-5">
            <div className="text-sm font-medium text-gray-500">Feature</div>
            <div className="mt-1 text-lg font-semibold">Itineraries</div>
            <p className="mt-2 text-sm text-gray-600">
              Create day-by-day plans in a clean dashboard.
            </p>
          </div>
          <div className="rounded-xl border bg-white p-5">
            <div className="text-sm font-medium text-gray-500">Feature</div>
            <div className="mt-1 text-lg font-semibold">Saved trips</div>
            <p className="mt-2 text-sm text-gray-600">
              Save and revisit plans anytime.
            </p>
          </div>
          <div className="rounded-xl border bg-white p-5">
            <div className="text-sm font-medium text-gray-500">Feature</div>
            <div className="mt-1 text-lg font-semibold">Share</div>
            <p className="mt-2 text-sm text-gray-600">
              Share a link with friends or family.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
