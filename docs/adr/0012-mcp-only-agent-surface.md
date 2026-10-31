# MCP-only agent surface; npm packages removed

Postdrop shipped with `packages/cli` (`postdrop-cli`) and `packages/sdk` (`postdrop-sdk`) private workspace packages intended for npm publication so agents could `npx postdrop-cli`. The `postdrop` name on npm is owned by an unrelated package, and Gibson redirected distribution (2026-10-31): the remote MCP server is the only first-class agent surface — no install, bearer-token auth, tools for the full artifact lifecycle.

Removed: `packages/cli`, `packages/sdk`, the `packages/*` workspace glob, and every npm/CLI mention in README, CONTRACT.md, OPERATIONS.md, and the served `llms.txt`. The REST API (`/v1`) stays: it is the documented contract layer the MCP tools mirror, and it serves clients that cannot speak MCP. Docs now present MCP first.

Rejected: keeping the packages "until npm auth arrives" (dead weight; usage is already MCP-first) and choosing a different npm name (the CLI duplicated surface the MCP server already covers; maintaining two clients doubles the contract-freeze burden). Consequence: `POSTDROP_TOKEN` auth is unchanged — dashboard-created tokens work identically over MCP and REST; CLI-specific flows (`whoami`, `save`) exist as MCP tools or plain REST GETs.
