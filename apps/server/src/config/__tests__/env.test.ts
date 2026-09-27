import { describe, test, expect } from "bun:test";
import { resolveJwtExpiresIn } from "../env.js";

describe("resolveJwtExpiresIn", () => {
  test("lasts thirty days by default", () => {
    // There is no refresh token, so this is the entire session. A week was short
    // enough to sign people out of a board they were still working in.
    expect(resolveJwtExpiresIn(undefined)).toBe("30d");
  });

  test("falls back on an empty or blank setting", () => {
    // A variable present but empty is a deployment mistake, not a request for a
    // zero-length session.
    expect(resolveJwtExpiresIn("")).toBe("30d");
    expect(resolveJwtExpiresIn("   ")).toBe("30d");
  });

  test("passes a configured duration through", () => {
    expect(resolveJwtExpiresIn("12h")).toBe("12h");
    expect(resolveJwtExpiresIn("90d")).toBe("90d");
  });

  test("trims surrounding whitespace", () => {
    expect(resolveJwtExpiresIn("  7d  ")).toBe("7d");
  });

  test("passes a number of seconds through", () => {
    expect(resolveJwtExpiresIn("3600")).toBe("3600");
  });
});
