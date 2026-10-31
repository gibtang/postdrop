"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";

/**
 * Privacy-hydrated product analytics (PostHog). Anonymous by design:
 * autocapture off, person profiles off, pageviews carry origin+pathname only
 * (no query strings or fragments — share-link and paste tokens must never
 * reach a third party). No-ops when NEXT_PUBLIC_POSTHOG_KEY is unset.
 */
export function Analytics(): null {
  const pathname = usePathname();

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key || typeof window === "undefined") return;
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      person_profiles: "never",
      before_send: (event) => {
        for (const name of ["$current_url", "$initial_current_url", "$referrer", "$initial_referrer"]) {
          const value = event.properties?.[name];
          if (typeof value === "string") {
            try {
              const url = new URL(value);
              event.properties[name] = name.includes("referrer") ? url.origin : url.origin + url.pathname;
            } catch {
              delete event.properties[name];
            }
          }
        }
        return event;
      },
    });
  }, []);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY || typeof window === "undefined") return;
    posthog.capture("$pageview", {
      $current_url: window.location.origin + pathname,
      $pathname: pathname,
      surface: pathname.startsWith("/dashboard") ? "app" : "public",
    });
  }, [pathname]);

  return null;
}
