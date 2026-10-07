# Expired means purged

When a Link expires we delete the Drop's file bytes and Reply/Edit content immediately, keeping only tombstone metadata (drop id, agent id, status, purged-at) for audit and quota accounting. We decided this because Drops are assumed sensitive and "expired must mean gone" is the product promise; the alternative (retain content, revoke access only) was rejected so sensitive files never outlive their Link.

Consequence: expired Drops are unrecoverable by design — there is no post-expiry support path.
