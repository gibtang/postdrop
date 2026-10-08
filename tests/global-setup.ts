import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoMemoryServer } from "mongodb-memory-server";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3111;
export const BASE_URL = `http://localhost:${PORT}`;

const RUN_ID = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const OWNER_EMAIL = `owner-${RUN_ID}@postdrop.test`;
const OWNER_PASSWORD = `pw-${RUN_ID}-secret`;

export interface ServerInfo {
  baseUrl: string;
  mongoUri: string;
  runId: string;
  ownerEmail: string;
  ownerPassword: string;
}

/** Teardown function vitest accepts from globalSetup. */
export type Teardown = () => Promise<void>;

async function waitForServer(url: string, proc: ChildProcess): Promise<void> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      throw new Error(`next start exited with code ${proc.exitCode}`);
    }
    try {
      const res = await fetch(`${url}/api/auth/me`);
      if (res.status === 401 || res.status === 200) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server at ${url} did not become ready`);
}

export default async function setup(): Promise<Teardown> {
  const mongod = await MongoMemoryServer.create();
  const mongoUri = mongod.getUri("postdrop");
  const storagePath = await mkdtemp(path.join(tmpdir(), "postdrop-storage-"));

  const serverEnv: NodeJS.ProcessEnv = {
    ...process.env,
    MONGODB_URI: mongoUri,
    BASE_URL,
    AUTH_MODE: "password",
    OWNER_EMAIL,
    OWNER_PASSWORD,
    SESSION_SECRET: `test-secret-${RUN_ID}`,
    STORAGE_DRIVER: "disk",
    DISK_STORAGE_PATH: storagePath,
    SWEEPER_DISABLED: "1",
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_ENV: "production",
  };

  const proc = spawn(
    "node",
    [path.join("node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PORT)],
    { cwd: path.join(repoRoot, "apps/web"), env: serverEnv, stdio: ["ignore", "pipe", "pipe"] },
  );
  const logs: string[] = [];
  proc.stdout.on("data", (d: Buffer) => logs.push(d.toString()));
  proc.stderr.on("data", (d: Buffer) => logs.push(d.toString()));

  try {
    await waitForServer(BASE_URL, proc);
  } catch (err) {
    console.error("server logs:", logs.join(""));
    proc.kill("SIGKILL");
    await mongod.stop();
    throw err;
  }

  const info: ServerInfo = {
    baseUrl: BASE_URL,
    mongoUri,
    runId: RUN_ID,
    ownerEmail: OWNER_EMAIL,
    ownerPassword: OWNER_PASSWORD,
  };
  // Share with test workers (fork pool does not inherit env mutations).
  await writeFile(path.join(__dirname, ".server-info.json"), JSON.stringify(info));
  process.env.TEST_SERVER_INFO = path.join(__dirname, ".server-info.json");

  const teardown: Teardown = async (): Promise<void> => {
    proc.kill("SIGTERM");
    // Node 20 lacks Promise.withResolvers
    let exitedResolve!: () => void;
    const exited = new Promise<void>((resolve) => {
      exitedResolve = resolve;
    });
    proc.once("exit", () => exitedResolve());
    await Promise.race([
      exited,
      new Promise<void>((resolve) => setTimeout(resolve, 10_000)).then(() => {
        proc.kill("SIGKILL");
      }),
    ]);
    await mongod.stop();
  };
  return teardown;
}
