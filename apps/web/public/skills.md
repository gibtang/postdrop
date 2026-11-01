# Postdrop — agent skill

Share files your agent produces (screenshots, charts, PDFs, HTML reports) with humans through unguessable, view-only links. No install: Postdrop is a **remote MCP server** + REST API at `https://thepostdrop.dev`.

## Authentication

1. Human signs in at <https://thepostdrop.dev> (Google or email/password) and creates a token under **Dashboard → Tokens** (shown once).
2. Every request carries that token:

```
Authorization: Bearer pd_live_<64 hex>
```

## MCP server (preferred)

- **URL:** `https://thepostdrop.dev/api/mcp` (streamable HTTP, stateless — no session handshake required)
- **Auth header:** `Authorization: Bearer <token>`
- Client config:

```json
{
  "mcpServers": {
    "postdrop": {
      "url": "https://thepostdrop.dev/api/mcp",
      "headers": { "Authorization": "Bearer pd_live_…" }
    }
  }
}
```

### Tools

| Tool | Arguments | Notes |
|---|---|---|
| `upload_artifact` | `filename`, `content_base64`, `name?` | ≤5 MB; `name` (if set) **replaces** the stored filename — keep a renderable extension |
| `upload_artifact_from_url` | `url` (https), `name?` | server fetches ≤5 MB |
| `list_artifacts` | `limit?` (1–200), `cursor?` | newest first → `{items, nextCursor}` |
| `get_artifact` | `artifactId` | artifact + its share links |
| `share_artifact` | `artifactId`, `expiresAt?` (ISO) | returns `{shareLink: {url, …}}` — give this URL to the human |
| `unshare_artifact` | `linkId` | revokes one share link |
| `delete_artifact` | `artifactId` | deletes file + share links |

## Golden path

```
upload_artifact (filename: "chart.png", content_base64: …)
→ share_artifact (artifactId) → {shareLink.url}
→ human opens https://thepostdrop.dev/a/<token> — no login needed
```

## REST fallback (`/v1`, same bearer token)

- `POST /v1/artifacts` — multipart upload (≤4.5 MB)
- `POST /v1/uploads/presign` + `POST /v1/uploads/complete` — direct-to-storage for 4.5–5 MB
- `GET /v1/artifacts`, `GET/PATCH/DELETE /v1/artifacts/:id`, `POST /v1/artifacts/:id/share`, `GET /v1/share`, `DELETE /v1/share/:linkId`

Errors are `{error: {code, message}}` (e.g. `413 FILE_TOO_LARGE`, `422 UNSUPPORTED_FORMAT`, `422 QUOTA_EXCEEDED`).

## Limits

- **Renderable formats only:** png, jpg, jpeg, gif, webp, avif, svg, pdf, mp4, webm, mp3, wav, ogg, txt, md, html, json, csv, xml — anything else is rejected (`422 UNSUPPORTED_FORMAT`)
- 5 MB per artifact, 500 MB per account, 60 uploads/min per token
- Share links are view-only and unguessable; expired links return `410`

## More

- Discovery: [`/llms.txt`](https://thepostdrop.dev/llms.txt) · this file: [`/skills.md`](https://thepostdrop.dev/skills.md)
- Integration contract: `docs/CONTRACT.md` in <https://github.com/gibtang/postdrop>
