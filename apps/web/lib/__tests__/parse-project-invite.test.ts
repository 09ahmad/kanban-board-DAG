import { describe, test, expect } from "bun:test";
import { parseProjectInvite } from "../parse-project-invite";

describe("parseProjectInvite", () => {
  // ── bare IDs ──────────────────────────────────────────────────────────────

  test("a bare positive integer is accepted", () => {
    expect(parseProjectInvite("147")).toBe(147);
  });

  test("leading/trailing whitespace is stripped before parsing", () => {
    expect(parseProjectInvite("  42  ")).toBe(42);
  });

  // ── full URLs ─────────────────────────────────────────────────────────────

  test("a full invite URL returns the numeric ID", () => {
    expect(parseProjectInvite("https://app.example.com/projects/147/invite")).toBe(147);
  });

  test("a project URL without /invite is also accepted", () => {
    expect(parseProjectInvite("https://app.example.com/projects/88")).toBe(88);
  });

  test("a trailing slash after /invite is tolerated", () => {
    expect(parseProjectInvite("https://app.example.com/projects/9/invite/")).toBe(9);
  });

  // ── rejection cases ───────────────────────────────────────────────────────

  test("a negative number is rejected", () => {
    expect(parseProjectInvite("-1")).toBeNull();
  });

  test("zero is rejected", () => {
    expect(parseProjectInvite("0")).toBeNull();
  });

  test("a non-numeric string is rejected", () => {
    expect(parseProjectInvite("abc")).toBeNull();
  });

  test("an empty string is rejected", () => {
    expect(parseProjectInvite("")).toBeNull();
  });

  test("a whitespace-only string is rejected", () => {
    expect(parseProjectInvite("   ")).toBeNull();
  });

  test("an ID embedded mid-path (//projects/1) is rejected", () => {
    // The path does not end with /projects/<id>[/invite], so there is no
    // unambiguous project reference.
    expect(parseProjectInvite("//projects/1")).toBeNull();
  });

  test("a javascript: URL is rejected", () => {
    // Dangerous scheme — must never produce a numeric ID.
    expect(parseProjectInvite("javascript:alert(1)")).toBeNull();
  });

  test("an ID embedded mid-string (not at end of path) is rejected", () => {
    // /projects/3/tasks would match /tasks as the tail, not /invite, so
    // the regex should not fire.
    expect(parseProjectInvite("https://app.example.com/projects/3/tasks")).toBeNull();
  });
});
