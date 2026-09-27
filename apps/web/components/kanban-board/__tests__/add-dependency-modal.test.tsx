import "../../../happydom";
import { describe, test, expect, vi, afterEach } from "bun:test";
import { render, within, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { Task, TaskDependency } from "@repo/types";
import { AddDependencyModal } from "../add-dependency-modal";

afterEach(() => {
  cleanup();
});

function makeTask(id: number, title: string): Task {
  return {
    id,
    projectId: 1,
    title,
    description: null,
    status: "BACKLOG",
    readiness: "READY",
    position: 0,
    duration: 1,
  };
}

const tasks = [makeTask(1, "Design schema"), makeTask(2, "Build API"), makeTask(3, "Write docs")];

const dependency = (prerequisiteTaskId: number, dependentTaskId: number): TaskDependency => ({
  id: prerequisiteTaskId * 100 + dependentTaskId,
  prerequisiteTaskId,
  dependentTaskId,
});

/**
 * Queries are scoped to the rendered tree rather than testing-library's
 * `screen`, which binds to `document.body` at import time — happy-dom has no
 * body until something has rendered.
 */
function open(props: Partial<Parameters<typeof AddDependencyModal>[0]> = {}) {
  const view = render(
    <AddDependencyModal
      tasks={tasks}
      dependencies={[]}
      onClose={() => {}}
      onAdd={async () => {}}
      {...props}
    />,
  );

  const q = within(view.baseElement);
  return {
    q,
    selects: view.baseElement.querySelectorAll("select"),
    submit: q.getByRole("button", { name: "Add Dependency" }) as HTMLButtonElement,
  };
}

describe("AddDependencyModal", () => {
  test("adds the edge with the chosen prerequisite and the chosen dependent", async () => {
    const onAdd = vi.fn(async () => {});
    const { selects, submit } = open({ onAdd });

    fireEvent.change(selects[0]!, { target: { value: "1" } });
    fireEvent.change(selects[1]!, { target: { value: "3" } });
    fireEvent.click(submit);

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith(1, 3);
  });

  test("pre-fills the dependent when the caller knows it", () => {
    const { selects, submit } = open({ defaultDependentTaskId: 2 });

    // Only the prerequisite is still an open question, so the button is live
    // as soon as one is picked.
    expect(selects[1]!.value).toBe("2");
    expect(submit.disabled).toBe(true);

    fireEvent.change(selects[0]!, { target: { value: "1" } });
    expect(submit.disabled).toBe(false);
  });

  test("refuses an edge that already exists", () => {
    const { selects, submit } = open({ dependencies: [dependency(1, 2)] });

    fireEvent.change(selects[0]!, { target: { value: "1" } });
    fireEvent.change(selects[1]!, { target: { value: "2" } });

    // Offering a button that only fails server-side is worse than not offering it.
    expect(submit.disabled).toBe(true);
  });

  test("refuses a task depending on itself", () => {
    const { selects, submit } = open({ defaultDependentTaskId: 2 });

    fireEvent.change(selects[0]!, { target: { value: "2" } });

    expect(submit.disabled).toBe(true);
  });

  test("stays disabled until both sides are chosen", () => {
    const { submit } = open();

    expect(submit.disabled).toBe(true);
  });

  test("shows the engine's reason and keeps the modal open when it refuses", async () => {
    // A cycle is only detectable with the whole graph, which is the server's
    // job, so the message has to survive the trip back.
    const onAdd = vi.fn(async () => {
      throw { error: { code: "CYCLE_DETECTED", message: "That link would create a cycle." } };
    });
    const onClose = vi.fn();
    const { q, selects, submit } = open({ onAdd, onClose });

    fireEvent.change(selects[0]!, { target: { value: "1" } });
    fireEvent.change(selects[1]!, { target: { value: "3" } });
    fireEvent.click(submit);

    expect(onAdd).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(q.getByText("That link would create a cycle.")).toBeDefined());
    // Closing on failure would throw the explanation away with the modal.
    expect(onClose).toHaveBeenCalledTimes(0);
  });

  test("closes after a successful add", async () => {
    const onClose = vi.fn();
    const { selects, submit } = open({ onClose });

    fireEvent.change(selects[0]!, { target: { value: "1" } });
    fireEvent.change(selects[1]!, { target: { value: "3" } });
    fireEvent.click(submit);

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
