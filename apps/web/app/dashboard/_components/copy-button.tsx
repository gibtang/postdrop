"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/button";

export function CopyButton({
  value,
  label = "Copy",
  size = "sm",
  className,
}: {
  value: string;
  label?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size={size}
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard unavailable (e.g. insecure context); leave button as-is.
        }
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : label}
    </Button>
  );
}
