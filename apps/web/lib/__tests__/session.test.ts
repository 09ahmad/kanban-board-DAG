import { describe, test, expect } from "bun:test";
import { isExpired, needsRefresh, REFRESH_WINDOW_MS } from "../session";

/** A token with the given expiry, built the way a real one is shaped. */
function tokenExpiringAt(expSeconds: number): string {
  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ userId: 1, exp: expSeconds })}.sig`;
}

const NOW = 1_700_000_000_000; // fixed clock, so nothing depends on the real one
const inSeconds = (s: number) => NOW / 1000 + s;

describe("needsRefresh", () => {
  test("leaves a fresh token alone", () => {
    // 30 days left is well outside the window: a visit should not cost a request.
    expect(needsRefresh(tokenExpiringAt(inSeconds(30 * 24 * 3600)), NOW)).toBe(false);
  });

  test("asks once the token is inside the window", () => {
    expect(needsRefresh(tokenExpiringAt(inSeconds(6 * 24 * 3600)), NOW)).toBe(true);
  });

  test("the boundary is where the window opens, not before it", () => {
    // Exactly a window away is still fine; one second past it and the token is
    // inside the window. An off-by-one here would either refresh on every visit
    // or leave a session to lapse while the browser sits open.
    const atBoundary = tokenExpiringAt(NOW / 1000 + REFRESH_WINDOW_MS / 1000);
    expect(needsRefresh(atBoundary, NOW)).toBe(false);
    expect(needsRefresh(atBoundary, NOW + 1000)).toBe(true);
  });

  test("asks about a token it cannot read", () => {
    // Better to ask and be told no than to assume the session is fine.
    expect(needsRefresh("not-a-jwt", NOW)).toBe(true);
    expect(needsRefresh("a.b", NOW)).toBe(true);
  });

  test("asks about a token with no expiry claim", () => {
    const encode = (o: unknown) => btoa(JSON.stringify(o));
    expect(needsRefresh(`${encode({ alg: "HS256" })}.${encode({ userId: 1 })}.sig`, NOW)).toBe(true);
  });
});

describe("isExpired", () => {
  test("a token with time left is not expired", () => {
    expect(isExpired(tokenExpiringAt(inSeconds(60)), NOW)).toBe(false);
  });

  test("a token past its expiry is expired", () => {
    // The server will refuse to extend this, so there is no point asking.
    expect(isExpired(tokenExpiringAt(inSeconds(-1)), NOW)).toBe(true);
  });

  test("an unreadable token counts as expired", () => {
    expect(isExpired("garbage", NOW)).toBe(true);
  });
});
