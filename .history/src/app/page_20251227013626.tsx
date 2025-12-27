"use client";

import { useState } from "react";

type PlanItem = {
  type: "stop" | "travel";
  title: string;
  durationMin: number;
  address?: string;

  // Enriched fields (present for type === "stop")
  photoUrl?: string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  openNow?: boolean;
  weekdayText?: string[];
  reviewSnippet?: string;
  mapsUri?: string;
  parking?: {
    name: string;
    address?: string;
    mapsUri?: string;
  };
};

type PlanResponse = {
  destination: string;
  totalMinutes: number;
  vibe: string;
  items: PlanItem[];
};

const APP_NAME = "Wander App";

type DurationKey = 120 | 150 | 180;

const TRAVEL_STYLES = [
  { key: "relaxed", label: "Relaxed" },
  { key: "foodie", label: "Foodie" },
  { key: "adventure", label: "Adventure" },
  { key: "culture", label: "Culture" },
] as const;

type TravelStyleKey = (typeof TRAVEL_STYLES)[number]["key"];

function formatPriceLevel(priceLevel?: string) {
  // Typical values: PRICE_LEVEL_FREE, PRICE_LEVEL_INEXPENSIVE, ...
  if (!priceLevel) return undefined;
  if (priceLevel.includes("FREE")) return "Free";
  if (priceLevel.includes("INEXPENSIVE")) return "$";
  if (priceLevel.includes("MODERATE")) return "$$";
  if (priceLevel.includes("EXPENSIVE")) return "$$$";
  if (priceLevel.includes("VERY_EXPENSIVE")) return "$$$$";
  return priceLevel.replace("PRICE_LEVEL_", "").toLowerCase();
}

