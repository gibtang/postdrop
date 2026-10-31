// Browser WebCrypto helpers for zero-knowledge secret links.
// Client-only: uses atob/btoa + crypto.subtle; never imports server code.

export function randomIv(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(12));
}

export function toB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function fromB64(value: string): Uint8Array {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** URL-safe base64 for the key fragment: no padding, - and _ instead of + and /. */
export function toB64Url(bytes: Uint8Array): string {
  return toB64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64Url(value: string): Uint8Array {
  return fromB64(value.replace(/-/g, "+").replace(/_/g, "/"));
}

async function importKey(keyB64Url: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", fromB64Url(keyB64Url) as BufferSource, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function newKeyB64Url(): Promise<string> {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
  return toB64Url(new Uint8Array(await crypto.subtle.exportKey("raw", key)));
}

export async function encryptBytes(
  keyB64Url: string,
  iv: Uint8Array,
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  const key = await importKey(keyB64Url);
  return new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, plaintext as BufferSource),
  );
}

export async function decryptBytes(
  keyB64Url: string,
  ivB64: string,
  ciphertextB64: string,
): Promise<Uint8Array> {
  const key = await importKey(keyB64Url);
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(ivB64) as BufferSource },
      key,
      fromB64(ciphertextB64) as BufferSource,
    ),
  );
}
