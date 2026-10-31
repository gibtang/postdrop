# Postdrop MVP — Test Cases

Owner: Release & QA · Drafted 2026-10-21 · Status: draft, aligned with `../specs/2026-10-21-client-signoff-mvp.md` §6.
Scope: the "get an answer back from a Recipient with no account" MVP (first market: agencies/freelancers). Terms follow `CONTEXT.md`.

Legend — P0 blocks release, P1 should fix before beta, P2 nice to have. Type: A = automated (vitest/acceptance), M = manual.

## 0. Spec-specific cases
| ID | Pri | Type | Case | Expected |
|---|---|---|---|---|
| SPC-01 | P0 | A | Create Drop with note, deadline and ask type (approve / feedback / edit) via MCP, CLI, SDK | Link + expiry returned; fields shown on Link page |
| SPC-02 | P0 | M | Recipient taps Approve | Drop Answered, outcome `approved` in webhook |
| SPC-03 | P0 | A | Request changes with empty text | Rejected client- and server-side |
| SPC-04 | P0 | A | Any response after the first (approve, changes or Edit) | Rejected |
| SPC-05 | P0 | A | Webhook with tampered body or stale timestamp | Fails documented signature check |
| SPC-06 | P0 | A | Agent reads another Agent's webhook settings | Denied (ADR 0002) |
| SPC-07 | P0 | M | Dashboard timeline: created, emailed, opened, reminded, answered/expired | All events shown in order |
| SPC-08 | P1 | A | Weekly report | Answer rate and median time to answer match raw data |
| SPC-09 | P0 | M | `/setup` timed by QA, fresh account to first Drop | Under 5 minutes |
| SPC-10 | P0 | A | Lint, typecheck, unit, acceptance suite, Docker build | All green |
| SPC-11 | P0 | M | Production email via Resend (keys set) | HTML email delivered, sender per Gibson's answer |

## 1. Account & Agent keys (Dashboard)
| ID | Pri | Type | Case | Expected |
|---|---|---|---|---|
| ACC-01 | P0 | M | Sign up a new Account | Lands on Dashboard, no Agents yet |
| ACC-02 | P0 | A | Create Agent key | Key shown once, stored hashed, listed by name |
| ACC-03 | P0 | A | Revoke Agent key, then call API with it | 401; existing Drops keep their state |
| ACC-04 | P0 | A | Agent A lists/reads Drops of Agent B (same Account) | 404/403; Agents are isolated |
| ACC-05 | P0 | A | Agent from Account X reads Drop of Account Y | 404; no data leaked |
| ACC-06 | P1 | M | Dashboard shows Drops list with status (sent/opened/Answered/Expired) and usage count | Counts match API |
| ACC-07 | P1 | A | Missing / malformed Agent key | 401 with clear error, no stack trace |

## 2. Creating a Drop (SDK, CLI, MCP)
| ID | Pri | Type | Case | Expected |
|---|---|---|---|---|
| DRP-01 | P0 | A | Create Drop with file, Recipient email, note, 7-day expiry | Returns Drop ID + Link; status sent |
| DRP-02 | P0 | A | Default expiry when omitted | 7 days |
| DRP-03 | P0 | A | Same create via SDK, CLI one-liner and MCP tool | Identical result shape per `docs/CONTRACT.md` |
| DRP-04 | P0 | A | File over plan limit (over 100 MB, rejected before storage) | 413 / clear error, nothing stored |
| DRP-05 | P0 | A | Invalid Recipient email | 400, no Drop, no email sent |
| DRP-06 | P1 | A | Zero-byte file, unicode/space filename, no extension | Accepted or rejected consistently; filename safe on download |
| DRP-07 | P0 | A | Expiry under 1h or over 30 days; deadline after expiry | 400 |
| DRP-08 | P1 | A | Retry create with same idempotency key | One Drop, one email |
| DRP-09 | P0 | A | Pilot quota (200 Drops/month) exceeded | `402`; no partial Drop |
| DRP-10 | P2 | M | MCP setup one-liner from docs in Claude Code | Tool appears and creates a Drop |

## 3. Recipient notification
| ID | Pri | Type | Case | Expected |
|---|---|---|---|---|
| NTF-01 | P0 | M | Email arrives with sender name, Drop title, one button | Button opens Link page |
| NTF-02 | P0 | M | Deliverability: Gmail and Outlook inbox (not spam); SPF/DKIM/DMARC pass | Inbox placement, headers pass |
| NTF-03 | P0 | A | Reminder after 48h with no answer; sweeper run twice | Exactly one reminder sent |
| NTF-04 | P0 | A | No reminder if Answered, Expired or revoked | None sent |
| NTF-05 | P1 | A | Email bounce | Drop flagged; Agent can see delivery failed |
| NTF-06 | P1 | M | Agent also receives raw Link to hand over manually (spam fallback) | Link returned in create response |

