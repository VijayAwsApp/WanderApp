import { NextResponse } from "next/server";

// Force Node runtime for stable env + fetch behavior
export const runtime = "nodejs";

const PLACES_SEARCH_TEXT = "https://places.googleapis.com/v1/places:searchText";
const PLACE_DETAILS_BASE = "https://places.googleapis.com/v1/places/";
const ROUTES_COMPUTE = "https://routes.googleapis.com/directions/v2:computeRoutes";

type LatLng = { latitude: number; longitude: number };

type ParkingOption = {
  name: string;
  address?: string;
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
  | { type: "travel"; title: string; durationMin: number; mode: "DRIVE" };

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
    fieldMask: "places.id,places.displayName,places.formattedAddress,places.location,places.types",
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

async function computeDriveMinutes(key: string, origin: LatLng, destination: LatLng) {
  const res = await googleFetch(ROUTES_COMPUTE, {
    key,
    method: "POST",
    body: JSON.stringify({
      origin: { location: { latLng: origin } },
      destination: { location: { latLng: destination } },
      travelMode: "DRIVE",
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

  return {
    name: best?.displayName?.text ?? "Parking",
    address: best?.formattedAddress,
    // mapsUri is NOT available from places:searchText results
  } as ParkingOption;
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

    const candidates = await searchPlacesText(key, query, 12);
    if (candidates.length < 2) {
      return NextResponse.json({ error: "Not enough places found" }, { status: 404 });
    }

    const stopCount = pickStopCount(totalMinutes);
    const chosen = candidates.slice(0, stopCount);

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
          parking = await findParkingNear(key, details?.displayName?.text ?? "", destination);
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

    const travelMins: number[] = [];
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i];
      const b = stops[i + 1];
      const mins = await computeDriveMinutes(
        key,
        { latitude: a.lat, longitude: a.lng },
        { latitude: b.lat, longitude: b.lng }
      );
      travelMins.push(mins);
    }

    const travelTotal = travelMins.reduce((x, y) => x + y, 0);
    const stopDurations = splitStopDurations(totalMinutes, travelTotal, stops.length);

    const items: PlanItem[] = [];
    for (let i = 0; i < stops.length; i++) {
      items.push({ type: "stop", durationMin: Math.max(25, stopDurations[i] ?? 40), ...stops[i] });
      if (i < travelMins.length) {
        items.push({ type: "travel", title: "Drive to next stop", durationMin: travelMins[i], mode: "DRIVE" });
      }
    }

    return NextResponse.json({
      destination,
      totalMinutes,
      vibe,
      source: "google",
      items,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to generate itinerary";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}