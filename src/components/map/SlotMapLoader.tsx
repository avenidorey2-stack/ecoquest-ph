"use client";

import dynamic from "next/dynamic";

// Leaflet touches `window`, so the map must render client-side only.
const SlotMap = dynamic(() => import("./SlotMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-emerald-50" />,
});

export default SlotMap;
