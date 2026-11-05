/**
 * Device-local owner opt-out for product analytics (GA4 + PostHog).
 *
 * Patterned on the Check-MCC/DramaSub convention:
 * - `?optout_internal=1` arms the opt-out for this origin + browser profile.
 * - `?optout_internal=0` disarms it.
 * - State persists in localStorage under `postdrop.owner_optout_internal`;
 *   if storage is blocked, the opt-out stays in-memory for the current page
 *   only (persistence is never claimed in that case).
 *
 * Scope: this flag applies to ONE origin + browser profile. It does not arm
 * other devices, does not propagate across apex/www, does not identify
 * anonymous users by email, and does not repair historical analytics data.
 * Disarming only restores normal eligibility — it never grants consent or
 * overrides a prior consent decline.
 */

export const OPTOUT_PARAM = "optout_internal";
export const OPTOUT_STORAGE_KEY = "postdrop.owner_optout_internal";

/** Pure: parse the URL override. `true`/`false` when the param is present, `null` when absent. */
export function optOutFromParams(params: URLSearchParams): boolean | null {
  const value = params.get(OPTOUT_PARAM);
  if (value === "1") return true;
  if (value === "0") return false;
  return null;
}

/** Pure: read persisted state. Returns false when unset or unreadable. */
export function optOutFromStorage(
  storage: Pick<Storage, "getItem"> | undefined | null,
): boolean {
  try {
    return storage?.getItem(OPTOUT_STORAGE_KEY) === "1";
  } catch {
    return false;
 }
}

/** In-memory fallback for the current page when storage is blocked. */
let memoryOverride: boolean | null = null;

/** @internal Test seam only: clears the in-memory override between unit tests. */
export function __resetOwnerOptOutMemory(): void {
  memoryOverride = null;
}

/** Whether the owner opt-out is currently armed. */
export function currentOptOut(): boolean {
  if (memoryOverride !== null) return memoryOverride;
  if (typeof window === "undefined") return false;
  return optOutFromStorage(window.localStorage);
}

/**
 * Apply the URL override (if any) before analytics initialization. Must be
 * called on every analytics effect run so arming visits send no initial
 * GA pageview and armed SPA navigations skip PostHog capture at call time.
 * Returns whether the opt-out is armed after applying the override.
 */
export function applyUrlOverride(search: string = window.location.search): boolean {
  if (typeof window === "undefined") return false;
  const override = optOutFromParams(new URLSearchParams(search));
  if (override === null) return currentOptOut();

  memoryOverride = override;
  let persisted = true;
  try {
    window.localStorage.setItem(OPTOUT_STORAGE_KEY, override ? "1" : "0");
  } catch {
    persisted = false; // blocked storage: in-memory opt-out for this page only
  }
  if (override && !persisted) {
    console.warn(
      "analytics-optout: storage blocked; opt-out is active in-memory for this page only",
    );
  }
  return override;
}

/**
 * Inline loader script (replaces the static gtag script tags). Runs before
 * any analytics so an arming visit emits zero GA traffic:
 * - armed: sets `ga-disable-<measurementId>` (guards any later gtag call) and
 *   does NOT inject the gtag script — zero GA requests this page.
 * - not armed: injects gtag/js and configures it (the standard snippet).
 * Duplicate of the TS logic in this module because it must execute before
 * any React/PostHog code loads. Explicitly disarming removes the
 * ga-disable flag only — it never grants consent or overrides a decline.
 */
export function ownerAnalyticsLoaderScript(measurementId: string): string {
  return `(function(){var K=${JSON.stringify(OPTOUT_STORAGE_KEY)};var F="ga-disable-${measurementId}";var o=null;try{var m=location.search.match(/[?&]${OPTOUT_PARAM}=(1|0)(?=&|$)/);if(m)o=m[1]==="1"}catch(e){}var a=false;if(o!==null){a=o;try{localStorage.setItem(K,a?"1":"0")}catch(e){}}else{try{a=localStorage.getItem(K)==="1"}catch(e){}}window.__postdropOwnerOptOut=a;if(a){window[F]=true;return}if(o===false){try{delete window[F]}catch(e2){window[F]=false}}window.dataLayer=window.dataLayer||[];window.gtag=function(){window.dataLayer.push(arguments)};window.gtag("js",new Date());var s=document.createElement("script");s.async=true;s.src="https://www.googletagmanager.com/gtag/js?id=${measurementId}";document.head.appendChild(s);window.gtag("config","${measurementId}");})();`;
}
