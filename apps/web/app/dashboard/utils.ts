export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = "B";
  for (const next of units) {
    if (value < 1024) break;
    value /= 1024;
    unit = next;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${unit}`;
}

export function relativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const abs = Math.abs(diff);
  const future = diff < 0;
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (abs < minute) return "just now";
  if (abs < hour) return rtf.format(Math.round(-diff / minute) * (future ? -1 : 1), "minute");
  if (abs < day) return rtf.format(Math.round(-diff / hour) * (future ? -1 : 1), "hour");
  if (abs < 30 * day) return rtf.format(Math.round(-diff / day) * (future ? -1 : 1), "day");
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/** Short human type label for a mime type, e.g. "image/png" → "PNG". */
export function typeLabel(contentType: string): string {
  const labels: Record<string, string> = {
    "image/svg+xml": "SVG",
    "application/pdf": "PDF",
    "text/markdown": "MD",
    "text/plain": "TXT",
    "text/html": "HTML",
    "application/json": "JSON",
    "text/csv": "CSV",
    "application/xml": "XML",
    "video/webm": "WebM",
    "audio/mpeg": "MP3",
    "audio/wav": "WAV",
    "audio/ogg": "OGG",
  };
  if (labels[contentType]) return labels[contentType];
  const slash = contentType.indexOf("/");
  if (slash < 0) return contentType.toUpperCase();
  const sub = contentType.slice(slash + 1);
  if (sub === "jpeg") return "JPEG";
  return sub.toUpperCase();
}
