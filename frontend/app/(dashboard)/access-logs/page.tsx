"use client";

import { useEffect, useState } from "react";
import { api, AccessEvent, CoverageGap, DataSource } from "@/lib/api-client";

export default function AccessLogsPage() {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [dataSourceId, setDataSourceId] = useState("");
  const [actor, setActor] = useState("");
  const [queryType, setQueryType] = useState("");
  const [events, setEvents] = useState<AccessEvent[]>([]);
  const [gaps, setGaps] = useState<CoverageGap[]>([]);

  useEffect(() => {
    api.get<DataSource[]>("/data-sources").then((ds) => {
      setSources(ds);
      if (ds.length) setDataSourceId(ds[0].id);
    });
  }, []);

  useEffect(() => {
    if (!dataSourceId) return;
    load();
    api.get<CoverageGap[]>(`/coverage-gaps?data_source_id=${dataSourceId}&open_only=true`).then(setGaps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSourceId]);

  async function load() {
    const params = new URLSearchParams({ data_source_id: dataSourceId });
    if (actor) params.set("actor", actor);
    if (queryType) params.set("query_type", queryType);
    setEvents(await api.get<AccessEvent[]>(`/access-events?${params.toString()}`));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold dark:text-zinc-100">Access Logs</h1>
        <p className="text-sm text-slate-500 dark:text-zinc-400">Who accessed what, when, and from where -- as best we can tell.</p>
      </div>

      {gaps.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          <p className="font-medium">⚠ Logging coverage gap(s) detected for this source</p>
          <ul className="mt-1 list-inside list-disc">
            {gaps.map((g) => (
              <li key={g.id}>
                <strong>{g.reason.replace(/_/g, " ")}</strong> since {new Date(g.gap_start).toLocaleString()} --
                access during this window may not be visible.
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <select className="input max-w-xs" value={dataSourceId} onChange={(e) => setDataSourceId(e.target.value)}>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          className="input max-w-xs"
          placeholder="Filter by actor"
          value={actor}
          onChange={(e) => setActor(e.target.value)}
        />
        <select className="input max-w-xs" value={queryType} onChange={(e) => setQueryType(e.target.value)}>
          <option value="">All query types</option>
          <option value="read">read</option>
          <option value="write">write</option>
          <option value="ddl">ddl</option>
          <option value="unknown">unknown</option>
        </select>
        <button className="btn-secondary" onClick={load}>
          Apply filters
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Occurred at (UTC)</th>
              <th>Actor</th>
              <th>Type</th>
              <th>Table</th>
              <th>Source IP</th>
              <th>Region</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap">{new Date(e.occurred_at).toISOString().replace("T", " ").slice(0, 19)}</td>
                <td>
                  {e.actor_identifier}
                  <span className="ml-1 badge bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400">{e.actor_type}</span>
                </td>
                <td>{e.query_type}</td>
                <td>
                  {e.schema_name_snapshot ? `${e.schema_name_snapshot}.${e.table_name_snapshot}` : "—"}
                  {!e.table_id && e.table_name_snapshot && (
                    <span className="ml-1 text-xs text-slate-400 dark:text-zinc-500">(table since dropped)</span>
                  )}
                </td>
                <td>{e.source_ip || "—"}</td>
                <td>
                  {e.source_region || "unknown"}{" "}
                  <span
                    className={`badge ${
                      e.region_confidence === "high"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                        : "bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400"
                    }`}
                    title={e.region_source || undefined}
                  >
                    {e.region_confidence}
                  </span>
                </td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td colSpan={6} className="text-slate-400 dark:text-zinc-500">
                  No access events match these filters yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
