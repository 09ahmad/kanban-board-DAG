import type { ApiResponse, ApiSuccessResponse, ApiErrorResponse } from "@repo/types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";

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

  const data = await response.json();

  if (!response.ok) {
    const error: ApiErrorResponse = {
      success: false,
      error: { code: data.error?.code ?? "UNKNOWN_ERROR", message: data.error?.message ?? "Something went wrong" },
    };
    throw error;
  }

  return { success: true, data: data.data ?? data };
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