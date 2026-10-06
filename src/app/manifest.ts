import type { MetadataRoute } from "next";
import { CANVAS } from "@/lib/palette";

// Lets planters add EcoQuest to their Home Screen as an app. On iPhones that's also what turns
// on phone notifications (iOS only allows them for Home Screen apps).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EcoQuest PH",
    short_name: "EcoQuest",
    description: "Gamified climate action for the Philippines",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: CANVAS,
    theme_color: CANVAS,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
