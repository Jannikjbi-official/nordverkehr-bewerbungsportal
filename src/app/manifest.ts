import type { MetadataRoute } from "next";

/** Web-App-Manifest: Portal lässt sich auf den Startbildschirm legen und startet ohne Browserleiste. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nordverkehr Bewerbungsportal",
    short_name: "Nordverkehr",
    description: "Bewerbungen für Team, Whitelist und Beta von Nordverkehr.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0c",
    theme_color: "#c41e1e",
    lang: "de",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Meine Bewerbungen", url: "/dashboard" },
      { name: "Team-Bereich", url: "/team" },
    ],
  };
}
