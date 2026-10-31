import { ForgotPasswordForm } from "./forgot-form";

export const metadata = { title: "Forgot password — Postdrop" };

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <ForgotPasswordForm />
    </main>
  );
}
