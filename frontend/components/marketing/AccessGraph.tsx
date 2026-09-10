"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Database, User, Robot } from "@phosphor-icons/react";

type Node = {
  id: string;
  label: string;
  x: number;
  y: number;
  kind: "table" | "person" | "service";
};

const nodes: Node[] = [
  { id: "core", label: "Traceline", x: 240, y: 200, kind: "table" },
  { id: "customers", label: "customers.ssn", x: 96, y: 76, kind: "table" },
  { id: "billing", label: "billing.invoices", x: 384, y: 72, kind: "table" },
  { id: "payouts", label: "payouts.accounts", x: 420, y: 232, kind: "table" },
  { id: "priya", label: "priya.raghunathan", x: 128, y: 336, kind: "person" },
  { id: "svc", label: "svc-reporting", x: 356, y: 340, kind: "service" },
];

const edges = [
  ["core", "customers"],
  ["core", "billing"],
  ["core", "payouts"],
  ["core", "priya"],
  ["core", "svc"],
] as const;

const iconFor = { table: Database, person: User, service: Robot };

// Fill/stroke are set via Tailwind classes (with dark: pairs) rather than
// inline hex, since SVG presentation attributes don't respond to the
// site's dark-mode class the way utility classes do.
export default function AccessGraph() {
  const [hovered, setHovered] = useState<string | null>(null);
  const reduce = useReducedMotion();
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

  return (
    <svg
      viewBox="0 0 480 400"
      className="w-full h-auto"
      role="img"
      aria-label="Diagram of Traceline connecting to database tables and the people and services that access them"
    >
      {edges.map(([a, b], i) => {
        const na = byId[a];
        const nb = byId[b];
        const active = hovered === a || hovered === b;
        return (
          <g key={`${a}-${b}`}>
            <line
              x1={na.x}
              y1={na.y}
              x2={nb.x}
              y2={nb.y}
              strokeWidth={active ? 2 : 1.4}
              className={`transition-colors duration-300 ${
                active ? "stroke-emerald-600 dark:stroke-emerald-400" : "stroke-slate-300 dark:stroke-zinc-700"
              }`}
            />
            {!reduce && (
              <motion.circle
                r={3.5}
                className="fill-emerald-600 dark:fill-emerald-400"
                initial={{ cx: na.x, cy: na.y, opacity: 0 }}
                animate={{
                  opacity: [0, 1, 1, 0],
                  cx: [na.x, nb.x],
                  cy: [na.y, nb.y],
                }}
                transition={{
                  duration: 2.6,
                  delay: i * 0.5,
                  repeat: Infinity,
                  repeatDelay: 2.4,
                  ease: "easeInOut",
                }}
              />
            )}
          </g>
        );
      })}

      {nodes.map((n, i) => {
        const Icon = iconFor[n.kind];
        const isCore = n.id === "core";
        const r = isCore ? 30 : 22;
        return (
          <motion.g
            key={n.id}
            initial={reduce ? false : { opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: reduce ? 0 : i * 0.08 }}
            onMouseEnter={() => setHovered(n.id)}
            onMouseLeave={() => setHovered(null)}
            className="cursor-pointer"
          >
            {isCore && !reduce && (
              <motion.circle
                cx={n.x}
                cy={n.y}
                fill="none"
                strokeWidth={1}
                className="stroke-emerald-600 dark:stroke-emerald-400"
                initial={{ r, opacity: 0.5 }}
                animate={{ r: [r, r + 14], opacity: [0.5, 0] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut" }}
              />
            )}
            <circle
              cx={n.x}
              cy={n.y}
              r={r}
              strokeWidth={hovered === n.id ? 2 : 1.4}
              className={`transition-colors duration-300 ${
                isCore ? "fill-ink dark:fill-zinc-100" : "fill-white dark:fill-zinc-800"
              } ${hovered === n.id ? "stroke-emerald-600 dark:stroke-emerald-400" : "stroke-slate-200 dark:stroke-zinc-700"}`}
            />
            <foreignObject
              x={n.x - 11}
              y={n.y - 11}
              width={22}
              height={22}
              className="pointer-events-none"
            >
              <div className={isCore ? "text-paper dark:text-zinc-900" : "text-slate-600 dark:text-zinc-400"}>
                <Icon size={22} weight={isCore ? "fill" : "regular"} color="currentColor" />
              </div>
            </foreignObject>
            <text
              x={n.x}
              y={n.y + r + 16}
              textAnchor="middle"
              className="fill-slate-500 dark:fill-zinc-500"
              style={{ fontSize: 10, fontFamily: "var(--font-mono, monospace)" }}
            >
              {n.label}
            </text>
          </motion.g>
        );
      })}
    </svg>
  );
}
