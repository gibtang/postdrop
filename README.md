# Postdrop

Standalone file-drop service for agents: an Agent uploads a file, a Recipient gets an expiring Link, Replies and Edits flow back to the originating Agent. Shipped as an MCP server and a one-line CLI.

**Status:** MVP in build (design locked 2026-10-07, grilling session).

## Layout

- `apps/web` — Next.js: REST API (`/v1`), Dashboard, Link pages
- `packages/sdk` — API client shared by CLI and MCP
- `packages/cli` — `postdrop` bin: one-line upload/handoff
- `packages/mcp` — `postdrop-mcp` bin: stdio MCP server

## Docs

- [`CONTEXT.md`](./CONTEXT.md) — domain glossary (Drop, Agent, Recipient, Link, …)
- [`docs/adr/`](./docs/adr/) — decision records
