import "../../happydom";
import { describe, test, expect, mock, beforeEach } from "bun:test";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { Task, TaskStatus, ReadinessState } from "@repo/types";

/** A task snapshot as the board hook holds it. */
function makeTask(
  id: number,
  status: TaskStatus = "BACKLOG",
  position = 0,
  readiness: ReadinessState = "READY"
): Task {
  return {
    id,
    projectId: 1,
    title: `Task ${id}`,
    description: null,
    status,
    readiness,
    position,
    duration: 1,
  };
}

const toasts: { type: string; message: string }[] = [];

let graphTasks: Task[] = [];
let moveShouldFail = false;

const apiMock = mock(async (endpoint: string, options: RequestInit = {}) => {
  if (endpoint.endsWith("/graph")) {
    return { success: true as const, data: { tasks: graphTasks, dependencies: [] } };
  }
  if (endpoint.includes("/move")) {
    if (moveShouldFail) {
      throw { success: false, error: { code: "TASK_IS_BLOCKED", message: "Task is blocked" } };
    }
    return { success: true as const, data: {} };
  }
  return { success: true as const, data: {} };
});

mock.module("@/lib/api-client", () => ({
  apiClient: apiMock,
  unwrapResponse: (res: any) => {
    if (!res.success) throw res.error;
    return res.data;
  },
  isErrorResponse: (res: any) => !res.success,
}));

mock.module("@/components/toaster", () => ({
  useToast: () => ({
    toasts: [],
    toast: (t: { type: string; message: string }) => {
      toasts.push(t);
    },
    remove: () => {},
  }),
}));

const { useBoard } = await import("../use-board");

async function mountBoard() {
  const hook = renderHook(() => useBoard(1));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

beforeEach(() => {
  toasts.length = 0;
  moveShouldFail = false;
  graphTasks = [];
  apiMock.mockClear();
});

describe("useBoard optimistic updates", () => {
  test("a task starts in the column its status names", async () => {
    graphTasks = [makeTask(1, "IN_PROGRESS")];
    const { result } = await mountBoard();

    const column = result.current.columns.find((c) => c.id === "IN_PROGRESS");
    expect(column?.tasks.map((t) => t.id)).toEqual([1]);
  });

  test("columns list their tasks in position order", async () => {
    graphTasks = [
      makeTask(3, "BACKLOG", 2),
      makeTask(1, "BACKLOG", 0),
      makeTask(2, "BACKLOG", 1),
    ];
    const { result } = await mountBoard();

    const column = result.current.columns.find((c) => c.id === "BACKLOG");
    expect(column?.tasks.map((t) => t.id)).toEqual([1, 2, 3]);
  });

  test("moveTask applies the new status immediately", async () => {
    graphTasks = [makeTask(1)];
    const { result } = await mountBoard();

    await act(async () => {
      await result.current.moveTask(1, "REVIEW", 0);
    });

    expect(result.current.tasks.get(1)?.status).toBe("REVIEW");
  });

  test("moveTask restores the original status when the move is rejected", async () => {
    graphTasks = [makeTask(1)];
    const { result } = await mountBoard();
    moveShouldFail = true;

    await act(async () => {
      await result.current.moveTask(1, "IN_PROGRESS", 0).catch(() => {});
    });

    // The card must go back to where it started, not stay in the rejected column.
    expect(result.current.tasks.get(1)?.status).toBe("BACKLOG");
  });

  test("moveTask restores the original position when the move is rejected", async () => {
    graphTasks = [makeTask(1, "BACKLOG", 4)];
    const { result } = await mountBoard();
    moveShouldFail = true;

    await act(async () => {
      await result.current.moveTask(1, "BACKLOG", 9).catch(() => {});
    });

    expect(result.current.tasks.get(1)?.position).toBe(4);
  });

  test("reorderTask restores the original position when the reorder is rejected", async () => {
    graphTasks = [makeTask(1, "BACKLOG", 1)];
    const { result } = await mountBoard();
    moveShouldFail = true;

    await act(async () => {
      await result.current.reorderTask(1, 7, "BACKLOG").catch(() => {});
    });

    expect(result.current.tasks.get(1)?.position).toBe(1);
  });

  test("reorderTask applies the new position immediately", async () => {
    graphTasks = [makeTask(1, "BACKLOG", 1)];
    const { result } = await mountBoard();

    await act(async () => {
      await result.current.reorderTask(1, 3, "BACKLOG");
    });

    expect(result.current.tasks.get(1)?.position).toBe(3);
  });

  test("a rejected move reports exactly one error", async () => {
    graphTasks = [makeTask(1)];
    const { result } = await mountBoard();
    moveShouldFail = true;

    await act(async () => {
      await result.current.moveTask(1, "IN_PROGRESS", 0).catch(() => {});
    });

    expect(toasts.filter((t) => t.type === "error")).toHaveLength(1);
  });

  test("a successful move reports exactly one success", async () => {
    graphTasks = [makeTask(1)];
    const { result } = await mountBoard();

    await act(async () => {
      await result.current.moveTask(1, "REVIEW", 0);
    });

    expect(toasts.filter((t) => t.type === "success")).toHaveLength(1);
  });
});
