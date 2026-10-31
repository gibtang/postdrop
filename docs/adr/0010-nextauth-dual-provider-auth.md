# NextAuth dual-provider authentication (Google + email/password)

Status: accepted 2026-10-31. Supersedes [ADR 0007](./0007-shared-firebase-project.md) (and with it [ADR 0001](./0001-separate-firebase-project.md)).

Auth.js v5 (NextAuth) replaces both previous modes (env-seeded password owner and Firebase client+admin verification). Sign-in is Google OAuth or email/password credentials with scrypt hashes in Mongo, via the official MongoDB adapter. A credentials signup requires email verification (Resend) before first login; Google login auto-creates a verified User. Password reset flows over Resend, degrading to no-op when Resend is unconfigured.

Consequences: `firebase`/`firebase-admin` dependencies and all FIREBASE_* env vars are gone; the stork-ticker coupling and its blast radius disappear; any existing Firebase-linked accounts cannot carry over (no production users existed — pre-launch pivot).
