import "../../happydom";
import { describe, test, expect, vi, afterEach } from "bun:test";
import { render, within, cleanup, fireEvent } from "@testing-library/react";
import { ConfirmDialog } from "../confirm-dialog";

afterEach(() => {
  cleanup();
});

/**
 * `screen` is not used anywhere below: @testing-library/dom binds it to
 * `document.body` while its module loads, and happy-dom has no body until
 * something has been rendered. Scoping queries to the rendered tree works
 * around that without pretending the problem is not there.
 */
function open(overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const view = render(
    <ConfirmDialog
      open
      title="Delete this task?"
      body="This cannot be undone."
      confirmLabel="Delete task"
      onConfirm={() => {}}
      onCancel={() => {}}
      {...overrides}
    />,
  );

  return { view, q: within(view.baseElement) };
}

describe("ConfirmDialog", () => {
  test("is not in the document while closed", () => {
    const { q } = open({ open: false });

    expect(q.queryByRole("alertdialog")).toBeNull();
    expect(q.queryByRole("button", { name: "Delete task" })).toBeNull();
  });

  test("states the consequence and names the action", () => {
    const { q } = open();

    expect(q.getByRole("alertdialog")).toBeDefined();
    expect(q.getByText("Delete this task?")).toBeDefined();
    expect(q.getByText("This cannot be undone.")).toBeDefined();
    // The button says the same thing as the confirmation, not just "OK".
    expect(q.getByRole("button", { name: "Delete task" })).toBeDefined();
  });

  test("confirms only when asked", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { q } = open({ onConfirm, onCancel });

    fireEvent.click(q.getByRole("button", { name: "Delete task" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(0);
  });

  test("cancels without confirming", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { q } = open({ onConfirm, onCancel });

    fireEvent.click(q.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(0);
  });

  test("escape backs out", () => {
    const onCancel = vi.fn();
    open({ onCancel });

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test("clicking away backs out, clicking the panel does not", () => {
    const onCancel = vi.fn();
    const { q } = open({ onCancel });
    const panel = q.getByRole("alertdialog");

    fireEvent.click(panel);
    expect(onCancel).toHaveBeenCalledTimes(0);

    fireEvent.click(panel.parentElement!);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test("cannot be confirmed twice while the delete is in flight", () => {
    const onConfirm = vi.fn();
    const { q } = open({ busy: true, onConfirm });

    const confirm = q.getByRole("button", { name: "Deleting…" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect((q.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(0);
  });
});
