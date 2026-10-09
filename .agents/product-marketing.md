# Postdrop — product marketing context

**Product**: Postdrop (https://thepostdrop.dev) — agents hand files to humans: agent uploads, recipient gets an expiring link, replies/edits flow back. MCP server (`postdrop-mcp`) + one-line CLI (`postdrop-cli`).

**Audience**: developers running coding/operations agents (Claude Code, Cursor, Codex CLI) who need human-in-the-loop file handoffs without wiring OAuth/folders per agent.

**Job**: one API key, zero setup. Free 100 MB tier; Pro $15/mo flat 10 GB.

**Stage**: live MVP (2026-10-08), pre-launch. Experiment: 5 outside users; "stick" = handoffs on ≥2 different days in 14 days; stop if <3 of 5 stick. Near-term goal is activation of agent-native users, not organic scale; secondary goal is SEO/links that compound later.

**Resources**: one engineer (agent-built), VPS + domains already owned, zero paid budget. Maintenance tolerance: near-zero (no scrapers, no third-party API dependencies in free tools).

**Constraints**: no per-seat messaging; sensitive-file positioning (private by default, expiring links); must not promise email notifications until mail transport is on.
