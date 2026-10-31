import { Token, type TokenDoc } from "./models";
import { sha256Hex } from "./crypto";

const TOKEN_PATTERN = /^Bearer (pd_live_[0-9a-f]{64})$/;

/**
 * Resolve the bearer key to a live token row, or null for missing/invalid/
 * revoked keys. Touches lastUsedAt fire-and-forget on success.
 */
export async function requireToken(req: Request): Promise<TokenDoc | null> {
  const header = req.headers.get("authorization") ?? "";
  const match = TOKEN_PATTERN.exec(header);
  if (!match) return null;
  const token = await Token.findOne({ keyHash: sha256Hex(match[1]), revokedAt: null });
  if (!token) return null;
  void Token.updateOne({ _id: token._id }, { $set: { lastUsedAt: new Date() } }).catch(
    (err: unknown) => {
      console.error(
        "token-auth: failed to touch lastUsedAt:",
        err instanceof Error ? err.message : err,
      );
    },
  );
  return token;
}
