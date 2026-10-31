import { Event } from "./models";

export type EventType =
  | "artifact_uploaded"
  | "artifact_edited"
  | "artifact_deleted"
  | "share_created"
  | "share_revoked"
  | "token_created"
  | "token_revoked";

export interface RecordEventInput {
  type: EventType;
  userId: string;
  data?: Record<string, unknown>;
}

/**
 * Fire-and-forget event append. Never throws into the caller: all failures
 * are logged and swallowed.
 */
export function recordEvent(input: RecordEventInput): void {
  void Event.create({
    userId: input.userId,
    type: input.type,
    ...(input.data !== undefined ? { data: input.data } : {}),
  }).catch((err: unknown) => {
    console.error(
      `events: failed to record ${input.type}:`,
      err instanceof Error ? err.message : err,
    );
  });
}
