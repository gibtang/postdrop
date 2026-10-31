"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/card";
import { forgotPasswordAction, type FormState } from "../actions";

const initial: FormState = {};

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, initial);
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-3">
          <Input name="email" type="email" required placeholder="you@example.com" autoComplete="email" />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Sending…" : "Send reset link"}
          </Button>
        </form>
        {state.error && (
          <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {state.error}
          </p>
        )}
        {state.info && (
          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            {state.info}
          </p>
        )}
        <p className="mt-4 text-sm text-[var(--text-muted)]">
          <Link href="/login" className="hover:underline">
            ← Back to sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
