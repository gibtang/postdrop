import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in — Postdrop" };

interface LoginProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function flag(params: Record<string, string | string[] | undefined>, key: string): string | null {
  const value = params[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

const banners: Record<string, string> = {
  registered: "Account created. If email verification is required, check your inbox — then sign in.",
  verified: "Email verified. You can sign in now.",
  unverified: "That verification link was invalid or expired. Sign in to resend it.",
  reset: "Password updated. Sign in with your new password.",
};

export default async function LoginPage({ searchParams }: LoginProps) {
  const params = await searchParams;
  const bannerKey = ["registered", "verified", "unverified", "reset"].find((k) => flag(params, k));
  const banner = bannerKey ? banners[bannerKey] : null;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      {banner && (
        <p className="w-full max-w-sm rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {banner}
        </p>
      )}
      <LoginForm />
      <Link href="/" className="text-sm text-[var(--text-muted)] hover:underline">
        ← Back to Postdrop
      </Link>
    </main>
  );
}
