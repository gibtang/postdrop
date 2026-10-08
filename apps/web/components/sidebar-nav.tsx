"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Boxes, KeyRound, ChartBar } from "lucide-react";
import { cn } from "@/components/cn";

const items = [
  { href: "/dashboard", label: "Drops", icon: Boxes },
  { href: "/dashboard/agents", label: "Agents", icon: KeyRound },
  { href: "/dashboard/usage", label: "Usage", icon: ChartBar },
] as const;

export function SidebarNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-6 py-6">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-sm font-bold text-white">
          pd
        </span>
        <span className="text-base font-semibold text-[var(--text)]">
          Postdrop
        </span>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {items.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-[var(--surface)] text-[var(--text)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-[var(--border)] px-6 py-4">
        <button
          type="button"
          onClick={logout}
          className="text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
