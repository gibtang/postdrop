import * as React from "react";
import { cn } from "./cn";

type BadgeTone = "pending" | "answered" | "expired" | "neutral";

const toneClasses: Record<BadgeTone, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  answered: "bg-emerald-50 text-emerald-700 border-emerald-200",
  expired: "bg-slate-100 text-slate-500 border-slate-200",
  neutral: "bg-[var(--surface)] text-[var(--text-muted)] border-[var(--border)]",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize",
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}
