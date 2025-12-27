"use client";

import { useMemo, useState } from "react";

type DayPlan = {
  day: number;
  title: string;
  items: string[];
};

const APP_NAME = "Wander App";
const MIN_DAYS = 1;
const MAX_DAYS = 14;

const TRAVEL_STYLES = [
  { key: "relaxed", label: "Relaxed" },
  { key: "foodie", label: "Foodie" },
  { key: "adventure", label: "Adventure" },
  { key: "culture", label: "Culture" },
] as const;

type TravelStyleKey = (typeof TRAVEL_STYLES)[number]["key"];

function clampDays(n: number): number {
  if (!Number.isFinite(n)) return MIN_DAYS;
  return Math.max(MIN_DAYS, Math.min(MAX_DAYS, n));
}

function buildPlaceholderItinerary(destination: string, days: number, style: TravelStyleKey): DayPlan[] {
  const safeDays = clampDays(days);
  const city = destination.trim() || "your destination";

  const byStyle: Record<TravelStyleKey, Array<Omit<DayPlan, "day">>> = {
    relaxed: [
      {
        title: "Arrive + slow stroll",
        items: [
          `Check in and take a relaxed walk around central ${city}.`,
          "Coffee stop + people watching.",
          "Sunset viewpoint or waterfront stroll.",
        ],
      },
      {
        title: "Neighborhood day",
        items: [
          "Late breakfast/brunch.",
          "Explore a charming neighborhood at your own pace.",
          "Easy evening: cozy café or live music.",
        ],
      },
    ],
    foodie: [
      {
        title: "Iconic bites",
        items: [
          `Start with a local must-try in ${city}.`,
          "Lunch: top-rated spot nearby.",
          "Evening: dessert + a signature drink.",
        ],
      },
      {
        title: "Market + tasting",
        items: [
          "Morning market browse + tastings.",
          "Street food crawl (2–4 stops).",
          "Dinner reservation at a local favorite.",
        ],
      },
    ],
    adventure: [
      {
        title: "Outdoor kickoff",
        items: [
          "Early start: scenic trail / hike (easy-moderate).",
          "Picnic lunch or lookout viewpoint.",
          "Evening recovery: spa / hot tub / chill.",
        ],
      },
      {
        title: "Day trip energy",
        items: [
          `Half-day trip outside ${city}.`,
          "Try an activity (kayak, bike, climb — your pick).",
          "Golden hour photos + casual dinner.",
        ],
      },
    ],
    culture: [
      {
        title: "Landmarks + stories",
        items: [
          `Visit a must-see landmark in ${city}.`,
          "Museum / gallery time.",
          "Historic district walk + local dinner.",
        ],
      },
      {
        title: "Hidden gems",
        items: [
          "Bookstore / architecture / local craft shops.",
          "Neighborhood café + journaling.",
          "Evening: performance or cultural event.",
        ],
      },
    ],
  };

  const templates = byStyle[style];

  return Array.from({ length: safeDays }, (_, i) => {
    const t = templates[i % templates.length];
    return { day: i + 1, title: t.title, items: t.items };
  });
}

