"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Script from "next/script";

type PlanItem = {
  type: "stop" | "travel";
  title: string;
  placeId?: string; // ✅ added for swap
  durationMin: number;
  mode?: "DRIVE" | "WALK";
  lat?: number;
  lng?: number;
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
  parkOnce?: boolean;
  riderMode?: boolean;
  bufferMinutes?: number;
  items: PlanItem[];
};

type ScheduledPlanItem = PlanItem & {
  start: Date;
  end: Date;
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

function latLngStr(p?: { lat: number; lng: number } | null) {
  if (!p) return "";
  return `${p.lat},${p.lng}`;
}

function buildGoogleMapsRouteUrl(args: {
  origin?: { lat: number; lng: number } | null;
  stops: { lat: number; lng: number }[];
  travelMode?: "driving" | "walking";
}) {
  const { origin, stops, travelMode = "driving" } = args;
  if (!stops || stops.length === 0) return "https://www.google.com/maps";

  const destination = latLngStr(stops[stops.length - 1]);
  const waypoints = stops
    .slice(0, -1)
    .map((s) => latLngStr(s))
    .filter(Boolean)
    .join("|");

  const params = new URLSearchParams();
  params.set("api", "1");
  if (origin) params.set("origin", latLngStr(origin));
  params.set("destination", destination);
  if (waypoints) params.set("waypoints", waypoints);
  params.set("travelmode", travelMode);

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function buildGoogleMapsToStopUrl(args: {
  origin?: { lat: number; lng: number } | null;
  destination: { lat: number; lng: number };
  travelMode?: "driving" | "walking";
}) {
  const { origin, destination, travelMode = "driving" } = args;
  const params = new URLSearchParams();
  params.set("api", "1");
  if (origin) params.set("origin", latLngStr(origin));
  params.set("destination", latLngStr(destination));
  params.set("travelmode", travelMode);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function estimateCostRange(items: PlanItem[]) {
  const stopItems = items.filter((x) => x.type === "stop");
  if (stopItems.length === 0) return null;

  let min = 0;
  let max = 0;

  for (const it of stopItems) {
    const pl = it.priceLevel || "";
    if (pl.includes("FREE")) {
      min += 0;
      max += 0;
    } else if (pl.includes("INEXPENSIVE")) {
      min += 10;
      max += 25;
    } else if (pl.includes("MODERATE")) {
      min += 25;
      max += 60;
    } else if (pl.includes("EXPENSIVE")) {
      min += 60;
      max += 120;
    } else if (pl.includes("VERY_EXPENSIVE")) {
      min += 120;
      max += 250;
    } else {
      min += 10;
      max += 60;
    }
  }

  min += 5;
  max += 20;

  return { min, max };
}

function formatTime(d: Date) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }
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
      {/* Compass ring */}
      <path
        d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"
        stroke="currentColor"
        strokeWidth="1.6"
        opacity="0.9"
      />
      {/* Cardinal ticks */}
      <path
        d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.6"
      />
      {/* Needle */}
      <path
        d="M14.9 9.1 13 13l-3.9 1.9L11 11l3.9-1.9Z"
        fill="currentColor"
        opacity="0.9"
      />
      <path
        d="M14.9 9.1 13 13l-3.9 1.9L11 11l3.9-1.9Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
        opacity="0.9"
      />
      {/* Center dot */}
      <path
        d="M12 12.1a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8Z"
        fill="currentColor"
        opacity="0.9"
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

function IconCheck(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M20 6L9 17l-5-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ToggleRow(props: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const { label, description, value, onChange } = props;
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="flex w-full items-start justify-between gap-4 rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-left transition hover:bg-white/10"
      aria-pressed={value}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-semibold text-white/90">
          <span>{label}</span>
          {value ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
              <IconCheck className="h-3.5 w-3.5" />
              On
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-white/12 bg-black/20 px-2 py-0.5 text-[11px] font-semibold text-white/60">
              Off
            </span>
          )}
        </div>
        <div className="mt-1 text-xs leading-relaxed text-white/60">{description}</div>
      </div>

      <div
        className={
          "mt-0.5 flex h-6 w-11 items-center rounded-full border transition " +
          (value
            ? "border-emerald-400/30 bg-emerald-400/20"
            : "border-white/12 bg-black/20")
        }
        aria-hidden="true"
      >
        <div
          className={
            "h-5 w-5 rounded-full bg-white transition " +
            (value ? "translate-x-5" : "translate-x-0.5")
          }
        />
      </div>
    </button>
  );
}

function MapView({
  apiKey,
  stops,
  origin,
  travelMode,
}: {
  apiKey: string;
  stops: { title: string; lat: number; lng: number }[];
  origin?: { lat: number; lng: number } | null;
  travelMode?: "DRIVING" | "WALKING";
}) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const directionsRef = useRef<any>(null);
  const [loaded, setLoaded] = useState(false);

  const ready =
    loaded && typeof window !== "undefined" && (window as any).google?.maps;

  useEffect(() => {
    if (!ready) return;
    if (!mapDivRef.current) return;
    if (mapRef.current) return;

    const first = stops?.[0];
    const center = first
      ? { lat: first.lat, lng: first.lng }
      : { lat: 49.2827, lng: -123.1207 };

    const g = (window as any).google;
    mapRef.current = new g.maps.Map(mapDivRef.current, {
      center,
      zoom: 12,
      mapTypeControl: false,
      fullscreenControl: false,
      streetViewControl: false,
    });
  }, [loaded, ready, stops]);

  useEffect(() => {
    if (!ready) return;
    if (!mapRef.current) return;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    if (!stops || stops.length === 0) return;

    const g = (window as any).google;
    const bounds = new g.maps.LatLngBounds();

    if (origin?.lat != null && origin?.lng != null) {
      bounds.extend({ lat: origin.lat, lng: origin.lng });
    }

    stops.forEach((s, idx) => {
      const pos = { lat: s.lat, lng: s.lng };
      bounds.extend(pos);

      const marker = new g.maps.Marker({
        map: mapRef.current!,
        position: pos,
        title: s.title,
        label: {
          text: String(idx + 1),
          color: "#ffffff",
          fontWeight: "600",
        },
      });

      const info = new g.maps.InfoWindow({
        content: `<div style="font-size:13px; font-weight:600; padding:2px 0;">${s.title}</div>`,
      });

      marker.addListener("click", () =>
        info.open({ map: mapRef.current!, anchor: marker })
      );

      markersRef.current.push(marker);
    });

    mapRef.current.fitBounds(bounds, 80);
  }, [loaded, ready, stops, origin]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    if (!stops || stops.length === 0) return;

    const g = (window as any).google;

    const ptsAll = stops.map((s) => ({ lat: s.lat, lng: s.lng }));
    const originPt =
      origin && origin.lat != null && origin.lng != null
        ? { lat: origin.lat, lng: origin.lng }
        : ptsAll[0];
    const pts =
      origin && origin.lat != null && origin.lng != null ? ptsAll : ptsAll.slice(1);
    if (pts.length === 0) return;

    if (directionsRef.current) {
      try {
        directionsRef.current.setMap(null);
      } catch {}
      directionsRef.current = null;
    }

    const ds = new g.maps.DirectionsService();
    const dr = new g.maps.DirectionsRenderer({
      suppressMarkers: true,
      preserveViewport: true,
    });

    dr.setMap(mapRef.current);
    directionsRef.current = dr;

    const mode =
      travelMode === "WALKING"
        ? g.maps.TravelMode.WALKING
        : g.maps.TravelMode.DRIVING;

    const destination = pts[pts.length - 1];
    const waypoints = pts
      .slice(0, -1)
      .map((p) => ({ location: p, stopover: true }));

    ds.route(
      {
        origin: originPt,
        destination,
        waypoints,
        travelMode: mode,
        optimizeWaypoints: false,
      },
      (result: any, status: string) => {
        if (status === "OK" && result) {
          dr.setDirections(result);
        }
      }
    );

    return () => {
      try {
        dr.setMap(null);
      } catch {}
    };
  }, [loaded, ready, origin, travelMode, stops]);

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="text-sm font-semibold text-white/85">Map</div>
        <div className="text-xs text-white/55">
          Stops: {stops.length}
          {origin ? " + you" : ""}
        </div>
      </div>

      {!ready ? (
        <div className="flex h-[360px] w-full items-center justify-center text-sm text-white/55">
          Loading map…
        </div>
      ) : null}

      <div
        ref={mapDivRef}
        className={"w-full " + (ready ? "h-[360px]" : "h-0")}
      />

      <Script
        id="google-maps-js"
        src={`https://maps.googleapis.com/maps/api/js?key=${apiKey}`}
        strategy="afterInteractive"
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}

