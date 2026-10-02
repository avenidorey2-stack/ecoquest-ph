"use client";

import { useEffect, useState } from "react";

const DATE = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});
const TIME = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });

/** Philippine date/time, ticking each 15s. Seeded from the server render to avoid a flash. */
export default function LiveClock({ initialIso }: { initialIso: string }) {
  const [now, setNow] = useState(() => new Date(initialIso));

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="text-right leading-tight" suppressHydrationWarning>
      <p className="text-sm font-semibold text-slate-800" suppressHydrationWarning>
        {TIME.format(now)} <span className="text-xs font-normal text-slate-400">PHT</span>
      </p>
      <p className="text-xs text-slate-500" suppressHydrationWarning>
        {DATE.format(now)}
      </p>
    </div>
  );
}