function IconSparkle(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M12 2l1.1 5.2L18 9l-4.9 1.8L12 16l-1.1-5.2L6 9l4.9-1.8L12 2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M19 13l.7 3.2 3.3.8-3.3.8L19 21l-.7-3.2-3.3-.8 3.3-.8L19 13z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconArrow(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M5 12h12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Home() {
  const [destination, setDestination] = useState("");
  const [daysText, setDaysText] = useState("3");
  const [style, setStyle] = useState<TravelStyleKey>("relaxed");
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
      setError("Enter a destination to continue.");
      setItinerary(null);
      return;
    }

    if (!Number.isFinite(daysNumber) || days < MIN_DAYS || days > MAX_DAYS) {
      setError(`Enter days between ${MIN_DAYS} and ${MAX_DAYS}.`);
      setItinerary(null);
      return;
    }

    setError(null);
    setItinerary(buildPlaceholderItinerary(dest, days, style));
  };

  const onQuickDemo = () => {
    setDestination("Vancouver");
    setDaysText("3");
    setStyle("culture");
    setError(null);
    setItinerary(buildPlaceholderItinerary("Vancouver", 3, "culture"));
  };

  return (
    <main className="min-h-screen bg-[#070A12] text-white">
      {/* background */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-fuchsia-500/30 via-sky-500/25 to-emerald-400/25 blur-3xl" />
        <div className="absolute bottom-[-220px] right-[-140px] h-[520px] w-[520px] rounded-full bg-gradient-to-tr from-emerald-400/20 via-sky-500/20 to-fuchsia-500/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.08),transparent_55%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:48px_48px] opacity-30" />
      </div>

      {/* nav */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#070A12]/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15">
              <IconSparkle className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">{APP_NAME}</div>
              <div className="text-xs text-white/60">AI-style trip planning</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/90 transition hover:bg-white/10"
              onClick={onQuickDemo}
            >
              Quick demo
            </button>
            <button className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black transition hover:bg-white/90">
              Sign in
            </button>
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="mx-auto max-w-6xl px-4 pb-8 pt-10">
        <div className="grid items-start gap-8 lg:grid-cols-2">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80">
              <IconSparkle className="h-4 w-4" />
              <span>Build an itinerary in seconds</span>
            </div>

            <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
              Plan trips that feel
              <span className="bg-gradient-to-r from-fuchsia-300 via-sky-300 to-emerald-200 bg-clip-text text-transparent"> custom-made</span>
            </h1>
            <p className="mt-4 max-w-xl text-base text-white/70">
              Pick a destination, number of days, and vibe. We’ll generate a clean, shareable day-by-day plan.
            </p>

            {/* planner card */}
            <div className="mt-6 rounded-2xl border border-white/12 bg-white/5 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.06)] backdrop-blur">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="md:col-span-2">
                  <label className="text-xs text-white/60">Destination</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/35 outline-none ring-0 transition focus:border-white/25"
                    placeholder="e.g., Vancouver"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-white/60">Days</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/35 outline-none transition focus:border-white/25"
                    placeholder="3"
                    value={daysText}
                    onChange={(e) => setDaysText(e.target.value)}
                    inputMode="numeric"
                  />
                </div>
              </div>

              <div className="mt-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-white/60">Vibe</div>
                  <div className="text-xs text-white/45">Tap to switch</div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {TRAVEL_STYLES.map((s) => {
                    const isActive = s.key === style;
                    return (
                      <button
                        key={s.key}
                        onClick={() => setStyle(s.key)}
                        className={
                          "rounded-full px-3 py-1.5 text-sm transition " +
                          (isActive
                            ? "bg-white text-black"
                            : "border border-white/15 bg-white/5 text-white/85 hover:bg-white/10")
                        }
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm">
                  {error ? (
                    <span className="text-rose-300">{error}</span>
                  ) : (
                    <span className="text-white/60">Tip: Keep it {MAX_DAYS} days max for now.</span>
                  )}
                </div>

                <button
                  onClick={onGenerate}
                  className="group inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90"
                >
                  Generate
                  <IconArrow className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/12 bg-white/5 p-4">
                <div className="text-xs text-white/55">Output</div>
                <div className="mt-1 text-sm font-semibold">Day-by-day plan</div>
                <div className="mt-1 text-sm text-white/65">Clear structure, easy to tweak.</div>
              </div>
              <div className="rounded-2xl border border-white/12 bg-white/5 p-4">
                <div className="text-xs text-white/55">Style</div>
                <div className="mt-1 text-sm font-semibold">Vibe presets</div>
                <div className="mt-1 text-sm text-white/65">Relaxed, foodie, adventure, culture.</div>
              </div>
              <div className="rounded-2xl border border-white/12 bg-white/5 p-4">
                <div className="text-xs text-white/55">Share</div>
                <div className="mt-1 text-sm font-semibold">Link-ready</div>
                <div className="mt-1 text-sm text-white/65">Great for friends & family.</div>
              </div>
            </div>
          </div>

          {/* preview */}
          <div className="lg:pt-2">
            <div className="rounded-3xl border border-white/12 bg-white/5 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.06)] backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-white/60">Preview</div>
                  <div className="mt-1 text-lg font-semibold">Your itinerary</div>
                  <div className="mt-1 text-sm text-white/60">
                    {itinerary ? (
                      <>
                        {destination.trim() || "—"} • {itinerary.length} day(s) • {TRAVEL_STYLES.find((s) => s.key === style)?.label}
                      </>
                    ) : (
                      "Generate to see your plan here"
                    )}
                  </div>
                </div>
                <button
                  className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/85 transition hover:bg-white/10 disabled:opacity-40"
                  onClick={() => setItinerary(null)}
                  disabled={!itinerary}
                >
                  Clear
                </button>
              </div>

              {itinerary ? (
                <div className="mt-4 grid gap-3">
                  {itinerary.slice(0, 4).map((d) => (
                    <div
                      key={d.day}
                      className="rounded-2xl border border-white/12 bg-black/20 p-4 transition hover:bg-black/25"
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold">Day {d.day}</div>
                        <div className="text-xs text-white/55">~ 4–6 hrs</div>
                      </div>
                      <div className="mt-1 text-sm text-white/80">{d.title}</div>
                      <ul className="mt-2 space-y-1 text-sm text-white/65">
                        {d.items.slice(0, 3).map((it, idx) => (
                          <li key={idx} className="flex gap-2">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-white/40" />
                            <span>{it}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  {itinerary.length > 4 ? (
                    <div className="rounded-2xl border border-white/12 bg-white/5 p-4 text-sm text-white/70">
                      + {itinerary.length - 4} more days… (we’ll show full view on the next page)
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-white/12 bg-black/20 p-6">
                  <div className="text-sm font-semibold">Try a sample</div>
                  <div className="mt-1 text-sm text-white/65">
                    Click <span className="text-white">Quick demo</span> in the top right.
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/12 bg-white/5 p-4">
                <div className="text-sm font-semibold">How it works</div>
                <div className="mt-2 space-y-2 text-sm text-white/70">
                  <div className="flex gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-lg bg-white/10 text-xs ring-1 ring-white/10">1</span>
                    <span>Enter destination + days</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-lg bg-white/10 text-xs ring-1 ring-white/10">2</span>
                    <span>Pick your vibe</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-lg bg-white/10 text-xs ring-1 ring-white/10">3</span>
                    <span>Generate + refine</span>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-white/12 bg-white/5 p-4">
                <div className="text-sm font-semibold">Coming next</div>
                <div className="mt-2 space-y-1 text-sm text-white/70">
                  <div>• Map view</div>
                  <div>• Save trips</div>
                  <div>• Shareable link</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-4 pb-10 pt-2 text-sm text-white/45">
        <div className="flex flex-col gap-2 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div>© {new Date().getFullYear()} {APP_NAME}</div>
          <div className="flex gap-4">
            <button className="hover:text-white/70">Privacy</button>
            <button className="hover:text-white/70">Terms</button>
            <button className="hover:text-white/70">Contact</button>
          </div>
        </div>
      </footer>
    </main>
  );
}
