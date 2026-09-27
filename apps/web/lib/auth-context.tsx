"use client";

import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode, useContext } from "react";
import { apiClient, unwrapResponse } from "@/lib/api-client";
import { isExpired, needsRefresh } from "@/lib/session";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

interface User {
  id: number;
  email: string;
  name: string;
  createdAt?: string;
}

interface AuthResponse {
  user: User;
  token: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * Trade a token that is close to lapsing for a fresh one, while it is still
   * good enough for the server to accept.
   *
   * This is a sliding session, not a refresh token: nothing is stored beyond the
   * one token, nothing is revoked, and a session that has already lapsed cannot
   * be revived here. What it buys is that someone using the board all week is not
   * signed out on Friday because the login was issued on Monday.
   */
  const extendSession = useCallback(async (current: string): Promise<string> => {
    try {
      const res = await apiClient<AuthResponse>("/auth/refresh", {
        method: "POST",
        headers: { Authorization: `Bearer ${current}` },
      });
      const { token: renewed } = unwrapResponse(res);
      localStorage.setItem("jwt_token", renewed);
      return renewed;
    } catch {
      // The server refused, so this session is finished. Leave the stored token
      // alone and let the caller's own error handling decide what that means.
      return current;
    }
  }, []);

  const refreshMe = useCallback(async () => {
    const t = typeof window !== "undefined" ? localStorage.getItem("jwt_token") : null;
    if (!t) {
      setUser(null);
      setToken(null);
      setLoading(false);
      return;
    }
    setToken(t);
    try {
      // Nothing to extend if it has already lapsed; go straight to finding out
      // whether the session is gone, which is one request either way.
      const live = isExpired(t) ? t : needsRefresh(t) ? await extendSession(t) : t;
      setToken(live);
      const res = await apiClient<User>("/auth/me");
      setUser(unwrapResponse(res));
    } catch {
      localStorage.removeItem("jwt_token");
      setUser(null);
      setToken(null);
    } finally {
      setLoading(false);
    }
  }, [extendSession]);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  useEffect(() => {
    if (!token || typeof document === "undefined") return;

    /**
     * A tab left open overnight is the case sliding sessions exist for: the
     * token was fine when the page loaded and is not by the time someone comes
     * back to it. `visibilitychange` catches that without polling, and without a
     * request on every page the user never returns to.
     */
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (isExpired(token) || !needsRefresh(token)) return;
      void extendSession(token).then(setToken);
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [token, extendSession]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiClient<AuthResponse>("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const { token, user } = unwrapResponse(res);
    localStorage.setItem("jwt_token", token);
    setToken(token);
    setUser(user);
  }, [refreshMe]);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const res = await apiClient<AuthResponse>("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const { token, user } = unwrapResponse(res);
    localStorage.setItem("jwt_token", token);
    setToken(token);
    setUser(user);
  }, [refreshMe]);

  const logout = useCallback(async () => {
    try {
      await apiClient("/auth/logout", { method: "POST" });
    } catch {
      // Ignore errors, still clear local state
    }
    localStorage.removeItem("jwt_token");
    setUser(null);
    setToken(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, token, loading, login, register, logout, refreshMe }),
    [user, token, loading, login, register, logout, refreshMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
