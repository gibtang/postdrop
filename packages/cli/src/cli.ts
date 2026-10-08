#!/usr/bin/env node
import { program } from "commander";
import {
  PostdropClient,
  PostdropError,
  type DropResult,
} from "@postdrop/sdk";

const BASE_URL = process.env.POSTDROP_BASE_URL ?? "https://thepostdrop.dev";

function apiKey(): string {
  const key = process.env.POSTDROP_API_KEY;
  if (!key) {
    process.stderr.write(
      "error: POSTDROP_API_KEY is not set. Export it or pass it inline, e.g.\n" +
        "  POSTDROP_API_KEY=pd_live_... postdrop drop ./file.pdf --to user@example.com\n",
    );
    process.exit(1);
  }
  return key;
}

function client(): PostdropClient {
  return new PostdropClient({ baseUrl: BASE_URL, apiKey: apiKey() });
}

function fail(err: unknown): never {
  if (err instanceof PostdropError) {
    process.stderr.write(`error: ${err.code}: ${err.message}\n`);
    if (err.status === 401) process.exit(1);
    if (err.status === 403 || err.status === 413) process.exit(2);
    process.exit(3);
  }
  process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(3);
}

program
  .name("postdrop")
  .description("One-line file handoff CLI for agents")
  .version("0.1.0");

program
  .command("drop")
  .argument("<file>", "path of the file to send")
  .requiredOption("--to <email>", "recipient email address")
  .option("--ttl <hours>", "time-to-live in hours (1-720)", "168")
  .action(async (file: string, opts: { to: string; ttl: string }) => {
    const ttl = Number(opts.ttl);
    if (!Number.isInteger(ttl) || ttl < 1 || ttl > 720) {
      fail(new Error("Invalid --ttl: must be an integer between 1 and 720"));
    }
    const res = await client().send(file, {
      recipientEmail: opts.to,
      ttlHours: ttl,
    });
    process.stdout.write(`${res.linkUrl}\nexpiresAt: ${res.expiresAt}\n`);
  });

function printResult(result: DropResult): void {
  process.stdout.write(`status: ${result.status}\n`);
  if (result.replyText !== undefined) {
    process.stdout.write(`reply: ${result.replyText}\n`);
  }
  if (result.edit) {
    process.stdout.write(`edit: ${result.edit.filename} (${result.edit.sizeBytes} bytes)\n`);
  }
}

program
  .command("check")
  .argument("<dropId>", "drop identifier")
  .action(async (dropId: string) => {
    printResult(await client().result(dropId));
  });

program
  .command("edit-download")
  .argument("<dropId>", "drop identifier")
  .argument("[dest]", "destination path for the edited file")
  .action(async (dropId: string, dest?: string) => {
    const saved = await client().downloadEdit(dropId, dest);
    process.stdout.write(`${saved}\n`);
  });

program.parseAsync().catch(fail);
