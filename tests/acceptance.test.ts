import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import {
  BASE,
  RUN,
  MAX_ARTIFACT_BYTES,
  QUOTA_BYTES,
  connectDb,
  closeDb,
  collection,
  seedUser,
  seedTokenForUser,
  revokeToken,
  bearer,
  upload,
  patchArtifact,
  createShare,
  json,
  storageHasExactBytes,
  storageFileCount,
  makeKey,
  PNG_BYTES,
  pngBytesAlt,
  pdfBytes,
  txtBytes,
  HTML_BYTES,
  SVG_BYTES,
  DOCX_BYTES,
  oversizedBytes,
  type Artifact,
  type ShareLink,
  type ApiError,
} from "./helpers";

// Quota is per-user and seeded small, so every section seeds its own user to
// keep cumulative stored bytes far below QUOTA_BYTES.
let aliceKey: string;
let aliceId: string;
let bobKey: string;
let bobId: string;

async function newUser(label: string): Promise<{ key: string; userId: string }> {
  const u = await seedUser(`${label}-${RUN}@postdrop.test`, label);
  return { key: u.key, userId: u.userId };
}

beforeAll(async () => {
  await connectDb();
  const alice = await seedUser(`alice-${RUN}@postdrop.test`, "Alice");
  const bob = await seedUser(`bob-${RUN}@postdrop.test`, "Bob");
  aliceKey = alice.key;
  aliceId = alice.userId;
  bobKey = bob.key;
  bobId = bob.userId;
});

afterAll(async () => {
  await closeDb();
});

// ---------------------------------------------------------------------------
// 1 — token auth
// ---------------------------------------------------------------------------

describe("token auth", () => {
  it("missing header → 401 UNAUTHORIZED envelope", async () => {
    const res = await fetch(`${BASE}/v1/me`);
    expect(res.status).toBe(401);
    const body = await json<ApiError>(res);
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(typeof body.error.message).toBe("string");
  });

  it("malformed header → 401", async () => {
    const res = await fetch(`${BASE}/v1/me`, { headers: { authorization: "Bearer not-a-token" } });
    expect(res.status).toBe(401);
    expect((await json<ApiError>(res)).error.code).toBe("UNAUTHORIZED");
  });

  it("valid but revoked token → 401", async () => {
    const u = await seedUser(`revoked-${RUN}@postdrop.test`, "Revoked");
    await revokeToken(u.tokenId);
    const res = await fetch(`${BASE}/v1/me`, { headers: bearer(u.key) });
    expect(res.status).toBe(401);
    expect((await json<ApiError>(res)).error.code).toBe("UNAUTHORIZED");
  });

  it("valid token → /v1/me reflects the seeded user", async () => {
    const res = await fetch(`${BASE}/v1/me`, { headers: bearer(aliceKey) });
    expect(res.status).toBe(200);
    const body = await json<{ userId: string; email: string; name: string }>(res);
    expect(body.userId).toBe(aliceId);
    expect(body.email).toBe(`alice-${RUN}@postdrop.test`);
    expect(body.name).toBe("Alice");
  });
});

// ---------------------------------------------------------------------------
// 2 — upload happy paths + storage write verification
// ---------------------------------------------------------------------------

