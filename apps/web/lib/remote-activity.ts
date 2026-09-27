import type { TaskEventType, TaskStatus, WsEventBroadcast } from "@repo/types";

/**
 * Turning a teammate's change into one sentence.
 *
 * Kept pure and apart from the socket so the wording can be tested without a DOM
 * and without a running WebSocket. The batching that decides *when* to speak
 * lives in the hook that owns the connection.
 */

/** Engine and refetch bookkeeping that should never announce itself. */
const SILENT: ReadonlySet<TaskEventType> = new Set<TaskEventType>([
  // GRAPH_UPDATED rides along with a real change and says nothing of its own;
  // counting it would double every notification.
  "GRAPH_UPDATED",
]);

function statusLabel(status: unknown): string | null {
  if (typeof status !== "string") return null;
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function oneLiner(event: WsEventBroadcast): string {
  const payload = event.payload ?? {};

  switch (event.type) {
    case "TASK_CREATED": {
      const title = typeof payload.title === "string" ? payload.title : null;
      return title ? `A teammate added “${title}”` : "A teammate added a task";
    }
    case "TASK_MOVED": {
      const to = statusLabel(payload.newStatus);
      return to ? `A teammate moved a task to ${to}` : "A teammate moved a task";
    }
    case "TASK_UPDATED":
      return "A teammate edited a task";
    case "TASK_DELETED":
      return "A teammate deleted a task";
    case "TASK_READY":
      return "A teammate's change unblocked a task";
    case "TASK_BLOCKED":
      return "A teammate's change blocked a task";
    case "SCHEDULE_CHANGED":
      return "The project schedule changed";
    case "DEPENDENCY_ADDED":
      return "A teammate added a dependency";
    case "DEPENDENCY_REMOVED":
      return "A teammate removed a dependency";
    default:
      return "Your project was updated";
  }
}

/**
 * The sentence for a batch of remote events, or null when there is nothing worth
 * interrupting anyone for.
 *
 * `currentUserId` is what makes this possible: an event with no actor is work
 * with no human behind it (the AI worker), and an event from the current user is
 * the echo of something they just did and have already been told about.
 */
export function summariseRemoteEvents(
  events: WsEventBroadcast[],
  currentUserId: number | null,
): string | null {
  // Without a user to compare against, every event is somebody else's — and
  // telling someone a teammate did something when we cannot tell who anyone is
  // is worse than saying nothing. The socket only ever runs inside the
  // authenticated app shell, so this costs nothing real.
  if (currentUserId === null) return null;

  const noteworthy = events.filter(
    (event) =>
      !SILENT.has(event.type) &&
      typeof event.actorId === "number" &&
      event.actorId !== currentUserId,
  );

  if (noteworthy.length === 0) return null;
  if (noteworthy.length === 1) return oneLiner(noteworthy[0]!);

  // Repeating near-identical sentences is the failure mode here. Someone
  // dragging a card across three columns should read one line, not three — and
  // those three events differ only in the column they landed in, so the grouping
  // is by kind of change, not by the sentence it would produce.
  const kinds = new Set(noteworthy.map((event) => event.type));
  if (kinds.size === 1) return `A teammate made ${noteworthy.length} changes`;

  return `${noteworthy.length} changes from your team`;
}
