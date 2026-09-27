import "../../../happydom";
import { describe, test, expect, afterEach, beforeEach } from "bun:test";
import { render, within, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { DependencyList } from "../dependency-list";
import type { Task, TaskDependency } from "@repo/types";

afterEach(() => {
  cleanup();
});

/**
 * `screen` is avoided throughout, as elsewhere in this suite: it binds to
 * `document.body` at import time and happy-dom has no body until a render.
 */
function setup(dependent: Partial<Task> = {}) {
  const tasks: Task[] = [
    { id: 1, title: "Design the schema", status: "DONE", readiness: "READY" } as Task,
    {
      id: 2,
      title: "Build the API",
      status: "BACKLOG",
      readiness: "BLOCKED",
      ...dependent,
    } as Task,
  ];
  const dependencies: TaskDependency[] = [
    { id: 10, projectId: 1, prerequisiteTaskId: 1, dependentTaskId: 2 } as TaskDependency,
  ];

  const removed: number[] = [];
  // No ToastProvider: the toaster is not what this suite is about, and standing
  // it up here would couple the test to whichever version of the module another
  // suite happened to load first.
  const view = render(
    <DependencyList
      tasks={tasks}
      dependencies={dependencies}
      onDelete={async (id) => {
        removed.push(id);
      }}
      onAdd={() => {}}
      onClose={() => {}}
    />,
  );

  return { view, q: within(view.baseElement), removed };
}

/** The trash button in the only dependency row. */
function deleteButton(q: ReturnType<typeof within>) {
  const buttons = q.queryAllByRole("button") as HTMLElement[];
  const trash = buttons.find((b) => b.querySelector("path[d^='M3 6h18']"));
  if (!trash) throw new Error("delete button not found");
  return trash;
}

describe("DependencyList removal confirmation", () => {
  test("removing an edge does not delete it on the first click", () => {
    const { q, removed } = setup();

    fireEvent.click(deleteButton(q));

    // The whole point: nothing is gone until the question is answered.
    expect(removed).toEqual([]);
    expect(q.queryByRole("alertdialog")).not.toBeNull();
  });

  test("asks first, and says what becomes unblocked", () => {
    const { q } = setup();

    fireEvent.click(deleteButton(q));

    expect(q.getByText("Remove this dependency?")).toBeDefined();
    expect(q.getByText(/will unblock it/)).toBeDefined();
  });

  test("confirms and then removes the edge", async () => {
    const { q, removed } = setup();

    fireEvent.click(deleteButton(q));
    fireEvent.click(q.getByRole("button", { name: "Remove dependency" }));

    await waitFor(() => expect(removed).toEqual([10]));
  });

  test("cancelling leaves the edge alone", () => {
    const { q, removed } = setup();

    fireEvent.click(deleteButton(q));
    fireEvent.click(q.getByRole("button", { name: "Cancel" }));

    expect(removed).toEqual([]);
    expect(q.queryByRole("alertdialog")).toBeNull();
  });

  test("a done dependent is told its history is kept, not that it can start", () => {
    const { q } = setup({ status: "DONE", readiness: "READY" });

    fireEvent.click(deleteButton(q));

    // Telling someone a finished task "can start whenever it is clear" would be
    // nonsense, so the copy branches on status.
    expect(q.getByText(/Its history is kept/)).toBeDefined();
  });

  test("a ready dependent is told the order is lifted", () => {
    const { q } = setup({ status: "BACKLOG", readiness: "READY" });

    fireEvent.click(deleteButton(q));

    expect(q.getByText(/no longer held back/)).toBeDefined();
    expect(q.queryByText(/will unblock it/)).toBeNull();
  });

  test("names both tasks, so the edge is identifiable", () => {
    const { q } = setup();

    fireEvent.click(deleteButton(q));

    // Scoped to the dialog: the same titles also appear in the list behind it,
    // and it is the dialog's wording that has to identify the edge.
    const dialog = within(q.getByRole("alertdialog"));
    expect(dialog.getByText(/Design the schema/)).toBeDefined();
    expect(dialog.getByText(/Build the API/)).toBeDefined();
  });
});
