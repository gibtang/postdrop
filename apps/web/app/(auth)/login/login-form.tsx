"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/button";
import { Input, PasswordInput } from "@/components/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/card";
import { loginAction, googleSignInAction, resendVerificationAction, type FormState } from "../actions";

const initial: FormState = {};

function ErrorMessage({ error }: { error: string }) {
  if (error === "EMAIL_NOT_VERIFIED") {
    return (
      <div data-testid="email-not-verified" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        <p className="font-medium">Your email isn&apos;t verified yet.</p>
        <p className="mt-1">Check your inbox for the verification link, or resend it below.</p>
        <ResendVerification email={null} />
      </div>
    );
  }
  return (
    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      {error}
    </p>
  );
}

function ResendVerification({ email }: { email: string | null }) {
  const [state, action, pending] = useActionState(resendVerificationAction, initial);
  return (
    <form action={action} className="mt-3 space-y-2">
      {email === null && (
        <Input name="email" type="email" required placeholder="you@example.com" />
      )}
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {pending ? "Sending…" : "Resend verification email"}
      </Button>
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      {state.info && <p className="text-sm text-emerald-700">{state.info}</p>}
    </form>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initial);
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Sign in to Postdrop</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form action={googleSignInAction}>
          <Button type="submit" variant="secondary" className="w-full">
            Continue with Google
          </Button>
        </form>
        <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
          <span className="h-px flex-1 bg-[var(--border)]" />
          or
          <span className="h-px flex-1 bg-[var(--border)]" />
        </div>
        <form action={action} className="space-y-3">
          <Input name="email" type="email" required placeholder="you@example.com" autoComplete="email" />
          <PasswordInput name="password" required placeholder="Password" autoComplete="current-password" />
          {state.error && <ErrorMessage error={state.error} />}
          {state.info && <p className="text-sm text-emerald-700">{state.info}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <div className="flex justify-between text-sm text-[var(--text-muted)]">
          <Link href="/signup" className="hover:underline">
            Create an account
          </Link>
          <Link href="/forgot-password" className="hover:underline">
            Forgot password?
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
