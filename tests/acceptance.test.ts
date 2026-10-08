import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { promisify } from "node:util";
import mongoose from "../apps/web/node_modules/mongoose";
import { beforeAll, describe, expect, it } from "vitest";
// Static import from packages/mcp's own dependency copy (root has no direct dep).
import type { Client } from "../packages/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import type { StdioClientTransport } from "../packages/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js";
import type { ServerInfo } from "./global-setup";

const execFileP = promisify(execFile);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const info: ServerInfo = JSON.parse(
  readFileSync(path.join(__dirname, ".server-info.json"), "utf8"),
) as ServerInfo; // known author-time shape written by globalSetup
const BASE = info.baseUrl;
const RUN = info.runId;

const MCP_SDK = "../packages/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm";
const A_ORIGINAL_LEN = 256 * 1024 + 7;
const A_EDIT_LEN = 128 * 1024 + 13;
const FREE_CAP_BYTES = 104_857_600;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface OwnerSession {
  cookie: string;
}

async function login(email: string, password: string): Promise<{ res: Response; cookie?: string }> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const setCookie = res.headers.get("set-cookie");
  return { res, cookie: setCookie?.split(";")[0] };
}

async function ownerSession(): Promise<OwnerSession> {
  const { res, cookie } = await login(info.ownerEmail, info.ownerPassword);
  expect(res.status).toBe(200);
  expect(cookie).toBeTruthy();
  return { cookie: cookie as string };
}

async function createAgent(session: OwnerSession, name: string): Promise<string> {
  const res = await fetch(`${BASE}/api/agents`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: session.cookie },
    body: JSON.stringify({ name }),
  });
  expect(res.status).toBe(201);
  const body = (await res.json()) as { key: string }; // 201 shape from /api/agents contract
  expect(body.key).toMatch(/^pd_live_[0-9a-f]{64}$/);
  return body.key;
}

interface Uploaded {
  dropId: string;
  linkUrl: string;
  token: string;
  filename: string;
  sizeBytes: number;
  expiresAt: string;
}

async function upload(
  apiKey: string,
  bytes: Buffer,
  opts: {
    recipientEmail: string;
    filename?: string;
    ttlHours?: number;
  },
): Promise<Response> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${apiKey}`,
    "x-filename": opts.filename ?? "file.bin",
    "x-recipient-email": opts.recipientEmail,
    "content-type": "application/octet-stream",
    "content-length": String(bytes.length),
  };
  if (opts.ttlHours !== undefined) headers["x-ttl-hours"] = String(opts.ttlHours);
  return fetch(`${BASE}/v1/drops`, { method: "POST", headers, body: bytes });
}

async function uploadOk(
  apiKey: string,
  bytes: Buffer,
  opts: { recipientEmail: string; filename?: string; ttlHours?: number },
): Promise<Uploaded> {
  const res = await upload(apiKey, bytes, opts);
  if (res.status !== 201) {
    throw new Error(`upload failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as Omit<Uploaded, "token">; // 201 shape per contract
  expect(body.linkUrl.startsWith(`${BASE}/l/`)).toBe(true);
  expect(body.sizeBytes).toBe(bytes.length);
  const token = body.linkUrl.slice(`${BASE}/l/`.length);
  expect(token).toMatch(/^[0-9a-f]{64}$/);
  return { ...body, token };
}

