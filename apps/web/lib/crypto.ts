import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const SCRYPT_KEYLEN = 64;

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
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

/** Cryptographically random URL-safe token (returned raw; hash before storing). */
export function randomToken(): string {
  return randomBytes(16).toString("hex");
}
