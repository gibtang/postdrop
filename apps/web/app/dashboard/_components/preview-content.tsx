"use client";

import * as React from "react";

const TEXT_TYPES = ["text/plain", "text/markdown", "application/json", "text/csv", "application/xml"];

/**
 * Shared preview surface for the dashboard dialog and the public viewer.
 * Branches by contentType; src is either the session content route
 * (/api/artifacts/<id>/content) or the public raw route (/a/<token>/raw).
 */
export function PreviewContent({
  contentType,
  filename,
  src,
}: {
  contentType: string;
  filename: string;
  src: string;
}) {
  if (contentType.startsWith("image/")) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={filename}
        className="max-h-[65vh] w-auto max-w-full rounded-lg border border-[var(--border)] bg-[repeating-conic-gradient(#f1f5f9_0%_25%,white_0%_50%)] bg-[length:16px_16px] object-contain"
      />
    );
  }
  if (contentType === "application/pdf" || contentType === "text/html" || contentType === "image/svg+xml") {
    return (
      <iframe
        src={src}
        title={filename}
        sandbox=""
        className="h-[65vh] w-full rounded-lg border border-[var(--border)] bg-white"
      />
    );
  }
  if (contentType.startsWith("video/")) {
    return <video src={src} controls className="max-h-[65vh] w-full rounded-lg border border-[var(--border)]" />;
  }
  if (contentType.startsWith("audio/")) {
    return <audio src={src} controls className="w-full" />;
  }
  if (TEXT_TYPES.includes(contentType)) {
    return <TextPreview src={src} />;
  }
  return (
    <p className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--text-muted)]">
      No inline preview is available for {contentType}.
    </p>
  );
}

function TextPreview({ src }: { src: string }) {
  const [text, setText] = React.useState<string | null>(null);
  const [error, setError] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    fetch(src)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((body) => {
        if (!cancelled) setText(body);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);
  if (error) {
    return <p className="text-sm text-red-700">Could not load preview.</p>;
  }
  if (text === null) {
    return <p className="text-sm text-[var(--text-muted)]">Loading…</p>;
  }
  return (
    <pre className="max-h-[65vh] overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-xs leading-5 text-[var(--text)]">
      {text}
    </pre>
  );
}
