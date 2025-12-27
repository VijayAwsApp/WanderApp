import { useState } from "react";
import { PlanItem, TRAVEL_STYLES } from "./types"; // Assuming types are imported from a types file

export default function Home() {
  const [destination, setDestination] = useState("");
  const [style, setStyle] = useState(TRAVEL_STYLES[0].key);
  const [duration, setDuration] = useState(150);
  const [startTime, setStartTime] = useState<string>(() => {
    const now = new Date();
    // round up to next 5 minutes
    const mins = now.getMinutes();
    const rounded = Math.ceil(mins / 5) * 5;
    now.setMinutes(rounded, 0, 0);
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  });
  const [plan, setPlan] = useState<{ items: PlanItem[]; destination: string; totalMinutes: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const timeline = plan ? buildTimeline(plan.items as PlanItem[], startTime) : null;

  // Helper functions
  function formatPriceLevel(level?: string) {
    if (!level) return "N/A";
    const map: Record<string, string> = { cheap: "$", moderate: "$$", expensive: "$$$" };
    return map[level] || level;
  }

  function formatRating(rating?: number) {
    if (rating === undefined) return "N/A";
    return rating.toFixed(1);
  }

  function parseHHMMToDate(hhmm: string) {
    const [hhStr, mmStr] = (hhmm || "").split(":");
    const hh = Number(hhStr);
    const mm = Number(mmStr);
    const d = new Date();
    d.setSeconds(0, 0);
    d.setHours(Number.isFinite(hh) ? hh : d.getHours(), Number.isFinite(mm) ? mm : d.getMinutes(), 0, 0);
    return d;
  }

  function addMinutes(d: Date, minutes: number) {
    const out = new Date(d.getTime());
    out.setMinutes(out.getMinutes() + minutes);
    return out;
  }

  function formatTime(d: Date) {
    // 12-hour with AM/PM
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  function buildTimeline(items: PlanItem[], startHHMM: string) {
    const start = parseHHMMToDate(startHHMM);
    let cursor = start;
    return items.map((it) => {
      const from = cursor;
      const to = addMinutes(cursor, Math.max(0, it.durationMin || 0));
      cursor = to;
      return { from, to };
    });
  }

  async function onQuickDemo() {
    setDestination("San Francisco");
    setStyle("culture");
    setDuration(150);
    setStartTime("14:00");
    // ... other logic to generate demo plan
  }

  return (
    <div>
      <div className="planner-card grid md:grid-cols-4 gap-4">
        <div className="md:col-span-2">
          <label className="text-xs text-white/60">Destination</label>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className="mt-1 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none transition focus:border-white/25"
          />
        </div>
        <div>
          <label className="text-xs text-white/60">Duration</label>
          <input
            type="number"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="mt-1 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none transition focus:border-white/25"
          />
        </div>
        <div>
          <label className="text-xs text-white/60">Start time</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="mt-1 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none transition focus:border-white/25"
          />
        </div>
      </div>

      {plan && (
        <div className="preview-header">
          <h2>
            {plan.destination || "—"} • {plan.totalMinutes} min • {TRAVEL_STYLES.find((s) => s.key === style)?.label}
            {timeline && timeline.length ? (
              <span className="ml-2 text-white/55">
                • {formatTime(timeline[0].from)}–{formatTime(timeline[timeline.length - 1].to)}
              </span>
            ) : null}
          </h2>
          <div className="plan-items">
            {plan.items.map((it, idx) => (
              <div key={idx} className="plan-item-card">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold">{it.type === "stop" ? "Stop" : "Travel"}</div>
                    {timeline?.[idx] ? (
                      <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-xs text-white/75">
                        {formatTime(timeline[idx].from)}–{formatTime(timeline[idx].to)}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-white/55">{it.durationMin} min</div>
                </div>
                {/* Additional item details here */}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}