import { ResetPasswordForm } from "./reset-form";

export const metadata = { title: "Reset password — Postdrop" };

interface ResetPasswordProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ResetPasswordPage({ searchParams }: ResetPasswordProps) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : null;
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <ResetPasswordForm token={token} />
    </main>
  );
}
