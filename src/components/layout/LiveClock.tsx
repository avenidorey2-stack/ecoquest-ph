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
      <p className="text-sm font-semibold text-ink" suppressHydrationWarning>
        {TIME.format(now)} <span className="text-xs font-normal text-ink-4">PHT</span>
      </p>
      <p className="text-xs text-ink-3" suppressHydrationWarning>
        {DATE.format(now)}
      </p>
    </div>
  );
}
