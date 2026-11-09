import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "juna",
    short_name: "juna",
    description: "Aktionen der Leiterrunde gemeinsam planen.",
    lang: "de",
    start_url: "/uebersicht",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbf7f4",
    theme_color: "#e8553f",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
