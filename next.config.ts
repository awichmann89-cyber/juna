import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Kein Partial Prefetching: es rendert für jeden sichtbaren Link die dynamischen Daten vor
  // (viele DB-Abfragen pro Seitenwechsel) und rendert Seiten doppelt. Das statische Gerüst wird weiterhin vorgeladen.
  experimental: {
    // Server-Uploads (lokal / kleine Dateien). Größere Dateien gehen per Client-Upload direkt in den Blob-Store.
    serverActions: { bodySizeLimit: "5mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
