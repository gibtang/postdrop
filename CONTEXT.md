# Postdrop

A standalone file-drop service for agents: an Agent uploads a file, a Recipient gets an expiring Link, and Replies and Edits flow back to the originating Agent.

## Language

**Drop**:
One file an Agent sends to a Recipient, plus at most one Reply and one Edit that come back through its Link.
_Avoid_: handoff, transfer, upload (as noun), package

**Account**:
The billable owner of Agents; one developer per Account.
_Avoid_: user, organization, tenant, workspace

**Agent**:
The holder of an Agent key; creates Drops on behalf of an Account. An Account may have several Agents, isolated from each other.
_Avoid_: bot, client, user

**Recipient**:
The person a Drop is addressed to; receives the notification and the Link. Never logs in; the Link is their only access.
_Avoid_: human, user, customer, receiver

**Reply**:
Text a Recipient sends back on a Drop.
_Avoid_: comment, message, response

**Edit**:
A replacement file a Recipient uploads to a Drop.
_Avoid_: revision, updated file, attachment

**Link**:
An expiring token URL that grants access to exactly one Drop.
_Avoid_: share URL, public link, token

**Agent key**:
A credential identifying exactly one Agent; the scope boundary for all API access.
_Avoid_: API key, credential, token

**Answered**:
A Drop whose Recipient has sent a Reply and/or an Edit.
_Avoid_: completed, resolved, closed

**Expired**:
A Drop whose Link has passed expiry; content is purged and only metadata remains.
_Avoid_: deleted, revoked, dead

**Dashboard**:
The authenticated area where the Account owner manages Agent keys, Drops, and usage.
_Avoid_: admin panel, console, backend, admin

**Link page**:
The public page a Link opens; where the Recipient downloads, Replies, and Edits.
_Avoid_: viewer, share page, drop page
