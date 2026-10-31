import type { MetadataRoute } from "next";

// Render at request time: BASE_URL is runtime env, never a build arg.
export const dynamic = "force-dynamic";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

/** Crawl the public marketing surface; keep agents out of the app and viewer surface. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login", "/signup", "/terms", "/privacy"],
        disallow: ["/api/", "/dashboard/", "/s/", "/a/", "/v1/"],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
