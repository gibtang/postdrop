import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <div className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-white p-8 text-center shadow-sm">
        <p className="text-2xl" aria-hidden="true">
          🔗
        </p>
        <h1 className="mt-3 text-lg font-semibold text-[var(--text)]">Link unavailable</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
          This link may have expired or been revoked. Ask the sender for a fresh one.
        </p>
        <Link href="/" className="mt-4 inline-block text-sm text-[var(--accent)] hover:underline">
          About Postdrop →
        </Link>
      </div>
    </main>
  );
}
