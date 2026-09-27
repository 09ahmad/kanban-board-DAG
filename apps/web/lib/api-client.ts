import type { ApiResponse, ApiSuccessResponse, ApiErrorResponse } from "@repo/types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";

/**
 * Fallbacks for responses that do not carry our envelope. A 401 can come from
 * something that is not this API — a proxy, a gateway, the Next rewrite — and a
 * 502 from a crashed upstream will be HTML. Without these, the user sees a JSON
 * parse error instead of what actually happened.
 *
 * The codes are the ones the backend really throws; see apps/web/CLAUDE.md.
 */
const CODE_BY_STATUS: Record<number, string> = {
  400: "VALIDATION_ERROR",
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
};

const MESSAGE_BY_STATUS: Record<number, string> = {
  401: "Your session has expired. Sign in again.",
  403: "You do not have access to that.",
  404: "We could not find that.",
  409: "That conflicts with something already there.",
};

const SERVER_ERROR_MESSAGE = "The server could not complete the request. Try again.";

const AUTH_PATHS = ["/login", "/register"];

function onAuthPage(): boolean {
  if (typeof window === "undefined") return true;
  return AUTH_PATHS.some((path) => window.location.pathname.startsWith(path));
}

/**
 * Read a body that may be absent, empty, or not JSON at all. Never throws: the
 * caller decides what an unreadable body means.
 */
async function readBody(response: Response): Promise<Record<string, unknown> | null> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    return null;
  }
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const apiClient = async <T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("jwt_token") : null;

  const headers = new Headers(options.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const body = await readBody(response);

  if (!response.ok) {
    // Handle the expired session from the status alone. This used to sit behind
    // a body parse, so an unparseable 401 left the dead token in place and
    // stranded the user on a broken page instead of sending them to sign in.
    if (response.status === 401 && !onAuthPage()) {
      localStorage.removeItem("jwt_token");
      window.location.href = "/login";
    }

    const envelope = body?.error as { code?: string; message?: string } | undefined;
    const error: ApiErrorResponse = {
      success: false,
      error: {
        code: envelope?.code ?? CODE_BY_STATUS[response.status] ?? "UNKNOWN_ERROR",
        message:
          envelope?.message ??
          MESSAGE_BY_STATUS[response.status] ??
          (response.status >= 500 ? SERVER_ERROR_MESSAGE : "Something went wrong"),
      },
    };
    throw error;
  }

  return { success: true, data: (body?.data ?? body) as T };
};

export type { ApiResponse, ApiSuccessResponse, ApiErrorResponse };

/**
 * Unwrap successful API response
 */
export function unwrapResponse<T>(res: ApiResponse<T>): T {
  if (!res.success) {
    throw res.error;
  }
  return res.data;
}

/**
 * Check if response is an error
 */
export function isErrorResponse<T>(res: ApiResponse<T>): res is ApiErrorResponse {
  return !res.success;
}

export { apiClient };