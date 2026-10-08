"use client";

import * as React from "react";

function formatRemaining(ms: number): string {
  if (ms <= 0) return "Expired";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/** Live countdown to an ISO timestamp; renders "Expired" once passed. */
export function Countdown({
  expiresAt,
  className,
}: {
  expiresAt: string;
  className?: string;
}) {
  const target = React.useMemo(
    () => new Date(expiresAt).getTime(),
    [expiresAt],
  );
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span
      className={className}
      suppressHydrationWarning
      title={new Date(target).toLocaleString()}
    >
      {formatRemaining(target - now)}
    </span>
  );
}
