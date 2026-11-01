import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "Sign in — Postdrop",
  description: "Sign in to manage your Postdrop artifacts, upload tokens, and share links.",
};

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
  google_linked:
    "This Google account is already linked to a different Postdrop account. Sign in with the linked account or contact support.",
  link_google_required:
    "Sign in to your existing Postdrop account first, then link Google under Dashboard settings.",
  google_error: "Google sign-in failed. Try again, or sign in with email and password.",
};
export default async function LoginPage({ searchParams }: LoginProps) {
  const params = await searchParams;
  const authError = flag(params, "error");
  const bannerKey = ["registered", "verified", "unverified", "reset", "google_linked", "google_error"].find((k) => flag(params, k))
    ?? (authError === "OAuthAccountNotLinked" ? "google_linked" : authError ? "google_error" : null)
    ?? (flag(params, "link_google") ? "link_google_required" : null);
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
