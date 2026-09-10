"use client";

import { LineageGraph as LineageGraphData } from "@/lib/api-client";

const COLUMN_X = { pipeline: 90, table: 460, actor: 830 };
const NODE_W = { pipeline: 150, table: 170, actor: 150 };
const NODE_H = 44;
const TOP_MARGIN = 40;
const ROW_GAP = 64;

const TAG_COLOR: Record<string, string> = {
  pii: "#dc2626",
  financial: "#d97706",
  public: "#64748b",
};

function layout(count: number) {
  return Array.from({ length: count }, (_, i) => TOP_MARGIN + i * ROW_GAP);
}

export default function LineageGraph({ graph }: { graph: LineageGraphData }) {
  const pipelineY = new Map(graph.pipelines.map((p, i) => [p.id, layout(graph.pipelines.length)[i]]));
  const tableY = new Map(graph.tables.map((t, i) => [t.id, layout(graph.tables.length)[i]]));
  const actorY = new Map(graph.actors.map((a, i) => [a.identifier, layout(graph.actors.length)[i]]));

  const rowCounts = [graph.pipelines.length, graph.tables.length, graph.actors.length];
  const height = Math.max(TOP_MARGIN * 2, Math.max(...rowCounts, 1) * ROW_GAP + TOP_MARGIN);

  if (graph.pipelines.length === 0 && graph.tables.length === 0) {
    return <p className="text-sm text-slate-400">Nothing to draw yet -- connect a data source first.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <svg width={COLUMN_X.actor + NODE_W.actor + 40} height={height + 40} className="min-w-[900px]">
        <defs>
          <marker id="arrow-declared" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#334155" />
          </marker>
          <marker id="arrow-observed" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#94a3b8" />
          </marker>
        </defs>

        {/* Column headers */}
        <text x={COLUMN_X.pipeline} y={16} className="fill-slate-400 text-[11px] font-semibold uppercase tracking-wide">
          Pipelines
        </text>
        <text x={COLUMN_X.table} y={16} className="fill-slate-400 text-[11px] font-semibold uppercase tracking-wide">
          Tables
        </text>
        <text x={COLUMN_X.actor} y={16} className="fill-slate-400 text-[11px] font-semibold uppercase tracking-wide">
          Actors (observed)
        </text>

        {/* Declared pipeline -> table edges */}
        {graph.pipeline_edges.map((e, i) => {
          const y1 = (pipelineY.get(e.pipeline_id) ?? 0) + NODE_H / 2;
          const y2 = (tableY.get(e.table_id) ?? 0) + NODE_H / 2;
          const x1 = COLUMN_X.pipeline + NODE_W.pipeline;
          const x2 = COLUMN_X.table;
          const midX = (x1 + x2) / 2;
          return (
            <path
              key={`pe-${i}`}
              d={`M${x1},${y1} C${midX},${y1} ${midX},${y2} ${x2},${y2}`}
              stroke="#334155"
              strokeWidth={1.5}
              fill="none"
              markerEnd="url(#arrow-declared)"
            >
              <title>
                {e.direction === "write" ? "writes" : "reads"} ({e.direction})
              </title>
            </path>
          );
        })}

        {/* Observed actor -> table edges */}
        {graph.access_edges.map((e, i) => {
          const y1 = (actorY.get(e.actor_identifier) ?? 0) + NODE_H / 2;
          const y2 = (tableY.get(e.table_id) ?? 0) + NODE_H / 2;
          const x1 = COLUMN_X.actor;
          const x2 = COLUMN_X.table + NODE_W.table;
          const midX = (x1 + x2) / 2;
          return (
            <path
              key={`ae-${i}`}
              d={`M${x1},${y1} C${midX},${y1} ${midX},${y2} ${x2},${y2}`}
              stroke="#94a3b8"
              strokeWidth={1.25}
              strokeDasharray="4 3"
              fill="none"
              markerEnd="url(#arrow-observed)"
            >
              <title>observed access</title>
            </path>
          );
        })}

        {/* Pipeline nodes */}
        {graph.pipelines.map((p) => (
          <g key={p.id} transform={`translate(${COLUMN_X.pipeline}, ${pipelineY.get(p.id)})`}>
            <rect width={NODE_W.pipeline} height={NODE_H} rx={8} fill="#eef2ff" stroke="#6366f1" />
            <text x={NODE_W.pipeline / 2} y={NODE_H / 2 + 4} textAnchor="middle" className="fill-indigo-800 text-[12px] font-medium">
              {p.name.length > 20 ? p.name.slice(0, 19) + "…" : p.name}
            </text>
          </g>
        ))}

        {/* Table nodes */}
        {graph.tables.map((t) => {
          const primaryTag = t.tags[0];
          const color = primaryTag ? TAG_COLOR[primaryTag] || "#0f172a" : "#94a3b8";
          return (
            <g key={t.id} transform={`translate(${COLUMN_X.table}, ${tableY.get(t.id)})`}>
              <rect width={NODE_W.table} height={NODE_H} rx={8} fill="white" stroke={color} strokeWidth={2} />
              <text x={10} y={18} className="fill-slate-800 text-[12px] font-semibold">
                {t.table_name}
              </text>
              <text x={10} y={34} className="text-[10px]" fill={color}>
                {t.tags.length ? t.tags.join(", ") : "untagged"}
              </text>
            </g>
          );
        })}

        {/* Actor nodes */}
        {graph.actors.map((a) => (
          <g key={a.identifier} transform={`translate(${COLUMN_X.actor}, ${actorY.get(a.identifier)})`}>
            <rect width={NODE_W.actor} height={NODE_H} rx={22} fill="#f8fafc" stroke="#64748b" />
            <text x={NODE_W.actor / 2} y={18} textAnchor="middle" className="fill-slate-700 text-[12px] font-medium">
              {a.identifier.length > 16 ? a.identifier.slice(0, 15) + "…" : a.identifier}
            </text>
            <text x={NODE_W.actor / 2} y={33} textAnchor="middle" className="fill-slate-400 text-[10px]">
              {a.actor_type}
            </text>
          </g>
        ))}
      </svg>

      <div className="mt-2 flex gap-6 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <svg width="20" height="8">
            <line x1="0" y1="4" x2="20" y2="4" stroke="#334155" strokeWidth={1.5} />
          </svg>
          declared pipeline read/write
        </span>
        <span className="flex items-center gap-1">
          <svg width="20" height="8">
            <line x1="0" y1="4" x2="20" y2="4" stroke="#94a3b8" strokeWidth={1.25} strokeDasharray="4 3" />
          </svg>
          observed access (from logs)
        </span>
      </div>
    </div>
  );
}