export default function Home() {
  const [destination, setDestination] = useState("");
  const [style, setStyle] = useState<TravelStyleKey>("relaxed");
  const [duration, setDuration] = useState<DurationKey>(150);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [swappingIdx, setSwappingIdx] = useState<number | null>(null); // ✅ added

  const [parkOnce, setParkOnce] = useState(false);
  const [riderMode, setRiderMode] = useState(false);
  const [addBuffer, setAddBuffer] = useState(false);

  const [startMode, setStartMode] = useState<"now" | "custom">("now");
  const [startClock, setStartClock] = useState("10:00");

  const [showMap, setShowMap] = useState(true);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [locError, setLocError] = useState<string | null>(null);

  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

  const mapStops = useMemo(() => {
    if (!plan) return [] as { title: string; lat: number; lng: number }[];
    return plan.items
      .filter(
        (it) =>
          it.type === "stop" &&
          typeof it.lat === "number" &&
          typeof it.lng === "number"
      )
      .map((it) => ({
        title: it.title,
        lat: it.lat as number,
        lng: it.lng as number,
      }));
  }, [plan]);

  const routeStops = useMemo(() => {
    if (!plan) return [] as { lat: number; lng: number }[];
    return plan.items
      .filter(
        (it) =>
          it.type === "stop" &&
          typeof it.lat === "number" &&
          typeof it.lng === "number"
      )
      .map((it) => ({ lat: it.lat as number, lng: it.lng as number }));
  }, [plan]);

  const cost = useMemo(
    () => (plan ? estimateCostRange(plan.items) : null),
    [plan]
  );

  const scheduledItems = useMemo((): ScheduledPlanItem[] => {
    if (!plan) return [];

    const base = new Date();
    let cursor = new Date(base);

    if (startMode === "custom") {
      const parts = String(startClock || "").split(":");
      const hh = Number(parts[0]);
      const mm = Number(parts[1]);
      if (Number.isFinite(hh) && Number.isFinite(mm)) {
        cursor.setHours(hh, mm, 0, 0);
      }
    }

    return plan.items.map((item) => {
      const start = new Date(cursor);
      const end = new Date(cursor.getTime() + (item.durationMin || 0) * 60_000);
      cursor = end;
      return { ...item, start, end };
    });
  }, [plan, startMode, startClock]);

  async function captureMyLocation() {
    setLocError(null);
    if (typeof window === "undefined" || !navigator?.geolocation) {
      setLocError("Geolocation not available in this browser.");
      return;
    }

    return new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          resolve();
        },
        (err) => {
          setLocError(err?.message || "Location permission denied.");
          resolve();
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60_000 }
      );
    });
  }

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
      const res = await fetch("/api/itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination: dest,
          totalMinutes: duration,
          vibe: style,
          parkOnce,
          riderMode,
          bufferMinutes: addBuffer ? 10 : 0,
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Itinerary API failed");
      }

      const data = (await res.json()) as PlanResponse;
      setPlan(data);
      void captureMyLocation();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not generate itinerary.";
      setError(msg);
      setPlan(null);
    } finally {
      setLoading(false);
    }
  };

  // ✅ Swap stop handler
  const onSwapStop = async (stopIdxInStops: number) => {
    if (!plan) return;

    const stopsOnly = plan.items
      .filter((x) => x.type === "stop")
      .map((s) => ({
        placeId: s.placeId,
        title: s.title,
        durationMin: s.durationMin,
        lat: s.lat,
        lng: s.lng,
      }))
      .filter(
        (s) =>
          typeof s.placeId === "string" &&
          s.placeId.length > 0 &&
          typeof s.lat === "number" &&
          typeof s.lng === "number"
      );

    const target = stopsOnly[stopIdxInStops];
    if (!target?.placeId || typeof target.lat !== "number" || typeof target.lng !== "number") {
      setError(
        "Swap isn’t available for this stop yet (missing Google placeId or coordinates). Please Generate again."
      );
      return;
    }

    setError(null);
    setSwappingIdx(stopIdxInStops);

    try {
      const res = await fetch("/api/itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "swap",
          destination: plan.destination,
          totalMinutes: plan.totalMinutes,
          vibe: style,
          parkOnce,
          riderMode,
          bufferMinutes: addBuffer ? 10 : 0,
          stops: stopsOnly,
          swapIndex: stopIdxInStops,
          swapPlaceId: target.placeId,
          swapLat: target.lat,
          swapLng: target.lng,
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Swap failed");
      }

      const data = (await res.json()) as PlanResponse;
      setPlan(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Swap failed";
      setError(msg);
    } finally {
      setSwappingIdx(null);
    }
  };

  const onQuickDemo = () => {
    setDestination("Vancouver");
    setStyle("culture");
    setDuration(150);
    setError(null);
    setPlan(null);

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
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
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
            <button
              className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black transition hover:bg-white/90"
              type="button"
            >
              Sign in
            </button>
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="mx-auto max-w-6xl px-4 pb-8 pt-10">
        <div className="grid items-start gap-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80">
              <IconSparkle className="h-4 w-4" />
              <span>Short, realistic plans</span>
            </div>

            <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
              Build a
              <span className="bg-gradient-to-r from-fuchsia-300 via-sky-300 to-emerald-200 bg-clip-text text-transparent">
                {" "}
                2–3 hour
              </span>{" "}
              itinerary
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

              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-white/60">Options</div>
                  <div className="text-xs text-white/45">Tap to toggle</div>
                </div>

                <div className="mt-2 grid gap-2">
                  <ToggleRow
                    label="Park once"
                    description="Pick a walkable cluster: park near the first stop, then walk between stops."
                    value={parkOnce}
                    onChange={(v) => setParkOnce(v)}
                  />

                  <ToggleRow
                    label="Rider mode"
                    description="More scenic stops + easy pull-ins. Better for motorcycles and quick loops."
                    value={riderMode}
                    onChange={(v) => setRiderMode(v)}
                  />

                  <ToggleRow
                    label="Add buffer"
                    description="Adds +10 minutes to each travel leg for traffic, parking, and delays."
                    value={addBuffer}
                    onChange={(v) => setAddBuffer(v)}
                  />
                </div>

                <div className="mt-2 text-xs text-white/55">
                  {parkOnce || riderMode || addBuffer
                    ? "Nice — your itinerary will adapt based on these toggles."
                    : "Optional: turn these on to make your plan more realistic and easier to follow."}
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs text-white/60">Schedule</div>
                    <div className="mt-0.5 text-sm font-semibold text-white/85">Start time</div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setStartMode("now")}
                      className={
                        "rounded-full px-3 py-1.5 text-sm transition " +
                        (startMode === "now"
                          ? "bg-white text-black"
                          : "border border-white/15 bg-white/5 text-white/85 hover:bg-white/10")
                      }
                    >
                      Now
                    </button>

                    <button
                      type="button"
                      onClick={() => setStartMode("custom")}
                      className={
                        "rounded-full px-3 py-1.5 text-sm transition " +
                        (startMode === "custom"
                          ? "bg-white text-black"
                          : "border border-white/15 bg-white/5 text-white/85 hover:bg-white/10")
                      }
                    >
                      Choose time
                    </button>

                    <input
                      type="time"
                      value={startClock}
                      onChange={(e) => {
                        setStartClock(e.target.value);
                        setStartMode("custom");
                      }}
                      className={
                        "rounded-xl border px-3 py-2 text-sm outline-none transition " +
                        (startMode === "custom"
                          ? "border-white/25 bg-black/30 text-white"
                          : "border-white/10 bg-black/20 text-white/60")
                      }
                    />
                  </div>
                </div>

                <div className="mt-2 text-xs text-white/55">
                  Shows real start/end times for each drive/walk and stop.
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

              {plan ? (
                <div className="mt-4">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-white/60">Map</div>
                    <button
                      className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/85 transition hover:bg-white/10"
                      onClick={() => setShowMap((v) => !v)}
                      type="button"
                    >
                      {showMap ? "Hide" : "Show"}
                    </button>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="text-xs text-white/55">
                      {userLoc
                        ? "Route starts from your current location"
                        : "Tip: click ‘Use my location’ for better routes"}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void captureMyLocation()}
                        className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/85 transition hover:bg-white/10"
                      >
                        Use my location
                      </button>

                      <a
                        href={buildGoogleMapsRouteUrl({
                          origin: userLoc,
                          stops: routeStops,
                          travelMode: parkOnce ? "walking" : "driving",
                        })}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/85 transition hover:bg-white/10"
                      >
                        Open full route
                      </a>
                    </div>
                  </div>

                  {locError ? (
                    <div className="mt-2 text-xs text-rose-200/90">
                      {locError} You can still open routes—starting point will default to the first stop.
                    </div>
                  ) : null}

                  {showMap ? (
                    mapsKey ? (
                      <MapView
                        apiKey={mapsKey}
                        stops={mapStops}
                        origin={userLoc}
                        travelMode={parkOnce ? "WALKING" : "DRIVING"}
                      />
                    ) : (
                      <div className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
                        Map view needs{" "}
                        <span className="font-semibold">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</span> in your env.
                        <div className="mt-1 text-xs text-amber-100/80">
                          Add it to <code>.env.local</code> and Vercel env vars, then restart.
                        </div>
                      </div>
                    )
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* preview */}
            <div className="mt-8">
              <div className="rounded-3xl border border-white/12 bg-white/5 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.06)] backdrop-blur">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-white/60">Preview</div>
                    <div className="mt-1 text-lg font-semibold">Your itinerary</div>
                    <div className="mt-1 text-sm text-white/60">
                      {plan ? (
                        <>
                          {plan.destination || "—"} • {plan.totalMinutes} min •{" "}
                          {TRAVEL_STYLES.find((s) => s.key === style)?.label}
                          {plan.items?.some(
                            (x) =>
                              x.type === "stop" &&
                              (x.photoUrl ||
                                x.rating ||
                                x.priceLevel ||
                                x.openNow !== undefined ||
                                x.reviewSnippet ||
                                x.parking)
                          ) ? (
                            <span className="ml-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-xs text-emerald-200">
                              Enriched
                            </span>
                          ) : (
                            <span className="ml-2 rounded-full border border-rose-400/30 bg-rose-400/10 px-2 py-0.5 text-xs text-rose-200">
                              Basic
                            </span>
                          )}

                          {riderMode ? (
                            <span className="ml-2 rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 text-xs text-sky-200">
                              Rider Mode
                            </span>
                          ) : null}

                          {plan?.bufferMinutes ? (
                            <span className="ml-2 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-xs text-white/80">
                              Buffer +{plan.bufferMinutes}m/leg
                            </span>
                          ) : null}

                          {cost ? (
                            <span className="ml-2 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-xs text-white/80">
                              Est. ${cost.min}–${cost.max}
                            </span>
                          ) : null}
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
                    {scheduledItems.map((it, idx) => (
                      <div
                        key={idx}
                        className={
                          "rounded-2xl border border-white/12 p-4 transition " +
                          (it.type === "stop"
                            ? "bg-black/20 hover:bg-black/25"
                            : "bg-white/5 hover:bg-white/10")
                        }
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold">
                              {it.type === "stop"
                                ? "Stop"
                                : it.mode === "WALK"
                                ? "Walk"
                                : "Drive"}
                            </div>
                            <div className="mt-0.5 text-xs text-white/55">
                              {formatTime(it.start)} – {formatTime(it.end)}
                            </div>
                          </div>

                          {/* ✅ Swap + duration */}
                          <div className="flex items-center gap-2">
                            {it.type === "stop" ? (
                              <>
                                {(() => {
                                  const currentStopIndex =
                                    scheduledItems
                                      .slice(0, idx + 1)
                                      .filter((x) => x.type === "stop").length - 1;
                                  const isThisSwapping = swappingIdx === currentStopIndex;

                                  return (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void onSwapStop(currentStopIndex);
                                      }}
                                      disabled={isThisSwapping}
                                      className={
                                        "rounded-full px-2 py-1 text-xs transition " +
                                        (isThisSwapping
                                          ? "border border-white/10 bg-white/5 text-white/45"
                                          : "border border-white/15 bg-white/5 text-white/80 hover:bg-white/10")
                                      }
                                    >
                                      {isThisSwapping ? "Swapping…" : "Swap"}
                                    </button>
                                  );
                                })()}
                              </>
                            ) : null}
                            <div className="text-xs text-white/55">{it.durationMin} min</div>
                          </div>
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
                            {it.type === "stop" &&
                            typeof it.lat === "number" &&
                            typeof it.lng === "number" ? (
                              <a
                                href={buildGoogleMapsToStopUrl({
                                  origin: userLoc,
                                  destination: { lat: it.lat, lng: it.lng },
                                  travelMode: plan?.parkOnce ? "walking" : "driving",
                                })}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm font-semibold text-white/90 hover:underline decoration-white/30"
                              >
                                {it.title}
                              </a>
                            ) : (
                              <div className="text-sm text-white/85">{it.title}</div>
                            )}

                            {it.address ? (
                              <div className="mt-1 text-xs text-white/55">{it.address}</div>
                            ) : null}

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

                                {typeof it.lat === "number" && typeof it.lng === "number" ? (
                                  <a
                                    href={buildGoogleMapsToStopUrl({
                                      origin: userLoc,
                                      destination: { lat: it.lat, lng: it.lng },
                                      travelMode: plan?.parkOnce ? "walking" : "driving",
                                    })}
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
                                {it.parking.address ? (
                                  <div className="mt-0.5 text-xs text-white/55">
                                    {it.parking.address}
                                  </div>
                                ) : null}
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
                    <div className="mt-1 text-sm text-white/65">
                      Click <span className="text-white">Quick demo</span> in the top right.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-4 pb-10 pt-2 text-sm text-white/45">
        <div className="flex flex-col gap-2 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            © {new Date().getFullYear()} {APP_NAME}
          </div>
          <div className="flex gap-4">
            <button className="hover:text-white/70" type="button">
              Privacy
            </button>
            <button className="hover:text-white/70" type="button">
              Terms
            </button>
            <button className="hover:text-white/70" type="button">
              Contact
            </button>
          </div>
        </div>
      </footer>
    </main>
  );
}