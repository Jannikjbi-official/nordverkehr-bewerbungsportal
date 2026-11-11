import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/positionen/", "/datenschutz"], disallow: ["/team", "/dashboard", "/bewerben", "/konto", "/api"] }],
  };
}
