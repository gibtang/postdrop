#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PostdropClient, PostdropError } from "@postdrop/sdk";

const BASE_URL = process.env.POSTDROP_BASE_URL ?? "https://thepostdrop.dev";

function makeClient(): PostdropClient {
  const apiKey = process.env.POSTDROP_API_KEY;
  if (!apiKey) {
    throw new Error(
      "POSTDROP_API_KEY environment variable is required (pd_live_...)",
    );
  }
  return new PostdropClient({ baseUrl: BASE_URL, apiKey });
}

function asErrorPayload(err: unknown): {
  content: [{ type: "text"; text: string }];
  isError: true;
} {
  if (err instanceof PostdropError) {
    return {
      content: [
        {
          type: "text",
          text: `Postdrop error ${err.status} ${err.code}: ${err.message}`,
        },
      ],
      isError: true,
    };
  }
  return {
    content: [
      {
        type: "text",
        text: `error: ${err instanceof Error ? err.message : String(err)}`,
      },
    ],
    isError: true,
  };
}

const server = new McpServer({
  name: "postdrop",
  version: "0.1.0",
});

server.tool(
  "postdrop_send",
  "Send a file to a human recipient and get an expiring download link",
  {
    file_path: z
      .string()
      .describe("Absolute or relative path of the file to send"),
    recipient_email: z.string().email().describe("Recipient email address"),
    ttl_hours: z
      .number()
      .int()
      .min(1)
      .max(720)
      .optional()
      .describe("Hours until the link expires (default 168)"),
  },
  async ({ file_path, recipient_email, ttl_hours }) => {
    try {
      const res = await makeClient().send(file_path, {
        recipientEmail: recipient_email,
        ttlHours: ttl_hours,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                dropId: res.dropId,
                linkUrl: res.linkUrl,
                expiresAt: res.expiresAt,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (err) {
      return asErrorPayload(err);
    }
  },
);

server.tool(
  "postdrop_check",
  "Check the status of a drop: whether it was answered, and any reply or edited file",
  {
    drop_id: z.string().describe("Drop identifier returned by postdrop_send"),
  },
  async ({ drop_id }) => {
    try {
      const res = await makeClient().result(drop_id);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: res.status,
                replyText: res.replyText,
                editFilename: res.edit?.filename,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (err) {
      return asErrorPayload(err);
    }
  },
);

await server.connect(new StdioServerTransport());
