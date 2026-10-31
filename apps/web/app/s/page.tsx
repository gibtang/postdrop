import type { Metadata } from "next";
import { PasteClient } from "./paste-client";

export const metadata: Metadata = {
  title: "One-time secret links — free, zero-knowledge | Postdrop",
  description:
    "Share a note or file with a self-destructing link. Encrypted in your browser — the server never sees the key, and the secret is deleted after one view. Free.",
  openGraph: {
    title: "One-time secret links — free, zero-knowledge",
    description:
      "Encrypted in your browser. The server never sees the key. One view, then gone.",
  },
};

export default function SecretPage() {
  return <PasteClient />;
}
