# One Agent key per Agent; Account → Agents → Drops

Acceptance requires that a key issued to one Agent cannot access another Agent's Drops, Replies, or Edits. We decided every API credential identifies exactly one Agent, and every read/write is filtered by that Agent's scope server-side, with Drops owned by an Agent under a billable Account.

Considered alternative: one key per Account (fewer keys to manage) — rejected because a leaked key would then expose every Agent's files and the negative-scope acceptance tests could not pass.

Consequence: multi-Agent users manage several keys; the Dashboard's show-once mint/revoke flow exists to make that cheap.
