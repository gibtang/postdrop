import { AwsClient } from "aws4fetch";

/**
 * Transactional email via Amazon SES (domain identity thepostdrop.dev,
 * eu-north-1). Unset credentials degrade to a no-op: auth flows auto-verify
 * signups and reset/verification email is unavailable (self-host friendly).
 */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.SES_ACCESS_KEY_ID && mailFrom());
}

function mailFrom(): string {
  return process.env.MAIL_FROM ?? "no-reply@thepostdrop.dev";
}

let cachedClient: AwsClient | null = null;

/**
 * aws4fetch (fetch-based SigV4) instead of @aws-sdk/client-sesv2: the AWS SDK
 * needs node:fs (shared INI config) during config resolution, which does not
 * exist on Cloudflare Workers (`[unenv] fs.readFile is not implemented yet!`).
 * Uses the SES v2 JSON protocol (X-Amz-Target) over plain fetch.
 */
function sesClient(): AwsClient {
  cachedClient ??= new AwsClient({
    accessKeyId: process.env.SES_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.SES_SECRET_ACCESS_KEY ?? "",
    region: process.env.SES_REGION ?? "eu-north-1",
    service: "ses",
  });
  return cachedClient;
}

async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<boolean> {
  /**
   * SES configuration set (eu-north-1) that publishes send/delivery/open/
   * click/bounce/complaint metrics to CloudWatch (dimensions: app, type).
   */
  const SES_CONFIGURATION_SET = "postdrop-transactional";
  if (!process.env.SES_ACCESS_KEY_ID) {
    console.error("email: SES_ACCESS_KEY_ID not configured; skipping send");
    return false;
  }
  try {
    const payload = {
      FromEmailAddress: `Postdrop <${mailFrom()}>`,
      Destination: { ToAddresses: [params.to] },
      ConfigurationSetName: SES_CONFIGURATION_SET,
      EmailTags: [
        { Name: "app", Value: "postdrop" },
        { Name: "type", Value: params.subject.toLowerCase().includes("reset") ? "password_reset" : "email_verification" },
      ],
      Content: {
        Simple: {
          Subject: { Data: params.subject, Charset: "UTF-8" },
          Body: {
            Html: { Data: params.html, Charset: "UTF-8" },
            Text: { Data: params.text, Charset: "UTF-8" },
          },
        },
      },
    };
    const region = process.env.SES_REGION ?? "eu-north-1";
    const res = await sesClient().fetch(`https://email.${region}.amazonaws.com/`, {
      method: "POST",
      headers: {
        "content-type": "application/x-amz-json-1.0",
        "x-amz-target": "Sesv2.SendEmail",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`);
    }
    return true;
  } catch (err) {
    console.error(`email: SES send to ${params.to} failed:`, err instanceof Error ? err.message : err);
    return false;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function brandedHtml(opts: {
  heading: string;
  bodyHtml: string;
  buttonUrl: string;
  buttonText: string;
}): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f5f7;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a2e">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8a8aa3">Postdrop</p>
<h1 style="margin:0 0 16px;font-size:20px">${opts.heading}</h1>
${opts.bodyHtml}
<p style="margin:24px 0"><a href="${escapeHtml(opts.buttonUrl)}" style="display:inline-block;background:#1a1a2e;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-family:sans-serif;font-size:15px">${escapeHtml(opts.buttonText)}</a></p>
<p style="margin:32px 0 0;font-size:12px;color:#8a8aa3">Sent via Postdrop — share web-renderable artifacts with anyone.</p>
</div></body></html>`;
}

interface UserLike {
  email: string;
  name?: string | null;
}

export async function sendVerificationEmail(user: UserLike, url: string): Promise<boolean> {
  const subject = "Verify your Postdrop email address";
  const bodyHtml = `<p style="margin:0 0 16px;font-size:14px">Hi${user.name ? ` ${escapeHtml(user.name)}` : ""},</p>
<p style="margin:0 0 16px;font-size:14px">Confirm <strong>${escapeHtml(user.email)}</strong> to activate your Postdrop account. This link expires in 24 hours.</p>`;
  const text = `Confirm ${user.email} to activate your Postdrop account. This link expires in 24 hours.\n\n${url}`;
  return sendEmail({
    to: user.email,
    subject,
    html: brandedHtml({ heading: subject, bodyHtml, buttonUrl: url, buttonText: "Verify email" }),
    text,
  });
}

export async function sendPasswordResetEmail(user: UserLike, url: string): Promise<boolean> {
  const subject = "Reset your Postdrop password";
  const bodyHtml = `<p style="margin:0 0 16px;font-size:14px">Hi${user.name ? ` ${escapeHtml(user.name)}` : ""},</p>
<p style="margin:0 0 16px;font-size:14px">A password reset was requested for <strong>${escapeHtml(user.email)}</strong>. This link expires in 1 hour. If you didn't request it, you can ignore this email.</p>`;
  const text = `A password reset was requested for ${user.email}. This link expires in 1 hour. If you didn't request it, ignore this email.\n\n${url}`;
  return sendEmail({
    to: user.email,
    subject,
    html: brandedHtml({ heading: subject, bodyHtml, buttonUrl: url, buttonText: "Reset password" }),
    text,
  });
}
