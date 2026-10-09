"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/card";
import { Input, PasswordInput } from "@/components/input";
import { getFirebaseAuth, isFirebaseClientConfigured } from "@/lib/firebase/client";

function passwordErrorMessage(status: number, message?: string): string {
  return (
    message ??
    (status === 401 ? "Invalid email or password." : `Login failed (${status}).`)
  );
}

/** Maps Firebase auth error codes to user-facing copy. */
function firebaseErrorMessage(code: string): string {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Invalid email or password.";
    case "auth/too-many-requests":
      return "Too many attempts — please try again later.";
    case "auth/network-request-failed":
      return "Network error — please try again.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Google sign-in was cancelled.";
    case "auth/operation-not-allowed":
      return "Google sign-in not enabled";
    default:
      return "Sign-in failed — please try again.";
  }
}

function PasswordLoginForm() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { code?: string; message?: string };
        } | null;
        setError(passwordErrorMessage(res.status, body?.error?.message));
        return;
      }
      toast.success("Signed in");
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label
          htmlFor="email"
          className="block text-sm font-medium text-[var(--text)]"
        >
          Email
        </label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </div>
      <div className="space-y-1.5">
        <label
          htmlFor="password"
          className="block text-sm font-medium text-[var(--text)]"
        >
          Password
        </label>
        <PasswordInput
          id="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </div>
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

/** Extracts the Firebase auth error code from a thrown value, if present. */
function firebaseErrorCode(err: unknown): string {
  if (typeof err === "object" && err !== null && "code" in err) {
    return typeof err.code === "string" ? err.code : "";
  }
  return "";
}

function FirebaseLoginForm() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function exchangeIdToken(idToken: string): Promise<boolean> {
    const res = await fetch("/api/auth/firebase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: { code?: string; message?: string };
      } | null;
      setError(body?.error?.message ?? `Sign-in failed (${res.status}).`);
      return false;
    }
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { signInWithEmailAndPassword } = await import("firebase/auth");
      const auth = await getFirebaseAuth();
      const credential = await signInWithEmailAndPassword(auth, email, password);
      if (await exchangeIdToken(await credential.user.getIdToken())) {
        toast.success("Signed in");
        router.replace("/dashboard");
        router.refresh();
      }
    } catch (err) {
      const code = firebaseErrorCode(err);
      setError(code ? firebaseErrorMessage(code) : "Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    setSubmitting(true);
    setError(null);
    try {
      const { GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
      const auth = await getFirebaseAuth();
      const credential = await signInWithPopup(
        auth,
        new GoogleAuthProvider(),
      );
      if (await exchangeIdToken(await credential.user.getIdToken())) {
        toast.success("Signed in");
        router.replace("/dashboard");
        router.refresh();
      }
    } catch (err) {
      const code = firebaseErrorCode(err);
      if (code === "auth/popup-closed-by-user") return;
      setError(code ? firebaseErrorMessage(code) : "Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label
            htmlFor="email"
            className="block text-sm font-medium text-[var(--text)]"
          >
            Email
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="password"
            className="block text-sm font-medium text-[var(--text)]"
          >
            Password
          </label>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <div className="flex items-center gap-3" role="separator">
        <span className="h-px flex-1 bg-[var(--border)]" />
        <span className="text-xs text-slate-500">or</span>
        <span className="h-px flex-1 bg-[var(--border)]" />
      </div>
      <Button
        type="button"
        variant="secondary"
        disabled={submitting}
        onClick={handleGoogle}
        className="w-full"
      >
        Continue with Google
      </Button>
    </div>
  );
}

export default function LoginPage() {
  const firebaseMode = isFirebaseClientConfigured();

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-sm font-bold text-white">
              pd
            </span>
            <span className="text-base font-semibold text-[var(--text)]">
              Postdrop
            </span>
          </div>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            Access your Drops, Agents, and usage.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {firebaseMode ? <FirebaseLoginForm /> : <PasswordLoginForm />}
        </CardContent>
      </Card>
    </main>
  );
}
