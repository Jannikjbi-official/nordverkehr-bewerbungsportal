import type { NextConfig } from "next";

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
  // Prisma bringt WASM-Engines für alle Datenbanken mit (~55 MB pro Funktion) –
  // wir nutzen nur MongoDB mit der nativen Engine (runtime/library.js + .so.node).
  outputFileTracingExcludes: {
    "*": [
      "node_modules/@prisma/client/runtime/query_engine_bg.*",
      "node_modules/@prisma/client/runtime/query_compiler_bg.*",
      "node_modules/@prisma/client/runtime/wasm-*",
      "node_modules/@prisma/client/runtime/binary.*",
      "node_modules/@prisma/client/runtime/react-native.*",
      "node_modules/@prisma/client/runtime/edge*",
      "node_modules/@prisma/client/runtime/*.map",
      "node_modules/.prisma/client/edge.js",
      "node_modules/.prisma/client/wasm*",
      "node_modules/.prisma/client/index.d.ts",
      // sharp: WebAssembly-Fallback wird auf Linux x64 nie geladen
      "node_modules/@img/sharp-wasm32/**",
      // Nur zum Bauen/Testen nötig
      "node_modules/prisma/**",
      "node_modules/@prisma/engines/**",
      "node_modules/typescript/**",
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
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
