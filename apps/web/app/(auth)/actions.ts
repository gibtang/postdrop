"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { signIn } from "@/auth";
import {
  createUserWithPassword,
  requestPasswordReset,
  resendVerificationEmail,
  resetPassword,
} from "@/lib/auth-user";

const credentialsSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type FormState = { error?: string; info?: string };

async function origin(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/dashboard",
    });
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.message === "EMAIL_NOT_VERIFIED") return { error: "EMAIL_NOT_VERIFIED" };
      return { error: "Invalid email or password" };
    }
    throw err; // redirect errors must propagate
  }
  return {};
}

export async function googleSignInAction(): Promise<void> {
  await signIn("google", { redirectTo: "/dashboard" });
}

export async function signupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const schema = credentialsSchema.extend({
    name: z.string().trim().min(1, "Name is required").max(200),
  });
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    await createUserWithPassword({
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
      origin: await origin(),
    });
  } catch (err) {
    if (err instanceof Error && err.message === "EMAIL_EXISTS") {
      return { error: "An account with this email already exists. Sign in instead." };
    }
    throw err;
  }
  revalidatePath("/login");
  redirect("/login?registered=1");
}

export async function resendVerificationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = z.string().email().safeParse(formData.get("email"));
  if (!email.success) return { error: "Enter a valid email address" };
  const sent = await resendVerificationEmail(email.data, await origin());
  if (sent) return { info: "If that account needs verification, a new email is on its way." };
  return { error: "Email sending is unavailable on this instance. Contact the administrator." };
}

export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = z.string().email("Enter a valid email address").safeParse(formData.get("email"));
  if (!email.success) return { error: "Enter a valid email address" };
  const result = await requestPasswordReset(email.data, await origin());
  if (result === "unavailable") {
    return { error: "Email sending is unavailable on this instance. Contact the administrator." };
  }
  return { info: "If an account exists for that email, a reset link is on its way." };
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const token = formData.get("token");
  if (typeof token !== "string" || token.length === 0) return { error: "Missing reset token" };
  const ok = await resetPassword(token, parsed.data.password);
  if (!ok) return { error: "This reset link is invalid or has expired. Request a new one." };
  redirect("/login?reset=1");
}
