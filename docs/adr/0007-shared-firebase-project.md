# Shared Firebase project (stork-ticker) for Postdrop auth

Status: supersedes [ADR 0001](./0001-separate-firebase-project.md).

Postdrop's dashboard needs Firebase Auth before outside users arrive. Creating a fresh Firebase project required interactive console work and a new service account. Gibson directed (2026-10-08) that Postdrop reuse the Firebase project agent-utils production runs on — project id `stork-ticker` — using the same service-account credentials extracted from the live agent-utils container.

We accepted the coupling this ADR-0001 originally warned about (shared user list, shared security blast radius, quota contention) in exchange for shipping the pre-launch auth swap today with zero new infrastructure. Consequences: Postdrop Accounts resolve against stork-ticker users (`firebaseUid` → Account); a compromise of either product's runtime leaks both products' admin credentials; migrating to a dedicated project later means re-linking `firebaseUid`s. Client-side config is injected at Docker build time (`NEXT_PUBLIC_FIREBASE_*` build args), server verification at runtime (`FIREBASE_*` env).
