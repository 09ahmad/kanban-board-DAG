"use client";

import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode, useContext } from "react";
import { apiClient, unwrapResponse } from "@/lib/api-client";

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
      const res = await apiClient<User>("/auth/me");
      setUser(unwrapResponse(res));
    } catch {
      localStorage.removeItem("jwt_token");
      setUser(null);
      setToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

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
