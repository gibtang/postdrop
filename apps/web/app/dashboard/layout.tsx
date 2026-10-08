import { requireOwner } from "@/lib/owner-auth";
import { redirect } from "next/navigation";
import { SidebarNav } from "@/components/sidebar-nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let email: string;
  const owner = await requireOwner();
  if (!owner) redirect("/login");
  email = owner.email;

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-[var(--border)] bg-white md:block">
        <SidebarNav />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 px-6 py-8 md:px-10">{children}</main>
        <footer className="border-t border-[var(--border)] px-6 py-4 text-sm text-[var(--text-muted)] md:px-10">
          Signed in as {email}
        </footer>
      </div>
    </div>
  );
}
