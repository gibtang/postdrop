# Pivot from directed file-drop to multi-user artifact sharing

Status: accepted 2026-10-31. Supersedes the product model described by [ADR 0002](./0002-one-key-one-agent-scoping.md) and [ADR 0003](./0003-expired-means-purged.md).

Postdrop shipped as an MVP where an Agent (API-key holder) sent a Drop to a named Recipient, who replied/edited back through an expiring link. Gibson redirected the product (2026-10-31) to a multi-user SaaS: any User signs in (Google or email/password), creates bearer Tokens by hand, and agents use CLI/API/remote-MCP to publish web-renderable Artifacts shared via public view-only links — no recipient, no reply-back, no webhooks.

Consequences: the Drop/Agent/Account/Recipient/Reply/Answered vocabulary is retired (see CONTEXT.md), the recipient flow, webhooks, reminder emails, and drop-purge sweeper jobs are deleted, the schema is rebuilt around User/Token/Artifact/ShareLink, and the acceptance suite is rewritten. Expiry now applies to Share links only — an expired link stops resolving while the Artifact survives (ADR 0003's purge-on-expiry applies only to Secret links' existing burn-after-view behavior).
