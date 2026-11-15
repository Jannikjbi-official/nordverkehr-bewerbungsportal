import type { NextConfig } from "next";
import traceExcludes from "./trace-excludes.json";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://discord.com" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "cdn.discordapp.com" }],
  },
  serverExternalPackages: ["sharp", "discord.js", "@discordjs/rest", "pg"],
  // Kleinere Server-Funktionen (Vercel speichert jede Funktion pro Deploy):
  // Prisma läuft mit engineType "client" (runtime/client.js + .prisma/client/
  // query_compiler_bg.wasm, ~2 MB) über den Treiber `pg` – Engines für andere
  // Datenbanken und die alte native Engine werden nicht gebraucht.
  // Liste in trace-excludes.json – scripts/trim-traces.mjs wendet sie nach dem Build auch auf
  // Middleware/Instrumentation an (die Next nicht filtert, Vercel aber in jede Funktion packt).
  outputFileTracingExcludes: { "*": traceExcludes },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Kurz-Links für die eigenen Bewerbungsarten (URL bleibt /whitelist bzw. /beta)
  async rewrites() {
    return [
      { source: "/whitelist", destination: "/positionen/whitelist" },
      { source: "/beta", destination: "/positionen/beta" },
    ];
  },
  // Alte Einstellungsseite → Admin-Bereich (Lesezeichen, Links in Hilfetexten)
  async redirects() {
    return [{ source: "/team/einstellungen", destination: "/team/admin", permanent: false }];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
