"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push("/projects");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas">
        <header className="h-[64px] bg-canvas border-b border-hairline sticky top-0 z-40">
          <div className="max-w-[1200px] mx-auto h-full px-6 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 font-display text-xl text-ink">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              <span>TaskFlow Pro</span>
            </Link>
            <nav className="flex items-center gap-6">
              <Link href="/login" className="nav-link text-body">
                Log in
              </Link>
              <Link href="/register" className="btn-primary">
                Get started
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex items-center justify-center h-[calc(100vh-64px)]">
          <p className="text-muted text-[16px]">Loading…</p>
        </main>
      </div>
    );
  }

  if (user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-canvas">
      {/* Top Navigation */}
      <header className="h-[64px] bg-canvas border-b border-hairline sticky top-0 z-40">
        <div className="max-w-[1200px] mx-auto h-full px-6 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-display text-xl text-ink">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            <span>TaskFlow Pro</span>
          </Link>

          <nav className="flex items-center gap-6">
            <Link href="/login" className="nav-link text-body">
              Log in
            </Link>
            <Link href="/register" className="btn-primary">
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero Band — Real dependency graph as illustration */}
        <section className="max-w-[1200px] mx-auto px-6 py-[96px]">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h1 className="font-display text-[48px] leading-[1.1] tracking-tight text-ink mb-6">
                Readiness is derived. Not set.
              </h1>
              <p className="text-body text-[18px] leading-[1.6] mb-8 max-w-lg">
                TaskFlow Pro separates workflow state from dependency state.
                Move tasks on the board. The DAG engine computes what's ready,
                what's blocked, and the critical path — automatically.
              </p>
              <div className="flex gap-4">
                <Link href="/register" className="btn-primary">
                  Start free
                </Link>
                <Link href="/login" className="btn-secondary">
                  Sign in
                </Link>
              </div>
            </div>

            {/* Hero Graph — Seeded dependency visualization */}
            <div className="relative" aria-label="Example dependency graph">
              <HeroGraph />
            </div>
          </div>
        </section>

        {/* Feature Bands — Grounded in product differentiation */}
        <section className="bg-surface-soft py-[96px]">
          <div className="max-w-[1200px] mx-auto px-6">
            <div className="grid md:grid-cols-3 gap-8">
              <FeatureCard
                title="Readiness as derived state"
                description="Tasks are READY only when all prerequisites are DONE. BLOCKED is computed, not chosen. No more manual status gymnastics."
                icon={
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                }
              />
              <FeatureCard
                title="No-compounding schedule shifts"
                description="Diamond graphs propagate changes once. If A shifts +3 days, D moves +3 — never +6. The finish-to-start scheduler guarantees it."
                icon={
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <path d="M9 12h6" />
                    <path d="M12 9v6" />
                  </svg>
                }
              />
              <FeatureCard
                title="AI-suggested dependencies with approval"
                description="Generate missing edges from task descriptions. Every suggestion requires explicit accept/reject — same validation as manual creation."
                icon={
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary">
                    <path d="M12 2a10 10 0 1 0 10 10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                }
              />
            </div>
          </div>
        </section>

        {/* CTA Band */}
        <section className="py-[96px]">
          <div className="max-w-[1200px] mx-auto px-6">
            <div className="rounded-xl p-12 md:p-16 text-center bg-primary text-on-primary">
              <h2 className="font-display text-[28px] leading-[1.2] mb-4">
                Ready to manage dependencies, not just cards?
              </h2>
              <p className="text-on-primary/80 text-[18px] mb-8 max-w-2xl mx-auto">
                Create your first project and experience a Kanban where readiness is computed,
                schedules don't compound, and AI suggests edges you might have missed.
              </p>
              <Link href="/register" className="inline-flex items-center justify-center gap-2 bg-canvas text-primary font-medium text-[14px] rounded-md px-5 py-[12px] h-[40px] hover:bg-surface-soft transition-colors">
                Create your first project
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-surface-dark text-on-dark-soft py-[64px]">
        <div className="max-w-[1200px] mx-auto px-6 text-center">
          <p className="font-body text-[14px]">TaskFlow Pro — Built for the hackathon</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="card p-8">
      <div className="w-10 h-10 mb-4">{icon}</div>
      <h3 className="font-display text-[18px] leading-[1.4] text-ink mb-2">{title}</h3>
      <p className="text-body text-[16px] leading-[1.55]">{description}</p>
    </div>
  );
}

