"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/button";
import { Input, PasswordInput } from "@/components/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/card";
import { signupAction, type FormState } from "../actions";

const initial: FormState = {};

export function SignupForm() {
  const [state, action, pending] = useActionState(signupAction, initial);
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Create your Postdrop account</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-3">
          <Input name="name" required placeholder="Your name" autoComplete="name" maxLength={200} />
          <Input name="email" type="email" required placeholder="you@example.com" autoComplete="email" />
          <PasswordInput
            name="password"
            required
            minLength={8}
            placeholder="Password (min 8 characters)"
            autoComplete="new-password"
          />
          {state.error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {state.error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creating account…" : "Sign up"}
          </Button>
        </form>
        <p className="mt-4 text-sm text-[var(--text-muted)]">
          Already have an account?{" "}
          <Link href="/login" className="hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
