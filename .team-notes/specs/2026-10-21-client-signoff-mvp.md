# Spec: Postdrop MVP for client sign-off

Status: Draft for Gibson's review (2026-10-21). Owner: Product Lead. Builder implements, Release & QA tests against `.team-notes/test-cases/2026-10-21-client-signoff-mvp.md` (written by Release & QA).

## 1. Positioning
Postdrop lets an agent get a sign-off from someone **outside your team**. The agent sends a file, the recipient opens one link with no account, approves it, asks for changes or uploads an edited file, and the answer goes back to the agent.

- **First users:** freelancers and small agencies whose agents send drafts to clients, such as designs, contracts or reports.
- **Not:** general file storage or syncing, and not approvals inside your own team, which people already handle in Slack.
- **One-line pitch:** "Get client sign-off from your agent. One link, no login, the answer comes back."

## 2. What already exists (as of `661134c`, so don't rebuild it)
- An API under `/v1/drops` with create, `[id]`, `result`, `revoke` and `edit`; a link page at `/l/[token]` with file, meta, reply and edit; a dashboard with agents and usage; Firebase auth.
- Scoping where one key gives access to one agent's drops only (ADR 0002), and expired drops being purged (ADR 0003), done by `lib/sweeper.ts` and `lib/purge.ts`.
- A recipient email through Resend (`lib/email.ts`). It is plain text, has no note and no reminder, and only works if `RESEND_*` is configured.
- `lib/quota.ts`, the SDK, the CLI (`postdrop`) and the MCP server (`postdrop-mcp`), plus the free secret-link tool at `/s` (ADR 0008).

This spec covers what's missing between that build and the sign-off journey below.

## 3. User journey (the target)
1. **Setup, once:** the owner signs in, creates an agent key in the dashboard, and copies a one-line MCP install command from `/setup`.
2. **Send:** the agent calls `create_drop` with the file, recipient email, an optional recipient name, a **note**, an optional **deadline** and an **ask type** (`approve`, `feedback` or `edit`). It gets back `dropId`, `linkUrl` and `expiresAt`, then moves on to other work.
3. **Notify:** the recipient gets a branded HTML email titled "<Sender> sent you <filename> to review", with the note, the deadline and one button.
4. **Respond:** the link page shows the sender's name, the note, the deadline, a file preview (PDF and images inline, other files download only) and three actions: **Approve**, **Request changes** (which needs text) and **Upload edited file**. No login.
5. **Reminder:** if nobody has answered after 48 hours, and the drop hasn't expired, Postdrop sends one reminder email. Never more than one per drop.
6. **Answer comes back:** the drop becomes `answered` with an outcome of `approved`, `changes_requested` or `edited`. Postdrop fires a signed webhook. Agents without a webhook can call `GET /v1/drops/:id/result` or the MCP tool `get_drop_result`.
7. **Expiry:** if the drop isn't answered before it expires, its status becomes `expired`, Postdrop fires an `drop.expired` webhook, and the content is purged (ADR 0003).

## 4. Requirements

