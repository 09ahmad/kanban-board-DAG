import "../../../happydom";
import { describe, test, expect, mock, beforeEach } from "bun:test";
import { render, cleanup, fireEvent } from "@testing-library/react";
import type { Task, TaskDependency, TaskStatus, ReadinessState } from "@repo/types";

const toasts: { type: string; message: string }[] = [];

mock.module("@/components/toaster", () => ({
  useToast: () => ({
    toasts: [],
    toast: (t: { type: string; message: string }) => {
      toasts.push(t);
    },
    remove: () => {},
  }),
}));

const { KanbanBoard, resolveDrop, performDrop } = await import("../board");

function makeTask(id: number, status: TaskStatus, position: number, readiness: ReadinessState = "READY"): Task {
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

interface TestColumn {
  id: TaskStatus;
  tasks: Task[];
}

/** dnd-kit marks a registered sortable with an aria-roledescription; a plain card has none. */
function cards(): HTMLElement[] {
  return Array.from(document.querySelectorAll("[aria-roledescription]"));
}

const STATUS_ORDER: TaskStatus[] = ["BACKLOG", "IN_PROGRESS", "REVIEW", "DONE"];

function defaultColumns(): Array<{ id: TaskStatus; title: string; tasks: Task[] }> {
  return STATUS_ORDER.map((id) => ({
    id,
    title: id.replace("_", " "),
    tasks: id === "BACKLOG" ? [makeTask(1, "BACKLOG", 0), makeTask(2, "BACKLOG", 1)] : [],
  }));
}

function renderBoard(overrides: Partial<Parameters<typeof KanbanBoard>[0]> = {}) {
  const props = {
    columns: defaultColumns(),
    dependencies: [] as TaskDependency[],
    criticalTaskIds: [] as number[],
    pendingReadinessIds: new Set<number>(),
    onMoveTask: async () => {},
    onReorderTask: async () => {},
    onTaskClick: () => {},
    onDeleteTask: () => {},
    ...overrides,
  };
  return render(<KanbanBoard {...props} />);
}

beforeEach(() => {
  toasts.length = 0;
  cleanup();
});

describe("KanbanBoard drag and drop", () => {
  test("every task card is registered as a draggable", () => {
    renderBoard();
    expect(cards()).toHaveLength(2);
  });

  test("cards in every column are draggable", () => {
    const cols = STATUS_ORDER.map((id) => ({
      id,
      title: id,
      tasks: [makeTask(10, id, 0)],
    }));
    renderBoard({ columns: cols });
    expect(cards()).toHaveLength(4);
  });

  test("a card describes itself to assistive tech as sortable", () => {
    renderBoard();
    const card = cards()[0];
    expect(card?.getAttribute("aria-roledescription")).toBe("sortable");
  });

  test("a card exposes a stable drag handle id to dnd-kit", () => {
    renderBoard();
    // useSortable wires aria-describedby to dnd-kit's own live instructions,
    // which is only present once the node is actually registered.
    const describedBy = cards()[0]?.getAttribute("aria-describedby") ?? "";
    expect(describedBy.length).toBeGreaterThan(0);
  });

  test("a BLOCKED card is still reachable by keyboard for inspection", () => {
    const blocked = [makeTask(1, "BACKLOG", 0, "BLOCKED")];
    renderBoard({ columns: [{ id: "BACKLOG", title: "Backlog", tasks: blocked }] });
    expect(cards()).toHaveLength(1);
  });
});

describe("drop resolution", () => {
  const board: TestColumn[] = STATUS_ORDER.map((id) => ({
    id,
    tasks: id === "BACKLOG" ? [makeTask(1, "BACKLOG", 0), makeTask(2, "BACKLOG", 1)] : [],
  }));

  /** The same board with some columns swapped out. */
  function withTasks(overrides: Partial<Record<TaskStatus, Task[]>>): TestColumn[] {
    return board.map((c) => ({ id: c.id, tasks: overrides[c.id] ?? c.tasks }));
  }

  test("a card dropped on another column becomes a move to its end", () => {
    expect(resolveDrop(1, "REVIEW", board)).toEqual({
      kind: "move",
      taskId: 1,
      status: "REVIEW",
      position: 0,
    });
  });

  test("a move lands after the cards already in the target column", () => {
    const target = withTasks({ REVIEW: [makeTask(8, "REVIEW", 0), makeTask(9, "REVIEW", 1)] });
    expect(resolveDrop(1, "REVIEW", target)).toMatchObject({ kind: "move", position: 2 });
  });

  test("dropping a card on its own column does nothing", () => {
    expect(resolveDrop(1, "BACKLOG", board)).toEqual({ kind: "none" });
  });

  test("dropping a card on itself does nothing", () => {
    expect(resolveDrop(1, 1, board)).toEqual({ kind: "none" });
  });

  test("dropping a card on a neighbour in the same column reorders it", () => {
    expect(resolveDrop(1, 2, board)).toEqual({
      kind: "reorder",
      taskId: 1,
      position: 1,
      status: "BACKLOG",
    });
  });

  test("a BLOCKED card may not be dropped into IN_PROGRESS", () => {
    const blocked = withTasks({ BACKLOG: [makeTask(1, "BACKLOG", 0, "BLOCKED")] });
    expect(resolveDrop(1, "IN_PROGRESS", blocked)).toEqual({ kind: "blocked" });
  });

  test("a BLOCKED card may still be moved to a column that does not start work", () => {
    const blocked = withTasks({ BACKLOG: [makeTask(1, "BACKLOG", 0, "BLOCKED")] });
    expect(resolveDrop(1, "REVIEW", blocked).kind).toBe("move");
  });

  test("a BLOCKED card dropped on its own column is not refused", () => {
    // Already in IN_PROGRESS, so a drop on IN_PROGRESS is a no-op, not a refusal.
    const inProgress: TestColumn[] = [
      { id: "BACKLOG", tasks: [] },
      { id: "IN_PROGRESS", tasks: [makeTask(1, "IN_PROGRESS", 0, "BLOCKED")] },
      { id: "REVIEW", tasks: [] },
      { id: "DONE", tasks: [] },
    ];
    expect(resolveDrop(1, "IN_PROGRESS", inProgress)).toEqual({ kind: "none" });
  });

  test("an unknown card or column resolves to nothing", () => {
    expect(resolveDrop(99, "REVIEW", board)).toEqual({ kind: "none" });
    expect(resolveDrop(1, "NOPE", board)).toEqual({ kind: "none" });
  });
});

describe("drop notifications", () => {
  function deps(overrides: Partial<Parameters<typeof performDrop>[1]> = {}) {
    const calls: string[] = [];
    return {
      calls,
      deps: {
        onMoveTask: async (taskId: number, status: TaskStatus) => {
          calls.push(`move:${taskId}:${status}`);
        },
        onReorderTask: async (taskId: number, position: number) => {
          calls.push(`reorder:${taskId}:${position}`);
        },
        toast: (t: { type: string; message: string }) => {
          calls.push(`toast:${t.type}`);
        },
        ...overrides,
      } as Parameters<typeof performDrop>[1],
    };
  }

  test("a move the server accepted is announced only by useBoard", async () => {
    const { calls, deps: d } = deps();
    await performDrop({ kind: "move", taskId: 1, status: "REVIEW", position: 0 }, d);
    expect(calls).toEqual(["move:1:REVIEW"]);
  });

  test("a rejected move is announced only by useBoard", async () => {
    const { calls, deps: d } = deps({
      onMoveTask: async () => {
        throw { error: { message: "Task is blocked" } };
      },
    });
    await performDrop({ kind: "move", taskId: 1, status: "IN_PROGRESS", position: 0 }, d);
    // No toast here: useBoard surfaces the server's message and rolls back.
    expect(calls).toEqual([]);
  });

  test("a rejected reorder is announced only by useBoard", async () => {
    const { calls, deps: d } = deps({
      onReorderTask: async () => {
        throw { error: { message: "Reorder failed" } };
      },
    });
    await performDrop({ kind: "reorder", taskId: 1, position: 2, status: "BACKLOG" }, d);
    expect(calls).toEqual([]);
  });

  test("the board's own refusal is announced once, and no move is sent", async () => {
    const { calls, deps: d } = deps();
    await performDrop({ kind: "blocked" }, d);
    expect(calls).toEqual(["toast:error"]);
  });

  test("a no-op drop neither moves nor speaks", async () => {
    const { calls, deps: d } = deps();
    await performDrop({ kind: "none" }, d);
    expect(calls).toEqual([]);
  });
});

describe("KanbanBoard keyboard access", () => {
  test("cards are reachable by Tab", () => {
    renderBoard();

    // A draggable that cannot be focused is invisible to the keyboard. dnd-kit
    // supplies this via its sortable attributes.
    for (const card of cards()) {
      expect(card.getAttribute("tabindex")).toBe("0");
    }
  });

  // The keyboard drag itself — Space to lift, arrows to move, Space to drop — is
  // deliberately not covered here. dnd-kit measures rects to decide where a
  // keyboard move lands, and happy-dom reports every element as zero-sized, so
  // no drag ever starts; the pointer path is equally silent, and the rendered
  // markup is identical with and without the sensor. A test here would be
  // asserting on a mock of dnd-kit rather than on this board. The move logic is
  // covered directly through resolveDrop and performDrop, which both sensors
  // share; what is untested is dnd-kit's key handling, which wants a real
  // browser.
});
