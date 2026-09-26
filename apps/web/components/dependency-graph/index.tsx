import { cn } from "@/lib/utils";
import type { Task } from "@repo/types";
import { TaskStatus, ReadinessState } from "@repo/types";

interface DependencyGraphProps {
  tasks: Task[];
  dependencies: Array<{ prerequisiteTaskId: number; dependentTaskId: number }>;
  criticalPath?: number[];
  onNodeClick?: (taskId: number) => void;
}

export function DependencyGraph({ tasks, dependencies, criticalPath = [], onNodeClick }: DependencyGraphProps) {
  // Layered topological layout: compute levels via BFS from roots
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  // Calculate in-degree for topological sort
  const inDegree = new Map<number, number>();
  const outEdges = new Map<number, number[]>();

  tasks.forEach((t) => inDegree.set(t.id, 0));
  dependencies.forEach((d) => {
    inDegree.set(d.dependentTaskId, (inDegree.get(d.dependentTaskId) || 0) + 1);
    if (!outEdges.has(d.prerequisiteTaskId)) outEdges.set(d.prerequisiteTaskId, []);
    outEdges.get(d.prerequisiteTaskId)!.push(d.dependentTaskId);
  });

  // Kahn's algorithm for topological order with levels
  const levels = new Map<number, number>();
  const queue: { taskId: number; level: number }[] = [];

  tasks.forEach((t) => {
    if ((inDegree.get(t.id) || 0) === 0) {
      queue.push({ taskId: t.id, level: 0 });
      levels.set(t.id, 0);
    }
  });

  while (queue.length > 0) {
    const { taskId, level } = queue.shift()!;
    const children = outEdges.get(taskId) || [];
    for (const childId of children) {
      const newLevel = level + 1;
      const existingLevel = levels.get(childId);
      if (existingLevel === undefined || newLevel > existingLevel) {
        levels.set(childId, newLevel);
        queue.push({ taskId: childId, level: newLevel });
      }
    }
  }

  // Assign positions
  const levelGroups = new Map<number, number[]>();
  tasks.forEach((t) => {
    const lvl = levels.get(t.id) || 0;
    if (!levelGroups.has(lvl)) levelGroups.set(lvl, []);
    levelGroups.get(lvl)!.push(t.id);
  });

  const maxLevel = Math.max(...Array.from(levelGroups.keys()), 0);
  const svgWidth = Math.max(levelGroups.size * 200, 400);
  const svgHeight = Math.max(
    Math.max(...Array.from(levelGroups.values()).map((g) => g.length)) * 120 + 80,
    200
  );

  const getPosition = (taskId: number) => {
    const level = levels.get(taskId) || 0;
    const group = levelGroups.get(level) || [];
    const idx = group.indexOf(taskId);
    const x = 60 + level * 180;
    const y = 60 + idx * 120 + 40;
    return { x, y };
  };

  const getNodeColor = (task: Task) => {
    if (task.readiness === "BLOCKED") return "#ea580c";
    if (task.readiness === "READY") return "#059669";
    if (task.status === "DONE") return "#059669";
    if (task.status === "IN_PROGRESS") return "#2563eb";
    if (task.status === "REVIEW") return "#cc785c";
    return "#e6dfd8";
  };

  return (
    <svg
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      className="w-full h-full min-h-[400px]"
      role="img"
      aria-label="Dependency graph showing task relationships and critical path"
    >
      <defs>
        <marker id="arrowhead-graph" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#6c6a64" />
        </marker>
        <marker id="arrowhead-critical" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#7c3aed" />
        </marker>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Edges */}
      {dependencies.map((dep) => {
        const from = getPosition(dep.prerequisiteTaskId);
        const to = getPosition(dep.dependentTaskId);
        const isCritical = criticalPath.includes(dep.prerequisiteTaskId) && criticalPath.includes(dep.dependentTaskId);

        return (
          <path
            key={`${dep.prerequisiteTaskId}-${dep.dependentTaskId}`}
            d={`M${from.x + 50} ${from.y} Q${(from.x + to.x) / 2} ${(from.y + to.y) / 2 - 20}, ${to.x - 50} ${to.y}`}
            stroke={isCritical ? "#7c3aed" : "#e6dfd8"}
            strokeWidth={isCritical ? 2.5 : 1.5}
            fill="none"
            markerEnd={isCritical ? "url(#arrowhead-critical)" : "url(#arrowhead-graph)"}
            className="transition-all duration-300"
          />
        );
      })}

      {/* Nodes */}
      {tasks.map((task) => {
        const pos = getPosition(task.id);
        const isCritical = criticalPath.includes(task.id);
        const nodeColor = getNodeColor(task);

        return (
          <g
            key={task.id}
            className="cursor-pointer transition-all duration-200 hover:scale-105"
            onClick={() => onNodeClick?.(task.id)}
            role="button"
            tabIndex={0}
          >
            {/* Critical path glow */}
            {isCritical && (
              <circle
                cx={pos.x}
                cy={pos.y}
                r={32}
                fill="none"
                stroke="#7c3aed"
                strokeWidth={2}
                opacity={0.3}
                filter="url(#glow)"
              />
            )}

            {/* Node body */}
            <rect
              x={pos.x - 60}
              y={pos.y - 26}
              width={120}
              height={52}
              rx={10}
              fill="#faf9f5"
              stroke={nodeColor}
              strokeWidth={isCritical ? 2.5 : 1.5}
              className="shadow-sm"
            />

            {/* Readiness dot */}
            <circle
              cx={pos.x + 46}
              cy={pos.y - 14}
              r={5}
              fill={nodeColor}
            />

            {/* Label */}
            <text
              x={pos.x}
              y={pos.y + 4}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#141413"
              fontSize="12"
              fontWeight={isCritical ? 600 : 500}
              fontFamily="Inter, sans-serif"
            >
              {task.title.length > 16 ? task.title.slice(0, 16) + "…" : task.title}
            </text>
          </g>
        );
      })}

      {/* Legend */}
      <g transform={`translate(${svgWidth - 160}, ${svgHeight - 60})`}>
        <rect x="0" y="0" width="155" height="50" rx="8" fill="#faf9f5" stroke="#e6dfd8" />
        <text x="10" y="16" fill="#6c6a64" fontSize="10" fontFamily="Inter, sans-serif" fontWeight={500}>
          Readiness:
        </text>
        <circle cx="60" cy="12" r="4" fill="#059669" />
        <text x="70" y="15" fill="#6c6a64" fontSize="10" fontFamily="Inter, sans-serif">Ready</text>
        <circle cx="115" cy="12" r="4" fill="#ea580c" />
        <text x="125" y="15" fill="#6c6a64" fontSize="10" fontFamily="Inter, sans-serif">Blocked</text>
      </g>
    </svg>
  );
}

export function HeroDependencyGraph() {
  // Seeded example for landing page hero
  const seedTasks: Task[] = [
    { id: 1, title: "Design API", status: "DONE", readiness: "READY", position: 1, projectId: 1 },
    { id: 2, title: "Implement API", status: "DONE", readiness: "READY", position: 2, projectId: 1 },
    { id: 3, title: "Write Tests", status: "IN_PROGRESS", readiness: "READY", position: 3, projectId: 1 },
    { id: 4, title: "Deploy", status: "BACKLOG", readiness: "BLOCKED", position: 4, projectId: 1 },
  ];

  const seedDeps = [
    { prerequisiteTaskId: 1, dependentTaskId: 2 },
    { prerequisiteTaskId: 1, dependentTaskId: 3 },
    { prerequisiteTaskId: 2, dependentTaskId: 4 },
    { prerequisiteTaskId: 3, dependentTaskId: 4 },
  ];

  return (
    <div className="bg-surface-soft rounded-xl p-4 border border-hairline max-w-xl mx-auto">
      <DependencyGraph
        tasks={seedTasks}
        dependencies={seedDeps}
        criticalPath={[1, 2, 4]}
      />
    </div>
  );
}