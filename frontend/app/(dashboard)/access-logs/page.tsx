"use client";

import { useEffect, useState } from "react";
import { ListMagnifyingGlass, MagnifyingGlass, Warning, X } from "@phosphor-icons/react";
import { api, AccessEvent, CoverageGap, DataSource } from "@/lib/api-client";
import { PageHeader } from "@/components/ui/PageHeader";
import { ActorTypePill, ConfidencePill, QueryTypePill } from "@/components/ui/Pill";
import { Time, formatAbsolute } from "@/components/ui/Time";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonRows } from "@/components/ui/Skeleton";

export default function AccessLogsPage() {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [dataSourceId, setDataSourceId] = useState("");
  const [actor, setActor] = useState("");
  const [queryType, setQueryType] = useState("");
  const [events, setEvents] = useState<AccessEvent[]>([]);
  const [gaps, setGaps] = useState<CoverageGap[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<DataSource[]>("/data-sources").then((ds) => {
      setSources(ds);
      if (ds.length) setDataSourceId(ds[0].id);
      else setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!dataSourceId) return;
    api.get<CoverageGap[]>(`/coverage-gaps?data_source_id=${dataSourceId}&open_only=true`).then(setGaps);
  }, [dataSourceId]);

  // Filters apply as you type (debounced) rather than behind an Apply button.
  useEffect(() => {
    if (!dataSourceId) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const params = new URLSearchParams({ data_source_id: dataSourceId });
      if (actor.trim()) params.set("actor", actor.trim());
      if (queryType) params.set("query_type", queryType);
      const rows = await api.get<AccessEvent[]>(`/access-events?${params.toString()}`);
      if (!cancelled) {
        setEvents(rows);
        setLoading(false);
      }
    }, actor ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [dataSourceId, actor, queryType]);

  const filtersActive = Boolean(actor.trim() || queryType);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Audit trail"
        title="Access Logs"
        description="Who accessed what, when, and from where — as best the logs can tell."
        actions={
          sources.length > 1 && (
            <select className="input w-auto min-w-[14rem]" value={dataSourceId} onChange={(e) => setDataSourceId(e.target.value)}>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )
        }
      />

      {gaps.length > 0 && (
        <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
          <Warning size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Logging coverage gap{gaps.length > 1 ? "s" : ""} on this source</p>
            <ul className="mt-1 space-y-0.5">
              {gaps.map((g) => (
                <li key={g.id}>
                  <span className="font-medium">{g.reason.replace(/_/g, " ")}</span> since {formatAbsolute(g.gap_start)} — access during this
                  window may not be visible.
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative">
          <MagnifyingGlass size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
          <input
            className="input w-64 pl-9"
            placeholder="Filter by actor"
            value={actor}
            onChange={(e) => setActor(e.target.value)}
          />
        </label>
        <select className="input w-auto" value={queryType} onChange={(e) => setQueryType(e.target.value)}>
          <option value="">All query types</option>
          <option value="read">read</option>
          <option value="write">write</option>
          <option value="ddl">ddl</option>
          <option value="unknown">unknown</option>
        </select>
        {filtersActive && (
          <button
            type="button"
            onClick={() => {
              setActor("");
              setQueryType("");
            }}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:border-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <X size={12} /> Clear filters
          </button>
        )}
        <span className="ml-auto font-mono text-[12px] tabular-nums text-slate-400 dark:text-zinc-500">
          {loading ? "…" : `${events.length} event${events.length === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className="table-card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Occurred</th>
                <th>Actor</th>
                <th>Type</th>
                <th>Table</th>
                <th>Source IP</th>
                <th>Region</th>
              </tr>
            </thead>
            <tbody>
              {loading && <SkeletonRows rows={6} cols={6} />}
              {!loading &&
                events.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <Time value={e.occurred_at} />
                    </td>
                    <td>
                      <span className="flex items-center gap-2">
                        <span className="mono-id">{e.actor_identifier}</span>
                        <ActorTypePill type={e.actor_type} />
                      </span>
                    </td>
                    <td>
                      <QueryTypePill type={e.query_type} />
                    </td>
                    <td>
                      <span className="mono-id">
                        {e.schema_name_snapshot ? `${e.schema_name_snapshot}.${e.table_name_snapshot}` : "—"}
                      </span>
                      {!e.table_id && e.table_name_snapshot && (
                        <span className="ml-2 text-xs text-slate-400 dark:text-zinc-500">since dropped</span>
                      )}
                    </td>
                    <td>
                      <span className="mono-id text-slate-500 dark:text-zinc-400">{e.source_ip || "—"}</span>
                    </td>
                    <td>
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-[12.5px] uppercase">{e.source_region || "unknown"}</span>
                        <ConfidencePill confidence={e.region_confidence} source={e.region_source} />
                      </span>
                    </td>
                  </tr>
                ))}
              {!loading && events.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-0">
                    <EmptyState
                      icon={ListMagnifyingGlass}
                      title={filtersActive ? "No events match these filters" : "No access recorded for this source yet"}
                      hint={
                        filtersActive
                          ? "Try a broader actor name or clear the query-type filter."
                          : "Events appear here as soon as the worker tails this source's query log."
                      }
                      compact
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