function formatRating(rating?: number, count?: number) {
  if (typeof rating !== "number") return undefined;
  const r = rating.toFixed(1);
  const c = typeof count === "number" ? ` (${count.toLocaleString()})` : "";
  return `${r}★${c}`;
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
  const [style, setStyle] = useState<TravelStyleKey>("relaxed");
  const [duration, setDuration] = useState<DurationKey>(150);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onGenerate = async () => {
    const dest = destination.trim();

    if (!dest) {
      setError("Enter a destination to continue.");
      setPlan(null);
      return;
    }

    setError(null);
    setLoading(true);

    try {
      // ✅ This was missing before: call your API route
      const res = await fetch("/api/itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination: dest, totalMinutes: duration, vibe: style }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Itinerary API failed");
      }

      const data = (await res.json()) as PlanResponse;
      setPlan(data);
    } catch {
      setError("Could not generate itinerary. Make sure /api/itinerary exists and restart the dev server.");
      setPlan(null);
    } finally {
      setLoading(false);
    }
  };

  const onQuickDemo = () => {
    setDestination("Vancouver");
    setStyle("culture");
    setDuration(150);
    setError(null);
    setPlan(null);

    // run after state updates
    setTimeout(() => {
      void onGenerate();
    }, 0);
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
              <div className="text-xs text-white/60">2–3 hour itinerary builder</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/90 transition hover:bg-white/10"
              onClick={onQuickDemo}
              type="button"
            >
              Quick demo
            </button>
            <button className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black transition hover:bg-white/90" type="button">
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
              <span>Short, realistic plans</span>
            </div>

            <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
              Build a
              <span className="bg-gradient-to-r from-fuchsia-300 via-sky-300 to-emerald-200 bg-clip-text text-transparent"> 2–3 hour</span>
              {" "}itinerary
            </h1>
            <p className="mt-4 max-w-xl text-base text-white/70">
              Pick a destination, duration, and vibe. We’ll generate a tight plan you can actually follow.
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
                  <label className="text-xs text-white/60">Duration</label>
                  <div className="mt-1 grid grid-cols-3 gap-2">
                    {([120, 150, 180] as const).map((m) => {
                      const active = m === duration;
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setDuration(m)}
                          className={
                            "rounded-xl px-3 py-2 text-sm transition " +
                            (active
                              ? "bg-white text-black"
                              : "border border-white/15 bg-white/5 text-white/85 hover:bg-white/10")
                          }
                        >
                          {m === 120 ? "2h" : m === 150 ? "2.5h" : "3h"}
                        </button>
                      );
                    })}
                  </div>
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
                        type="button"
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
                    <span className="text-white/60">We’ll keep it within {duration} minutes.</span>
                  )}
                </div>

                <button
                  onClick={onGenerate}
                  disabled={loading}
                  className="group inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-60"
                  type="button"
                >
                  {loading ? "Generating…" : "Generate"}
                  <IconArrow className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/12 bg-white/5 p-4">
                <div className="text-xs text-white/55">Format</div>
                <div className="mt-1 text-sm font-semibold">Stops + travel</div>
                <div className="mt-1 text-sm text-white/65">2–3 stops with realistic timing.</div>
              </div>
              <div className="rounded-2xl border border-white/12 bg-white/5 p-4">
                <div className="text-xs text-white/55">Routing</div>
                <div className="mt-1 text-sm font-semibold">API-backed</div>
                <div className="mt-1 text-sm text-white/65">Uses /api/itinerary in your app.</div>
              </div>
              <div className="rounded-2xl border border-white/12 bg-white/5 p-4">
                <div className="text-xs text-white/55">Next</div>
                <div className="mt-1 text-sm font-semibold">Map view</div>
                <div className="mt-1 text-sm text-white/65">Plot stops on a map.</div>
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
                    {plan ? (
                      <>
                        {plan.destination || "—"} • {plan.totalMinutes} min • {TRAVEL_STYLES.find((s) => s.key === style)?.label}
                      </>
                    ) : (
                      "Generate to see your plan here"
                    )}
                  </div>
                </div>
                <button
                  className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/85 transition hover:bg-white/10 disabled:opacity-40"
                  onClick={() => setPlan(null)}
                  disabled={!plan}
                  type="button"
                >
                  Clear
                </button>
              </div>

              {plan ? (
                <div className="mt-4 grid gap-3">
                  {plan.items.map((it, idx) => (
                    <div
                      key={idx}
                      className={
                        "rounded-2xl border border-white/12 p-4 transition " +
                        (it.type === "stop" ? "bg-black/20 hover:bg-black/25" : "bg-white/5 hover:bg-white/10")
                      }
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold">{it.type === "stop" ? "Stop" : "Travel"}</div>
                        <div className="text-xs text-white/55">{it.durationMin} min</div>
                      </div>

                      <div className="mt-2 flex gap-3">
                        {it.type === "stop" && it.photoUrl ? (
                          <img
                            src={it.photoUrl}
                            alt={it.title}
                            className="h-16 w-16 rounded-xl object-cover ring-1 ring-white/10"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                        ) : null}

                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-white/85">{it.title}</div>
                          {it.address ? <div className="mt-1 text-xs text-white/55">{it.address}</div> : null}

                          {it.type === "stop" ? (
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                              {formatRating(it.rating, it.userRatingCount) ? (
                                <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-white/80">
                                  {formatRating(it.rating, it.userRatingCount)}
                                </span>
                              ) : null}

                              {formatPriceLevel(it.priceLevel) ? (
                                <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-white/80">
                                  {formatPriceLevel(it.priceLevel)}
                                </span>
                              ) : null}

                              {typeof it.openNow === "boolean" ? (
                                <span
                                  className={
                                    "rounded-full border px-2 py-0.5 " +
                                    (it.openNow
                                      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                                      : "border-rose-400/30 bg-rose-400/10 text-rose-200")
                                  }
                                >
                                  {it.openNow ? "Open now" : "Closed"}
                                </span>
                              ) : null}

                              {it.mapsUri ? (
                                <a
                                  href={it.mapsUri}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-white/80 hover:bg-white/10"
                                >
                                  Maps
                                </a>
                              ) : null}
                            </div>
                          ) : null}

                          {it.type === "stop" && it.reviewSnippet ? (
                            <div className="mt-2 text-xs text-white/65">“{it.reviewSnippet}”</div>
                          ) : null}

                          {it.type === "stop" && it.parking ? (
                            <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                              <div className="text-xs font-semibold text-white/80">Parking</div>
                              <div className="mt-1 text-xs text-white/70">{it.parking.name}</div>
                              {it.parking.address ? <div className="mt-0.5 text-xs text-white/55">{it.parking.address}</div> : null}
                              {it.parking.mapsUri ? (
                                <a
                                  href={it.parking.mapsUri}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-2 inline-flex text-xs text-white/70 underline decoration-white/30 hover:text-white"
                                >
                                  Open parking in Maps..
                                </a>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-white/12 bg-black/20 p-6">
                  <div className="text-sm font-semibold">Try a sample</div>
                  <div className="mt-1 text-sm text-white/65">Click <span className="text-white">Quick demo</span> in the top right.</div>
                </div>
              )}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/12 bg-white/5 p-4">
                <div className="text-sm font-semibold">How it works</div>
                <div className="mt-2 space-y-2 text-sm text-white/70">
                  <div className="flex gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-lg bg-white/10 text-xs ring-1 ring-white/10">1</span>
                    <span>Destination + duration</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-lg bg-white/10 text-xs ring-1 ring-white/10">2</span>
                    <span>Pick your vibe</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-lg bg-white/10 text-xs ring-1 ring-white/10">3</span>
                    <span>Generate a 2–3 hour plan</span>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-white/12 bg-white/5 p-4">
                <div className="text-sm font-semibold">Next upgrades</div>
                <div className="mt-2 space-y-1 text-sm text-white/70">
                  <div>• Google Places for real POIs</div>
                  <div>• Map + pins</div>
                  <div>• Save & share</div>
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
            <button className="hover:text-white/70" type="button">Privacy</button>
            <button className="hover:text-white/70" type="button">Terms</button>
            <button className="hover:text-white/70" type="button">Contact</button>
          </div>
        </div>
      </footer>
    </main>
  );
}
