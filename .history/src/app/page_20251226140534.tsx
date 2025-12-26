"use client";

import { useMemo, useState } from "react";

type DayPlan = {
  day: number;
  title: string;
  items: string[];
};

function buildPlaceholderItinerary(destination: string, days: number): DayPlan[] {
  const safeDays = Math.max(1, Math.min(14, Number.isFinite(days) ? days : 1));
  const city = destination.trim() || "your destination";

  const templates: Array<Omit<DayPlan, "day">> = [
    {
      title: "Arrive + easy explore",
      items: [
        `Check in and take a relaxed walk around downtown ${city}.`,
        "Grab a local coffee and a light meal.",
        "Sunset viewpoint or waterfront stroll.",
      ],
    },
    {
      title: "Top highlights",
      items: [
        `Visit a must-see landmark in ${city}.`,
        "Lunch at a highly rated spot nearby.",
        "Museum / neighborhood exploration.",
      ],
    },
    {
      title: "Nature + local vibes",
      items: [
        "Morning park/trail (easy).",
        "Local market or shopping street.",
        "Dinner + dessert spot.",
      ],
    },
    {
      title: "Food day",
      items: [
        "Breakfast/brunch crawl.",
        "Try 2–3 signature dishes.",
        "Evening: casual bar/café (optional).",
      ],
    },
  ];

  return Array.from({ length: safeDays }, (_, i) => {
    const t = templates[i % templates.length];
    return {
      day: i + 1,
      title: t.title,
      items: t.items,
    };
  });
}

export default function Home() {
  const [destination, setDestination] = useState("");
  const [daysText, setDaysText] = useState("3");
  const [itinerary, setItinerary] = useState<DayPlan[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const daysNumber = useMemo(() => {
    const n = Number(daysText);
    return Number.isFinite(n) ? n : NaN;
  }, [daysText]);

  const onGenerate = () => {
    const dest = destination.trim();
    const days = Math.floor(daysNumber);

    if (!dest) {
      setError("Please enter a destination.");
      setItinerary(null);
      return;
    }

    if (!Number.isFinite(daysNumber) || days < 1 || days > 14) {
      setError("Please enter days between 1 and 14.");
      setItinerary(null);
      return;
    }

    setError(null);
    setItinerary(buildPlaceholderItinerary(dest, days));
  };

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
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            />
            <input
              className="rounded-md border px-3 py-2"
              placeholder="Days (e.g., 3)"
              value={daysText}
              onChange={(e) => setDaysText(e.target.value)}
              inputMode="numeric"
            />
            <button
              className="rounded-md bg-black px-3 py-2 text-white"
              onClick={onGenerate}
            >
              Generate
            </button>
          </div>

          {error ? (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          ) : (
            <p className="mt-3 text-sm text-gray-500">
              Tip: Start with 3 days and refine after.
            </p>
          )}
        </div>

        {/* Results (this was the missing / wrong-placement piece) */}
        {itinerary ? (
          <div className="mt-6 rounded-xl border bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Your itinerary</h2>
                <p className="mt-1 text-sm text-gray-600">
                  {destination.trim()} • {itinerary.length} day(s)
                </p>
              </div>
              <button
                className="rounded-md border bg-white px-3 py-1.5 text-sm"
                onClick={() => setItinerary(null)}
              >
                Clear
              </button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {itinerary.map((d) => (
                <div key={d.day} className="rounded-lg border p-4">
                  <div className="text-sm font-medium text-gray-500">Day {d.day}</div>
                  <div className="mt-1 text-base font-semibold">{d.title}</div>
                  <ul className="mt-2 list-disc pl-5 text-sm text-gray-700">
                    {d.items.map((it, idx) => (
                      <li key={idx}>{it}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ) : null}

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