### 4.1 Creating a drop (API, SDK, CLI and MCP)
- New fields: `note` (up to 2,000 characters), `deadline` (an ISO date, which must be on or before `expiresAt`), `askType` (`approve`, `feedback` or `edit`, default `feedback`), `recipientName` (optional), `senderName` (defaults to the account's display name) and `webhookUrl` (optional, overriding the account default).
- The default expiry is 7 days, the minimum 1 hour and the maximum 30 days.
- The SDK, CLI flags and MCP tool schema all expose the same fields.

### 4.2 The response model
- One response per drop, same as now: the first Approve, Request changes or Edit locks the drop.
- `Approve` records `outcome=approved`, with an optional comment.
- `Request changes` needs text and records `outcome=changes_requested`.
- `Upload edited file` records `outcome=edited`, with an optional comment. It's subject to the same size limit as the original file.
- Each new round of changes is a **new** drop. The agent can pass `previousDropId` so the dashboard links the two.

### 4.3 Link page `/l/[token]`
- Shows the sender name, file name and size, the note, the deadline (with an overdue badge once it's passed) and the expiry date.
- Previews PDFs and images (PNG, JPG, WEBP, GIF) inline. Other types show a download button only.
- Only offers the actions that fit the ask type (for `approve`: Approve plus Request changes; `edit` adds Upload edited file). Download is always available.
- After someone responds, the page shows a read-only confirmation ("Sent back to <Sender>").
- An expired or revoked link shows a clear message, with no file or content.
- Works on mobile at 375px wide, and the page loads in under 2 seconds on 4G (not counting the preview).
- `noindex`, with no analytics that identify the recipient.

### 4.4 Emails (Resend; set up `RESEND_*` in production)
- Three emails: **new drop**, **one reminder at 48 hours if there's no answer and the drop hasn't expired**, and an optional **confirmation to the recipient after they respond**.
- HTML with a plain-text fallback. The reply-to address is the account owner's email if they've enabled it, and no-reply otherwise.
- Each email is recorded on the drop (`notifiedAt`, `remindedAt`). A failed send never blocks creating the drop.
- The sweeper (or a sibling job) runs at least every 15 minutes and sends reminders, never more than one per drop, even if it runs again or overlaps.

### 4.5 Webhooks
- Events: `drop.answered` (with the outcome, the reply text and a signed URL for the edited file, if there is one) and `drop.expired`.
- Every request is signed with `Postdrop-Signature: t=<ts>,v1=<HMAC-SHA256(secret, t.body)>`. Each agent gets a webhook secret, shown once in the dashboard.
- Failed deliveries are retried with backoff for up to 24 hours (5 attempts). The last status is recorded on the drop.
- The payload includes the `dropId` and `previousDropId` but **no file bytes**.

### 4.6 Dashboard
- The drop list shows status (`sent`, `opened`, `answered` or `expired`), the outcome, recipient, deadline, and when it was sent and answered.
- A drop's detail page shows the timeline (sent, emailed, opened, reminded, answered, webhook delivered) and links to its previous and next drops.
- Agents can be given a default webhook URL, and the webhook secret can be rotated.
- The usage view shows drops this month against the plan limit.

### 4.7 Limits for the pilot (no billing yet)
- Every account gets a pilot quota of 200 drops a month and 100 MB per file. Once the quota runs out, creating a drop returns `402` with a clear message.
- **No Stripe** in this MVP. Pricing waits until the pilot data is in.

### 4.8 Measurement (for the pilot)
- Record these events: drop created, email sent, link opened, response submitted (with outcome), reminder sent, webhook delivered or failed, and expired.
- An admin-only view (or a script) reports, by week, **answer rate** (answered ÷ created), **median time to answer**, the effect of reminders (answered within 24 hours after a reminder), and active accounts.

## 5. Out of scope
Folders, syncing, version history beyond `previousDropId`, more than one recipient per drop, more than one round of responses per drop, recipient accounts, teams or seats, billing, custom domains, the full SES migration, and any change to `/s`.

## 6. Acceptance criteria
- [ ] An agent using the MCP server can create a drop with a note, deadline and ask type, and gets back a link and expiry. Same through the CLI and SDK.
- [ ] The recipient gets the HTML email. The link page shows the note and deadline and previews a PDF and a PNG inline.
- [ ] The recipient can approve, request changes (and can't submit an empty request) or upload an edited file, with no login. After one response, any further response attempt is rejected.
- [ ] The `drop.answered` webhook arrives with the correct outcome and a valid signature. A tampered or out-of-date signature fails the documented check.
- [ ] Webhook delivery is retried after 5xx errors and stops after 5 attempts.
- [ ] Exactly one reminder goes out after 48 hours with no answer. None goes out if the drop was answered, expired or revoked, and running the sweeper twice doesn't send two.
- [ ] On expiry, `drop.expired` fires and the content is purged in line with ADR 0003. After that, the link page and `result` return no content.
- [ ] One agent's key can't read another agent's drops, results or webhook settings (keeping ADR 0002).
- [ ] The quota is enforced (`402`), and files over 100 MB are rejected before they're stored.
- [ ] The dashboard shows status, outcome and the timeline, and the weekly report gives answer rate and median time to answer.
- [ ] `/setup` takes a new user from sign-up to their first drop in under 5 minutes, which Release & QA times.
- [ ] Lint, type checks, unit tests and the acceptance suite all pass, and the Docker build is green.

## 7. Rollout and pilot
1. Builder works on a feature branch and hands it to Release & QA, which runs the test cases.
2. Gibson approves, then the change is deployed through the current setup (ADR 0006, `run-web.sh`), and Release & QA checks the live site.
3. Invite 10 freelance or agency builders for a two-week pilot.
4. Decide whether to go ahead if **at least 60% of drops get answered** and **at least 5 accounts send 3 or more drops**. Pricing work starts only after that.

## 8. Likely files
`apps/web/app/v1/drops/**`, `apps/web/app/l/[token]/**`, `apps/web/app/dashboard/**`, `apps/web/app/setup`, `apps/web/lib/{models,email,sweeper,quota,links,link-access}.ts`, new `apps/web/lib/webhooks.ts` and `apps/web/lib/events.ts`, `packages/sdk/src/index.ts`, `packages/cli/src/cli.ts`, `packages/mcp/src/mcp.ts`, plus tests in `tests/`.

## 9. Open questions for Gibson
1. Should the sender's name and reply-to address come from the account owner (more trust, but it shows their email) or stay no-reply?
2. Is a 48-hour reminder right, or should the agent be able to set it?
3. Should the first market be agencies and freelancers, or is there a better group you can reach for the 10-user pilot?