async function revoke(apiKey: string, dropId: string): Promise<Response> {
  return fetch(`${BASE}/v1/drops/${dropId}/revoke`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}` },
  });
}

async function replyOnLink(token: string, text: string): Promise<Response> {
  return fetch(`${BASE}/l/${token}/reply`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

async function findDropIdByFilename(apiKey: string, filename: string): Promise<string | undefined> {
  const res = await fetch(`${BASE}/v1/drops`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const body = (await res.json()) as { drops: Array<{ dropId: string; filename: string }> };
  return body.drops.find((d) => d.filename === filename)?.dropId;
}

/** Raw HTTP request with a forged Content-Length, sending only a tiny body. */
function rawUploadWithDeclaredLength(
  apiKey: string,
  declaredBytes: number,
  actualBytes: number,
): Promise<{ status: number; body: string }> {
  // Node 20 lacks Promise.withResolvers
  let resolveDone!: (v: { status: number; body: string }) => void;
  let rejectDone!: (e: unknown) => void;
  const done = new Promise<{ status: number; body: string }>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });
  const req = http.request(
    {
      host: "localhost",
      port: 3111,
      method: "POST",
      path: "/v1/drops",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "x-filename": "huge.bin",
        "x-recipient-email": `huge-${RUN}@postdrop.test`,
        "x-ttl-hours": "24",
        "content-type": "application/octet-stream",
        "content-length": String(declaredBytes),
      },
    },
    (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        resolveDone({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() });
        req.destroy(); // body never completed; server answered from headers alone
      });
    },
  );
  req.on("error", () => undefined); // socket destroyed after response is expected
  req.write(Buffer.alloc(actualBytes)); // do NOT end(): content-length is intentionally larger
  return done;
}

const mcpEnv = (key: string): Record<string, string> => ({
  ...(process.env as Record<string, string>),
  POSTDROP_API_KEY: key,
  POSTDROP_BASE_URL: BASE,
});

async function mcpSpawn(key: string): Promise<{ client: Client; transport: StdioClientTransport }> {
  const { Client: McpClient } = await import(`${MCP_SDK}/client/index.js`);
  const { StdioClientTransport: StdioTransport } = await import(`${MCP_SDK}/client/stdio.js`);
  const transport = new StdioTransport({
    command: "node",
    args: [path.join(repoRoot, "packages/mcp/dist/mcp.js")],
    env: mcpEnv(key),
  });
  const client = new McpClient({ name: "postdrop-acceptance", version: "0.0.0" });
  await client.connect(transport);
  return { client, transport };
}

async function writeTempFile(name: string, bytes: Buffer): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "postdrop-test-"));
  const file = path.join(dir, name);
  await writeFile(file, bytes);
  return file;
}

interface CliResult {
  stdout: string;
  stderr: string;
  code: number;
}

async function cli(args: string[], key: string): Promise<CliResult> {
  try {
    const { stdout, stderr } = await execFileP(
      "node",
      [path.join(repoRoot, "packages/cli/dist/cli.js"), ...args],
      { env: mcpEnv(key) },
    );
    return { stdout, stderr, code: 0 };
  } catch (err) {
    const e = err as { code?: number | string; stdout?: string; stderr?: string };
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", code: Number(e.code ?? -1) };
  }
}

async function dropRow(dropId: string): Promise<Record<string, unknown> | null> {
  // mongoose is the driver apps/web ships; read tombstones through its native db handle
  if (!mongoose.connection.readyState) await mongoose.connect(info.mongoUri);
  return mongoose.connection.db!.collection("drops").findOne({ dropId });
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

let session: OwnerSession;
let keyA = "";
let keyB = "";

beforeAll(async () => {
  session = await ownerSession();
  keyA = await createAgent(session, `acceptance-a-${RUN}`);
  keyB = await createAgent(session, `acceptance-b-${RUN}`);
});

// ---------------------------------------------------------------------------
// A — whole loop with a real file
// ---------------------------------------------------------------------------

describe("A: whole loop with a real file", () => {
  const original = randomBytes(A_ORIGINAL_LEN);
  const edited = randomBytes(A_EDIT_LEN);
  const replyText = `reply from acceptance A run ${RUN}`;
  let drop: Uploaded;

  it("upload via /v1 then meta + byte-identical file via /l", async () => {
    drop = await uploadOk(keyA, original, {
      recipientEmail: `recipient-a-${RUN}@postdrop.test`,
      filename: "original-report.bin",
      ttlHours: 48,
    });
    expect(drop.dropId).toMatch(/^drop_[0-9a-f]{32}$/);

    const metaRes = await fetch(`${BASE}/l/${drop.token}/meta`);
    expect(metaRes.status).toBe(200);
    const meta = (await metaRes.json()) as { filename: string; sizeBytes: number };
    expect(meta.filename).toBe("original-report.bin");
    expect(meta.sizeBytes).toBe(original.length);

    const fileRes = await fetch(`${BASE}/l/${drop.token}/file`);
    expect(fileRes.status).toBe(200);
    const downloaded = Buffer.from(await fileRes.arrayBuffer());
    expect(downloaded.equals(original)).toBe(true);
    expect(fileRes.headers.get("content-disposition")).toContain("attachment");
  });

  it("reply then edit with different real bytes via /l", async () => {
    const replyRes = await replyOnLink(drop.token, replyText);
    expect(replyRes.status).toBe(200);
    const replyBody = (await replyRes.json()) as { status: string };
    expect(replyBody.status).toBe("answered");

    const editRes = await fetch(`${BASE}/l/${drop.token}/edit`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream", "x-filename": "edited-report.bin" },
      body: edited,
    });
    expect(editRes.status).toBe(200);
  });

  it("result shows replyText + edit filename; edit download byte-identical", async () => {
    const resultRes = await fetch(`${BASE}/v1/drops/${drop.dropId}/result`, {
      headers: { authorization: `Bearer ${keyA}` },
    });
    expect(resultRes.status).toBe(200);
    const result = (await resultRes.json()) as {
      dropId: string;
      status: string;
      replyText?: string;
      edit?: { filename: string; sizeBytes: number };
    };
    expect(result.dropId).toBe(drop.dropId);
    expect(result.status).toBe("answered");
    expect(result.replyText).toBe(replyText);
    expect(result.edit).toEqual({ filename: "edited-report.bin", sizeBytes: edited.length });

    const editDl = await fetch(`${BASE}/v1/drops/${drop.dropId}/edit`, {
      headers: { authorization: `Bearer ${keyA}` },
    });
    expect(editDl.status).toBe(200);
    const editBytes = Buffer.from(await editDl.arrayBuffer());
    expect(editBytes.equals(edited)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// B — owner dashboard routes
// ---------------------------------------------------------------------------

describe("B: owner dashboard routes", () => {
  let dropId: string;
  let linkToken: string;
  const bytes = randomBytes(4096);

  it("GET /api/drops lists account drops", async () => {
    const uploaded = await uploadOk(keyA, bytes, {
      recipientEmail: `recipient-b-${RUN}@postdrop.test`,
      filename: "dashboard-drop.bin",
    });
    dropId = uploaded.dropId;
    linkToken = uploaded.token;

    const res = await fetch(`${BASE}/api/drops`, { headers: { cookie: session.cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { drops: Array<{ dropId: string }> };
    expect(body.drops.some((d) => d.dropId === dropId)).toBe(true);
  });

  it("DELETE /api/drops/:id purges: content null, purgedAt set, status expired", async () => {
    const res = await fetch(`${BASE}/api/drops/${dropId}`, {
      method: "DELETE",
      headers: { cookie: session.cookie },
    });
    expect(res.status).toBe(200);

    const agentRes = await fetch(`${BASE}/v1/drops/${dropId}`, {
      headers: { authorization: `Bearer ${keyA}` },
    });
    expect(agentRes.status).toBe(200);
    const agentBody = (await agentRes.json()) as { status: string };
    expect(agentBody.status).toBe("expired");

    // tombstone: purgedAt set, content fields (storageKey) null; filename persists
    const row = await dropRow(dropId);
    expect(row?.purgedAt).toBeInstanceOf(Date);
    expect(row?.storageKey).toBeNull();
    expect(row?.editFilename).toBeNull();

    const linkRes = await fetch(`${BASE}/l/${linkToken}/file`);
    expect(linkRes.status).toBe(410);
  });

  it("GET /api/usage storageBytes matches unpurged uploads", async () => {
    const res = await fetch(`${BASE}/api/usage`, { headers: { cookie: session.cookie } });
    expect(res.status).toBe(200);
    const usage = (await res.json()) as { tier: string; storageBytes: number; capBytes: number };
    expect(usage.tier).toBe("free");
    expect(usage.capBytes).toBe(FREE_CAP_BYTES);
    // Section A's original is the only unpurged drop (B's was purged above;
    // storageBytes sums original sizeBytes, edits don't add)
    expect(usage.storageBytes).toBe(A_ORIGINAL_LEN);
  });

  it("agent revoke → key 401 on next /v1 call", async () => {
    const key = await createAgent(session, `revoke-me-${RUN}`);
    const listRes = await fetch(`${BASE}/v1/drops`, {
      headers: { authorization: `Bearer ${key}` },
    });
    expect(listRes.status).toBe(200);

    const agentsRes = await fetch(`${BASE}/api/agents`, { headers: { cookie: session.cookie } });
    const agents = (await agentsRes.json()) as { agents: Array<{ agentId: string; name: string }> };
    const target = agents.agents.find((a) => a.name === `revoke-me-${RUN}`);
    expect(target).toBeTruthy();
    const delRes = await fetch(`${BASE}/api/agents/${target!.agentId}`, {
      method: "DELETE",
      headers: { cookie: session.cookie },
    });
    expect(delRes.status).toBe(200);

    const afterRes = await fetch(`${BASE}/v1/drops`, {
      headers: { authorization: `Bearer ${key}` },
    });
    expect(afterRes.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// C — clients e2e (CLI + MCP dists against the running server)
// ---------------------------------------------------------------------------

describe("C: clients e2e", () => {
  it("CLI drop uploads and prints link URL; check shows reply", async () => {
    const bytes = randomBytes(33_333);
    const tmpFile = await writeTempFile("cli-payload.bin", bytes);

    const dropped = await cli(["drop", tmpFile, "--to", `cli-recipient-${RUN}@postdrop.test`], keyA);
    expect(dropped.code).toBe(0);
    const linkMatch = dropped.stdout.match(new RegExp(`${BASE}/l/([0-9a-f]{64})`));
    expect(linkMatch).toBeTruthy();
    const token = linkMatch![1];

    const dl = await fetch(`${BASE}/l/${token}/file`);
    expect(dl.status).toBe(200);
    expect(Buffer.from(await dl.arrayBuffer()).equals(bytes)).toBe(true);

    const cliDropId = await findDropIdByFilename(keyA, "cli-payload.bin");
    expect(cliDropId).toBeTruthy();

    const replyRes = await replyOnLink(token, `cli reply ${RUN}`);
    expect(replyRes.status).toBe(200);
    const checked = await cli(["check", cliDropId!], keyA);
    expect(checked.code).toBe(0);
    expect(checked.stdout).toContain("status: answered");
    expect(checked.stdout).toContain(`cli reply ${RUN}`);
  }, 120_000);

  it("MCP postdrop_send + postdrop_check over stdio", async () => {
    const bytes = randomBytes(9_876);
    const tmpFile = await writeTempFile("mcp-payload.bin", bytes);

    const { client, transport } = await mcpSpawn(keyA);
    try {
      const sendRes = (await client.callTool({
        name: "postdrop_send",
        arguments: { file_path: tmpFile, recipient_email: `mcp-recipient-${RUN}@postdrop.test` },
      })) as { content?: Array<{ type: string; text?: string }>; isError?: boolean };
      expect(sendRes.isError).toBeFalsy();
      const sendText = sendRes.content?.[0]?.text ?? "";
      const dropIdMatch = sendText.match(/drop_[0-9a-f]{32}/);
      const tokenMatch = sendText.match(new RegExp(`${BASE}/l/([0-9a-f]{64})`));
      expect(dropIdMatch).toBeTruthy();
      expect(tokenMatch).toBeTruthy();

      const dl = await fetch(`${BASE}/l/${tokenMatch![1]}/file`);
      expect(dl.status).toBe(200);
      expect(Buffer.from(await dl.arrayBuffer()).equals(bytes)).toBe(true);

      const replyRes = await replyOnLink(tokenMatch![1], `mcp reply ${RUN}`);
      expect(replyRes.status).toBe(200);
      const checkRes = (await client.callTool({
        name: "postdrop_check",
        arguments: { drop_id: dropIdMatch![0] },
      })) as { content?: Array<{ type: string; text?: string }>; isError?: boolean };
      expect(checkRes.isError).toBeFalsy();
      const checkText = checkRes.content?.[0]?.text ?? "";
      expect(checkText).toContain("answered");
      expect(checkText).toContain(`mcp reply ${RUN}`);
    } finally {
      await client.close();
      await transport.close();
    }
  }, 120_000);
});

// ---------------------------------------------------------------------------
// D — negative: scoping, unknown links, expiry/revoke purge
// ---------------------------------------------------------------------------

describe("D: negative cases", () => {
  let dropId: string;
  let token: string;

  beforeAll(async () => {
    const drop = await uploadOk(keyA, randomBytes(2048), {
      recipientEmail: `neg-recipient-${RUN}@postdrop.test`,
      filename: "neg-case.bin",
    });
    dropId = drop.dropId;
    token = drop.token;
  });

  it("agent B gets 404 for agent A's drop (never 403)", async () => {
    for (const p of [`/v1/drops/${dropId}`, `/v1/drops/${dropId}/result`, `/v1/drops/${dropId}/edit`]) {
      const res = await fetch(`${BASE}${p}`, { headers: { authorization: `Bearer ${keyB}` } });
      expect(res.status).toBe(404);
    }
  });

  it("unknown link token → 404", async () => {
    const unknown = randomBytes(32).toString("hex");
    expect((await fetch(`${BASE}/l/${unknown}/meta`)).status).toBe(404);
    expect((await fetch(`${BASE}/l/${unknown}/file`)).status).toBe(404);
  });

  it("revoke expires + purges; link 410; content purged; result reflects it", async () => {
    const res = await revoke(keyA, dropId);
    expect(res.status).toBe(200);
    const revBody = (await res.json()) as { status: string };
    expect(revBody.status).toBe("expired");

    const summaryRes = await fetch(`${BASE}/v1/drops/${dropId}`, {
      headers: { authorization: `Bearer ${keyA}` },
    });
    expect(summaryRes.status).toBe(200);
    const summary = (await summaryRes.json()) as { status: string };
    expect(summary.status).toBe("expired");

    expect((await fetch(`${BASE}/l/${token}/file`)).status).toBe(410);
    expect((await fetch(`${BASE}/l/${token}/meta`)).status).toBe(410);

    const resultRes = await fetch(`${BASE}/v1/drops/${dropId}/result`, {
      headers: { authorization: `Bearer ${keyA}` },
    });
    expect(resultRes.status).toBe(200);
    const result = (await resultRes.json()) as { status: string; replyText?: string; edit?: unknown };
    expect(result.status).toBe("expired");
    expect(result.replyText).toBeUndefined();
    expect(result.edit).toBeUndefined();

    const row = await dropRow(dropId);
    expect(row?.purgedAt).toBeInstanceOf(Date);
    expect(row?.storageKey).toBeNull();
  });

  it("directly-expired row (inserted via Mongo) → 410 + purge-on-access removes storage", async () => {
    const expiredToken = randomBytes(32).toString("hex");
    const expiredDropId = `drop_${randomBytes(16).toString("hex")}`;

    if (!mongoose.connection.readyState) await mongoose.connect(info.mongoUri);
    let storageDirPath: string;
    try {
      const db = mongoose.connection.db!;
      const account = await db.collection("accounts").findOne({});
      const agent = await db.collection("agents").findOne({ name: `acceptance-a-${RUN}` });
      expect(account && agent).toBeTruthy();
      await db.collection("drops").insertOne({
        dropId: expiredDropId,
        accountId: account!._id,
        agentId: agent!.agentId,
        recipientEmail: `expired-${RUN}@postdrop.test`,
        filename: "already-expired.bin",
        sizeBytes: 512,
        mimeType: "application/octet-stream",
        storageKey: `drops/${expiredDropId}/original-already-expired.bin`,
        status: "pending",
        linkTokenHash: createHash("sha256").update(expiredToken).digest("hex"),
        expiresAt: new Date(Date.now() - 3_600_000),
        createdAt: new Date(Date.now() - 7_200_000),
      });
      // materialize the storage object so purge-on-access must delete it
      const dirents = await import("node:fs/promises").then((f) =>
        f.readdir(tmpdir(), { withFileTypes: true }),
      );
      const storageDir = dirents.find(
        (d) => d.isDirectory() && d.name.startsWith("postdrop-storage-"),
      );
      expect(storageDir).toBeTruthy();
      storageDirPath = path.join(tmpdir(), storageDir!.name);
      const keyPath = path.join(storageDirPath, "drops", expiredDropId);
      await mkdir(keyPath, { recursive: true });
      await writeFile(path.join(keyPath, "original-already-expired.bin"), Buffer.alloc(512));
    } finally {
      // keep the shared mongoose connection open for further reads
    }

    const fileRes = await fetch(`${BASE}/l/${expiredToken}/file`);
    expect(fileRes.status).toBe(410);

    const row = await dropRow(expiredDropId);
    expect(row?.purgedAt).toBeInstanceOf(Date);
    expect(row?.storageKey).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// F — quota
// ---------------------------------------------------------------------------

describe("F: quota", () => {
  it("near-cap upload then 1-byte upload → 403 QUOTA_EXCEEDED; >1GB content-length → 413", async () => {
    // fill the account exactly to the free cap (any prior unpurged byte counts)
    const usageBefore = await fetch(`${BASE}/api/usage`, { headers: { cookie: session.cookie } });
    const usageBody = (await usageBefore.json()) as { storageBytes: number };
    const fillBytes = FREE_CAP_BYTES - usageBody.storageBytes;
    const big = Buffer.alloc(fillBytes, 0x61);
    const bigRes = await upload(keyA, big, {
      recipientEmail: `quota-recipient-${RUN}@postdrop.test`,
      filename: "cap-filler.bin",
    });
    expect(bigRes.status).toBe(201);
    const bigBody = (await bigRes.json()) as { dropId: string };

    const oneByte = await upload(keyA, Buffer.alloc(1, 0x62), {
      recipientEmail: `quota-recipient-${RUN}@postdrop.test`,
      filename: "one-byte.bin",
    });
    expect(oneByte.status).toBe(403);
    const errBody = (await oneByte.json()) as { error: { code: string } };
    expect(errBody.error.code).toBe("QUOTA_EXCEEDED");

    // per-file limit is enforced from the declared content-length; only a tiny
    // body is sent so the test stays fast
    const raw = await rawUploadWithDeclaredLength(keyA, 1_073_741_825, 1024);
    expect(raw.status).toBe(413);

    // free the cap (purged drops no longer count toward storage)
    const rev = await revoke(keyA, bigBody.dropId);
    expect(rev.status).toBe(200);
    const usageAfter = await fetch(`${BASE}/api/usage`, { headers: { cookie: session.cookie } });
    const usageAfterBody = (await usageAfter.json()) as { storageBytes: number };
    expect(usageAfterBody.storageBytes).toBeLessThan(FREE_CAP_BYTES);
  }, 120_000);
});

// ---------------------------------------------------------------------------
// Login failure
// ---------------------------------------------------------------------------

describe("auth", () => {
  it("wrong password → 401", async () => {
    const { res } = await login(info.ownerEmail, `wrong-${RUN}`);
    expect(res.status).toBe(401);
  });

  it("unknown email → 401", async () => {
    const { res } = await login(`nobody-${RUN}@postdrop.test`, "irrelevant");
    expect(res.status).toBe(401);
  });
});
