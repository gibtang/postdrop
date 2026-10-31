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
