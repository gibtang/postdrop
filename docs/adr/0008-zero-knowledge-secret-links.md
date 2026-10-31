# ADR 0008: Zero-knowledge secret links (/s)

Date: 2026-10-11
Status: accepted

## Context

Marketing skill evaluation (coreyhaines `free-tools`, engineering-as-marketing) scored a free one-time secret-link tool highest (32/40) as a compounding SEO/link asset: it makes the product's positioning (private by default, expiring links) literal, attracts links, and stays inside the near-zero maintenance constraint (no scrapers, no third-party APIs). Constraints: unauthenticated (no account), must not cannibalize the free tier, must not leak secrets to the server.

## Decision

- **Encryption is client-side only.** The browser generates an AES-GCM-256 key per secret, encrypts locally (WebCrypto), and puts the raw key in the URL fragment (`/s/<token>#<key>`). Fragments are never sent to the server. The server stores only ciphertext.
- **Token model mirrors product Links**: 32-byte random token, stored as SHA-256 hash (`linkTokenHash` convention), looked up by hash.
- **Burn on first fetch.** `GET /api/pastes/<token>` atomically nulls the ciphertext via `findOneAndUpdate` (pre-image): exactly one request ever receives content. Later calls get a 410 tombstone with `reason: "viewed" | "expired"`. Refreshing after a successful view shows "already viewed" — intended.
- **Storage: Mongo document, not the storage service.** Ciphertext is capped at 6 MB (covers 5 MB plaintext + GCM tag), well under the 16 MB document limit. No S3/disk involvement, no orphaned blobs.
- **TTL: 1h / 24h / 72h / 7d in the UI, server accepts 1–720h** (same range as Drops). The existing 5-minute sweeper purges expired ciphertexts (`purgeExpiredPastes`); tombstone metadata persists, matching ADR 0003's expired-means-purged stance.
- **Abuse resistance**: per-IP in-memory sliding window (10 creates / 10 min), payload validation with caps on every field. In-memory state resets on deploy — accepted at experiment scale.
- **Not a Drop**: no Account, Agent, Reply, or Edit. Quotas do not apply. The 5 MB file cap sits below the 100 MB free tier so the tool cannot cannibalize product usage.
- **Pages**: `/s` (create, indexable, SEO metadata), `/s/[token]` (view, `noindex`), linked from homepage nav + footer per the no-orphan-pages rule.

## Consequences

- Losing the fragment loses the secret — even for us. Support cannot recover content; this is the product story.
- A failed decrypt (truncated URL) still burns the secret. Accepted: one-time semantics stay simple and honest.
- The in-memory rate limiter is per-process; a multi-replica deploy would need a shared store. Single-container deploy today (ADR 0006).
- Files above 5 MB route to the product ("Postdrop does that" CTA on both tool pages).

## Related

- ADR 0003 (expired means purged) — same tombstone philosophy.
- ADR 0006 (Coolify deploy deviation) — single container makes the in-memory rate limiter viable.
