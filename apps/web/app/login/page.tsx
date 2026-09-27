"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

const DEMO_ACCOUNTS = [
  { name: "Alice", email: "alice@example.com", password: "alice123", note: "owns Website Redesign" },
  { name: "Bob", email: "bob@example.com", password: "bob123", note: "owns Mobile App" },
  { name: "Charlie", email: "charlie@example.com", password: "charlie123", note: "member only" },
];

export default function LoginPage() {
  const { login, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login(email, password);
      router.push("/projects");
    } catch (err: any) {
      setError(err?.error?.message ?? "Login failed");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas">
      <div className="w-full max-w-md space-y-6 p-6">
        <div className="text-center">
          <Link href="/" className="flex items-center gap-2 mb-6">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            <span className="font-display text-xl">TaskFlow Pro</span>
          </Link>
          <h1 className="font-display text-[32px] leading-[1.2] text-ink mb-2">Sign in</h1>
          <p className="text-body text-[16px]">Welcome back. Please sign in to continue.</p>
        </div>

        {error && (
          <div className="bg-error/10 border border-error/20 rounded-lg p-4 text-error">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-ink mb-1">
              Email address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input w-full"
              placeholder="you@example.com"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-ink mb-1">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input w-full"
              placeholder="••••••••"
            />
          </div>

          <div className="flex items-center justify-between">
            <Button type="submit" disabled={loading} className="w-full md:w-auto">
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </div>
        </form>

        <div className="space-y-2">
          <p className="text-[13px] text-muted">
            Seeded accounts &mdash; pick one to fill the form.
          </p>
          <ul className="space-y-1.5">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email}>
                <button
                  type="button"
                  onClick={() => {
                    setEmail(account.email);
                    setPassword(account.password);
                    setError(null);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-md border border-hairline bg-surface-soft hover:border-primary/30 text-left"
                >
                  <span className="font-medium text-[14px] text-ink">{account.name}</span>
                  <span className="flex-1 truncate text-[13px] text-muted">{account.email}</span>
                  <span className="text-[12px] text-muted">{account.note}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-center text-[14px]">
          Don't have an account?{" "}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}