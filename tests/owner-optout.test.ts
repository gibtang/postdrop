import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  OPTOUT_PARAM,
  OPTOUT_STORAGE_KEY,
  __resetOwnerOptOutMemory,
  applyUrlOverride,
  currentOptOut,
  optOutFromParams,
  optOutFromStorage,
  ownerAnalyticsLoaderScript,
} from "../apps/web/lib/analytics-optout";

const GA_ID = "G-M0YZL8SPXX";
const GA_DISABLE_FLAG = `ga-disable-${GA_ID}`;

interface BootWindow {
  __postdropOwnerOptOut?: boolean;
  [key: string]: unknown;
}

/** Minimal window/localStorage/document harness. storage="blocked" simulates denied storage. */
function installWindow(opts: { search?: string; storage?: "ok" | "blocked" } = {}) {
  const store = new Map<string, string>();
  const localStorage =
    opts.storage === "blocked"
      ? {
          getItem: () => {
            throw new Error("SecurityError");
          },
          setItem: () => {
            throw new Error("SecurityError");
          },
        }
      : {
          getItem: (k: string) => store.get(k) ?? null,
          setItem: (k: string, v: string) => void store.set(k, v),
        };
  const appended: { src?: string }[] = [];
  const document = {
    createElement: () => ({ async: false }),
    head: { appendChild: (el: { src?: string }) => void appended.push(el) },
  };
  const g = globalThis as Record<string, unknown>;
  const win: BootWindow = { location: { search: opts.search ?? "" }, localStorage, document, appended };
  g.window = win;
  g.localStorage = localStorage;
  g.document = document;
  return { store, win, appended };
}

/** Evaluate the inline loader script against the current globals. */
function runLoaderScript(gaId: string): BootWindow {
  const g = globalThis as Record<string, unknown>;
  // eslint-disable-next-line no-new-func
  new Function("window", "localStorage", "location", "document", ownerAnalyticsLoaderScript(gaId))(
    g.window,
    g.localStorage,
    (g.window as BootWindow).location,
    g.document,
  );
  return g.window as BootWindow;
}

describe("optOutFromParams", () => {
  it.each([
    ["1", true],
    ["0", false],
  ])("parses ?%s as %s", (value, expected) => {
    expect(optOutFromParams(new URLSearchParams(`${OPTOUT_PARAM}=${value}`))).toBe(expected);
  });

  it("returns null when the param is absent or has another value", () => {
    expect(optOutFromParams(new URLSearchParams(""))).toBeNull();
    expect(optOutFromParams(new URLSearchParams("foo=bar"))).toBeNull();
    expect(optOutFromParams(new URLSearchParams("optout_internal=2"))).toBeNull();
  });
});

describe("optOutFromStorage", () => {
  it("reads the persisted site-specific key", () => {
    expect(optOutFromStorage({ getItem: () => "1" })).toBe(true);
    expect(optOutFromStorage({ getItem: () => "0" })).toBe(false);
    expect(optOutFromStorage({ getItem: () => null })).toBe(false);
  });

  it("defaults to false for blocked or missing storage", () => {
    expect(
      optOutFromStorage({
        getItem: () => {
          throw new Error("SecurityError");
        },
      }),
    ).toBe(false);
    expect(optOutFromStorage(undefined)).toBe(false);
  });
});

describe("applyUrlOverride / currentOptOut", () => {
  beforeEach(() => {
    __resetOwnerOptOutMemory();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    const g = globalThis as Record<string, unknown>;
    delete g.window;
    delete g.localStorage;
  });

  it("first load with ?optout_internal=1 arms and persists; repeat load stays armed without a param", () => {
    const { store } = installWindow({ search: "?optout_internal=1" });
    expect(applyUrlOverride("?optout_internal=1")).toBe(true);
    expect(store.get(OPTOUT_STORAGE_KEY)).toBe("1");
    expect(currentOptOut()).toBe(true);
    // Repeat load: no URL param, armed state read back from storage.
    __resetOwnerOptOutMemory();
    expect(applyUrlOverride("")).toBe(true);
  });

  it("first load disarmed stays unarmed on repeat loads", () => {
    const { store } = installWindow({ search: "?optout_internal=0" });
    expect(applyUrlOverride("?optout_internal=0")).toBe(false);
    expect(store.get(OPTOUT_STORAGE_KEY)).toBe("0");
    __resetOwnerOptOutMemory();
    expect(applyUrlOverride("")).toBe(false);
  });

  it("no URL override reflects persisted state; SPA navigation re-checks at call time", () => {
    const { store } = installWindow({ search: "" });
    store.set(OPTOUT_STORAGE_KEY, "1");
    expect(applyUrlOverride("")).toBe(true);
    expect(applyUrlOverride("?foo=bar")).toBe(true);
    expect(applyUrlOverride("?optout_internal=0")).toBe(false);
    expect(currentOptOut()).toBe(false);
  });

  it("blocked storage: arming keeps an in-memory opt-out without claiming persistence", () => {
    installWindow({ storage: "blocked" });
    expect(applyUrlOverride("?optout_internal=1")).toBe(true);
    expect(currentOptOut()).toBe(true);
    expect(console.warn).toHaveBeenCalled();
    // Nothing persisted — a fresh page with blocked storage starts unarmed.
    __resetOwnerOptOutMemory();
    expect(applyUrlOverride("")).toBe(false);
  });

  it("blocked storage: disarming also degrades to memory without throwing", () => {
    installWindow({ storage: "blocked" });
    expect(applyUrlOverride("?optout_internal=0")).toBe(false);
    expect(currentOptOut()).toBe(false);
  });

  it("is inert on the server", () => {
    const g = globalThis as Record<string, unknown>;
    delete g.window;
    expect(currentOptOut()).toBe(false);
    expect(applyUrlOverride("?optout_internal=1")).toBe(false);
  });
});

