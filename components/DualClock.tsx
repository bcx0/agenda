"use client";

import { useEffect, useState } from "react";
import { DateTime } from "luxon";

const BRUSSELS = "Europe/Brussels";
const MIAMI = "America/New_York";

export default function DualClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const format = (zone: string) =>
    DateTime.fromJSDate(now).setZone(zone).setLocale("fr").toFormat("HH:mm - EEEE dd MMM");

  return (
    <div className="grid gap-3 text-sm text-white/80 md:grid-cols-2">
      <div className="card p-4">
        <div className="text-xs uppercase tracking-widest text-white/60">
          Heure Belgique (Europe/Brussels)
        </div>
        <div className="text-lg font-semibold">{format(BRUSSELS)}</div>
      </div>
      <div className="card p-4">
        <div className="text-xs uppercase tracking-widest text-white/60">
          Heure Miami (America/New_York)
        </div>
        <div className="text-lg font-semibold">{format(MIAMI)}</div>
      </div>
    </div>
  );
}

