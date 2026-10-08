import { purgeExpiredDrops } from "./purge";

const INTERVAL_MS = 5 * 60 * 1000;

const globalRef = globalThis as unknown as { __postdropSweeperStarted?: boolean };

/** Starts the 5-minute expiry sweeper once per process (unless SWEEPER_DISABLED=1). */
export function startSweeper(): void {
  if (process.env.SWEEPER_DISABLED === "1") return;
  if (globalRef.__postdropSweeperStarted) return;
  globalRef.__postdropSweeperStarted = true;
  const timer = setInterval(() => {
    purgeExpiredDrops().catch((err) => {
      console.error("sweeper: purge run failed:", err instanceof Error ? err.message : err);
    });
  }, INTERVAL_MS);
  timer.unref?.();
}
