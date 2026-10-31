import { ShareLink } from "./models";
import { purgeExpiredPastes } from "./pastes";

const INTERVAL_MS = 5 * 60 * 1000;

const globalRef = globalThis as unknown as { __postdropSweeperStarted?: boolean };

export interface SweeperTickResult {
  expiredLinks: number;
  pastesPurged: number;
}

/** Claim one due share link atomically so it is never double-marked. */
async function claimExpiredLink(now: Date) {
  return ShareLink.findOneAndUpdate(
    { expiresAt: { $lt: now }, expiredAt: null },
    { $set: { expiredAt: now } },
    { new: true },
  );
}

/** Mark every share link past its expiry; the Artifact itself is untouched. */
async function expireDueLinks(now: Date): Promise<number> {
  let expiredLinks = 0;
  for (;;) {
    const link = await claimExpiredLink(now);
    if (!link) break;
    expiredLinks += 1;
  }
  return expiredLinks;
}

/** One full sweeper pass: share-link expiry + paste purge. */
export async function sweeperTick(now = new Date()): Promise<SweeperTickResult> {
  const expiredLinks = await expireDueLinks(now);
  const pastesPurged = await purgeExpiredPastes(now);
  return { expiredLinks, pastesPurged };
}

/** Starts the 5-minute sweeper once per process (unless SWEEPER_DISABLED=1). */
export function startSweeper(): void {
  if (process.env.SWEEPER_DISABLED === "1") return;
  if (globalRef.__postdropSweeperStarted) return;
  globalRef.__postdropSweeperStarted = true;
  const timer = setInterval(() => {
    sweeperTick().catch((err) => {
      console.error("sweeper: sweep failed:", err instanceof Error ? err.message : err);
    });
  }, INTERVAL_MS);
  timer.unref?.();
}
