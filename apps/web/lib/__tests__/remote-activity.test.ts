import "../../happydom";
import { describe, test, expect } from "bun:test";
import type { TaskEventType, WsEventBroadcast } from "@repo/types";
import { summariseRemoteEvents } from "../remote-activity";

const ME = 7;
const SOMEONE_ELSE = 9;

function event(type: TaskEventType, actorId?: number, payload: Record<string, unknown> = {}): WsEventBroadcast {
  return { type, projectId: 1, taskId: 1, actorId, payload };
}

describe("summariseRemoteEvents", () => {
  test("says nothing about the current user's own changes", () => {
    // They just did this, and they were already told by the action they took.
    expect(summariseRemoteEvents([event("TASK_MOVED", ME, { newStatus: "REVIEW" })], ME)).toBeNull();
  });

  test("says nothing about work with no human behind it", () => {
    // The AI worker runs detached from whoever asked for it.
    expect(summariseRemoteEvents([event("AI_SUGGESTION_CREATED")], ME)).toBeNull();
  });

  test("ignores the graph-refresh signal", () => {
    // GRAPH_UPDATED always accompanies a real change; counting it would double
    // every notification.
    expect(summariseRemoteEvents([event("GRAPH_UPDATED", SOMEONE_ELSE)], ME)).toBeNull();
  });

  test("says nothing when there is no user to tell apart", () => {
    // Every event looks like somebody else's without a reference point, so the
    // honest move is to stay quiet rather than invent a teammate.
    expect(summariseRemoteEvents([event("TASK_MOVED", SOMEONE_ELSE, { newStatus: "REVIEW" })], null)).toBeNull();
  });

  test("describes a single remote change", () => {
    expect(
      summariseRemoteEvents(
        [event("TASK_MOVED", SOMEONE_ELSE, { oldStatus: "BACKLOG", newStatus: "IN_PROGRESS" })],
        ME,
      ),
    ).toBe("A teammate moved a task to In Progress");
  });

  test("uses the title when a task is created", () => {
    expect(summariseRemoteEvents([event("TASK_CREATED", SOMEONE_ELSE, { title: "Write docs" })], ME)).toBe(
      'A teammate added “Write docs”',
    );
  });

  test("collapses a burst of the same kind into one line", () => {
    const burst = [
      event("TASK_MOVED", SOMEONE_ELSE, { newStatus: "IN_PROGRESS" }),
      event("TASK_MOVED", SOMEONE_ELSE, { newStatus: "REVIEW" }),
      event("TASK_MOVED", SOMEONE_ELSE, { newStatus: "DONE" }),
    ];

    expect(summariseRemoteEvents(burst, ME)).toBe("A teammate made 3 changes");
  });

  test("summarises a mixed burst", () => {
    const burst = [
      event("TASK_CREATED", SOMEONE_ELSE, { title: "One" }),
      event("DEPENDENCY_ADDED", SOMEONE_ELSE),
      event("TASK_DELETED", SOMEONE_ELSE),
    ];

    expect(summariseRemoteEvents(burst, ME)).toBe("3 changes from your team");
  });

  test("counts only the other person's events", () => {
    const burst = [
      event("TASK_MOVED", SOMEONE_ELSE, { newStatus: "REVIEW" }),
      event("TASK_MOVED", ME, { newStatus: "DONE" }),
      event("GRAPH_UPDATED", ME),
    ];

    expect(summariseRemoteEvents(burst, ME)).toBe("A teammate moved a task to Review");
  });

  test("says nothing when a burst is all the current user's", () => {
    const burst = [event("TASK_MOVED", ME, { newStatus: "REVIEW" }), event("TASK_UPDATED", ME)];

    expect(summariseRemoteEvents(burst, ME)).toBeNull();
  });

  test("falls back when the payload is missing or unfamiliar", () => {
    expect(summariseRemoteEvents([event("TASK_MOVED", SOMEONE_ELSE)], ME)).toBe("A teammate moved a task");
    expect(summariseRemoteEvents([event("TASK_CREATED", SOMEONE_ELSE)], ME)).toBe(
      "A teammate added a task",
    );
  });
});
