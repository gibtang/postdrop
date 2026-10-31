"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/button";
import { PasswordInput } from "@/components/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/card";
import { resetPasswordAction, type FormState } from "../actions";

const initial: FormState = {};

export function ResetPasswordForm({ token }: { token: string | null }) {
  const [state, action, pending] = useActionState(resetPasswordAction, initial);
  if (!token) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Invalid reset link</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--text-muted)]">
            This link is missing its token.{" "}
            <Link href="/forgot-password" className="hover:underline">
              Request a new reset link
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-3">
          <input type="hidden" name="token" value={token} />
          <PasswordInput
            name="password"
            required
            minLength={8}
            placeholder="New password (min 8 characters)"
            autoComplete="new-password"
          />
          {state.error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {state.error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Updating…" : "Update password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