function HeroGraph() {
  // Seeded example: Backend API → Integration Tests → Deploy
  //                         → Documentation → Deploy
  // Diamond shape: A → B, A → C, B → D, C → D
  const nodes = [
    { id: 1, x: 80, y: 60, label: "Design API", readiness: "READY" as const, critical: true },
    { id: 2, x: 240, y: 60, label: "Implement API", readiness: "DONE" as const, critical: true },
    { id: 3, x: 240, y: 200, label: "Write Tests", readiness: "IN_PROGRESS" as const, critical: false },
    { id: 4, x: 400, y: 130, label: "Deploy", readiness: "BLOCKED" as const, critical: true },
  ];

  const edges = [
    { from: 1, to: 2, critical: true },
    { from: 1, to: 3, critical: false },
    { from: 2, to: 4, critical: true },
    { from: 3, to: 4, critical: true },
  ];

  const getNode = (id: number) => nodes.find(n => n.id === id)!;

  return (
    <svg
      viewBox="0 0 480 260"
      className="w-full h-[320px] max-w-[480px] mx-auto"
      role="img"
      aria-label="Example dependency graph showing Design API → Implement API → Deploy and Design API → Write Tests → Deploy"
    >
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="currentColor" />
        </marker>
        <linearGradient id="criticalGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>

      {/* Edges */}
      {edges.map((edge) => {
        const from = getNode(edge.from);
        const to = getNode(edge.to);
        const cx = (from.x + to.x) / 2;
        const cy = (from.y + to.y) / 2;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        const midX = from.x + dx * 0.5;
        const midY = from.y + dy * 0.5;
        const ctrlX = midX - dy * 0.2;
        const ctrlY = midY + dx * 0.2;

        return (
          <g key={`${edge.from}-${edge.to}`}>
            <path
              d={`M${from.x} ${from.y} Q${ctrlX} ${ctrlY} ${to.x} ${to.y}`}
              stroke={edge.critical ? "url(#criticalGrad)" : "#e6dfd8"}
              strokeWidth={edge.critical ? 3 : 1.5}
              fill="none"
              markerEnd="url(#arrowhead)"
              className="transition-all duration-300"
            />
          </g>
        );
      })}

      {/* Nodes */}
      {nodes.map((node) => (
        <g key={node.id} className="transition-all duration-200">
          {/* Outer glow for critical path */}
          {node.critical && (
            <circle
              cx={node.x}
              cy={node.y}
              r={42}
              fill="none"
              stroke="#7c3aed"
              strokeWidth={2}
              strokeDasharray="8 4"
              opacity={0.4}
            />
          )}
          {/* Node body */}
          <rect
            x={node.x - 70}
            y={node.y - 28}
            width={140}
            height={56}
            rx={12}
            fill={
              node.readiness === "DONE" ? "#efe9de" :
              node.readiness === "BLOCKED" ? "#fff0eb" :
              node.readiness === "IN_PROGRESS" ? "#eef2ff" :
              "#efe9de"
            }
            stroke={
              node.readiness === "BLOCKED" ? "#ea580c" :
              node.readiness === "DONE" ? "#059669" :
              node.readiness === "IN_PROGRESS" ? "#2563eb" :
              "#e6dfd8"
            }
            strokeWidth={node.critical ? 2.5 : 1.5}
            className="shadow-sm"
          />
          {/* Readiness indicator */}
          <circle
            cx={node.x + 55}
            cy={node.y - 16}
            r={6}
            fill={
              node.readiness === "DONE" ? "#059669" :
              node.readiness === "BLOCKED" ? "#ea580c" :
              node.readiness === "IN_PROGRESS" ? "#2563eb" :
              "#5db872"
            }
          />
          {/* Label */}
          <text
            x={node.x}
            y={node.y + 4}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#141413"
            fontFamily="Inter, sans-serif"
            fontSize="13"
            fontWeight={node.critical ? 600 : 500}
            className="font-body"
          >
            {node.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
