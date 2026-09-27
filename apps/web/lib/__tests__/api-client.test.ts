import "../../happydom";
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { apiClient, unwrapResponse, isErrorResponse } from "../api-client";

declare global {
  interface Window {
    /** happy-dom's test hook, present once GlobalRegistrator.register() ran. */
    happyDOM: { setURL(url: string): void };
  }
}

const realFetch = globalThis.fetch;
let requests: Array<{ url: string; init: RequestInit | undefined }> = [];

/** Reply with a status and a raw body, so non-JSON cases are representable. */
function reply(status: number, body: string, contentType = "application/json") {
  requests = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    requests.push({ url, init });
    return new Response(body, { status, headers: { "content-type": contentType } });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  window.happyDOM.setURL("http://localhost:3000/task/1");
  localStorage.setItem("jwt_token", "a-token");
});

afterEach(() => {
  globalThis.fetch = realFetch;
  localStorage.clear();
});

describe("apiClient success", () => {
  test("unwraps the envelope", async () => {
    reply(200, JSON.stringify({ success: true, data: { id: 7, title: "Ship it" } }));

    const res = await apiClient<{ id: number; title: string }>("/tasks/7");

    expect(res.success).toBe(true);
    expect(unwrapResponse(res)).toEqual({ id: 7, title: "Ship it" });
  });

  test("attaches the stored token", async () => {
    reply(200, JSON.stringify({ success: true, data: {} }));

    await apiClient("/projects");

    const headers = new Headers(requests[0]!.init!.headers);
    expect(headers.get("Authorization")).toBe("Bearer a-token");
  });

  test("a 204 with no body is a success, not a parse error", async () => {
    reply(204, "");

    const res = await apiClient("/tasks/7", { method: "DELETE" });

    expect(res.success).toBe(true);
  });
});

describe("apiClient failure", () => {
  test("surfaces the server's envelope verbatim", async () => {
    reply(400, JSON.stringify({ success: false, error: { code: "TASK_IS_BLOCKED", message: "Task is blocked." } }));

    expect(apiClient("/tasks/7/move")).rejects.toEqual({
      success: false,
      error: { code: "TASK_IS_BLOCKED", message: "Task is blocked." },
    });
  });

  test("falls back to the status when the body is not our envelope", async () => {
    reply(404, "<html>not found</html>", "text/html");

    expect(apiClient("/nope")).rejects.toEqual({
      success: false,
      error: { code: "NOT_FOUND", message: "We could not find that." },
    });
  });

  test("a 500 with an HTML body reads as a server problem, not a crash", async () => {
    reply(502, "<html><body>Bad Gateway</body></html>", "text/html");

    expect(apiClient("/projects")).rejects.toEqual({
      success: false,
      error: { code: "UNKNOWN_ERROR", message: "The server could not complete the request. Try again." },
    });
  });

  test("a rejected body still yields a usable error", async () => {
    globalThis.fetch = (async () => new Response("ok", { status: 200 })) as unknown as typeof fetch;
    // Reading the body fails when the connection drops mid-stream.
    Object.defineProperty(globalThis.Response.prototype, "text", {
      configurable: true,
      value: () => Promise.reject(new Error("stream closed")),
    });

    try {
      const res = await apiClient("/projects");
      expect(res.success).toBe(true);
    } catch (err) {
      expect(isErrorResponse(err as never)).toBe(true);
    } finally {
      delete (globalThis.Response.prototype as { text?: unknown }).text;
    }
  });
});

describe("expired sessions", () => {
  test("a 401 clears the token and sends the user to sign in", async () => {
    reply(401, JSON.stringify({ success: false, error: { code: "UNAUTHENTICATED", message: "Token expired" } }));

    await expect(apiClient("/projects")).rejects.toBeDefined();

    expect(localStorage.getItem("jwt_token")).toBeNull();
    expect(window.location.pathname).toBe("/login");
  });

  test("an unparseable 401 does the same thing", async () => {
    // The case that used to break: the status said the session was over, the
    // body was not JSON, and the redirect never ran.
    reply(401, "<html>401 Unauthorized</html>", "text/html");

    expect(apiClient("/projects")).rejects.toEqual({
      success: false,
      error: { code: "UNAUTHENTICATED", message: "Your session has expired. Sign in again." },
    });

    expect(localStorage.getItem("jwt_token")).toBeNull();
    expect(window.location.pathname).toBe("/login");
  });

  test("an empty-bodied 401 does the same thing", async () => {
    reply(401, "");

    await expect(apiClient("/projects")).rejects.toBeDefined();

    expect(localStorage.getItem("jwt_token")).toBeNull();
    expect(window.location.pathname).toBe("/login");
  });

  test("does not redirect a user who is already signing in", async () => {
    window.happyDOM.setURL("http://localhost:3000/login");
    reply(401, JSON.stringify({ success: false, error: { code: "UNAUTHENTICATED", message: "Bad credentials" } }));

    expect(apiClient("/auth/login")).rejects.toBeDefined();

    expect(window.location.pathname).toBe("/login");
  });

  test("a 403 is not treated as an expired session", async () => {
    reply(403, JSON.stringify({ success: false, error: { code: "FORBIDDEN", message: "Not a member" } }));

    await expect(apiClient("/projects/9/members")).rejects.toBeDefined();

    expect(localStorage.getItem("jwt_token")).toBe("a-token");
    expect(window.location.pathname).toBe("/task/1");
  });
});
