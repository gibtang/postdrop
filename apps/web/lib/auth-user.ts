import { auth } from "@/auth";
import type { UserDoc, VerificationTokenDoc } from "./models";
import { User, VerificationToken } from "./models";
import { connectDb } from "./db";
import { hashPassword, randomToken, sha256Hex } from "./crypto";
import { isEmailConfigured, sendPasswordResetEmail, sendVerificationEmail } from "./email";

const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/** Resolves the signed-in session's User doc; null when unauthenticated. */
export async function requireUser(): Promise<UserDoc | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  await connectDb();
  return User.findById(id);
}

export interface CreateUserResult {
  user: UserDoc;
  /** false when RESEND_* is unset — the user was auto-verified instead. */
  verificationEmailSent: boolean;
}

/**
 * Creates a password account with a lowercased email. When email sending is
 * unavailable (self-host without SMTP), the account is auto-verified so
 * signup stays usable.
 */
export async function createUserWithPassword(input: {
  name: string;
  email: string;
  password: string;
  origin: string;
}): Promise<CreateUserResult> {
  await connectDb();
  const email = input.email.toLowerCase();
  const existing = await User.findOne({ email });
  if (existing) throw new Error("EMAIL_EXISTS");

  const emailConfigured = isEmailConfigured();
  const user = await User.create({
    email,
    name: input.name,
    passwordHash: await hashPassword(input.password),
    emailVerified: emailConfigured ? null : new Date(),
  });

  let verificationEmailSent = false;
  if (emailConfigured) {
    const raw = await issueToken(String(user._id), "verify", VERIFY_TOKEN_TTL_MS);
    verificationEmailSent = await sendVerificationEmail(
      { email: user.email, name: user.name },
      `${input.origin}/api/verify?token=${raw}`,
    );
    if (!verificationEmailSent) {
      // Transport configured but send rejected: keep the account usable.
      await User.updateOne({ _id: user._id }, { $set: { emailVerified: new Date() } });
    }
  }
  return { user, verificationEmailSent };
}

/** Issues a single-use hashed token; returns the raw value for the email link. */
async function issueToken(userId: string, purpose: "verify" | "reset", ttlMs: number): Promise<string> {
  await connectDb();
  const raw = randomToken();
  await VerificationToken.create({
    userId,
    tokenHash: sha256Hex(raw),
    purpose,
    expiresAt: new Date(Date.now() + ttlMs),
    usedAt: null,
  });
  return raw;
}

/** Marks a matching unused, unexpired token used; null when invalid. */
async function consumeToken(raw: string, purpose: "verify" | "reset"): Promise<VerificationTokenDoc | null> {
  await connectDb();
  return VerificationToken.findOneAndUpdate(
    {
      tokenHash: sha256Hex(raw),
      purpose,
      usedAt: null,
      expiresAt: { $gt: new Date() },
    },
    { $set: { usedAt: new Date() } },
    { new: true },
  );
}

/** Completes email verification. Returns false for unknown/used/expired tokens. */
export async function verifyEmail(raw: string): Promise<boolean> {
  const token = await consumeToken(raw, "verify");
  if (!token) return false;
  await User.updateOne(
    { _id: token.userId, emailVerified: null },
    { $set: { emailVerified: new Date() } },
  );
  return true;
}

export type ResetRequestStatus = "sent" | "unavailable";

/**
 * Issues a password reset for the given email. Returns "unavailable" when
 * email sending is not configured. Missing accounts are indistinguishable
 * from existing ones ("sent") to avoid enumeration.
 */
export async function requestPasswordReset(email: string, origin: string): Promise<ResetRequestStatus> {
  if (!isEmailConfigured()) return "unavailable";
  await connectDb();
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) return "sent";
  const raw = await issueToken(String(user._id), "reset", RESET_TOKEN_TTL_MS);
  const sent = await sendPasswordResetEmail(
    { email: user.email, name: user.name },
    `${origin}/reset-password?token=${raw}`,
  );
  return sent ? "sent" : "unavailable";
}

/** Sets a new password for a valid reset token. False when the token is invalid. */
export async function resetPassword(raw: string, password: string): Promise<boolean> {
  const token = await consumeToken(raw, "reset");
  if (!token) return false;
  await User.updateOne(
    { _id: token.userId },
    { $set: { passwordHash: await hashPassword(password) } },
  );
  return true;
}

/** Re-sends the verification email for an existing unverified account. */
export async function resendVerificationEmail(email: string, origin: string): Promise<boolean> {
  if (!isEmailConfigured()) return false;
  await connectDb();
  const user = await User.findOne({ email: email.toLowerCase(), emailVerified: null });
  if (!user) return true; // already verified or unknown — nothing to do
  const raw = await issueToken(String(user._id), "verify", VERIFY_TOKEN_TTL_MS);
  return sendVerificationEmail(
    { email: user.email, name: user.name },
    `${origin}/api/verify?token=${raw}`,
  );
}
