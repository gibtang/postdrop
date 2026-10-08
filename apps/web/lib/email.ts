import { Resend } from "resend";
import type { DropDoc } from "./models";

/**
 * Fire-and-forget recipient notification. Never throws into the request path;
 * callers record notifiedAt only when Resend accepts the send.
 */
export async function sendDropNotification(
  drop: DropDoc,
  linkUrl: string,
): Promise<Date | null> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) {
    console.error("email: RESEND_API_KEY/RESEND_FROM not configured; skipping notification");
    return null;
  }
  const resend = new Resend(apiKey);
  const expires = drop.expiresAt.toISOString();
  try {
    const result = await resend.emails.send({
      from,
      to: drop.recipientEmail,
      subject: `${drop.filename} — file from Postdrop`,
      text: `You have received a file: ${drop.filename}\nDownload it before ${expires}:\n${linkUrl}`,
    });
    if (result.error) {
      console.error(`email: Resend rejected send to ${drop.recipientEmail}: ${result.error.message}`);
      return null;
    }
    return new Date();
  } catch (err) {
    console.error("email: notification failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
