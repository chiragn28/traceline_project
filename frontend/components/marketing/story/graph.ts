// The demo graph the 3D scene renders. Mirrors the shape of the product's
// own lineage view (pipelines -> tables <- actors) and its seed data, so an
// investor who signs in after scrolling sees the same names in the real tool.

export type NodeKind = "pipeline" | "table" | "actor";
export type Tag = "pii" | "financial" | "public";
export type ActorType = "human" | "service_account" | "unknown";

export interface GraphNode {
  id: string;
  label: string;
  kind: NodeKind;
  /** resting position in the lineage layout */
  pos: [number, number, number];
  /** position once the graph collapses into the audit-report grid */
  grid: [number, number, number];
  tag?: Tag;
  actorType?: ActorType;
  /** one-line detail shown in the hover tooltip */
  detail: string;
  /** sits outside the approved-region shell; the violator in the story */
  outsideRegion?: boolean;
}

export interface GraphEdge {
  from: string;
  to: string;
  /** declared = pipeline read/write; observed = seen in access logs */
  kind: "declared" | "observed";
  violation?: boolean;
}

// 4 columns x 3 rows on the "report sheet", filled in this node order.
const gridAt = (i: number): [number, number, number] => [
  -3.3 + (i % 4) * 2.2,
  -0.7,
  -1.3 + Math.floor(i / 4) * 1.3,
];

export const NODES: GraphNode[] = [
  { id: "customers", label: "customers", kind: "table", tag: "pii", pos: [0, 1.5, 0], grid: gridAt(0), detail: "pii · 3 accesses · 2 actors" },
  { id: "products", label: "products", kind: "table", tag: "public", pos: [0, 0.5, 0.4], grid: gridAt(1), detail: "public · 2 accesses · 2 actors" },
  { id: "transactions", label: "transactions", kind: "table", tag: "financial", pos: [0, -0.5, -0.2], grid: gridAt(2), detail: "financial · 7 accesses · 4 actors" },
  { id: "payouts", label: "payouts", kind: "table", tag: "financial", pos: [0, -1.5, 0.3], grid: gridAt(3), detail: "financial · 1 access · 1 actor" },

  { id: "demo_app", label: "demo_app", kind: "actor", actorType: "service_account", pos: [3.4, 1.6, 0.3], grid: gridAt(4), detail: "service_account · 4× · 13d ago" },
  { id: "priya", label: "priya.raghunathan", kind: "actor", actorType: "human", pos: [3.4, 0.55, -0.2], grid: gridAt(5), detail: "human · 3× · 3d ago" },
  { id: "svc_reporting", label: "svc-reporting", kind: "actor", actorType: "service_account", pos: [3.4, -0.5, 0.4], grid: gridAt(6), detail: "service_account · unowned · 6d ago" },
  { id: "legacy_batch", label: "legacy_batch_job", kind: "actor", actorType: "service_account", pos: [3.4, -1.6, -0.3], grid: gridAt(7), detail: "service_account · unowned · 26d ago" },

  { id: "nightly_etl", label: "Nightly Analytics ETL", kind: "pipeline", pos: [-3.4, 0.9, 0.2], grid: gridAt(8), detail: "pipeline · 2 read · 1 write" },
  { id: "portal_sync", label: "Support Portal Sync", kind: "pipeline", pos: [-3.4, -0.9, -0.3], grid: gridAt(9), detail: "pipeline · 1 read · 1 write" },

  { id: "unknown_client", label: "unknown_client", kind: "actor", actorType: "unknown", pos: [5.2, 0.2, 1.4], grid: gridAt(10), detail: "unknown · outside approved region", outsideRegion: true },
];

export const EDGES: GraphEdge[] = [
  { from: "nightly_etl", to: "customers", kind: "declared" },
  { from: "nightly_etl", to: "transactions", kind: "declared" },
  { from: "portal_sync", to: "products", kind: "declared" },
  { from: "portal_sync", to: "transactions", kind: "declared" },

  { from: "demo_app", to: "customers", kind: "observed" },
  { from: "demo_app", to: "products", kind: "observed" },
  { from: "priya", to: "transactions", kind: "observed" },
  { from: "priya", to: "payouts", kind: "observed" },
  { from: "svc_reporting", to: "transactions", kind: "observed" },
  { from: "legacy_batch", to: "products", kind: "observed" },
  { from: "unknown_client", to: "customers", kind: "observed", violation: true },
];

export const NODE_INDEX: Record<string, number> = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
