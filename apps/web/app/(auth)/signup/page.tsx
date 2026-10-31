import { SignupForm } from "./signup-form";

export const metadata = { title: "Sign up — Postdrop" };

export default function SignupPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <SignupForm />
    </main>
  );
}
