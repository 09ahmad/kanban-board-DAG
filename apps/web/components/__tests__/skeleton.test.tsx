import "../../happydom";
import { describe, test, expect, afterEach } from "bun:test";
import { render, within, cleanup } from "@testing-library/react";
import {
  BoardSkeleton,
  GraphSkeleton,
  ProjectListSkeleton,
  TaskDetailSkeleton,
} from "../ui/skeleton";

afterEach(() => {
  cleanup();
});

/**
 * A skeleton that announces nothing is a silent blank page to anyone using a
 * screen reader, so each one has to say what is loading and that it is busy.
 */
const cases = [
  ["ProjectListSkeleton", ProjectListSkeleton, "Loading projects"],
  ["BoardSkeleton", BoardSkeleton, "Loading board"],
  ["TaskDetailSkeleton", TaskDetailSkeleton, "Loading task"],
  ["GraphSkeleton", GraphSkeleton, "Loading project"],
] as const;

describe("loading skeletons", () => {
  for (const [name, Component, label] of cases) {
    test(`${name} announces what it is standing in for`, () => {
      const view = render(<Component />);
      const q = within(view.baseElement);

      const status = q.getByRole("status");
      expect(status.getAttribute("aria-label")).toBe(label);
      // Busy matters as much as the label: it is what stops a screen reader
      // from treating the placeholder as the finished content.
      expect(status.getAttribute("aria-busy")).toBe("true");
    });

    test(`${name} reserves the space it will fill`, () => {
      const view = render(<Component />);
      const status = within(view.baseElement).getByRole("status");

      // Placeholders, not a single centred line of text: the point is that the
      // page does not jump when the real content lands.
      expect(status.children.length).toBeGreaterThan(0);
      expect(view.baseElement.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    });
  }

  test("the board stands in for all four columns, since the real board has four", () => {
    const view = render(<BoardSkeleton />);
    const text = view.baseElement.textContent ?? "";

    for (const column of ["Backlog", "In progress", "Review", "Done"]) {
      expect(text).toContain(column);
    }
  });
});
