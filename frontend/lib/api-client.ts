const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }
  return res.blob() as unknown as Promise<T>;
}

export const api = {
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
};

export interface DataSource {
  id: string;
  name: string;
  source_type: string;
  host: string;
  port: number;
  dbname: string;
  username: string;
  log_directory: string;
  is_production: boolean;
  read_only_verified: boolean | null;
  read_only_checked_at: string | null;
  read_only_warning: string | null;
  created_at: string;
}

export interface ClassificationTag {
  id: string;
  column_name: string | null;
  tag: string;
  effective_from: string;
  superseded_at: string | null;
}

export interface TableAsset {
  id: string;
  data_source_id: string;
  schema_name: string;
  table_name: string;
  discovered_at: string;
  dropped_at: string | null;
  current_tags: ClassificationTag[];
}

export interface AccessEvent {
  id: string;
  data_source_id: string;
  table_id: string | null;
  schema_name_snapshot: string | null;
  table_name_snapshot: string | null;
  actor_identifier: string;
  actor_type: string;
  query_type: string;
  source_ip: string | null;
  source_region: string | null;
  region_confidence: string;
  region_source: string | null;
  occurred_at: string;
  ingested_at: string;
}

export interface CoverageGap {
  id: string;
  data_source_id: string;
  gap_start: string;
  gap_end: string | null;
  reason: string;
  detected_at: string;
}

export interface RegionRule {
  id: string;
  classification_tag: string;
  approved_regions: string[];
  applies_to_production_only: boolean;
  created_at: string;
}

export interface Violation {
  id: string;
  access_event_id: string;
  region_rule_id: string;
  table_id: string | null;
  reason: string;
  detected_at: string;
}

export interface Report {
  id: string;
  range_start: string;
  range_end: string;
  timezone_label: string;
  generated_at: string;
  content_sha256: string;
}

export interface User {
  id: string;
  email: string;
  role: string;
  can_review: boolean;
  created_at: string;
}

export interface AccessReviewCycle {
  id: string;
  label: string;
  lookback_days: number;
  created_at: string;
  item_count: number;
  pending_count: number;
}

export interface LineageGraph {
  pipelines: { id: string; name: string }[];
  tables: { id: string; schema_name: string; table_name: string; tags: string[] }[];
  actors: { identifier: string; actor_type: string }[];
  pipeline_edges: { pipeline_id: string; table_id: string; direction: string }[];
  access_edges: { actor_identifier: string; table_id: string }[];
}

export interface AccessReviewItem {
  id: string;
  cycle_id: string;
  table_id: string | null;
  schema_name_snapshot: string;
  table_name_snapshot: string;
  classification_tags_snapshot: string;
  actor_identifier: string;
  actor_type: string;
  owner_user_id: string | null;
  owner_email: string | null;
  access_count: number;
  first_seen_at: string;
  last_seen_at: string;
  decision: string;
  decision_reason: string | null;
  reviewed_by_user_id: string | null;
  reviewer_email: string | null;
  reviewed_at: string | null;
  is_stale: boolean;
}
