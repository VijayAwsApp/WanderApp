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

function desiredCategories(vibe: string, stopCount: number): ("attraction" | "food" | "park")[] {
  if (stopCount === 2) return vibe === "foodie" ? ["food", "attraction"] : ["attraction", "food"];

  if (vibe === "adventure") return ["park", "attraction", "food"];
  if (vibe === "relaxed") return ["park", "food", "attraction"];
  if (vibe === "foodie") return ["food", "attraction", "park"];
  return ["attraction", "food", "park"];
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
      "id,displayName,formattedAddress,location,rating,userRatingCount,priceLevel,regularOpeningHours,photos,reviews,googleMapsUri",
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

    const destination = String(body?.destination ?? "").trim();
    const totalMinutes = clamp(Number(body?.totalMinutes ?? 150), 120, 180);
    const vibe = String(body?.vibe ?? "culture");
    const parkOnce = Boolean(body?.parkOnce);
    const riderMode = Boolean(body?.riderMode);
    const bufferMinutes = clamp(Number(body?.bufferMinutes ?? 0), 0, 20);

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

    const query =
      vibe === "adventure"
        ? `top viewpoints parks trails in ${destination}`
        : vibe === "foodie"
        ? `best cafes restaurants bakeries in ${destination}`
        : vibe === "relaxed"
        ? `waterfront parks cafes in ${destination}`
        : `top tourist attractions museums in ${destination}`;

    const destPlaces = await searchPlacesText(key, destination, 3);
    const destCenter = destPlaces?.[0]?.location as { latitude: number; longitude: number } | undefined;

    const qAttraction = `top attractions museums landmarks in ${destination}`;
    const qFood = `best cafes restaurants bakeries in ${destination}`;
    const qPark = `best parks viewpoints waterfront in ${destination}`;
    const qScenic = `scenic viewpoints waterfront drives in ${destination}`;
    const qRideCoffee = `coffee stops with parking in ${destination}`;

    const [candA, candF, candP, candVibe, candScenic, candRideCoffee] = await Promise.all([
      searchPlacesText(key, qAttraction, 20),
      searchPlacesText(key, qFood, 20),
      searchPlacesText(key, qPark, 20),
      searchPlacesText(key, query, 20),
      searchPlacesText(key, riderMode ? qScenic : qAttraction, 20),
      searchPlacesText(key, riderMode ? qRideCoffee : qFood, 20),
    ]);

    const byId = new Map<string, any>();
    for (const p of [...candA, ...candF, ...candP, ...candVibe, ...candScenic, ...candRideCoffee]) {
      if (p?.id && !byId.has(p.id)) byId.set(p.id, p);
    }
    const pooled = Array.from(byId.values());

    const stopCount = pickStopCount(totalMinutes);
    const radiusKm = 10;

    const filtered = pooled
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

    const want = desiredCategories(vibe, stopCount);

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

    const chosen = ordered.filter(Boolean).slice(0, stopCount);

    if (chosen.length < 2) {
      return NextResponse.json({ error: "Not enough places found after filtering" }, { status: 404 });
    }

    const stops: StopDetails[] = await Promise.all(
      chosen.map(async (p) => {
        const placeId = String(p?.id ?? "");
        if (!placeId) throw new Error("Google Places returned an item without id");

        const details = await getPlaceDetails(key, placeId);

        let photoUrl: string | undefined;
        const firstPhotoName = details?.photos?.[0]?.name;
        if (firstPhotoName) {
          photoUrl = await getPhotoUri(key, firstPhotoName, 1000);
        }

        const reviewSnippet = safeText(details?.reviews?.[0]?.text?.text, 170);

        const openNow = details?.regularOpeningHours?.openNow;
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

        return {
          placeId,
          title: details?.displayName?.text ?? "Place",
          address: details?.formattedAddress,
          lat: Number(details?.location?.latitude),
          lng: Number(details?.location?.longitude),
          mapsUri: details?.googleMapsUri,

          rating: typeof details?.rating === "number" ? details.rating : undefined,
          userRatingCount:
            typeof details?.userRatingCount === "number" ? details.userRatingCount : undefined,
          priceLevel: typeof details?.priceLevel === "string" ? details.priceLevel : undefined,
          openNow: typeof openNow === "boolean" ? openNow : undefined,
          weekdayText,
          photoUrl,
          reviewSnippet,
          parking,
        };
      })
    );

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
      vibe,
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