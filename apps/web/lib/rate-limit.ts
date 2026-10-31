interface WindowState {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, WindowState>();

export const CREATE_RATE_LIMIT_PER_MIN = 60;
export const LINK_READ_RATE_LIMIT_PER_MIN = 300;
export const LINK_WRITE_RATE_LIMIT_PER_MIN = 60;

/** Fixed-window limiter; process-local, sufficient for the pilot. */
export function checkRateLimit(bucketKey: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  // Lazy prune of stale buckets so the map cannot grow without bound.
  if (buckets.size > 0) {
    for (const [key, state] of buckets) {
      if (now - state.windowStart >= windowMs && key !== bucketKey) buckets.delete(key);
    }
  }
  const state = buckets.get(bucketKey);
  if (!state || now - state.windowStart >= windowMs) {
    buckets.set(bucketKey, { count: 1, windowStart: now });
    return true;
  }
  if (state.count >= limit) return false;
  state.count += 1;
  return true;
}
