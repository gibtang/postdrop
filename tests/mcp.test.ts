import { afterAll, describe, expect, test } from "vitest";
import { BASE, closeDb, connectDb, JPEG_BYTES, seedUser, collection } from "./helpers";

// MCP route regression: stateless JSON-mode transport over the web-standard
// StreamableHTTPServerTransport (SDK ≥1.32). Guards the initialize/tool-call path.

async function rpc(key: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  expect(
    res.status >= 200 && res.status < 300,
    `mcp post failed: ${res.status} ${text}`,
  ).toBe(true);
  return text ? JSON.parse(text) : null;
}

/** Narrow a JSON-RPC success envelope: { result: { content: [...] } } with text parts. */
function resultText(body: unknown, id: number): string {
  expect(body && typeof body === "object" && "result" in body).toBe(true);
  const result = (body as { result: unknown }).result;
  expect(result && typeof result === "object" && "content" in result).toBe(true);
  const content = (result as { content: unknown }).content;
  expect(Array.isArray(content) && content.length > 0).toBe(true);
  const first = content[0] as unknown;
  expect(first && typeof first === "object" && "text" in first).toBe(true);
  expect((body as { id?: unknown }).id === undefined || (body as { id: unknown }).id === id).toBe(true);
  return (first as { text: unknown }).text as string;
}

describe("mcp route (stateless, JSON mode)", () => {
  afterAll(async () => {
    await closeDb();
  });

  test("initialize -> tools/list -> upload_artifact -> list_artifacts", async () => {
    await connectDb();
    const seeded = await seedUser(`mcp-smoke-${Date.now()}@test.local`, "MCP Smoke");

    const initBody = (await rpc(seeded.key, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "postdrop-smoke", version: "0.0.0" },
      },
    })) as { result?: unknown };
    expect(
      initBody.result !== null &&
        typeof initBody.result === "object" &&
        "serverInfo" in initBody.result &&
        typeof (initBody.result as { serverInfo?: { name?: unknown } }).serverInfo?.name ===
          "string",
    ).toBe(true);
    const serverName = (
      (initBody.result as { serverInfo: { name: unknown } }).serverInfo
    ).name;
    expect(serverName).toBe("postdrop");

    const notif = await fetch(`${BASE}/api/mcp`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${seeded.key}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });
    expect(notif.status).toBe(202);

    const toolsBody = (await rpc(seeded.key, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    })) as { result?: { tools?: unknown } };
    const tools = toolsBody.result?.tools;
    expect(Array.isArray(tools)).toBe(true);
    const names = (tools as { name: unknown }[])
      .filter((t) => t && typeof t === "object" && "name" in t)
      .map((t) => t.name);
    expect(names).toContain("upload_artifact");
    expect(names).toContain("list_artifacts");

    const png = Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001d0a2db40000000049454e44ae426082",
      "hex",
    );
    const uploadText = resultText(
      await rpc(seeded.key, {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "upload_artifact",
          arguments: {
            filename: "pixel.png",
            content_base64: png.toString("base64"),
            name: "smoke pixel.png",
          },
        },
      }),
      3,
    );
    const uploaded = JSON.parse(uploadText) as {
      artifact?: { artifactId?: unknown; filename?: unknown };
    };
    const artifactId = uploaded.artifact?.artifactId;
    expect(typeof artifactId).toBe("string");
    expect(uploaded.artifact?.filename).toBe("smoke pixel.png");

    // Regression (GH #2): display name without an extension must not affect
    // format validation — extension contract binds to `filename` only.
    const labelled = JSON.parse(
      resultText(
        await rpc(seeded.key, {
          jsonrpc: "2.0",
          id: 5,
          method: "tools/call",
          params: {
            name: "upload_artifact",
            arguments: {
              filename: "shot.jpg",
              content_base64: JPEG_BYTES.toString("base64"),
              name: "sign-in unavailable (mobile Safari)",
            },
          },
        }),
        5,
      ),
    ) as { artifact?: { artifactId?: unknown; filename?: unknown; contentType?: unknown } };
    expect(labelled.artifact?.artifactId).toBeTruthy();
    expect(labelled.artifact?.filename).toBe("sign-in unavailable (mobile Safari)");
    expect(labelled.artifact?.contentType).toBe("image/jpeg");

    // Content lying about its extension is rejected by magic-byte sniffing.
    const fakePng = await rpc(seeded.key, {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "upload_artifact",
        arguments: {
          filename: "evil.png",
          content_base64: Buffer.from("<!doctype html><html></html>").toString("base64"),
        },
      },
    });
    const fakeText = resultText(fakePng, 6);
    expect(fakeText).toContain("UNSUPPORTED_FORMAT");

    const listText = resultText(
      await rpc(seeded.key, {
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: { name: "list_artifacts", arguments: {} },
      }),
      7,
    );
    const listed = JSON.parse(listText) as { items?: { artifactId?: unknown }[] };
    expect(Array.isArray(listed.items)).toBe(true);
    expect(
      (listed.items ?? []).some((a) => a.artifactId === artifactId),
      "uploaded artifact must appear in list_artifacts",
    ).toBe(true);
    expect(
      (listed.items ?? []).some((a) => a.artifactId === labelled.artifact?.artifactId),
      "display-labelled artifact must appear in list_artifacts",
    ).toBe(true);

    // Cleanup seeded rows (test DB is ephemeral, but keep it tidy anyway).
    await connectDb();
    await collection("tokens").deleteMany({ tokenId: seeded.tokenId });
    await collection("users").deleteMany({ email: seeded.email });
    await collection("artifacts").deleteMany({ artifactId: artifactId });
    await collection("artifacts").deleteMany({ artifactId: labelled.artifact?.artifactId });
  });

  test("unauthorized without token", async () => {
    const res = await fetch(`${BASE}/api/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    expect(res.status).toBe(401);
  });
});
