import type { NextRequest } from "next/server";
import { sha256Hex } from "../crypto";
import { Agent, type AgentDoc } from "../models";

/**
 * Bearer pd_live_<64hex> -> sha256 lookup -> live (non-revoked) Agent.
 * Returns null on missing/malformed/revoked keys; callers respond 401.
 */
export async function requireAgent(req: NextRequest): Promise<AgentDoc | null> {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(pd_live_[0-9a-f]{64})$/i.exec(header.trim());
  if (!match) return null;
  const agent = await Agent.findOne({ keyHash: sha256Hex(match[1]), revokedAt: null });
  return agent;
}
