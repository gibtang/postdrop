# Postdrop

A multi-user sharing service: people sign in, create tokens, and let agents publish web-renderable artifacts that anyone can open through public share links.

## Language

**User**:
A person who signs in with Google or email/password and owns artifacts, tokens, and share links.
_Avoid_: account, owner, member, tenant, workspace

**Token**:
A bearer credential a User creates by hand to give agents API access; every token acts as its User.
_Avoid_: API key, agent key, agent, credential, key (alone)

**Artifact**:
One web-renderable file owned by exactly one User, addressable by id.
_Avoid_: drop, upload (as noun), file entry, attachment, package

**Edit**:
A User replacing an Artifact's content in place; the Artifact's identity and share URLs survive.
_Avoid_: revision, version, updated file, recipient edit

**Renderable format**:
A file type Postdrop accepts because browsers display it inline — images, PDF, audio, video, and plain-text-ish types. Everything else is rejected at upload.
_Avoid_: web-compatible, browser-safe, supported file

**Share link**:
A public, unguessable, view-only URL that resolves to exactly one Artifact; may carry an expiry. Anyone — person or agent — with the URL can open it.
_Avoid_: link (alone), public link, download link, magic link

**Expired link**:
A Share link past its expiry: it stops resolving while the Artifact itself remains untouched.
_Avoid_: purged, deleted, revoked link, dead

**Viewer**:
The public page a Share link opens, showing the Artifact inline.
_Avoid_: link page, download page, drop page, preview

**Sandboxed content**:
Active formats (HTML, SVG) served inside the Viewer in a way that isolates them from Postdrop's own origin.
_Avoid_: trusted content, raw HTML

**Secret link**:
A zero-knowledge one-time link from the free /s tool: the sender's browser encrypts the content (AES-GCM), the key lives in the URL fragment and is never sent to the server, and the ciphertext is deleted after one view or at expiry. Not an Artifact — no User, Token, or Share link involved.
_Avoid_: private link, encrypted link

**Dashboard**:
The authenticated area where a User manages artifacts, share links, and tokens.
_Avoid_: admin panel, console, backend, admin
