/**
 * Renderable formats: file types Postdrop accepts because browsers display
 * them inline. Everything else is rejected at upload.
 */
export const RENDERABLE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  txt: "text/plain",
  md: "text/markdown",
  html: "text/html",
  json: "application/json",
  csv: "text/csv",
  xml: "application/xml",
};

/** Best-effort mime type from a filename's final extension; null when unknown. */
export function mimeForFilename(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return null;
  return RENDERABLE_TYPES[name.slice(dot + 1).toLowerCase()] ?? null;
}

/** Canonical extension for a renderable mime type; null when not renderable. */
export function extensionForMime(mime: string): string | null {
  for (const [ext, mapped] of Object.entries(RENDERABLE_TYPES)) {
    if (mapped === mime) return ext;
  }
  return null;
}

function startsWith(head: Uint8Array, bytes: number[], offset = 0): boolean {
  if (head.length < offset + bytes.length) return false;
  return bytes.every((b, i) => head[offset + i] === b);
}

function ftypBrand(head: Uint8Array): string | null {
  if (!startsWith(head, [0x66, 0x74, 0x79, 0x70], 4)) return null; // "ftyp" at offset 4
  const brand = Buffer.from(head.slice(8, 12)).toString("latin1");
  return /^[a-z0-9]{4}$/i.test(brand) ? brand : "";
}

/**
 * Does the file head match the declared content type? Binary renderable
 * formats have magic bytes; mismatches mean the extension (or Content-Type)
 * lied — e.g. HTML smuggled as .png. Returns null when the declared type has
 * no reliable signature (text formats) — extension remains the only signal.
 */
export function contentMatchesFormat(head: Uint8Array, contentType: string): boolean | null {
  const b = (hex: string) => [...hex.matchAll(/../g)].map((h) => parseInt(h[0], 16));
  switch (contentType) {
    case "image/png":
      return startsWith(head, b("89504e470d0a1a0a"));
    case "image/jpeg":
      return startsWith(head, b("ffd8ff"));
    case "image/gif":
      return startsWith(head, b("47494638"));
    case "image/webp":
      return startsWith(head, b("52494646")) && Buffer.from(head.slice(8, 12)).toString("latin1") === "WEBP";
    case "image/avif": {
      const brand = ftypBrand(head);
      return brand === null ? false : brand === "avif" || brand === "avis";
    }
    case "video/mp4": {
      const brand = ftypBrand(head);
      return brand === null ? false : brand !== "avif" && brand !== "avis";
    }
    case "video/webm":
      return startsWith(head, b("1a45dfa3"));
    case "application/pdf":
      return startsWith(head, b("25504446"));
    case "audio/mpeg":
      return startsWith(head, b("494433")) || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0);
    case "audio/wav":
      return startsWith(head, b("52494646")) && Buffer.from(head.slice(8, 12)).toString("latin1") === "WAVE";
    case "audio/ogg":
      return startsWith(head, b("4f676753"));
    default:
      // text/plain, text/markdown, text/html, application/json, text/csv,
      // application/xml, image/svg+xml — no signature; extension-only.
      return null;
  }
}

export function isRenderable(mime: string): boolean {
  return Object.values(RENDERABLE_TYPES).includes(mime);
}

/**
 * Active formats execute in the browser (HTML, SVG); they are served inside
 * the Viewer sandboxed away from Postdrop's origin.
 */
export const ACTIVE_TYPES: string[] = ["text/html", "image/svg+xml"];

/** Content-Security-Policy header value used when serving active types. */
export const SANDBOX_CSP = "sandbox";

/** Per-artifact upload cap (bytes), overridable via MAX_ARTIFACT_BYTES. */
export function maxArtifactBytes(): number {
  const raw = Number.parseInt(process.env.MAX_ARTIFACT_BYTES ?? "", 10);
  return Number.isInteger(raw) && raw > 0 ? raw : 5 * 1024 * 1024;
}

/** Per-user total storage quota (bytes), overridable via QUOTA_BYTES. */
export function quotaBytes(): number {
  const raw = Number.parseInt(process.env.QUOTA_BYTES ?? "", 10);
  return Number.isInteger(raw) && raw > 0 ? raw : 500 * 1024 * 1024;
}