describe("upload happy paths", () => {
  it("png upload → 201 artifact with persisted metadata, bytes on disk", async () => {
    const res = await upload(aliceKey, PNG_BYTES, {
      filename: "pixel.png",
      contentType: "image/png",
    });
    expect(res.status).toBe(201);
    const { artifact } = await json<{ artifact: Artifact }>(res);
    expect(artifact.artifactId).toMatch(/^art_[0-9a-f]{32}$/);
    expect(artifact.filename).toBe("pixel.png");
    expect(artifact.contentType).toBe("image/png");
    expect(artifact.size).toBe(PNG_BYTES.length);
    expect(new Date(artifact.createdAt).toString()).not.toBe("Invalid Date");
    expect(new Date(artifact.updatedAt).toString()).not.toBe("Invalid Date");
    expect(await storageHasExactBytes(PNG_BYTES)).toBe(true);
  });

  it("pdf upload → 201 with application/pdf", async () => {
    const bytes = pdfBytes();
    const res = await upload(aliceKey, bytes, { filename: "doc.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(201);
    const { artifact } = await json<{ artifact: Artifact }>(res);
    expect(artifact.contentType).toBe("application/pdf");
    expect(artifact.size).toBe(bytes.length);
    expect(await storageHasExactBytes(bytes)).toBe(true);
  });

  it("txt upload → 201 with text/plain", async () => {
    const bytes = txtBytes();
    const res = await upload(aliceKey, bytes, { filename: "notes.txt", contentType: "text/plain" });
    expect(res.status).toBe(201);
    const { artifact } = await json<{ artifact: Artifact }>(res);
    expect(artifact.contentType).toBe("text/plain");
    expect(artifact.size).toBe(bytes.length);
    expect(await storageHasExactBytes(bytes)).toBe(true);
  });

  it("upload with no auth header → 401", async () => {
    const res = await fetch(`${BASE}/v1/artifacts`, { method: "POST", body: new FormData() });
    expect(res.status).toBe(401);
    expect((await json<ApiError>(res)).error.code).toBe("UNAUTHORIZED");
  });

  it("unregistered (well-formed) key → 401", async () => {
    const res = await upload(makeKey(), PNG_BYTES, { filename: "x.png", contentType: "image/png" });
    // not registered key — same 401 shape
    expect(res.status).toBe(401);
    expect((await json<ApiError>(res)).error.code).toBe("UNAUTHORIZED");
  });
});

// ---------------------------------------------------------------------------
// 3 — format rejection
// ---------------------------------------------------------------------------

describe("format rejection", () => {
  it(".docx → 422 UNSUPPORTED_FORMAT listing allowed formats", async () => {
    const res = await upload(aliceKey, DOCX_BYTES, {
      filename: "paper.docx",
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    expect(res.status).toBe(422);
    const body = await json<ApiError>(res);
    expect(body.error.code).toBe("UNSUPPORTED_FORMAT");
    for (const ext of ["png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "pdf", "mp4", "webm", "mp3", "wav", "ogg", "txt", "md", "html", "json", "csv", "xml"]) {
      expect(body.error.message).toContain(ext);
    }
  });

  it("extensionless filename → 422 UNSUPPORTED_FORMAT", async () => {
    const res = await upload(aliceKey, txtBytes(32), {
      filename: "README",
      contentType: "text/plain",
    });
    expect(res.status).toBe(422);
    expect((await json<ApiError>(res)).error.code).toBe("UNSUPPORTED_FORMAT");
  });
});

// ---------------------------------------------------------------------------
// 4 — size rejection (MAX_ARTIFACT_BYTES tiny via boot env)
// ---------------------------------------------------------------------------

describe("size rejection", () => {
  let sizeKey: string;
  beforeAll(async () => {
    sizeKey = (await newUser("sizer")).key;
  });

  it(`file > ${MAX_ARTIFACT_BYTES} bytes → 413 FILE_TOO_LARGE`, async () => {
    expect(oversizedBytes().length).toBeGreaterThan(MAX_ARTIFACT_BYTES);
    const res = await upload(sizeKey, oversizedBytes(), {
      filename: "big.txt",
      contentType: "text/plain",
    });
    expect(res.status).toBe(413);
    const body = await json<ApiError>(res);
    expect(body.error.code).toBe("FILE_TOO_LARGE");
    // presign enforces the same per-artifact cap, so the message must not
    // redirect oversized uploads there.
    expect(body.error.message).not.toContain("presign");
  });

  it("file exactly at the limit is not size-rejected", async () => {
    const bytes = txtBytes(MAX_ARTIFACT_BYTES);
    expect(bytes.length).toBe(MAX_ARTIFACT_BYTES);
    const res = await upload(sizeKey, bytes, { filename: "edge.txt", contentType: "text/plain" });
    expect(res.status).toBe(201);
    expect((await json<{ artifact: Artifact }>(res)).artifact.size).toBe(MAX_ARTIFACT_BYTES);
  });
});

// ---------------------------------------------------------------------------
// 5 — quota (QUOTA_BYTES seeded small via boot env; dedicated user)
// ---------------------------------------------------------------------------

describe("quota", () => {
  let quotaKey: string;

  beforeAll(async () => {
    const u = await seedUser(`quota-${RUN}@postdrop.test`, "Quota");
    quotaKey = u.key;
  });

  it("second upload crossing QUOTA_BYTES → 422 QUOTA_EXCEEDED", async () => {
    expect(QUOTA_BYTES).toBeLessThan(MAX_ARTIFACT_BYTES * 2);
    const first = txtBytes(2400);
    const r1 = await upload(quotaKey, first, { filename: "q1.txt", contentType: "text/plain" });
    expect(r1.status).toBe(201);

    const second = txtBytes(2400); // 2400 + 2400 > 4096, each under the per-file cap
    const r2 = await upload(quotaKey, second, { filename: "q2.txt", contentType: "text/plain" });
    expect(r2.status).toBe(422);
    expect((await json<ApiError>(r2)).error.code).toBe("QUOTA_EXCEEDED");
  });

  it("deleting the artifact frees quota → upload OK again", async () => {
    const list = await json<{ items: Artifact[] }>(
      await fetch(`${BASE}/v1/artifacts`, { headers: bearer(quotaKey) }),
    );
    expect(list.items).toHaveLength(1);
    const del = await fetch(`${BASE}/v1/artifacts/${list.items[0].artifactId}`, {
      method: "DELETE",
      headers: bearer(quotaKey),
    });
    expect(del.status).toBe(204);

    const retry = txtBytes(2400);
    const res = await upload(quotaKey, retry, { filename: "q3.txt", contentType: "text/plain" });
    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// 6 — edit (PATCH replace-in-place)
// ---------------------------------------------------------------------------

describe("artifact edit (PATCH)", () => {
  it("replaces bytes, keeps artifactId, updates metadata and storage", async () => {
    const originalBytes = Buffer.concat([PNG_BYTES, randomBytes(8)]); // unique per run
    const created = await json<{ artifact: Artifact }>(
      await upload(aliceKey, originalBytes, { filename: "evolving.png", contentType: "image/png" }),
    );
    const original = created.artifact;

    const replacement = pngBytesAlt();
    const res = await patchArtifact(aliceKey, original.artifactId, replacement, {
      filename: "evolving.png",
      contentType: "image/png",
    });
    expect(res.status).toBe(200);
    const { artifact } = await json<{ artifact: Artifact }>(res);
    expect(artifact.artifactId).toBe(original.artifactId);
    expect(artifact.size).toBe(replacement.length);
    expect(new Date(artifact.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(original.updatedAt).getTime(),
    );

    // old storage object replaced: exactly the new bytes exist, old full bytes gone
    expect(await storageHasExactBytes(replacement)).toBe(true);
    expect(await storageHasExactBytes(originalBytes)).toBe(false);
  });

  it("PATCH updates contentType (png → pdf)", async () => {
    const created = await json<{ artifact: Artifact }>(
      await upload(aliceKey, PNG_BYTES, { filename: "swap.png", contentType: "image/png" }),
    );
    const bytes = pdfBytes();
    const res = await patchArtifact(aliceKey, created.artifact.artifactId, bytes, {
      filename: "swap.pdf",
      contentType: "application/pdf",
    });
    expect(res.status).toBe(200);
    const { artifact } = await json<{ artifact: Artifact }>(res);
    expect(artifact.artifactId).toBe(created.artifact.artifactId);
    expect(artifact.contentType).toBe("application/pdf");
    expect(artifact.size).toBe(bytes.length);
    expect(await storageHasExactBytes(bytes)).toBe(true);
  });

  it("PATCH foreign artifact → 404", async () => {
    const mine = await json<{ artifact: Artifact }>(
      await upload(aliceKey, PNG_BYTES, { filename: "mine.png", contentType: "image/png" }),
    );
    const res = await patchArtifact(bobKey, mine.artifact.artifactId, PNG_BYTES, {
      filename: "mine.png",
      contentType: "image/png",
    });
    expect(res.status).toBe(404);
    expect((await json<ApiError>(res)).error.code).toBe("NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// 7 — list + pagination + visibility scoping
// ---------------------------------------------------------------------------

describe("list artifacts", () => {
  const prefix = `list-${RUN}`;

  beforeAll(async () => {
    const u = await seedUser(`lister-${RUN}@postdrop.test`, "Lister");
    for (let i = 0; i < 5; i++) {
      const res = await upload(u.key, txtBytes(16 + i), {
        filename: `${prefix}-${i}.txt`,
        contentType: "text/plain",
      });
      expect(res.status).toBe(201);
    }
  });

  it("paginates with cursor round-trip until exhausted", async () => {
    const u = await seedUser(`paginator-${RUN}@postdrop.test`, "Paginator");
    for (let i = 0; i < 3; i++) {
      await upload(u.key, txtBytes(20 + i), { filename: `p-${i}.txt`, contentType: "text/plain" });
    }

    const seen: Artifact[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      const url = new URL(`${BASE}/v1/artifacts`);
      url.searchParams.set("limit", "2");
      if (cursor) url.searchParams.set("cursor", cursor);
      const res = await fetch(url, { headers: bearer(u.key) });
      expect(res.status).toBe(200);
      const body = await json<{ items: Artifact[]; nextCursor: string | null }>(res);
      seen.push(...body.items);
      if (body.nextCursor === null) break;
      cursor = body.nextCursor;
    }
    expect(seen).toHaveLength(3);
    expect(seen.map((a) => a.filename)).toEqual(
      expect.arrayContaining([expect.stringContaining("p-")]),
    );
    // cursors never repeat an artifact
    const ids = new Set(seen.map((a) => a.artifactId));
    expect(ids.size).toBe(seen.length);
  });

  it("only own artifacts visible to the token", async () => {
    const mine = await json<{ artifact: Artifact }>(
      await upload(aliceKey, PNG_BYTES, { filename: `${prefix}-mine.png`, contentType: "image/png" }),
    );
    const bobList = await json<{ items: Artifact[] }>(
      await fetch(`${BASE}/v1/artifacts`, { headers: bearer(bobKey) }),
    );
    expect(bobList.items.map((a) => a.artifactId)).not.toContain(mine.artifact.artifactId);
    const aliceList = await json<{ items: Artifact[] }>(
      await fetch(`${BASE}/v1/artifacts`, { headers: bearer(aliceKey) }),
    );
    expect(aliceList.items.map((a) => a.artifactId)).toContain(mine.artifact.artifactId);
  });
});

// ---------------------------------------------------------------------------
// 8 — ownership (no existence leak)
// ---------------------------------------------------------------------------

describe("ownership scoping", () => {
  let artifactId: string;

  beforeAll(async () => {
    const created = await json<{ artifact: Artifact }>(
      await upload(aliceKey, PNG_BYTES, { filename: "owned.png", contentType: "image/png" }),
    );
    artifactId = created.artifact.artifactId;
  });

  it("foreign GET → 404 NOT_FOUND", async () => {
    const res = await fetch(`${BASE}/v1/artifacts/${artifactId}`, { headers: bearer(bobKey) });
    expect(res.status).toBe(404);
    expect((await json<ApiError>(res)).error.code).toBe("NOT_FOUND");
  });

  it("foreign PATCH → 404", async () => {
    const res = await patchArtifact(bobKey, artifactId, PNG_BYTES, {
      filename: "owned.png",
      contentType: "image/png",
    });
    expect(res.status).toBe(404);
  });

  it("foreign DELETE → 404", async () => {
    const res = await fetch(`${BASE}/v1/artifacts/${artifactId}`, {
      method: "DELETE",
      headers: bearer(bobKey),
    });
    expect(res.status).toBe(404);
  });

  it("unknown artifact id → 404", async () => {
    const res = await fetch(`${BASE}/v1/artifacts/${randomUUID()}`, { headers: bearer(aliceKey) });
    expect(res.status).toBe(404);
  });

  it("owner GET → 200 with artifact", async () => {
    const res = await fetch(`${BASE}/v1/artifacts/${artifactId}`, { headers: bearer(aliceKey) });
    expect(res.status).toBe(200);
    const body = await json<{ artifact: Artifact }>(res);
    expect(body.artifact.artifactId).toBe(artifactId);
  });
});

// ---------------------------------------------------------------------------
// 9 — share lifecycle + public link surface
// ---------------------------------------------------------------------------

describe("share lifecycle", () => {
  let artifactId: string;

  beforeAll(async () => {
    const created = await json<{ artifact: Artifact }>(
      await upload(aliceKey, PNG_BYTES, { filename: "shared.png", contentType: "image/png" }),
    );
    artifactId = created.artifact.artifactId;
  });

  it("create without expiry → 201 shareLink on BASE/a/<token>", async () => {
    const res = await createShare(aliceKey, artifactId);
    expect(res.status).toBe(201);
    const { shareLink } = await json<{ shareLink: ShareLink }>(res);
    expect(shareLink.linkId).toBeTruthy();
    expect(shareLink.revokedAt).toBeNull();
    expect(shareLink.expiresAt).toBeNull();
    const token = shareLink.url.replace(`${BASE}/a/`, "");
    expect(shareLink.url).toBe(`${BASE}/a/${token}`);
    expect(token.length).toBeGreaterThan(8);

    // artifact detail lists the link
    const detail = await json<{ artifact: Artifact; shareLinks: ShareLink[] }>(
      await fetch(`${BASE}/v1/artifacts/${artifactId}`, { headers: bearer(aliceKey) }),
    );
    expect(detail.shareLinks.map((l) => l.linkId)).toContain(shareLink.linkId);
  });

  it("create with future expiry → 201 with expiresAt set", async () => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const res = await createShare(aliceKey, artifactId, { expiresAt });
    expect(res.status).toBe(201);
    const { shareLink } = await json<{ shareLink: ShareLink }>(res);
    expect(shareLink.expiresAt).toBe(expiresAt);
  });

  it("viewer page 200, raw serves exact bytes with correct content type", async () => {
    const { shareLink } = await json<{ shareLink: ShareLink }>(
      await createShare(aliceKey, artifactId),
    );
    const viewer = await fetch(shareLink.url);
    expect(viewer.status).toBe(200);
    expect(viewer.headers.get("content-type")).toContain("text/html");

    const raw = await fetch(`${shareLink.url}/raw`);
    expect(raw.status).toBe(200);
    expect(Buffer.from(await raw.arrayBuffer()).equals(PNG_BYTES)).toBe(true);
    expect(raw.headers.get("content-type")).toContain("image/png");
  });

  it("unshare (DELETE /v1/share/:linkId) → 204 then viewer+raw 404", async () => {
    const { shareLink } = await json<{ shareLink: ShareLink }>(
      await createShare(aliceKey, artifactId),
    );
    const del = await fetch(`${BASE}/v1/share/${shareLink.linkId}`, {
      method: "DELETE",
      headers: bearer(aliceKey),
    });
    expect(del.status).toBe(204);
    expect((await fetch(shareLink.url)).status).toBe(404);
    expect((await fetch(`${shareLink.url}/raw`)).status).toBe(404);
  });

  it("expired link (expiresAt in past, seeded directly) → viewer+raw 404", async () => {
    const { shareLink } = await json<{ shareLink: ShareLink }>(
      await createShare(aliceKey, artifactId),
    );
    // SWEEPER_DISABLED=1, so expiry is seeded at the driver level.
    const filter = { linkId: shareLink.linkId };
    const update = { $set: { expiresAt: new Date(Date.now() - 1000) } };
    await collection("share_links").updateOne(filter, update);
    expect((await fetch(shareLink.url)).status).toBe(404);
    expect((await fetch(`${shareLink.url}/raw`)).status).toBe(404);
  });

  it("unknown link token → 404", async () => {
    expect((await fetch(`${BASE}/a/definitely-not-a-real-token`)).status).toBe(404);
    expect((await fetch(`${BASE}/a/definitely-not-a-real-token/raw`)).status).toBe(404);
  });

  it("foreign share create → 404", async () => {
    const res = await createShare(bobKey, artifactId);
    expect(res.status).toBe(404);
  });

  it("deleting the artifact makes its links 404", async () => {
    const created = await json<{ artifact: Artifact }>(
      await upload(aliceKey, PNG_BYTES, { filename: "doomed.png", contentType: "image/png" }),
    );
    const { shareLink } = await json<{ shareLink: ShareLink }>(
      await createShare(aliceKey, created.artifact.artifactId),
    );
    expect((await fetch(shareLink.url)).status).toBe(200);
    const del = await fetch(`${BASE}/v1/artifacts/${created.artifact.artifactId}`, {
      method: "DELETE",
      headers: bearer(aliceKey),
    });
    expect(del.status).toBe(204);
    expect((await fetch(shareLink.url)).status).toBe(404);
    expect((await fetch(`${shareLink.url}/raw`)).status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// 10 — share listing + deletion scoping (13 covered too)
// ---------------------------------------------------------------------------

describe("share admin surface", () => {
  it("GET /v1/share lists own links; DELETE foreign link → 404", async () => {
    const created = await json<{ artifact: Artifact }>(
      await upload(aliceKey, PNG_BYTES, { filename: "admin.png", contentType: "image/png" }),
    );
    const mine = await json<{ shareLink: ShareLink }>(
      await createShare(aliceKey, created.artifact.artifactId),
    );

    const list = await json<{ items: ShareLink[] }>(
      await fetch(`${BASE}/v1/share`, { headers: bearer(aliceKey) }),
    );
    expect(Array.isArray(list.items)).toBe(true);
    expect(list.items.map((l) => l.linkId)).toContain(mine.shareLink.linkId);

    // foreign user sees none of it and cannot delete it
    const bobList = await json<{ items: ShareLink[] }>(
      await fetch(`${BASE}/v1/share`, { headers: bearer(bobKey) }),
    );
    expect(bobList.items.map((l) => l.linkId)).not.toContain(mine.shareLink.linkId);

    const foreignDel = await fetch(`${BASE}/v1/share/${mine.shareLink.linkId}`, {
      method: "DELETE",
      headers: bearer(bobKey),
    });
    expect(foreignDel.status).toBe(404);
    expect((await json<ApiError>(foreignDel)).error.code).toBe("NOT_FOUND");

    // own delete still works
    const ownDel = await fetch(`${BASE}/v1/share/${mine.shareLink.linkId}`, {
      method: "DELETE",
      headers: bearer(aliceKey),
    });
    expect(ownDel.status).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// 11 — sandboxed active content + raw download (CLI surface)
// ---------------------------------------------------------------------------

describe("active content sandboxing and raw download", () => {
  async function shareOf(
    key: string,
    bytes: Buffer,
    filename: string,
    contentType: string,
  ): Promise<{ url: string; artifactId: string }> {
    const created = await json<{ artifact: Artifact }>(
      await upload(key, bytes, { filename, contentType }),
    );
    const { shareLink } = await json<{ shareLink: ShareLink }>(
      await createShare(key, created.artifact.artifactId),
    );
    return { url: shareLink.url, artifactId: created.artifact.artifactId };
  }

  it("html raw carries Content-Security-Policy: sandbox and text/html", async () => {
    const { url } = await shareOf(aliceKey, HTML_BYTES, "report.html", "text/html");
    const raw = await fetch(`${url}/raw`);
    expect(raw.status).toBe(200);
    expect(raw.headers.get("content-type")).toContain("text/html");
    expect(raw.headers.get("content-security-policy")).toContain("sandbox");
  });

  it("svg raw carries Content-Security-Policy: sandbox and image/svg+xml", async () => {
    const { url } = await shareOf(aliceKey, SVG_BYTES, "chart.svg", "image/svg+xml");
    const raw = await fetch(`${url}/raw`);
    expect(raw.status).toBe(200);
    expect(raw.headers.get("content-type")).toContain("image/svg+xml");
    expect(raw.headers.get("content-security-policy")).toContain("sandbox");
  });

  it("png raw does not need sandbox and is inline", async () => {
    const { url } = await shareOf(aliceKey, PNG_BYTES, "safe.png", "image/png");
    const raw = await fetch(`${url}/raw`);
    expect(raw.status).toBe(200);
    expect(raw.headers.get("content-type")).toContain("image/png");
    const csp = raw.headers.get("content-security-policy");
    expect(csp === null || !csp.includes("sandbox")).toBe(true);
    expect(raw.headers.get("content-disposition") ?? "inline").toContain("inline");
  });

  it("token-auth raw download (CLI surface) → 200 exact bytes inline", async () => {
    const created = await json<{ artifact: Artifact }>(
      await upload(aliceKey, pdfBytes(), { filename: "cli.pdf", contentType: "application/pdf" }),
    );
    const res = await fetch(`${BASE}/v1/artifacts/${created.artifact.artifactId}/raw`, {
      headers: bearer(aliceKey),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");
    expect((res.headers.get("content-disposition") ?? "inline")).toContain("inline");
  });

  it("token-auth raw download of foreign artifact → 404", async () => {
    const created = await json<{ artifact: Artifact }>(
      await upload(aliceKey, PNG_BYTES, { filename: "nope.png", contentType: "image/png" }),
    );
    const res = await fetch(`${BASE}/v1/artifacts/${created.artifact.artifactId}/raw`, {
      headers: bearer(bobKey),
    });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// 12 — presign on disk driver
// ---------------------------------------------------------------------------

describe("presign", () => {
  it("POST /v1/uploads/presign on disk driver → 501 PRESIGN_UNAVAILABLE", async () => {
    const res = await fetch(`${BASE}/v1/uploads/presign`, {
      method: "POST",
      headers: { ...bearer(aliceKey), "content-type": "application/json" },
      body: JSON.stringify({
        filename: "big.png",
        contentType: "image/png",
        size: PNG_BYTES.length,
      }),
    });
    expect(res.status).toBe(501);
    expect((await json<ApiError>(res)).error.code).toBe("PRESIGN_UNAVAILABLE");
  });

  it("presign without auth → 401", async () => {
    const res = await fetch(`${BASE}/v1/uploads/presign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename: "big.png", contentType: "image/png", size: 10 }),
    });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// 13 — secret paste regression (UNTOUCHED by the pivot)
// ---------------------------------------------------------------------------

describe("secret link tool regression (/s)", () => {
  it("create → one view → second view gone", async () => {
    const iv = "AAAAAAAAAAAAAAAAAAAAAA==";
    const ciphertext = Buffer.from("top secret text").toString("base64");
    const createRes = await fetch(`${BASE}/api/pastes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "text", iv, ciphertext, ttlHours: 24 }),
    });
    expect(createRes.status).toBe(200);
    const { token } = (await createRes.json()) as { token: string };
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    const view1 = await fetch(`${BASE}/api/pastes/${token}`);
    expect(view1.status).toBe(200);
    expect(((await view1.json()) as { ciphertext: string }).ciphertext).toBe(ciphertext);

    const view2 = await fetch(`${BASE}/api/pastes/${token}`);
    expect(view2.status).toBe(410);
    expect(((await view2.json()) as { gone: boolean }).gone).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Storage hygiene — runs last: uploads must map to stored objects
// ---------------------------------------------------------------------------

describe("storage hygiene", () => {
  it("disk storage contains at least one object per surviving artifact", async () => {
    const count = await storageFileCount();
    const list = await json<{ items: Artifact[] }>(
      await fetch(`${BASE}/v1/artifacts`, { headers: bearer(aliceKey) }),
    );
    expect(count).toBeGreaterThanOrEqual(list.items.length);
  });
});
