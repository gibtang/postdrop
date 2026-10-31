#!/usr/bin/env node
import { basename } from "node:path";
import { readFile } from "node:fs/promises";
import { program, type Command } from "commander";
import {
  PostdropClient,
  PostdropError,
  ensureRenderableName,
  saveRaw,
  type Artifact,
  type ShareLink,
} from "@postdrop/sdk";

const BASE_URL = process.env.POSTDROP_BASE_URL ?? "https://thepostdrop.dev";

function token(opts: { token?: string }): string {
  const value = opts.token ?? process.env.POSTDROP_TOKEN;
  if (!value) {
    process.stderr.write(
      "error: POSTDROP_TOKEN is not set. Export it or pass --token, e.g.\n" +
        "  POSTDROP_TOKEN=pd_live_... postdrop upload ./report.pdf\n",
    );
    process.exit(1);
  }
  return value;
}

function baseUrl(opts: { baseUrl?: string }): string {
  return opts.baseUrl ?? BASE_URL;
}

function client(opts: { token?: string; baseUrl?: string }): PostdropClient {
  return new PostdropClient({ baseUrl: baseUrl(opts), token: token(opts) });
}

function fail(err: unknown): never {
  if (err instanceof PostdropError) {
    process.stderr.write(`\u001B[31m\u2718\u001B[0m error: ${err.code}: ${err.message}\n`);
    if (err.status === 401) process.exit(1);
    if (err.status === 413) process.exit(2);
    process.exit(3);
  }
  process.stderr.write(
    `\u001B[31m\u2718\u001B[0m error: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(3);
}

function ok(): string {
  return "\u001B[32m\u2713\u001B[0m";
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function printArtifact(artifact: Artifact): void {
  process.stdout.write(
    `${ok()} ${artifact.artifactId}  ${artifact.filename}  ${formatBytes(artifact.size)}\n`,
  );
}

function linkState(link: ShareLink): "active" | "expired" | "revoked" {
  if (link.revokedAt !== null) return "revoked";
  if (link.expiredAt !== null) return "expired";
  return "active";
}

function linkIdFrom(value: string): string {
  const match = /\/a\/([A-Za-z0-9_-]+)$/.exec(value);
  return match ? match[1]! : value;
}

function withGlobalOptions(command: Command) {
  return command
    .option("--token <token>", "API token (defaults to POSTDROP_TOKEN)")
    .option("--base-url <url>", "API base URL (defaults to POSTDROP_BASE_URL)");
}

program
  .name("postdrop")
  .description("Share web-renderable artifacts with anyone, from the terminal.")
  .version("0.1.0");

withGlobalOptions(program.command("whoami")).action(
  async (opts: { token?: string; baseUrl?: string }) => {
    const me = await client(opts).me();
    process.stdout.write(`${me.name} <${me.email}> (${me.userId})\n`);
  },
);

withGlobalOptions(program.command("upload"))
  .argument("<file>", "path of the artifact to upload")
  .option("--name <name>", "display name for the artifact")
  .option("--expires <iso>", "share-link expiry (ISO 8601)")
  .action(
    async (
      file: string,
      opts: { name?: string; expires?: string; token?: string; baseUrl?: string },
    ) => {
      const c = client(opts);
      const bytes = await readFile(file);
      const started = Date.now();
      const source = basename(file);
      const artifact = await c.upload(bytes, {
        name: opts.name === undefined ? undefined : ensureRenderableName(opts.name, source),
        filename: source,
      });
      process.stdout.write(`${ok()} uploaded ${artifact.filename} (${formatBytes(artifact.size)})\n`);
      if (opts.expires !== undefined) {
        const link = await c.share(artifact.artifactId, {
          expiresAt: opts.expires,
        });
        process.stdout.write(`${link.url}\n`);
        process.stdout.write(`\u23F1\uFE0F starts: ${link.createdAt}\n`);
        process.stdout.write(
          `expires: ${link.expiresAt ?? "never"} (duration ${Date.now() - started}ms)\n`,
        );
      } else {
        process.stdout.write(`\u23F1\uFE0F duration ${Date.now() - started}ms\n`);
      }
    },
  );

withGlobalOptions(program.command("get"))
  .argument("<artifactId>", "artifact identifier")
  .action(async (artifactId: string, opts: { token?: string; baseUrl?: string }) => {
    const { artifact, shareLinks } = await client(opts).get(artifactId);
    printArtifact(artifact);
    process.stdout.write(`created: ${artifact.createdAt}\n`);
    process.stdout.write(`updated: ${artifact.updatedAt}\n`);
    for (const link of shareLinks) {
      process.stdout.write(`share: ${link.url} (${linkState(link)})\n`);
    }
  });

withGlobalOptions(program.command("save"))
  .argument("<artifactId>", "artifact identifier")
  .argument("[dest]", "destination path (defaults to ./filename)")
  .action(
    async (
      artifactId: string,
      dest: string | undefined,
      opts: { token?: string; baseUrl?: string },
    ) => {
      const c = client(opts);
      const target = dest ?? basename((await c.get(artifactId)).artifact.filename);
      await saveRaw(await c.raw(artifactId), target);
      process.stdout.write(`${ok()} saved ${target}\n`);
    },
  );

withGlobalOptions(program.command("list"))
  .option("--limit <n>", "page size", "50")
  .option("--cursor <cursor>", "pagination cursor")
  .action(
    async (opts: {
      limit: string;
      cursor?: string;
      token?: string;
      baseUrl?: string;
    }) => {
      const limit = Number(opts.limit);
      if (!Number.isInteger(limit) || limit < 1) {
        fail(new Error("Invalid --limit: must be a positive integer"));
      }
      const { items, nextCursor } = await client(opts).list({
        limit,
        cursor: opts.cursor,
      });
      const width = Math.max(
        ...items.map((a) => a.artifactId.length),
        "artifactId".length,
      );
      process.stdout.write(
        `${"artifactId".padEnd(width)}  filename  size  updated\n`,
      );
      for (const a of items) {
        process.stdout.write(
          `${a.artifactId.padEnd(width)}  ${a.filename}  ${formatBytes(a.size)}  ${a.updatedAt}\n`,
        );
      }
      if (nextCursor !== null) {
        process.stdout.write(`next cursor: ${nextCursor}\n`);
      }
    },
  );

withGlobalOptions(program.command("rm"))
  .argument("<artifactId>", "artifact identifier")
  .option("--yes", "skip confirmation")
  .action(
    async (
      artifactId: string,
      opts: { yes?: boolean; token?: string; baseUrl?: string },
    ) => {
      if (!opts.yes) {
        const answer = await confirm(`Delete ${artifactId}? Its share links die too. [y/N] `);
        if (!answer) {
          process.stdout.write("aborted\n");
          return;
        }
      }
      await client(opts).remove(artifactId);
      process.stdout.write(`${ok()} deleted ${artifactId}\n`);
    },
  );

withGlobalOptions(program.command("share"))
  .argument("<artifactId>", "artifact identifier")
  .option("--expires <iso>", "expiry (ISO 8601)")
  .action(
    async (
      artifactId: string,
      opts: { expires?: string; token?: string; baseUrl?: string },
    ) => {
      const link = await client(opts).share(artifactId, {
        expiresAt: opts.expires,
      });
      process.stdout.write(`${ok()} ${link.url}\n`);
      if (link.expiresAt !== null) process.stdout.write(`expires: ${link.expiresAt}\n`);
    },
  );

withGlobalOptions(program.command("shares")).action(
  async (opts: { token?: string; baseUrl?: string }) => {
    const { items } = await client(opts).listShares();
    for (const link of items) {
      process.stdout.write(
        `${link.url}  ${linkIdFrom(link.url)}  expiry: ${link.expiresAt ?? "never"}  ${linkState(link)}\n`,
      );
    }
  },
);

withGlobalOptions(program.command("unshare"))
  .argument("<linkIdOrUrl>", "share link id or full URL")
  .action(
    async (linkIdOrUrl: string, opts: { token?: string; baseUrl?: string }) => {
      const linkId = linkIdFrom(linkIdOrUrl);
      await client(opts).unshare(linkId);
      process.stdout.write(`${ok()} revoked ${linkId}\n`);
    },
  );

function confirm(prompt: string): Promise<boolean> {
  process.stdout.write(prompt);
  return new Promise<boolean>((resolve) => {
    process.stdin.setEncoding("utf8");
    process.stdin.once("data", (chunk: string) => {
      const answer = chunk.trim().toLowerCase();
      resolve(answer === "y" || answer === "yes");
    });
  });
}

program.parseAsync().catch(fail);
