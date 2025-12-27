

import { NextResponse } from "next/server";

// This route builds a 2–3 hour itinerary.
// For now it returns a safe fallback plan.
// You can later replace the body with Google Places + Routes logic.

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const destination = String(body?.destination ?? "").trim();
    const totalMinutes = Number(body?.totalMinutes ?? 150);
    const vibe = String(body?.vibe ?? "culture");

    if (!destination) {
      return NextResponse.json({ error: "Destination is required" }, { status: 400 });
    }

    const minutes = clamp(totalMinutes, 120, 180);

    // Simple 2–3 hour structure
    const stopCount = minutes <= 140 ? 2 : 3;
    const travelMinEach = 12;
    const travelTotal = (stopCount - 1) * travelMinEach;
    const remaining = Math.max(60, minutes - travelTotal);

    const stopDurations =
      stopCount === 2
        ? [Math.floor(remaining * 0.55), remaining - Math.floor(remaining * 0.55)]
        : [
            Math.floor(remaining * 0.42),
            Math.floor(remaining * 0.35),
            remaining - Math.floor(remaining * 0.42) - Math.floor(remaining * 0.35),
          ];

    const byVibe: Record<string, string[]> = {
      relaxed: ["Waterfront stroll", "Coffee break", "Scenic viewpoint"],
      foodie: ["Top-rated café", "Local specialty", "Dessert stop"],
      adventure: ["Easy trail", "Lookout point", "Recovery café"],
      culture: ["Museum or gallery", "Historic walk", "Local landmark"],
    };

    const titles = byVibe[vibe] ?? byVibe.culture;

    const items: Array<{
      type: "stop" | "travel";
      title: string;
      durationMin: number;
    }> = [];

    for (let i = 0; i < stopCount; i++) {
      items.push({
        type: "stop",
        title: `${titles[i] ?? "Stop"} in ${destination}`,
        durationMin: Math.max(25, stopDurations[i]),
      });

      if (i < stopCount - 1) {
        items.push({
          type: "travel",
          title: "Walk to next stop",
          durationMin: travelMinEach,
        });
      }
    }

    return NextResponse.json({
      destination,
      totalMinutes: minutes,
      vibe,
      items,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to generate itinerary" },
      { status: 500 }
    );
  }
}

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}