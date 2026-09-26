"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

export default function RegisterPage() {
  const { register, loading } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await register(name, email, password);
      router.push("/");
    } catch (err: any) {
      setError(err?.error?.message ?? "Registration failed");
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
          <h1 className="font-display text-[32px] leading-[1.2] text-ink mb-2">Create account</h1>
          <p className="text-body text-[16px]">
            Get started with TaskFlow Pro — where readiness is derived, not set.
          </p>
        </div>

        {error && (
          <div className="bg-error/10 border border-error/20 rounded-lg p-4 text-error">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-ink mb-1">
              Full name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input w-full"
              placeholder="Your full name"
              autoFocus
            />
          </div>

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
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-ink mb-1">
              Password
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input w-full"
              placeholder="••••••••"
            />
          </div>

          <div className="flex items-center justify-between">
            <Button type="submit" disabled={loading} className="w-full md:w-auto">
              {loading ? "Creating account…" : "Create account"}
            </Button>
          </div>
        </form>

        <p className="text-center text-[14px]">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}