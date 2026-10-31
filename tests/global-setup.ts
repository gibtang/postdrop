import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoMemoryServer } from "mongodb-memory-server";

// `mongodb` is not a direct root dependency; resolve it from whichever package
// pulls it in (mongodb-memory-server, or the app once the lockfile gains it).
const require = createRequire(import.meta.url);
function resolveMongoDb(): string {
  try {
    return require.resolve("mongodb");
  } catch {
    const mmsDir = path.dirname(require.resolve("mongodb-memory-server"));
    return require.resolve("mongodb", { paths: [mmsDir] });
  }
}
export const MONGODB_MODULE_PATH = resolveMongoDb();

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3111;
export const BASE_URL = `http://localhost:${PORT}`;

const RUN_ID = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Small, deterministic limits so size/quota tests need no direct DB surgery.
// Every fixture in the suite is far below these values except where a test
// deliberately crosses them.
export const MAX_ARTIFACT_BYTES = 4096;
export const QUOTA_BYTES = 4096;

export interface ServerInfo {
  baseUrl: string;
  mongoUri: string;
  runId: string;
  storagePath: string;
  maxArtifactBytes: number;
  quotaBytes: number;
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
      const res = await fetch(`${url}/v1/me`);
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
    AUTH_SECRET: `auth-secret-${RUN_ID}`,
    GOOGLE_CLIENT_ID: `dummy-client-id-${RUN_ID}.apps.googleusercontent.com`,
    GOOGLE_CLIENT_SECRET: `dummy-client-secret-${RUN_ID}`,
    STORAGE_DRIVER: "disk",
    DISK_STORAGE_PATH: storagePath,
    MAX_ARTIFACT_BYTES: String(MAX_ARTIFACT_BYTES),
    QUOTA_BYTES: String(QUOTA_BYTES),
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
    storagePath,
    maxArtifactBytes: MAX_ARTIFACT_BYTES,
    quotaBytes: QUOTA_BYTES,
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
