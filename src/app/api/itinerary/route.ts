import { NextResponse } from "next/server";

// Force Node runtime for stable env + fetch behavior
export const runtime = "nodejs";

const PLACES_SEARCH_TEXT = "https://places.googleapis.com/v1/places:searchText";
const PLACE_DETAILS_BASE = "https://places.googleapis.com/v1/places/";
const ROUTES_COMPUTE = "https://routes.googleapis.com/directions/v2:computeRoutes";

type LatLng = { latitude: number; longitude: number };

type ParkingOption = {
  placeId?: string;
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  mapsUri?: string;
};

type StopDetails = {
  placeId: string;
  title: string;
  address?: string;
  lat: number;
  lng: number;
  mapsUri?: string;

  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  openNow?: boolean;
  weekdayText?: string[];
  photoUrl?: string;
  reviewSnippet?: string;
  parking?: ParkingOption;
};

type PlanItem =
  | ({ type: "stop"; durationMin: number } & StopDetails)
  | { type: "travel"; title: string; durationMin: number; mode: "DRIVE" | "WALK" };

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function toMinsFromDuration(durationStr: string): number {
  const secs = Number(String(durationStr ?? "").replace("s", "")) || 900;
  return Math.max(5, Math.round(secs / 60));
}

function safeText(s: any, maxLen: number) {
  const t = String(s ?? "").trim();
  if (!t) return undefined;
  return t.length > maxLen ? `${t.slice(0, maxLen - 1)}…` : t;
}

function haversineKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
) {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const sin1 = Math.sin(dLat / 2);
  const sin2 = Math.sin(dLon / 2);
  const h = sin1 * sin1 + Math.cos(lat1) * Math.cos(lat2) * sin2 * sin2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function pickCategory(types: any): "food" | "park" | "attraction" {
  const t = Array.isArray(types) ? (types as string[]) : [];
  const has = (k: string) => t.includes(k);

  if (
    has("restaurant") ||
    has("cafe") ||
    has("bakery") ||
    has("bar") ||
    has("meal_takeaway") ||
    has("meal_delivery")
  ) {
    return "food";
  }

  if (
    has("park") ||
    has("natural_feature") ||
    has("campground") ||
    has("rv_park") ||
    has("hiking_area")
  ) {
    return "park";
  }

  return "attraction";
}

function isNoisyType(types: any) {
  const t = Array.isArray(types) ? (types as string[]) : [];
  const bad = new Set([
    "accounting",
    "atm",
    "bank",
    "car_dealer",
    "car_rental",
    "car_repair",
    "car_wash",
    "courthouse",
    "dentist",
    "doctor",
    "electrician",
    "finance",
    "gas_station",
    "insurance_agency",
    "lawyer",
    "local_government_office",
    "moving_company",
    "painter",
    "pharmacy",
    "plumber",
    "police",
    "post_office",
    "real_estate_agency",
    "school",
    "storage",
    "transit_station",
    "vehicle_inspection",
    "hospital",
  ]);

  const nonBad = t.filter((x) => !bad.has(x));
  if (nonBad.length === 0 && t.length > 0) return true;

  return false;
}

function scoreCandidate(p: any, riderMode?: boolean) {
  const rating = typeof p?.rating === "number" ? p.rating : 0;
  const count = typeof p?.userRatingCount === "number" ? p.userRatingCount : 0;

  const score = rating * 12 + Math.log10(Math.max(1, count)) * 8;

  const cat = pickCategory(p?.types);
  const boost = cat === "attraction" ? 1.12 : cat === "park" ? 1.08 : 1.0;

  if (riderMode) {
    const t = Array.isArray(p?.types) ? (p.types as string[]) : [];
    const scenicBoostTypes = new Set([
      "tourist_attraction",
      "park",
      "natural_feature",
      "viewpoint",
      "scenic_lookout",
      "hiking_area",
      "campground",
    ]);

    const isScenic = t.some((x) => scenicBoostTypes.has(x));
    const hasFood = t.includes("cafe") || t.includes("restaurant") || t.includes("bakery");

    if (isScenic) return score * boost * 1.18;
    if (hasFood) return score * boost * 1.08;
  }

  return score * boost;
}

function vibeToQuery(vibe: string, destination: string) {
  if (vibe === "adventure") return `top viewpoints parks trails in ${destination}`;
  if (vibe === "foodie") return `best cafes restaurants bakeries in ${destination}`;
  if (vibe === "relaxed") return `waterfront parks cafes in ${destination}`;
  return `top tourist attractions museums in ${destination}`;
}

function desiredCategoriesMulti(
  vibes: string[],
  stopCount: number
): ("attraction" | "food" | "park")[] {
  const v = new Set((vibes || []).map((x) => String(x)));
  const wants: ("attraction" | "food" | "park")[] = [];

  // Always include at least one "attraction" to keep diversity.
  wants.push("attraction");

  if (v.has("foodie")) wants.push("food");
  if (v.has("adventure") || v.has("relaxed")) wants.push("park");
  if (v.has("culture")) wants.push("attraction");

  // Fill remaining with a nice cycle
  const cycle: ("attraction" | "food" | "park")[] = ["food", "park", "attraction"];
  for (const c of cycle) if (!wants.includes(c)) wants.push(c);

  // Trim to stopCount
  return wants.slice(0, stopCount);
}

function orderByNearestNeighbor(list: any[], riderMode?: boolean) {
  if (list.length <= 2) return list;
  const remaining = [...list];
  const ordered: any[] = [];

  remaining.sort((a, b) => scoreCandidate(b, riderMode) - scoreCandidate(a, riderMode));
  ordered.push(remaining.shift());

  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    const lastLoc = last?.location;
    if (!lastLoc) {
      ordered.push(remaining.shift());
      continue;
    }

    let bestIdx = 0;
    let bestD = Number.POSITIVE_INFINITY;
    for (let i = 0; i < remaining.length; i++) {
      const loc = remaining[i]?.location;
      if (!loc) continue;
      const d = haversineKm(lastLoc, loc);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    ordered.push(remaining.splice(bestIdx, 1)[0]);
  }

  return ordered.filter(Boolean);
}

async function googleFetch(url: string, opts: RequestInit & { fieldMask?: string; key: string }) {
  const { fieldMask, key, ...rest } = opts;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": key,
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (fieldMask) headers["X-Goog-FieldMask"] = fieldMask;

  return fetch(url, { ...rest, headers });
}

async function searchPlacesText(key: string, textQuery: string, maxResultCount = 10) {
  const res = await googleFetch(PLACES_SEARCH_TEXT, {
    key,
    method: "POST",
    body: JSON.stringify({ textQuery, maxResultCount }),
    fieldMask:
      "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.rating,places.userRatingCount",
  });

  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return (data?.places ?? []) as any[];
}

async function getPlaceDetails(key: string, placeId: string) {
  const url = `${PLACE_DETAILS_BASE}${encodeURIComponent(placeId)}`;
  const res = await googleFetch(url, {
    key,
    method: "GET",
    fieldMask:
      "id,displayName,formattedAddress,location,types,rating,userRatingCount,priceLevel,regularOpeningHours,photos,reviews,googleMapsUri",
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as any;
}

async function getPhotoUri(key: string, photoName: string, maxWidthPx = 900) {
  const url = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true`;
  const res = await googleFetch(url, { key, method: "GET", fieldMask: "photoUri" });
  if (!res.ok) return undefined;
  const data = await res.json();
  return data?.photoUri as string | undefined;
}

async function computeRouteMinutes(
  key: string,
  origin: LatLng,
  destination: LatLng,
  travelMode: "DRIVE" | "WALK"
) {
  const res = await googleFetch(ROUTES_COMPUTE, {
    key,
    method: "POST",
    body: JSON.stringify({
      origin: { location: { latLng: origin } },
      destination: { location: { latLng: destination } },
      travelMode,
    }),
    fieldMask: "routes.duration",
  });

  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  const dur = data?.routes?.[0]?.duration ?? "900s";
  return toMinsFromDuration(dur);
}

async function findParkingNear(key: string, placeTitle: string, destinationLabel: string) {
  const q = `parking near ${placeTitle} ${destinationLabel}`;
  const results = await searchPlacesText(key, q, 5);
  const best = results?.[0];
  if (!best) return undefined;

  const loc = best?.location;

  return {
    placeId: best?.id,
    name: best?.displayName?.text ?? "Parking",
    address: best?.formattedAddress,
    lat: typeof loc?.latitude === "number" ? loc.latitude : undefined,
    lng: typeof loc?.longitude === "number" ? loc.longitude : undefined,
  } as ParkingOption;
}

async function enrichParkingMapsUri(key: string, parking?: ParkingOption) {
  if (!parking?.placeId) return parking;
  try {
    const details = await getPlaceDetails(key, parking.placeId);
    return {
      ...parking,
      mapsUri: details?.googleMapsUri,
    } as ParkingOption;
  } catch {
    return parking;
  }
}

function pickStopCount(totalMinutes: number) {
  return totalMinutes <= 140 ? 2 : 3;
}

function splitStopDurations(totalMinutes: number, travelTotal: number, stopCount: number) {
  const remaining = Math.max(60, totalMinutes - travelTotal);
  if (stopCount === 2) {
    const a = Math.floor(remaining * 0.55);
    return [a, remaining - a];
  }
  const a = Math.floor(remaining * 0.42);
  const b = Math.floor(remaining * 0.35);
  return [a, b, remaining - a - b];
}

export async function POST(req: Request) {
  console.log("🔥 /api/itinerary HIT (GOOGLE+DRIVE)");

  try {
    const body = await req.json().catch(() => ({}));

    const action = String(body?.action ?? "").trim();

    // -----------------------------
    // SWAP STOP (replace only 1 stop)
    // -----------------------------
    if (action === "swap") {
      const destination = String(body?.destination ?? "").trim();
      const totalMinutes = clamp(Number(body?.totalMinutes ?? 150), 120, 420);
      const vibe = String(body?.vibe ?? "culture");
      const vibes = Array.isArray(body?.vibes) ? (body.vibes as string[]).map((x) => String(x)) : [];
      const vibesFinal = vibes.length ? vibes : [vibe];
      const vibeLabel = vibesFinal.length > 1 ? "mixed" : vibesFinal[0];
      const parkOnce = Boolean(body?.parkOnce);
      const riderMode = Boolean(body?.riderMode);
      const bufferMinutes = clamp(Number(body?.bufferMinutes ?? 0), 0, 20);

      const swapIndex = clamp(Number(body?.swapIndex ?? -1), 0, 10);
      const swapPlaceId = String(body?.swapPlaceId ?? "").trim();
      const swapLat = Number(body?.swapLat);
      const swapLng = Number(body?.swapLng);

      const rawStops = Array.isArray(body?.stops) ? body.stops : [];

      if (!destination) {
        return NextResponse.json({ error: "Destination is required" }, { status: 400 });
      }

      const key = process.env.GOOGLE_MAPS_API_KEY;
      if (!key) {
        return NextResponse.json(
          { error: "Missing GOOGLE_MAPS_API_KEY. Add it to .env.local and restart npm run dev." },
          { status: 500 }
        );
      }

      const stopsInput = rawStops
        .map((s: any) => ({
          placeId: String(s?.placeId ?? "").trim(),
          title: String(s?.title ?? "").trim(),
          durationMin: clamp(Number(s?.durationMin ?? 40), 20, 180),
          lat: Number(s?.lat),
          lng: Number(s?.lng),
        }))
        .filter((s: any) => s.placeId);

      if (stopsInput.length < 2) {
        return NextResponse.json({ error: "Not enough stops to swap" }, { status: 400 });
      }

      if (swapIndex < 0 || swapIndex >= stopsInput.length) {
        return NextResponse.json({ error: "Invalid swap index" }, { status: 400 });
      }

      const currentStop = stopsInput[swapIndex];
      const centerLat = Number.isFinite(swapLat) ? swapLat : currentStop?.lat;
      const centerLng = Number.isFinite(swapLng) ? swapLng : currentStop?.lng;

      if (!swapPlaceId || !Number.isFinite(centerLat) || !Number.isFinite(centerLng)) {
        return NextResponse.json({ error: "Invalid swap request" }, { status: 400 });
      }

      // Determine category of the stop being swapped using its current place types
      let swapTypes: string[] = [];
      try {
        const d = await getPlaceDetails(key, swapPlaceId);
        swapTypes = Array.isArray(d?.types) ? (d.types as string[]) : [];
      } catch {
        swapTypes = [];
      }

      const targetCategory = pickCategory(swapTypes);

      const qNearby =
        targetCategory === "food"
          ? `cafes restaurants near ${centerLat},${centerLng}`
          : targetCategory === "park"
          ? `parks viewpoints near ${centerLat},${centerLng}`
          : `tourist attractions museums near ${centerLat},${centerLng}`;

      let candidates: any[] = [];
      try {
        candidates = await searchPlacesText(key, qNearby, 30);
      } catch {
        candidates = [];
      }

      const excludeIds = new Set(stopsInput.map((s: any) => s.placeId));
      excludeIds.delete(swapPlaceId);

      const swapCenter: LatLng = { latitude: centerLat, longitude: centerLng };
      const maxKm = parkOnce ? 2.0 : 4.0;

      const filtered = candidates
        .filter((p) => p?.id && p?.location?.latitude != null && p?.location?.longitude != null)
        .filter((p) => !excludeIds.has(String(p.id)))
        .filter((p) => !isNoisyType(p?.types))
        .filter((p) => pickCategory(p?.types) === targetCategory)
        .filter((p) => haversineKm(swapCenter, p.location) <= maxKm)
        .sort((a, b) => scoreCandidate(b, riderMode) - scoreCandidate(a, riderMode));

      let replacement: any | undefined;

      for (const cand of filtered.slice(0, 12)) {
        const candId = String(cand?.id ?? "");
        if (!candId) continue;
        try {
          const details = await getPlaceDetails(key, candId);
          const openNow = details?.regularOpeningHours?.openNow;
          // Skip explicitly closed places
          if (openNow === false) continue;
          replacement = cand;
          break;
        } catch {
          // ignore and try next candidate
        }
      }

      if (!replacement?.id) {
        return NextResponse.json({ error: "No OPEN replacement found nearby" }, { status: 404 });
      }

      // Replace only the swapped stop's placeId; keep durations exactly as provided
      const nextStops = [...stopsInput];
      nextStops[swapIndex] = {
        ...nextStops[swapIndex],
        placeId: String(replacement.id),
      };

      // Enrich all stops with place details (2–3 stops only), sequentially,
      // and reject if any stop is explicitly closed right now.
      const stops: StopDetails[] = [];

      for (const s of nextStops) {
        const details = await getPlaceDetails(key, s.placeId);

        const openNow = details?.regularOpeningHours?.openNow;
        // If a stop is explicitly closed right now, don't include it.
        if (openNow === false) {
          return NextResponse.json(
            { error: `One of the stops is closed right now (${details?.displayName?.text ?? "Place"}). Please regenerate.` },
            { status: 404 }
          );
        }

        let photoUrl: string | undefined;
        const firstPhotoName = details?.photos?.[0]?.name;
        if (firstPhotoName) {
          photoUrl = await getPhotoUri(key, firstPhotoName, 1000);
        }

        const reviewSnippet = safeText(details?.reviews?.[0]?.text?.text, 170);

        const weekdayText = Array.isArray(details?.regularOpeningHours?.weekdayDescriptions)
          ? (details.regularOpeningHours.weekdayDescriptions as string[])
          : undefined;

        let parking: ParkingOption | undefined;
        try {
          const base = await findParkingNear(key, details?.displayName?.text ?? "", destination);
          parking = await enrichParkingMapsUri(key, base);
        } catch {
          parking = undefined;
        }

        stops.push({
          placeId: String(s.placeId),
          title: details?.displayName?.text ?? s.title ?? "Place",
          address: details?.formattedAddress,
          lat: Number(details?.location?.latitude),
          lng: Number(details?.location?.longitude),
          mapsUri: details?.googleMapsUri,

          rating: typeof details?.rating === "number" ? details.rating : undefined,
          userRatingCount: typeof details?.userRatingCount === "number" ? details.userRatingCount : undefined,
          priceLevel: typeof details?.priceLevel === "string" ? details.priceLevel : undefined,
          openNow: typeof openNow === "boolean" ? openNow : undefined,
          weekdayText,
          photoUrl,
          reviewSnippet,
          parking,
        } as StopDetails);
      }

      // Park-once anchor parking near the FIRST stop
      let parkOnceLocation: ParkingOption | undefined;
      if (parkOnce && stops.length > 0) {
        try {
          const base = await findParkingNear(key, stops[0].title, destination);
          parkOnceLocation = await enrichParkingMapsUri(key, base);
        } catch {
          parkOnceLocation = undefined;
        }
      }

      // Compute travel legs
      const travelMins: number[] = [];

      if (parkOnce && parkOnceLocation?.lat != null && parkOnceLocation?.lng != null && stops.length > 0) {
        const firstStop = stops[0];
        const fromParkingToFirst = await computeRouteMinutes(
          key,
          { latitude: parkOnceLocation.lat, longitude: parkOnceLocation.lng },
          { latitude: firstStop.lat, longitude: firstStop.lng },
          "WALK"
        );
        travelMins.push(fromParkingToFirst + bufferMinutes);

        for (let i = 0; i < stops.length - 1; i++) {
          const a = stops[i];
          const b = stops[i + 1];
          const mins = await computeRouteMinutes(
            key,
            { latitude: a.lat, longitude: a.lng },
            { latitude: b.lat, longitude: b.lng },
            "WALK"
          );
          travelMins.push(mins + bufferMinutes);
        }
      } else {
        for (let i = 0; i < stops.length - 1; i++) {
          const a = stops[i];
          const b = stops[i + 1];
          const mins = await computeRouteMinutes(
            key,
            { latitude: a.lat, longitude: a.lng },
            { latitude: b.lat, longitude: b.lng },
            "DRIVE"
          );
          travelMins.push(mins + bufferMinutes);
        }
      }

      // Preserve stop durations exactly from the client
      const stopDurations = nextStops.map((s: any) => clamp(Number(s?.durationMin ?? 40), 20, 180));

      const items: PlanItem[] = [];

      if (parkOnce && parkOnceLocation?.lat != null && parkOnceLocation?.lng != null) {
        items.push({
          type: "stop",
          durationMin: 5,
          placeId: parkOnceLocation.placeId || "parking",
          title: "Park once",
          address: parkOnceLocation.address,
          lat: parkOnceLocation.lat,
          lng: parkOnceLocation.lng,
          mapsUri: parkOnceLocation.mapsUri,
          rating: undefined,
          userRatingCount: undefined,
          priceLevel: undefined,
          openNow: undefined,
          weekdayText: undefined,
          photoUrl: undefined,
          reviewSnippet: undefined,
          parking: {
            placeId: parkOnceLocation.placeId,
            name: parkOnceLocation.name,
            address: parkOnceLocation.address,
            lat: parkOnceLocation.lat,
            lng: parkOnceLocation.lng,
            mapsUri: parkOnceLocation.mapsUri,
          },
        });

        if (travelMins.length > 0) {
          items.push({
            type: "travel",
            title: `Walk to ${stops[0]?.title ?? "first stop"}`,
            durationMin: travelMins[0],
            mode: "WALK",
          });
        }

        for (let i = 0; i < stops.length; i++) {
          items.push({ type: "stop", durationMin: stopDurations[i] ?? 40, ...stops[i] });
          if (i < stops.length - 1) {
            const leg = travelMins[i + 1] ?? 10;
            items.push({
              type: "travel",
              title: `Walk to ${stops[i + 1]?.title ?? "next stop"}`,
              durationMin: leg,
              mode: "WALK",
            });
          }
        }
      } else {
        for (let i = 0; i < stops.length; i++) {
          items.push({ type: "stop", durationMin: stopDurations[i] ?? 40, ...stops[i] });
          if (i < travelMins.length) {
            items.push({
              type: "travel",
              title: `Drive to ${stops[i + 1]?.title ?? "next stop"}`,
              durationMin: travelMins[i],
              mode: "DRIVE",
            });
          }
        }
      }

      return NextResponse.json({
        destination,
        totalMinutes,
        vibe: vibeLabel,
        vibes: vibesFinal,
        parkOnce,
        riderMode,
        bufferMinutes,
        source: "google",
        items,
      });
    }

    // --------
    // EXISTING LOGIC BELOW (for non-swap)
    // --------

    const destination = String(body?.destination ?? "").trim();
    const totalMinutes = clamp(Number(body?.totalMinutes ?? 150), 120, 420);
    const vibe = String(body?.vibe ?? "culture");
    const vibes = Array.isArray(body?.vibes) ? (body.vibes as string[]).map((x) => String(x)) : [];
    const vibesFinal = vibes.length ? vibes : [vibe];
    const vibeLabel = vibesFinal.length > 1 ? "mixed" : vibesFinal[0];
    const parkOnce = Boolean(body?.parkOnce);
    const riderMode = Boolean(body?.riderMode);
    const bufferMinutes = clamp(Number(body?.bufferMinutes ?? 0), 0, 20);
    const excludePlaceIds = Array.isArray(body?.excludePlaceIds)
      ? (body.excludePlaceIds as string[])
      : [];
    const excludeSet = new Set(excludePlaceIds.map((x) => String(x)).filter(Boolean));

    if (!destination) {
      return NextResponse.json({ error: "Destination is required" }, { status: 400 });
    }

    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) {
      return NextResponse.json(
        { error: "Missing GOOGLE_MAPS_API_KEY. Add it to .env.local and restart npm run dev." },
        { status: 500 }
      );
    }

    const vibeQueries = vibesFinal.map((v) => vibeToQuery(v, destination));

    const destPlaces = await searchPlacesText(key, destination, 3);
    const destCenter = destPlaces?.[0]?.location as { latitude: number; longitude: number } | undefined;

    const qAttraction = `top attractions museums landmarks in ${destination}`;
    const qFood = `best cafes restaurants bakeries in ${destination}`;
    const qPark = `best parks viewpoints waterfront in ${destination}`;
    const qScenic = `scenic viewpoints waterfront drives in ${destination}`;
    const qRideCoffee = `coffee stops with parking in ${destination}`;

    const vibeResults = await Promise.all(vibeQueries.map((q) => searchPlacesText(key, q, 20)));

    const [candA, candF, candP, candScenic, candRideCoffee] = await Promise.all([
      searchPlacesText(key, qAttraction, 20),
      searchPlacesText(key, qFood, 20),
      searchPlacesText(key, qPark, 20),
      searchPlacesText(key, qScenic, 20),
      searchPlacesText(key, riderMode ? qRideCoffee : qFood, 20),
    ]);

    const candVibe = vibeResults.flat();

    const byId = new Map<string, any>();
    for (const p of [...candA, ...candF, ...candP, ...candVibe, ...candScenic, ...candRideCoffee]) {
      if (p?.id && !byId.has(p.id)) byId.set(p.id, p);
    }
    const pooled = Array.from(byId.values());

    const stopCount = pickStopCount(totalMinutes);
    const radiusKm = 10;

    const filtered = pooled
      .filter((p) => p?.id && !excludeSet.has(String(p.id)))
      .filter((p) => p?.id && p?.location?.latitude != null && p?.location?.longitude != null)
      .filter((p) => !isNoisyType(p?.types))
      .filter((p) => {
        const rating = typeof p?.rating === "number" ? p.rating : 0;
        const count = typeof p?.userRatingCount === "number" ? p.userRatingCount : 0;

        if (count >= 20 && rating > 0 && rating < 4.1) return false;
        if (count >= 5 && rating > 0 && rating < 3.9) return false;

        if (destCenter) {
          const km = haversineKm(destCenter, p.location);
          if (km > radiusKm) return false;
        }
        return true;
      })
      .sort((a, b) => scoreCandidate(b, riderMode) - scoreCandidate(a, riderMode));

    if (filtered.length < 2) {
      return NextResponse.json({ error: "Not enough high-quality places found" }, { status: 404 });
    }

    const want = desiredCategoriesMulti(vibesFinal, stopCount);

    const walkKmPrimary = 1.5;
    const walkKmRelaxed = 3;

    const picked: any[] = [];

    const anchorCat = want[0];
    const anchor = filtered.find((p) => pickCategory(p?.types) === anchorCat) || filtered[0];
    if (anchor) picked.push(anchor);

    const anchorLoc = anchor?.location as { latitude: number; longitude: number } | undefined;

    const poolPrimary =
      parkOnce && anchorLoc
        ? filtered.filter((p) => {
            const loc = p?.location as { latitude: number; longitude: number } | undefined;
            if (!loc) return false;
            return haversineKm(anchorLoc, loc) <= walkKmPrimary;
          })
        : filtered;

    const poolRelaxed =
      parkOnce && anchorLoc
        ? filtered.filter((p) => {
            const loc = p?.location as { latitude: number; longitude: number } | undefined;
            if (!loc) return false;
            return haversineKm(anchorLoc, loc) <= walkKmRelaxed;
          })
        : filtered;

    const pickFromPool = (pool: any[], cat: "attraction" | "food" | "park") =>
      pool.find((p) => pickCategory(p?.types) === cat && !picked.some((x) => x.id === p.id));

    for (const cat of want.slice(1)) {
      let next = pickFromPool(poolPrimary, cat);
      if (!next) next = pickFromPool(poolRelaxed, cat);
      if (!next) next = pickFromPool(filtered, cat);
      if (next) picked.push(next);
    }

    const fillFrom = (pool: any[]) => {
      while (picked.length < stopCount) {
        const next = pool.find((p) => !picked.some((x) => x.id === p.id));
        if (!next) break;
        picked.push(next);
      }
    };

    fillFrom(poolPrimary);
    fillFrom(poolRelaxed);
    fillFrom(filtered);

    let ordered = parkOnce
      ? [picked[0], ...orderByNearestNeighbor(picked.slice(1), riderMode)]
      : orderByNearestNeighbor(picked, riderMode);

    if (riderMode && ordered.length >= 3 && anchorLoc) {
      const rest = ordered.slice(1);
      rest.sort((a, b) => {
        const la = a?.location as any;
        const lb = b?.location as any;
        if (!la || !lb) return 0;
        const da = haversineKm(anchorLoc, la);
        const db = haversineKm(anchorLoc, lb);
        return da - db;
      });
      ordered = [ordered[0], ...rest];
    }

    const candidatesOrdered = ordered.filter(Boolean);

    const stops: StopDetails[] = [];
    const usedIds = new Set<string>();

    const maxAttempts = Math.min(candidatesOrdered.length, stopCount * 8);
    let attempts = 0;

    for (const p of candidatesOrdered) {
      if (stops.length >= stopCount) break;
      if (attempts >= maxAttempts) break;
      attempts++;

      const placeId = String(p?.id ?? "");
      if (!placeId) continue;
      if (usedIds.has(placeId)) continue;
      usedIds.add(placeId);

      const details = await getPlaceDetails(key, placeId);

      // Skip places that are explicitly closed right now.
      const openNow = details?.regularOpeningHours?.openNow;
      if (openNow === false) {
        continue;
      }

      let photoUrl: string | undefined;
      const firstPhotoName = details?.photos?.[0]?.name;
      if (firstPhotoName) {
        photoUrl = await getPhotoUri(key, firstPhotoName, 1000);
      }

      const reviewSnippet = safeText(details?.reviews?.[0]?.text?.text, 170);

      const weekdayText = Array.isArray(details?.regularOpeningHours?.weekdayDescriptions)
        ? (details.regularOpeningHours.weekdayDescriptions as string[])
        : undefined;

      let parking: ParkingOption | undefined;
      try {
        const base = await findParkingNear(key, details?.displayName?.text ?? "", destination);
        parking = await enrichParkingMapsUri(key, base);
      } catch {
        parking = undefined;
      }

      stops.push({
        placeId,
        title: details?.displayName?.text ?? "Place",
        address: details?.formattedAddress,
        lat: Number(details?.location?.latitude),
        lng: Number(details?.location?.longitude),
        mapsUri: details?.googleMapsUri,

        rating: typeof details?.rating === "number" ? details.rating : undefined,
        userRatingCount: typeof details?.userRatingCount === "number" ? details.userRatingCount : undefined,
        priceLevel: typeof details?.priceLevel === "string" ? details.priceLevel : undefined,
        openNow: typeof openNow === "boolean" ? openNow : undefined,
        weekdayText,
        photoUrl,
        reviewSnippet,
        parking,
      });
    }

    if (stops.length < 2) {
      return NextResponse.json({ error: "Not enough OPEN places found right now" }, { status: 404 });
    }

    let parkOnceLocation: ParkingOption | undefined;
    if (parkOnce && stops.length > 0) {
      try {
        const base = await findParkingNear(key, stops[0].title, destination);
        parkOnceLocation = await enrichParkingMapsUri(key, base);
      } catch {
        parkOnceLocation = undefined;
      }
    }

    const travelMins: number[] = [];

    if (parkOnce && parkOnceLocation?.lat != null && parkOnceLocation?.lng != null && stops.length > 0) {
      const firstStop = stops[0];
      const fromParkingToFirst = await computeRouteMinutes(
        key,
        { latitude: parkOnceLocation.lat, longitude: parkOnceLocation.lng },
        { latitude: firstStop.lat, longitude: firstStop.lng },
        "WALK"
      );
      travelMins.push(fromParkingToFirst + bufferMinutes);

      for (let i = 0; i < stops.length - 1; i++) {
        const a = stops[i];
        const b = stops[i + 1];
        const mins = await computeRouteMinutes(
          key,
          { latitude: a.lat, longitude: a.lng },
          { latitude: b.lat, longitude: b.lng },
          "WALK"
        );
        travelMins.push(mins + bufferMinutes);
      }
    } else {
      for (let i = 0; i < stops.length - 1; i++) {
        const a = stops[i];
        const b = stops[i + 1];
        const mins = await computeRouteMinutes(
          key,
          { latitude: a.lat, longitude: a.lng },
          { latitude: b.lat, longitude: b.lng },
          "DRIVE"
        );
        travelMins.push(mins + bufferMinutes);
      }
    }

    const travelTotal = travelMins.reduce((x, y) => x + y, 0);
    const stopDurations = splitStopDurations(totalMinutes, travelTotal, stops.length);

    const items: PlanItem[] = [];

    if (parkOnce && parkOnceLocation?.lat != null && parkOnceLocation?.lng != null) {
      items.push({
        type: "stop",
        durationMin: 5,
        placeId: parkOnceLocation.placeId || "parking",
        title: "Park once",
        address: parkOnceLocation.address,
        lat: parkOnceLocation.lat,
        lng: parkOnceLocation.lng,
        mapsUri: parkOnceLocation.mapsUri,
        rating: undefined,
        userRatingCount: undefined,
        priceLevel: undefined,
        openNow: undefined,
        weekdayText: undefined,
        photoUrl: undefined,
        reviewSnippet: undefined,
        parking: {
          placeId: parkOnceLocation.placeId,
          name: parkOnceLocation.name,
          address: parkOnceLocation.address,
          lat: parkOnceLocation.lat,
          lng: parkOnceLocation.lng,
          mapsUri: parkOnceLocation.mapsUri,
        },
      });

      if (travelMins.length > 0) {
        items.push({
          type: "travel",
          title: `Walk to ${stops[0]?.title ?? "first stop"}`,
          durationMin: travelMins[0],
          mode: "WALK",
        });
      }

      for (let i = 0; i < stops.length; i++) {
        items.push({ type: "stop", durationMin: Math.max(25, stopDurations[i] ?? 40), ...stops[i] });
        if (i < stops.length - 1) {
          const leg = travelMins[i + 1] ?? 10;
          items.push({
            type: "travel",
            title: `Walk to ${stops[i + 1]?.title ?? "next stop"}`,
            durationMin: leg,
            mode: "WALK",
          });
        }
      }
    } else {
      for (let i = 0; i < stops.length; i++) {
        items.push({ type: "stop", durationMin: Math.max(25, stopDurations[i] ?? 40), ...stops[i] });
        if (i < travelMins.length) {
          items.push({
            type: "travel",
            title: `Drive to ${stops[i + 1]?.title ?? "next stop"}`,
            durationMin: travelMins[i],
            mode: "DRIVE",
          });
        }
      }
    }

    return NextResponse.json({
      destination,
      totalMinutes,
      vibe: vibeLabel,
      vibes: vibesFinal,
      parkOnce,
      riderMode,
      bufferMinutes,
      source: "google",
      items,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to generate itinerary";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}