## 4. Link page (Recipient, no account)
| ID | Pri | Type | Case | Expected |
|---|---|---|---|---|
| LNK-01 | P0 | M | Open Link: preview, note, deadline, download | No login prompt anywhere |
| LNK-02 | P0 | M | Recipient sends a Reply in under 1 minute (timed, first-time user) | Confirmation shown; Drop Answered |
| LNK-03 | P0 | A | Upload an Edit | Stored; Drop Answered |
| LNK-04 | P0 | A | Second Reply or second Edit on same Drop | Rejected (one each per Drop) |
| LNK-05 | P0 | A | Tampered / guessed token | 404, no timing or info leak |
| LNK-06 | P0 | A | Link of one Drop cannot reach another Drop's file | 404 |
| LNK-07 | P0 | A | Expired Link | "This drop has expired" page; file not downloadable |
| LNK-08 | P1 | M | Mobile Safari and Chrome Android: preview, Reply, Edit upload | Works, readable |
| LNK-09 | P0 | M | Inline preview for PDF and PNG (P0); PPTX/DOCX; fallback for unknown types | Preview or clean download-only state |
| LNK-10 | P0 | A | Edit upload over 100 MB / disallowed type | Clear error, Drop not Answered |
| LNK-11 | P1 | A | XSS in note, Reply and filename | Escaped everywhere (Link page, Dashboard, email) |
| LNK-12 | P1 | A | Link page sends `noindex` and no third-party trackers | Header/meta present |
| LNK-13 | P2 | M | Accessibility: keyboard-only Reply, screen-reader labels | Passes basic axe check |

## 5. Answer comes back to the Agent
| ID | Pri | Type | Case | Expected |
|---|---|---|---|---|
| ANS-01 | P0 | A | Webhook fired on Answered with Drop ID and Reply/Edit refs | Delivered within 1 min |
| ANS-02 | P0 | A | Webhook signature verifiable; bad signature rejected by SDK helper | Pass / fail as expected |
| ANS-03 | P0 | A | No webhook configured: Agent polls Drop status | Returns Answered + Reply text + Edit download |
| ANS-04 | P0 | A | Webhook fired on Expired unanswered | Agent told so it can escalate |
| ANS-05 | P0 | A | Webhook endpoint returns 5xx | Retried, stops after 5 attempts; still pollable |
| ANS-06 | P1 | A | Agent downloads Edit | Bytes match upload (checksum) |
| ANS-07 | P1 | M | "Set aside" flow: Agent creates Drop, ends session, later run picks up answer | Answer retrieved with no human step |

## 6. Expiry & purge
| ID | Pri | Type | Case | Expected |
|---|---|---|---|---|
| EXP-01 | P0 | A | At expiry, file and Edit purged from storage (R2/S3) | Objects gone; only metadata remains |
| EXP-02 | P0 | A | After expiry, Answered or not | Reply, approval comment, Edit and original all purged; only ID, Agent, status, outcome, timestamps remain; signed Edit URL in webhook stops working |
| EXP-03 | P1 | A | Purge job idempotent and re-runnable | No errors on second run |
| EXP-04 | P1 | M | Dashboard shows Expired Drop as record only | No download offered |

## 7. Free Secret link tool (/s)
| ID | Pri | Type | Case | Expected |
|---|---|---|---|---|
| SEC-01 | P0 | A | Server never receives key (fragment only) | Request logs/body contain ciphertext only |
| SEC-02 | P0 | A | Second view | "Already viewed"; ciphertext deleted |
| SEC-03 | P1 | M | Still works and is unaffected by Drop changes | Regression pass |

## 8. Billing & limits (once tiers are chosen)
| ID | Pri | Type | Case | Expected |
|---|---|---|---|---|
| BIL-01 | P1 | A | Free tier: 50 drops/month cap, branding on Link page | Enforced |
| BIL-02 | P1 | A | Pro: higher caps, no branding, custom sender name | Enforced after upgrade |
| BIL-03 | P2 | A | Overage counted per extra Drop | Usage matches Dashboard |

## 9. Non-functional
| ID | Pri | Type | Case | Expected |
|---|---|---|---|---|
| NFR-01 | P0 | A | Rate limit on create and on Link page token lookups | 429 beyond limit |
| NFR-02 | P0 | M | HTTPS only, HSTS, secure cookies on Dashboard | Verified on live domain |
| NFR-03 | P1 | M | Link page loads < 2s on 4G for 25 MB file preview | Measured |
| NFR-04 | P1 | M | Uptime Kuma monitor on thepostdrop.dev + API health | Alert configured |

## 10. Pilot success metrics (not pass/fail; tracked during 2-week test)
- Answer rate: Answered Drops ÷ Drops sent.
- Time to answer: median and p90, sent → Answered.
- Recipient time on Link page before Reply (target under 1 minute).
- Share of answers picked up by the Agent without human help.

## Release gate
All P0 pass on a preview build, then smoke test on production after deploy: DRP-01, LNK-01–03, ANS-01/03, EXP-01, SEC-01.

## Spec §6 traceability
| Acceptance criterion | Cases |
|---|---|
| Create with note/deadline/ask type, MCP/CLI/SDK | SPC-01, DRP-01, DRP-03 |
| HTML email; note, deadline, PDF/PNG preview | NTF-01, LNK-01, LNK-09, SPC-11 |
| Approve / request changes / Edit, no login, one response | SPC-02–04, LNK-02–04 |
| `drop.answered` webhook + signature | ANS-01, ANS-02, SPC-05 |
| Retry on 5xx, max 5 | ANS-05 |
| One reminder at 48h, idempotent sweeper | NTF-03, NTF-04 |
| `drop.expired` + purge (ADR 0003) | ANS-04, EXP-01, LNK-07 |
| Agent isolation (ADR 0002) | ACC-04, ACC-05, SPC-06 |
| Quota `402`, 100 MB limit | DRP-09, DRP-04 |
| Dashboard timeline + weekly report | SPC-07, SPC-08, ACC-06 |
| `/setup` under 5 min | SPC-09 |
| Lint/types/tests/Docker green | SPC-10 |