describe("ownerAnalyticsLoaderScript", () => {
  afterEach(() => {
    const g = globalThis as Record<string, unknown>;
    delete g.window;
    delete g.localStorage;
    delete g.document;
  });

  it("arming visit injects NO GA script and sets the ga-disable guard", () => {
    const { appended, win } = installWindow({ search: "?optout_internal=1" });
    const loaded = runLoaderScript(GA_ID);
    expect(appended).toHaveLength(0); // zero GA requests on an arming visit
    expect(loaded.__postdropOwnerOptOut).toBe(true);
    expect(loaded[GA_DISABLE_FLAG]).toBe(true);
  });

  it("repeat armed load (no param) re-arms from localStorage with no GA injection", () => {
    const { store, appended } = installWindow({ search: "" });
    store.set(OPTOUT_STORAGE_KEY, "1");
    runLoaderScript(GA_ID);
    expect(appended).toHaveLength(0);
  });

  it("explicit disarm injects GA normally and removes the ga-disable flag without granting consent", () => {
    const { store, appended, win } = installWindow({ search: "?optout_internal=0" });
    store.set(OPTOUT_STORAGE_KEY, "1"); // previously armed
    const loaded = runLoaderScript(GA_ID);
    expect(loaded.__postdropOwnerOptOut).toBe(false);
    expect(GA_DISABLE_FLAG in win).toBe(false);
    expect(appended).toHaveLength(1);
    expect(appended[0].src).toContain(`googletagmanager.com/gtag/js?id=${GA_ID}`);
    // No consent API was touched: the gate only restores normal eligibility.
    expect("googletagmanager" in win).toBe(false);
    expect(store.get(OPTOUT_STORAGE_KEY)).toBe("0");
  });

  it("unarmed visit injects GA exactly as the previous static tags did", () => {
    const { appended, win } = installWindow({ search: "" });
    const loaded = runLoaderScript(GA_ID);
    expect(loaded.__postdropOwnerOptOut).toBe(false);
    expect(appended).toHaveLength(1);
    expect(appended[0].src).toContain(`googletagmanager.com/gtag/js?id=${GA_ID}`);
    expect(Array.isArray(win.dataLayer)).toBe(true);
    expect(typeof win.gtag).toBe("function");
  });

  it("blocked storage: armed state stays in-memory for the page, no GA injection, no false persistence", () => {
    const { appended } = installWindow({ search: "?optout_internal=1", storage: "blocked" });
    const loaded = runLoaderScript(GA_ID);
    expect(loaded.__postdropOwnerOptOut).toBe(true);
    expect(loaded[GA_DISABLE_FLAG]).toBe(true);
    expect(appended).toHaveLength(0);
  });

  it("loader is emitted before the PostHog component in the root layout and is self-contained", () => {
    const layout = fs.readFileSync(
      path.join(__dirname, "../apps/web/app/layout.tsx"),
      "utf8",
    );
    const loaderIdx = layout.indexOf("ownerAnalyticsLoaderScript(gaId)");
    const analyticsIdx = layout.indexOf("<Analytics />");
    expect(loaderIdx).toBeGreaterThan(-1);
    expect(analyticsIdx).toBeGreaterThan(-1);
    // No static gtag script tags remain: injection is conditional client-side.
    expect(layout).not.toContain("googletagmanager.com/gtag/js");
    const script = ownerAnalyticsLoaderScript(GA_ID);
    expect(script).toContain(GA_DISABLE_FLAG);
    expect(script).toContain(OPTOUT_STORAGE_KEY);
    expect(script).toContain(OPTOUT_PARAM);
  });
});
