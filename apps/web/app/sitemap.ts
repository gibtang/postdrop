import type { MetadataRoute } from "next";

// Render at request time: BASE_URL is runtime env, never a build arg.
export const dynamic = "force-dynamic";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

/** Public marketing/auth surface only — viewer, dashboard, and paste URLs are private or ephemeral. */
export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["/", "/login", "/signup"];
  return routes.map((path) => ({
    url: `${BASE}${path}`,
    changeFrequency: "weekly",
    priority: path === "/" ? 1 : 0.5,
  }));
}
