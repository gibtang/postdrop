import Link from "next/link";
import { requireUser } from "@/lib/auth-user";
import { signOutAction } from "@/lib/artifact-actions";
import { Button } from "@/components/button";

export const metadata = { title: "Dashboard — Postdrop" };

const navItems = [
  { href: "/dashboard", label: "Artifacts" },
  { href: "/dashboard/tokens", label: "Tokens" },
  { href: "/dashboard/links", label: "Links" },
  { href: "/dashboard/settings", label: "Settings" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!user) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
        <p className="text-sm text-[var(--text-muted)]">You need to sign in to view this page.</p>
        <Button asChild>
          <Link href="/login">Sign in</Link>
        </Button>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <header className="border-b border-[var(--border)] bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-sm font-semibold tracking-tight text-[var(--text)]">
              postdrop
            </Link>
            <nav className="flex items-center gap-1 text-sm" aria-label="Dashboard">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-lg px-3 py-1.5 text-[var(--text-muted)] transition hover:bg-[var(--surface)] hover:text-[var(--text)]"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-[var(--text-muted)]">{user.email}</span>
            <form action={signOutAction}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
    </div>
  );
}
