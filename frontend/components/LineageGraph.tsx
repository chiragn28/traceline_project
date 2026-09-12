"use client";

import { useCallback, useRef, useState } from "react";
import { LineageGraph as LineageGraphData } from "@/lib/api-client";

const COLUMN_X = { pipeline: 90, table: 460, actor: 830 };
const NODE_W = { pipeline: 170, table: 190, actor: 170 };
const NODE_H = 54;
const TOP_MARGIN = 40;
const ROW_GAP = 78;

const TAG_COLOR: Record<string, string> = {
  pii: "#dc2626",
  financial: "#d97706",
  public: "#64748b",
};

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 3;

function layout(count: number) {
  return Array.from({ length: count }, (_, i) => TOP_MARGIN + i * ROW_GAP);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

type Hover =
  | { kind: "pipeline"; id: string }
  | { kind: "table"; id: string }
  | { kind: "actor"; id: string }
  | { kind: "pipeline_edge"; index: number }
  | { kind: "access_edge"; index: number };

export default function LineageGraph({ graph }: { graph: LineageGraphData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  // zoom and pan are updated together, atomically, in one state object --
  // computing pan from zoom requires reading zoom, and doing that as a
  // side effect inside setZoom's updater (calling setPan from within it)
  // breaks React's purity contract for updater functions and silently
  // double-applies under Strict Mode (Next dev's default), which is
  // exactly the "zoomed itself off-screen after a few clicks" bug this
  // replaced.
  const [view, setView] = useState({ zoom: 1, pan: { x: 0, y: 0 } });
  const { zoom, pan } = view;
  const dragRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });

  const pipelineY = new Map(graph.pipelines.map((p, i) => [p.id, layout(graph.pipelines.length)[i]]));
  const tableY = new Map(graph.tables.map((t, i) => [t.id, layout(graph.tables.length)[i]]));
  const actorY = new Map(graph.actors.map((a, i) => [a.identifier, layout(graph.actors.length)[i]]));
  const tableById = new Map(graph.tables.map((t) => [t.id, t]));
  const pipelineById = new Map(graph.pipelines.map((p) => [p.id, p]));

  const rowCounts = [graph.pipelines.length, graph.tables.length, graph.actors.length];
  const contentHeight = Math.max(TOP_MARGIN * 2, Math.max(...rowCounts, 1) * ROW_GAP + TOP_MARGIN);
  const contentWidth = COLUMN_X.actor + NODE_W.actor + 40;

  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

  const zoomBy = useCallback((factor: number, center?: { x: number; y: number }) => {
    setView((prev) => {
      const nextZoom = clampZoom(prev.zoom * factor);
      const rect = containerRef.current?.getBoundingClientRect();
      const cx = center ? center.x - (rect?.left ?? 0) : (rect?.width ?? 0) / 2;
      const cy = center ? center.y - (rect?.top ?? 0) : (rect?.height ?? 0) / 2;
      return {
        zoom: nextZoom,
        pan: {
          x: cx - ((cx - prev.pan.x) / prev.zoom) * nextZoom,
          y: cy - ((cy - prev.pan.y) / prev.zoom) * nextZoom,
        },
      };
    });
  }, []);

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, { x: e.clientX, y: e.clientY });
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPanX: pan.x, startPanY: pan.y };
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) setMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top });

    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setView((prev) => ({ ...prev, pan: { x: dragRef.current!.startPanX + dx, y: dragRef.current!.startPanY + dy } }));
  }

  function endDrag() {
    dragRef.current = null;
    setDragging(false);
  }

  function resetView() {
    setView({ zoom: 1, pan: { x: 0, y: 0 } });
  }

  if (graph.pipelines.length === 0 && graph.tables.length === 0) {
    return <p className="text-sm text-slate-400 dark:text-zinc-500">Nothing to draw yet -- connect a data source first.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400 dark:text-zinc-500">
          Scroll or pinch to zoom, drag to pan. Hover any node or line for detail.
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => zoomBy(1 / 1.3)}
            className="flex h-7 w-7 items-center justify-center rounded border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            aria-label="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => zoomBy(1.3)}
            className="flex h-7 w-7 items-center justify-center rounded border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            onClick={resetView}
            className="rounded border border-slate-300 px-2 text-xs text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Reset
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        // Same dot-grid texture as the marketing site (see app/page.tsx),
        // applied as this element's own background-image rather than a
        // separate fixed overlay -- it paints beneath the SVG automatically
        // with no z-index/stacking-context concerns, and since it's the
        // container's background rather than something inside the panned/
        // zoomed <svg>, it stays put like paper under a diagram instead of
        // scaling or drifting with the graph.
        className={`relative h-[480px] w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50 bg-[radial-gradient(rgba(15,23,42,0.09)_1px,transparent_1px)] bg-[size:22px_22px] dark:border-zinc-800 dark:bg-zinc-950 dark:bg-[radial-gradient(rgba(255,255,255,0.09)_1px,transparent_1px)] ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={() => {
          endDrag();
          setHover(null);
        }}
      >
        <svg width={contentWidth} height={contentHeight} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}>
          <defs>
            <marker id="arrow-declared" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className="fill-slate-700 dark:fill-zinc-400" />
            </marker>
            <marker id="arrow-observed" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className="fill-slate-400 dark:fill-zinc-600" />
            </marker>
          </defs>

          <text x={COLUMN_X.pipeline} y={16} className="fill-slate-400 text-[11px] font-semibold uppercase tracking-wide dark:fill-zinc-500">
            Pipelines
          </text>
          <text x={COLUMN_X.table} y={16} className="fill-slate-400 text-[11px] font-semibold uppercase tracking-wide dark:fill-zinc-500">
            Tables
          </text>
          <text x={COLUMN_X.actor} y={16} className="fill-slate-400 text-[11px] font-semibold uppercase tracking-wide dark:fill-zinc-500">
            Actors (observed, 30d)
          </text>

          {graph.pipeline_edges.map((e, i) => {
            const y1 = (pipelineY.get(e.pipeline_id) ?? 0) + NODE_H / 2;
            const y2 = (tableY.get(e.table_id) ?? 0) + NODE_H / 2;
            const x1 = COLUMN_X.pipeline + NODE_W.pipeline;
            const x2 = COLUMN_X.table;
            const midX = (x1 + x2) / 2;
            const active = hover?.kind === "pipeline_edge" && hover.index === i;
            return (
              <path
                key={`pe-${i}`}
                d={`M${x1},${y1} C${midX},${y1} ${midX},${y2} ${x2},${y2}`}
                strokeWidth={active ? 3 : 1.5}
                fill="none"
                markerEnd="url(#arrow-declared)"
                className={active ? "stroke-emerald-600 dark:stroke-emerald-400" : "stroke-slate-700 dark:stroke-zinc-400"}
                onPointerEnter={() => setHover({ kind: "pipeline_edge", index: i })}
                onPointerLeave={() => setHover(null)}
              />
            );
          })}

          {graph.access_edges.map((e, i) => {
            const y1 = (actorY.get(e.actor_identifier) ?? 0) + NODE_H / 2;
            const y2 = (tableY.get(e.table_id) ?? 0) + NODE_H / 2;
            const x1 = COLUMN_X.actor;
            const x2 = COLUMN_X.table + NODE_W.table;
            const midX = (x1 + x2) / 2;
            const active = hover?.kind === "access_edge" && hover.index === i;
            return (
              <path
                key={`ae-${i}`}
                d={`M${x1},${y1} C${midX},${y1} ${midX},${y2} ${x2},${y2}`}
                strokeWidth={active ? 2.5 : 1.25}
                strokeDasharray="4 3"
                fill="none"
                markerEnd="url(#arrow-observed)"
                className={active ? "stroke-emerald-600 dark:stroke-emerald-400" : "stroke-slate-400 dark:stroke-zinc-600"}
                onPointerEnter={() => setHover({ kind: "access_edge", index: i })}
                onPointerLeave={() => setHover(null)}
              />
            );
          })}

          {graph.pipelines.map((p) => (
            <g
              key={p.id}
              transform={`translate(${COLUMN_X.pipeline}, ${pipelineY.get(p.id)})`}
              onPointerEnter={() => setHover({ kind: "pipeline", id: p.id })}
              onPointerLeave={() => setHover(null)}
              className="cursor-pointer"
            >
              <rect
                width={NODE_W.pipeline}
                height={NODE_H}
                rx={8}
                className={`fill-indigo-50 dark:fill-indigo-500/10 ${hover?.kind === "pipeline" && hover.id === p.id ? "stroke-indigo-600 dark:stroke-indigo-400" : "stroke-indigo-300 dark:stroke-indigo-500/40"}`}
                strokeWidth={hover?.kind === "pipeline" && hover.id === p.id ? 2 : 1}
              />
              <text x={10} y={20} className="fill-indigo-800 text-[12px] font-medium dark:fill-indigo-300">
                {p.name.length > 21 ? p.name.slice(0, 20) + "…" : p.name}
              </text>
              <text x={10} y={38} className="fill-indigo-500 text-[10px] dark:fill-indigo-400">
                {p.reads_count} read · {p.writes_count} write
              </text>
            </g>
          ))}

          {graph.tables.map((t) => {
            const primaryTag = t.tags[0];
            const color = primaryTag ? TAG_COLOR[primaryTag] || "#0f172a" : "#94a3b8";
            const active = hover?.kind === "table" && hover.id === t.id;
            return (
              <g
                key={t.id}
                transform={`translate(${COLUMN_X.table}, ${tableY.get(t.id)})`}
                onPointerEnter={() => setHover({ kind: "table", id: t.id })}
                onPointerLeave={() => setHover(null)}
                className="cursor-pointer"
              >
                <rect
                  width={NODE_W.table}
                  height={NODE_H}
                  rx={8}
                  className="fill-white dark:fill-zinc-900"
                  stroke={color}
                  strokeWidth={active ? 3 : 2}
                />
                <text x={10} y={18} className="fill-slate-800 text-[12px] font-semibold dark:fill-zinc-100">
                  {t.table_name}
                </text>
                <text x={10} y={34} className="text-[10px]" fill={color}>
                  {t.tags.length ? t.tags.join(", ") : "untagged"}
                </text>
                <text x={10} y={48} className="fill-slate-400 text-[10px] dark:fill-zinc-500">
                  {t.access_count_30d} accesses · {t.distinct_actor_count} actors
                </text>
              </g>
            );
          })}

          {graph.actors.map((a) => {
            const active = hover?.kind === "actor" && hover.id === a.identifier;
            const unattributed = a.actor_type === "service_account" && !a.owner_email;
            return (
              <g
                key={a.identifier}
                transform={`translate(${COLUMN_X.actor}, ${actorY.get(a.identifier)})`}
                onPointerEnter={() => setHover({ kind: "actor", id: a.identifier })}
                onPointerLeave={() => setHover(null)}
                className="cursor-pointer"
              >
                <rect
                  width={NODE_W.actor}
                  height={NODE_H}
                  rx={12}
                  className={`fill-white dark:fill-zinc-900 ${unattributed ? "stroke-amber-500" : "stroke-slate-400 dark:stroke-zinc-600"}`}
                  strokeWidth={active ? 3 : unattributed ? 1.75 : 1}
                  strokeDasharray={unattributed ? "3 2" : undefined}
                />
                <text x={10} y={18} className="fill-slate-700 text-[12px] font-medium dark:fill-zinc-200">
                  {a.identifier.length > 18 ? a.identifier.slice(0, 17) + "…" : a.identifier}
                </text>
                <text x={10} y={34} className="fill-slate-400 text-[10px] dark:fill-zinc-500">
                  {a.actor_type}
                  {unattributed ? " · unowned" : ""}
                </text>
                <text x={10} y={48} className="fill-slate-400 text-[10px] dark:fill-zinc-500">
                  {a.access_count_30d}x · {fmtDate(a.last_seen_at)}
                </text>
              </g>
            );
          })}
        </svg>

        {hover && (
          <div
            className="pointer-events-none absolute z-10 max-w-[260px] rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
            style={{
              left: Math.min(mouse.x + 14, (containerRef.current?.clientWidth ?? 400) - 270),
              top: mouse.y + 14,
            }}
          >
            <HoverContent hover={hover} graph={graph} tableById={tableById} pipelineById={pipelineById} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-6 text-xs text-slate-500 dark:text-zinc-500">
        <span className="flex items-center gap-1">
          <svg width="20" height="8">
            <line x1="0" y1="4" x2="20" y2="4" className="stroke-slate-700 dark:stroke-zinc-400" strokeWidth={1.5} />
          </svg>
          declared pipeline read/write
        </span>
        <span className="flex items-center gap-1">
          <svg width="20" height="8">
            <line x1="0" y1="4" x2="20" y2="4" className="stroke-slate-400 dark:stroke-zinc-600" strokeWidth={1.25} strokeDasharray="4 3" />
          </svg>
          observed access (from logs, last 30d)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-4 rounded-sm border border-dashed border-amber-500" />
          unattributed service account
        </span>
      </div>
    </div>
  );
}

function HoverContent({
  hover,
  graph,
  tableById,
  pipelineById,
}: {
  hover: Hover;
  graph: LineageGraphData;
  tableById: Map<string, LineageGraphData["tables"][number]>;
  pipelineById: Map<string, LineageGraphData["pipelines"][number]>;
}) {
  if (hover.kind === "table") {
    const t = tableById.get(hover.id);
    if (!t) return null;
    return (
      <div className="space-y-1">
        <p className="font-semibold text-slate-800 dark:text-zinc-100">
          {t.schema_name}.{t.table_name}
        </p>
        <p className="text-slate-500 dark:text-zinc-400">Tags: {t.tags.length ? t.tags.join(", ") : "untagged"}</p>
        <p className="text-slate-500 dark:text-zinc-400">{t.access_count_30d} accesses in the last 30 days</p>
        <p className="text-slate-500 dark:text-zinc-400">{t.distinct_actor_count} distinct actor(s)</p>
        <p className="text-slate-500 dark:text-zinc-400">Last accessed: {fmtDate(t.last_accessed_at)}</p>
      </div>
    );
  }
  if (hover.kind === "actor") {
    const a = graph.actors.find((x) => x.identifier === hover.id);
    if (!a) return null;
    return (
      <div className="space-y-1">
        <p className="font-semibold text-slate-800 dark:text-zinc-100">{a.identifier}</p>
        <p className="text-slate-500 dark:text-zinc-400">Type: {a.actor_type}</p>
        <p className="text-slate-500 dark:text-zinc-400">{a.access_count_30d} accesses in the last 30 days</p>
        <p className="text-slate-500 dark:text-zinc-400">Last seen: {fmtDate(a.last_seen_at)}</p>
        <p className="text-slate-500 dark:text-zinc-400">
          Owner: {a.owner_email || (a.actor_type === "service_account" ? "unattributed -- assign one in Team" : "n/a (human actor)")}
        </p>
      </div>
    );
  }
  if (hover.kind === "pipeline") {
    const p = pipelineById.get(hover.id);
    if (!p) return null;
    return (
      <div className="space-y-1">
        <p className="font-semibold text-slate-800 dark:text-zinc-100">{p.name}</p>
        <p className="text-slate-500 dark:text-zinc-400">Reads {p.reads_count} table(s)</p>
        <p className="text-slate-500 dark:text-zinc-400">Writes {p.writes_count} table(s)</p>
        <p className="text-slate-400 dark:text-zinc-500">Declared lineage -- not auto-discovered in this MVP.</p>
      </div>
    );
  }
  if (hover.kind === "pipeline_edge") {
    const e = graph.pipeline_edges[hover.index];
    const p = pipelineById.get(e.pipeline_id);
    const t = tableById.get(e.table_id);
    return (
      <p className="text-slate-600 dark:text-zinc-300">
        <span className="font-semibold">{p?.name}</span> {e.direction === "write" ? "writes" : "reads"}{" "}
        <span className="font-semibold">
          {t?.schema_name}.{t?.table_name}
        </span>
      </p>
    );
  }
  if (hover.kind === "access_edge") {
    const e = graph.access_edges[hover.index];
    const t = tableById.get(e.table_id);
    return (
      <div className="space-y-1">
        <p className="text-slate-600 dark:text-zinc-300">
          <span className="font-semibold">{e.actor_identifier}</span> accessed{" "}
          <span className="font-semibold">
            {t?.schema_name}.{t?.table_name}
          </span>
        </p>
        <p className="text-slate-500 dark:text-zinc-400">{e.access_count_30d}x in the last 30 days</p>
        <p className="text-slate-500 dark:text-zinc-400">Last: {fmtDate(e.last_accessed_at)}</p>
      </div>
    );
  }
  return null;
}
