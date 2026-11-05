# Ticket 1: Add browser owner opt-out and audit server-event test-account exclusion

## Purpose and scope

Keep owner browsing and identified test-account activity out of customer/product analytics for thepostdrop.dev. This is a prepared implementation specification, not evidence that exclusion is deployed or that Gibson's devices are armed.

Prepared on 2026-11-05 from current `main` at `43c137a39b08681a005bf229281a394b75c9030a`. Refresh the source audit before implementation. Issue/spec preparation was approved; this preparation does not activate GA filters, change production configuration, or authorize paid/customer test actions. Apply the repository's normal implementation/deployment approval process before production changes.

## Grounded starting point

GA loads from the root layout using GA_MEASUREMENT_ID. A separate PostHog component tracks page views and strips sensitive URL parts. Keep that privacy protection.

Expected production web GA4 measurement ID: `G-M0YZL8SPXX`. GA4 Internal Traffic exclusion filters were Testing in the 2026-11-04 admin audit, not Active. Leave those settings untouched. Counts remain raw/test-inclusive until implementation, deployment, and verification are separately established. Historical data cannot be cleaned by a new browser flag.

Inspect these entry points and all their callers, not only one wrapper:
- `apps/web/app/layout.tsx`
- `apps/web/app/analytics.tsx`

## Browser implementation

1. Add a device-local owner opt-out patterned on the existing Check-MCC/DramaSub convention: `?optout_internal=1` arms it and `?optout_internal=0` disarms it. Use a site-specific localStorage key and document the exact key. Read the URL before analytics initialization so an arming visit sends no initial GA pageview. Handle blocked storage safely with an in-memory opt-out for the current page; do not claim persistence if saving failed.
2. Set `ga-disable-<resolved measurement ID>` before any GA script/config/pageview. Guard both direct `gtag` calls and helper events at call time, including SPA navigation and delayed callbacks. Ensure consent initialization cannot clear the owner gate. Disarming restores only normal eligibility: it must not grant consent or override a prior decline.
3. Suppress existing browser product-analytics sinks (including PostHog where present) while armed, without breaking the product. Inventory the sinks first and avoid adding a new vendor. Do not block security/operational error reporting that the product needs. Keep existing query/token/PII sanitization.
4. Make the local state verifiable and document an arm/disarm runbook on the actual production canonical host. State plainly that the flag applies to that origin/browser/profile only; it does not arm Gibson's other devices, propagate across apex/www, identify anonymous users by email, or repair history. Do not silently alter existing consent choices. Avoid fingerprinting or broad IP/geography exclusions.
5. Update existing tests and add coverage for first load, repeat load, SPA navigation, direct calls, blocked storage, arming/disarming, consent accepted/declined/unset, and any supported host redirects. Do not generate real customer or paid actions for verification.

## Server-event test-account checks

1. Inventory all server event emitters and business-event callers: GA4 Measurement Protocol if present, PostHog capture/identify, MCP usage, checkout/reconciliation/webhooks, jobs, and any other current analytics sink. Publish an evidence table of event, caller, sink, available trusted identity, existing exclusion, and remaining gap. Mark absent paths as not applicable with a code-search reference rather than inventing an emitter.
2. Separate customer/product metrics from operational/system events. Check whether identified owner/test accounts can reach product metrics. Resolve identity from trusted authenticated account records or verified business-event ownership, never an arbitrary email/header/query field, browser-supplied opt-out bit, or matching text in MCP inputs. For anonymous/system events with no trusted identity, document the limitation; do not claim reliable account exclusion or drop all unknown traffic.
3. If gaps exist, propose a centralized server-only eligibility predicate plus explicit test-account configuration, applied before outbound analytics requests. Use opaque stable IDs internally; never send raw email, credentials, payment details, or exclusion lists to GA4. The owner email found in narrow existing code is not proof of every test account; document the proposed configured set and obtain any missing account IDs via the normal manual-action rule. Preserve legitimate customers and system health events. Do not weaken payment/webhook verification, idempotency, auth, or the actual business operation. Suppression must affect analytics only.
4. Validate with mocked sinks and synthetic local fixtures for excluded owner, excluded test account, normal customer, missing identity, system job, and repeated webhook/reconciliation. No live payment, paid API call, customer message, artificial production business event, secret rotation, or GA-admin change is part of this ticket. If live verification needs a new action outside normal approval, stop that step and state what is still unverified.
5. For event-tracking request/response logs, keep only bounded, scrubbed request metadata and response status/summary, plus a safe suppression reason for local verification. No full subtitle text, artifact/share tokens, financial data, raw email, secrets, raw IPs, or full responses. Preserve existing tighter privacy limits, input truncation, and retention. Do not bypass the owner's exclusion by sending an 'excluded user' event to the same analytics sink.

## Verification and acceptance criteria

- Attach a source/caller inventory and tests with exact commands, results, and commit SHA. Every current analytics sink has a documented decision; no claim of complete exclusion from a single helper test.
- In a clean isolated browser with interception/mock collectors: ordinary eligible traffic emits the expected GA pageview and representative interaction once; armed traffic emits zero GA or existing product-analytics requests on initial load, reload, SPA navigation, and delayed/direct helper paths. Consent remains unchanged and still controls eligibility after disarm. Include redacted network evidence for both positive and negative controls.
- Inspect the actual browser pixels after the UI/state indication changes on mobile and desktop. Attach before/after screenshots or a short recording showing arm/disarm status without exposing private content. Test the deployed canonical origin without arming someone else's browser or pretending this covers Gibson's devices.
- Server fixtures prove identified owner/test events are suppressed before all relevant sink calls and normal-customer events remain correct. Verify operational/system events are handled by their documented policy, not silently lost. If no trusted account identity exists on a path, the evidence names that gap instead of reporting a false pass.
- Run relevant lint/typecheck/build and regression tests. Verify consent behavior, login, tools, payment processing/idempotency where applicable using mocks, and existing privacy sanitization. Do not buy anything to test.
- After an independently authorized deployment, inspect the live deployed version and capture a bounded redacted verification record. State what was mocked versus observed live. Tag presence alone is not collection or exclusion proof; GA4 admin Testing is not Active. Historical GA data and unarmed devices remain caveated.
- Record deployment time, URLs, proof of intended behavior, rollback plan, and any manual blocker in the GitHub issue. Do not close or mark executed on code merge alone.

## Execution and closeout

Run under `/goal` to complete the entire ticket within the applicable approval scope. If Gibson must do a manual action, skip it only if non-blocking and record the limitation; if blocking, ping him on Telegram. Do not turn this instruction into permission for spending, account/filter changes, or unapproved production actions.

WHEN DONE: Only once the action is done, deployed, and verified, move this file to `research/tickets/executed/` with the same filename and commit the move. Attach verification evidence and update/close the assigned GitHub issue; otherwise leave it open with the exact blocker.
