import { cookies } from "next/headers";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { SESSION_COOKIE_NAME, SESSION_TTL, signSession, verifySession } from "./crypto";

export { SESSION_COOKIE_NAME as SESSION_COOKIE, SESSION_TTL };
import { Account, type AccountDoc } from "./models";

const SCRYPT_KEYLEN = 64;

/**
 * AUTH_MODE seam: only `password` is implemented. `firebase` is a reserved
 * module seam and fails fast with a clear error.
 */
function requirePasswordMode(): void {
  if (process.env.AUTH_MODE === "firebase") {
    throw new Error("AUTH_MODE=firebase is not implemented in this version");
  }
}

function scryptKey(password: string, salt: Buffer): Promise<Buffer> {
  return promisify(scryptCb)(password, salt, SCRYPT_KEYLEN) as unknown as Promise<Buffer>;
}

/** stored format: scrypt$<salthex>$<hashhex> */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptKey(password, salt);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const derived = await scryptKey(password, Buffer.from(saltHex, "hex"));
  const expected = Buffer.from(hashHex, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** Seeds the first Account from OWNER_EMAIL/OWNER_PASSWORD when none exist. */
async function ensureOwnerSeeded(): Promise<void> {
  const count = await Account.countDocuments();
  if (count > 0) return;
  const email = process.env.OWNER_EMAIL;
  const password = process.env.OWNER_PASSWORD;
  if (!email || !password) {
    throw new Error("No accounts exist and OWNER_EMAIL/OWNER_PASSWORD are not configured");
  }
  await Account.create({
    email: email.toLowerCase(),
    passwordHash: await hashPassword(password),
    tier: "free",
  });
}

export async function loginWithPassword(
  email: string,
  password: string,
): Promise<{ account: AccountDoc; token: string } | null> {
  requirePasswordMode();
  await ensureOwnerSeeded();
  const account = await Account.findOne({ email: email.toLowerCase(), passwordHash: { $ne: null } });
  if (!account || !account.passwordHash) return null;
  if (!(await verifyPassword(password, account.passwordHash))) return null;
  const token = signSession({
    accountId: account.accountId,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL,
  });
  return { account, token };
}

/** Reads the signed pd_session cookie and resolves the owning Account. */
export async function requireOwner(): Promise<AccountDoc | null> {
  requirePasswordMode();
  const jar = await cookies();
  const payload = verifySession(jar.get(SESSION_COOKIE_NAME)?.value);
  if (!payload) return null;
  return Account.findOne({ accountId: payload.accountId });
}
