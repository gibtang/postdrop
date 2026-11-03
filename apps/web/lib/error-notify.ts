import "server-only";

import * as Sentry from "@sentry/nextjs";

/**
 * Error notifications: Sentry capture + Telegram alert.
 *
 * Sentry is the primary sink — every `notifyError` call captures the error
 * with full context (wired via the DSN in all three runtime configs).
 * Telegram is the pager: a lightweight sendMessage to the ops bot so 4xx/5xx
 * bursts surface on the phone without opening Sentry.
 *
 * Design constraints (single Coolify instance, no new deps):
 * - Never throws: notification failures must not turn a handled 4xx into a 500.
 * - Never blocks the response longer than ~2s.
 * - Cooldown per message key (default 10 min) so a repeating 4xx does not
 *   spam the phone. 5xx alerts never cool down — a real outage pages every time.
 * - Enabled by default whenever a bot token + chat id are present; set
 *   TELEGRAM_ALERTS=off to mute (e.g. local dev).
 * - No-op + console.warn when unset — safe to merge before env provisioning.
 */

const SITE = "thepostdrop.dev";
const TELEGRAM_API_BASE = "https://api.telegram.org";
const SEND_TIMEOUT_MS = 2_500;
const DEFAULT_COOLDOWN_MS = 10 * 60 * 1000;

export type ErrorSeverity = "warning" | "error";

export type NotifyErrorInput = {
  /** The caught error (or an Error constructed for a non-exception failure). */
  error: unknown;
  /** Short machine-readable origin, e.g. "api/pastes". */
  source: string;
  /** HTTP status the caller is about to return (4xx → warning, 5xx → error). */
  status: number;
  /** Stable per-site key for cooldown dedup, e.g. the client IP + route. */
  cooldownKey?: string;
  /** Small extra payload rendered into the Telegram message. */
  details?: Record<string, string | number | boolean | null | undefined>;
};

/** Alert budget: at most 20 Telegram alerts per rolling 5 minutes. */
const ALERT_BUDGET = { max: 20, windowMs: 5 * 60 * 1000 };

const cooldowns = new Map<string, number>();
let budgetWindowStart = 0;
let budgetUsed = 0;

function withinBudget(now: number): boolean {
  if (now - budgetWindowStart > ALERT_BUDGET.windowMs) {
    budgetWindowStart = now;
    budgetUsed = 0;
  }
  if (budgetUsed >= ALERT_BUDGET.max) return false;
  budgetUsed += 1;
  return true;
}

function onCooldown(key: string, now: number): boolean {
  const until = cooldowns.get(key);
  if (until && now < until) return true;
  cooldowns.set(key, now + DEFAULT_COOLDOWN_MS);
  if (cooldowns.size > 500) {
    for (const [k, t] of cooldowns) {
      if (now >= t) cooldowns.delete(k);
    }
  }
  return false;
}

export function telegramAlertsEnabled(): boolean {
  const flag = process.env.TELEGRAM_ALERTS;
  if (flag === "off" || flag === "false" || flag === "0") return false;
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

function severityFor(status: number): ErrorSeverity {
  return status >= 500 ? "error" : "warning";
}

function statusEmoji(status: number): string {
  if (status >= 500) return "🚨";
  if (status === 429) return "🐢";
  if (status === 401 || status === 403) return "🔐";
  return "⚠️";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

/** True when the status is a 5xx (always pages, ignores cooldown). */
export function isServerError(status: number): boolean {
  return status >= 500;
}

async function sendTelegram(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(
        `[notify] telegram sendMessage failed: ${res.status} ${await res.text().catch(() => "")}`,
      );
    }
  } catch (e) {
    console.error("[notify] telegram sendMessage error:", e instanceof Error ? e.message : e);
  } finally {
    clearTimeout(timer);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Capture the error in Sentry and (optionally) page via Telegram.
 * Resolves when both sinks settle; never rejects.
 */
export async function notifyError(input: NotifyErrorInput): Promise<void> {
  const { error, source, status, details } = input;
  const severity = severityFor(status);
  const message = errorMessage(error);

  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) {
    console.warn("[notify] sentry DSN unset — capture skipped");
  }

  // 1. Sentry — always, full context. Handled errors are invisible to the
  //    SDK's automatic capture, so this is the only path they take.
  Sentry.withScope((scope) => {
    scope.setTag("source", source);
    scope.setTag("status", String(status));
    scope.setTag("severity", severity);
    scope.setLevel(severity);
    if (details) {
      for (const [k, v] of Object.entries(details)) {
        if (v !== undefined) scope.setExtra(k, v);
      }
    }
    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      Sentry.captureMessage(`${source}: ${message}`, { level: severity });
    }
  });

  // 2. Telegram pager — best-effort, budgeted, deduped.
  if (!telegramAlertsEnabled()) return;
  const now = Date.now();
  if (!withinBudget(now)) return;

  const cooldownKey = input.cooldownKey ?? `${source}:${status}:${message.slice(0, 80)}`;
  if (!isServerError(status) && onCooldown(cooldownKey, now)) return;

  const lines = [
    `${statusEmoji(status)} <b>${SITE}</b> HTTP ${status}`,
    `<b>${escapeHtml(source)}</b> — ${escapeHtml(message.slice(0, 300))}`,
  ];
  if (details) {
    for (const [k, v] of Object.entries(details)) {
      if (v === undefined || v === null || v === "") continue;
      lines.push(`• ${escapeHtml(k)}: ${escapeHtml(String(v).slice(0, 120))}`);
    }
  }
  await sendTelegram(lines.join("\n"));
}

/**
 * Fire-and-forget notify: never blocks the response, never rejects.
 */
export function notifyErrorAfter(input: NotifyErrorInput): void {
  void notifyError(input).catch(() => {});
}
